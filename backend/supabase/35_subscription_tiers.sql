-- =====================================================================
-- TRẠM HỶ – 35_SUBSCRIPTION_TIERS.SQL
-- Hệ thống 3 gói cước AI Studio (Khởi Điểm 0đ, Nàng Thơ Rạng Rỡ 99k, Cẩm Tú Trọn Đôi 249k)
--   1. subscription_plans: danh sách các gói cước và quyền lợi
--   2. user_subscriptions: gói đang kích hoạt của người dùng
--   3. subscription_orders: đơn hàng nạp/nâng cấp qua VietQR
--   4. RPC get_my_subscription: lấy thông tin gói hiện tại
--   5. RPC activate_my_subscription: kích hoạt gói sau khi thanh toán
-- Chạy SAU 34. Chạy lại nhiều lần không lỗi.
-- =====================================================================

create table if not exists public.subscription_plans (
  id text primary key,
  name text not null,
  price int not null default 0,
  duration_days int not null default 30,
  daily_credits int not null default 6,
  bonus_credits int not null default 0,
  max_saved_photos int not null default 3,
  allow_own_garment boolean not null default false,
  allow_max_quality boolean not null default false,
  badge text,
  description text,
  features jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.subscription_plans enable row level security;
drop policy if exists "subscription_plans_read_all" on public.subscription_plans;
create policy "subscription_plans_read_all" on public.subscription_plans for select using (true);

insert into public.subscription_plans (id, name, price, duration_days, daily_credits, bonus_credits, max_saved_photos, allow_own_garment, allow_max_quality, badge, description, features)
values
  ('basic', 'Khởi Điểm', 0, 3650, 6, 0, 3, false, false, null, 'Trải nghiệm thử váy cơ bản mỗi ngày',
   '["6 credit thử váy mỗi ngày", "Chất lượng chuẩn (Fast / 768p)", "Kho váy có sẵn của tiệm", "Lưu tối đa 3 ảnh người mẫu"]'::jsonb),
  ('pro_bride', 'Nàng Thơ Rạng Rỡ', 99000, 30, 60, 30, 15, true, true, 'Được 89% Cô dâu chọn', 'Thỏa sức tìm chiếc váy mơ ước suốt mùa chuẩn bị cưới',
   '["60 credit mỗi ngày (gấp 10 lần)", "Tặng ngay +30 credit tức thì", "Mở khóa Siêu Nét 1K Ultra HD", "Tự do tải váy riêng từ Pinterest / TikTok", "Lưu 15 ảnh cá nhân nhiều góc chụp", "Hàng đợi xử lý ưu tiên (8-12s)", "Xóa sạch Watermark"]'::jsonb),
  ('studio_duo', 'Cẩm Tú Trọn Đôi', 249000, 60, 150, 100, 999, true, true, 'VIP Studio & Duo', 'Trọn gói cao cấp cho cặp đôi & chuyên gia tư vấn',
   '["150 credit mỗi ngày (Fair Use)", "Tặng ngay +100 credit tức thì", "Tính năng Thử Đôi (Váy & Vest cùng lúc)", "Trợ lý AI Stylist phân tích dáng & màu sắc", "Xuất file ảnh gốc in ấn album", "Không giới hạn lưu trữ ảnh", "Hỗ trợ 1:1 qua Zalo VIP"]'::jsonb)
on conflict (id) do update set
  name = excluded.name,
  price = excluded.price,
  duration_days = excluded.duration_days,
  daily_credits = excluded.daily_credits,
  bonus_credits = excluded.bonus_credits,
  max_saved_photos = excluded.max_saved_photos,
  allow_own_garment = excluded.allow_own_garment,
  allow_max_quality = excluded.allow_max_quality,
  badge = excluded.badge,
  description = excluded.description,
  features = excluded.features;

create table if not exists public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id text not null references public.subscription_plans(id),
  bonus_balance int not null default 0,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  status text not null default 'active' check (status in ('active', 'expired', 'cancelled')),
  created_at timestamptz not null default now()
);

alter table public.user_subscriptions enable row level security;
drop policy if exists "user_subscriptions_read_own" on public.user_subscriptions;
create policy "user_subscriptions_read_own" on public.user_subscriptions
  for select using (auth.uid() = user_id or public.is_admin());
drop policy if exists "user_subscriptions_admin_all" on public.user_subscriptions;
create policy "user_subscriptions_admin_all" on public.user_subscriptions
  for all using (public.is_admin()) with check (public.is_admin());

create table if not exists public.subscription_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id text not null references public.subscription_plans(id),
  code text not null unique,
  amount int not null check (amount >= 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

alter table public.subscription_orders enable row level security;
drop policy if exists "subscription_orders_read_own" on public.subscription_orders;
create policy "subscription_orders_read_own" on public.subscription_orders
  for select using (auth.uid() = user_id or public.is_admin());
drop policy if exists "subscription_orders_insert_own" on public.subscription_orders;
create policy "subscription_orders_insert_own" on public.subscription_orders
  for insert with check (auth.uid() = user_id or public.is_admin());
drop policy if exists "subscription_orders_update_own" on public.subscription_orders;
create policy "subscription_orders_update_own" on public.subscription_orders
  for update using (auth.uid() = user_id or public.is_admin());
drop policy if exists "subscription_orders_admin_all" on public.subscription_orders;
create policy "subscription_orders_admin_all" on public.subscription_orders
  for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.get_my_subscription()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_sub record;
  v_plan record;
begin
  if v_uid is null then
    return null;
  end if;

  select s.* into v_sub
  from public.user_subscriptions s
  where s.user_id = v_uid and s.status = 'active'
    and (s.expires_at is null or s.expires_at > now())
  order by s.created_at desc limit 1;

  if v_sub.id is not null then
    select p.* into v_plan from public.subscription_plans p where p.id = v_sub.plan_id;
    return jsonb_build_object(
      'has_subscription', true,
      'plan_id', v_plan.id,
      'plan_name', v_plan.name,
      'daily_credits', v_plan.daily_credits,
      'bonus_balance', v_sub.bonus_balance,
      'allow_own_garment', v_plan.allow_own_garment,
      'allow_max_quality', v_plan.allow_max_quality,
      'badge', v_plan.badge,
      'expires_at', v_sub.expires_at
    );
  else
    select p.* into v_plan from public.subscription_plans p where p.id = 'basic';
    return jsonb_build_object(
      'has_subscription', false,
      'plan_id', 'basic',
      'plan_name', coalesce(v_plan.name, 'Khởi Điểm'),
      'daily_credits', coalesce(v_plan.daily_credits, 6),
      'bonus_balance', 0,
      'allow_own_garment', false,
      'allow_max_quality', false,
      'badge', null,
      'expires_at', null
    );
  end if;
end $$;

revoke execute on function public.get_my_subscription() from public, anon;
grant execute on function public.get_my_subscription() to authenticated;

create or replace function public.activate_my_subscription(p_order_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_order record;
  v_plan record;
  v_sub_id uuid;
begin
  if v_uid is null then
    raise exception 'Cần đăng nhập để kích hoạt gói';
  end if;

  select * into v_order from public.subscription_orders
  where code = p_order_code and user_id = v_uid and status = 'pending'
  for update;

  if v_order.id is null then
    raise exception 'Không tìm thấy đơn hàng hoặc đơn đã được xử lý';
  end if;

  select * into v_plan from public.subscription_plans where id = v_order.plan_id;
  if v_plan.id is null then
    raise exception 'Gói cước không tồn tại';
  end if;

  update public.user_subscriptions set status = 'cancelled'
  where user_id = v_uid and status = 'active';

  insert into public.user_subscriptions (user_id, plan_id, bonus_balance, starts_at, expires_at, status)
  values (
    v_uid,
    v_plan.id,
    v_plan.bonus_credits,
    now(),
    now() + (v_plan.duration_days || ' days')::interval,
    'active'
  ) returning id into v_sub_id;

  update public.subscription_orders
  set status = 'paid', paid_at = now()
  where id = v_order.id;

  return jsonb_build_object(
    'ok', true,
    'plan_id', v_plan.id,
    'plan_name', v_plan.name,
    'daily_credits', v_plan.daily_credits,
    'bonus_credits', v_plan.bonus_credits,
    'expires_at', now() + (v_plan.duration_days || ' days')::interval
  );
end $$;

revoke execute on function public.activate_my_subscription(text) from public, anon;
grant execute on function public.activate_my_subscription(text) to authenticated;

-- RPC lấy toàn bộ đơn hàng gói AI cho admin
create or replace function public.admin_list_subscription_orders()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên mới có quyền xem danh sách đơn gói AI';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', o.id,
        'code', o.code,
        'amount', o.amount,
        'status', o.status,
        'created_at', o.created_at,
        'paid_at', o.paid_at,
        'user', jsonb_build_object(
          'id', p.id,
          'full_name', p.full_name,
          'phone', p.phone,
          'email', p.email
        ),
        'plan', jsonb_build_object(
          'id', pl.id,
          'name', pl.name,
          'daily_credits', pl.daily_credits,
          'duration_days', pl.duration_days,
          'bonus_credits', pl.bonus_credits,
          'badge', pl.badge
        )
      ) order by o.created_at desc
    )
    from public.subscription_orders o
    left join public.profiles p on p.id = o.user_id
    left join public.subscription_plans pl on pl.id = o.plan_id
  ), '[]'::jsonb);
end $$;

revoke execute on function public.admin_list_subscription_orders() from public, anon;
grant execute on function public.admin_list_subscription_orders() to authenticated;

-- RPC duyệt đơn gói AI thủ công
create or replace function public.admin_confirm_subscription_order(p_order_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order record;
  v_plan record;
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên mới có quyền duyệt đơn';
  end if;

  select * into v_order from public.subscription_orders
  where code = p_order_code
  for update;

  if v_order.id is null then
    raise exception 'Không tìm thấy đơn hàng';
  end if;

  select * into v_plan from public.subscription_plans where id = v_order.plan_id;
  if v_plan.id is null then
    raise exception 'Gói cước không tồn tại';
  end if;

  update public.user_subscriptions set status = 'cancelled'
  where user_id = v_order.user_id and status = 'active';

  insert into public.user_subscriptions (user_id, plan_id, bonus_balance, starts_at, expires_at, status)
  values (
    v_order.user_id,
    v_plan.id,
    v_plan.bonus_credits,
    now(),
    now() + (v_plan.duration_days || ' days')::interval,
    'active'
  );

  update public.subscription_orders
  set status = 'paid', paid_at = now()
  where id = v_order.id;

  return jsonb_build_object('ok', true, 'code', p_order_code);
end $$;

revoke execute on function public.admin_confirm_subscription_order(text) from public, anon;
grant execute on function public.admin_confirm_subscription_order(text) to authenticated;

