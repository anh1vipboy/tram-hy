-- ============================================================================
-- TRẠM HỶ – 40_FIX_SUBSCRIPTION_AUTO_ACTIVATION.SQL
-- Tự động kích hoạt user_subscriptions mỗi khi subscription_orders chuyển sang 'paid'
-- Tự động đồng bộ và tự sửa lỗi (self-healing) cho get_my_subscription
-- ============================================================================

-- 1. Hàm trigger kích hoạt quyền lợi gói cước khi đơn hàng thành 'paid'
create or replace function public.on_subscription_order_paid()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_plan record;
  v_duration int := 30;
  v_bonus int := 30;
begin
  if new.status = 'paid' and (old.status is null or old.status is distinct from 'paid') then
    select * into v_plan from public.subscription_plans where id = new.plan_id;
    if v_plan.id is not null then
      v_duration := coalesce(v_plan.duration_days, 30);
      v_bonus := coalesce(v_plan.bonus_credits, 0);
    end if;

    -- Hủy các gói cũ còn hiệu lực
    update public.user_subscriptions
    set status = 'cancelled'
    where user_id = new.user_id and status = 'active';

    -- Tạo gói kích hoạt mới cho người dùng
    insert into public.user_subscriptions (user_id, plan_id, bonus_balance, starts_at, expires_at, status)
    values (
      new.user_id,
      new.plan_id,
      v_bonus,
      now(),
      now() + (v_duration || ' days')::interval,
      'active'
    );
  end if;
  return new;
end $$;

-- 2. Đăng ký trigger trên bảng subscription_orders
drop trigger if exists trg_on_subscription_order_paid on public.subscription_orders;
create trigger trg_on_subscription_order_paid
  after insert or update of status on public.subscription_orders
  for each row execute function public.on_subscription_order_paid();

-- 3. Cập nhật hàm get_my_subscription có cơ chế tự động bù gói nếu user có đơn 'paid'
create or replace function public.get_my_subscription()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_sub record;
  v_plan record;
  v_order record;
begin
  if v_uid is null then
    return null;
  end if;

  select s.* into v_sub
  from public.user_subscriptions s
  where s.user_id = v_uid and s.status = 'active'
    and (s.expires_at is null or s.expires_at > now())
  order by s.created_at desc limit 1;

  if v_sub.id is null then
    select o.* into v_order from public.subscription_orders o
    where o.user_id = v_uid and o.status = 'paid'
    order by coalesce(o.paid_at, o.created_at) desc limit 1;

    if v_order.id is not null then
      select p.* into v_plan from public.subscription_plans where id = v_order.plan_id;
      if v_plan.id is not null then
        insert into public.user_subscriptions (user_id, plan_id, bonus_balance, starts_at, expires_at, status)
        values (
          v_uid,
          v_plan.id,
          coalesce(v_plan.bonus_credits, 30),
          now(),
          now() + (coalesce(v_plan.duration_days, 30) || ' days')::interval,
          'active'
        ) returning * into v_sub;
      end if;
    end if;
  end if;

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

-- 4. Kích hoạt bù ngay lập tức cho các đơn đã thanh toán 'paid' trong quá khứ
do $$
declare
  r record;
  v_plan record;
begin
  for r in (
    select distinct on (o.user_id) o.*
    from public.subscription_orders o
    where o.status = 'paid'
    order by o.user_id, o.paid_at desc nulls last, o.created_at desc
  ) loop
    if not exists (
      select 1 from public.user_subscriptions s
      where s.user_id = r.user_id and s.status = 'active'
        and (s.expires_at is null or s.expires_at > now())
    ) then
      select * into v_plan from public.subscription_plans where id = r.plan_id;
      
      insert into public.user_subscriptions (user_id, plan_id, bonus_balance, starts_at, expires_at, status)
      values (
        r.user_id,
        r.plan_id,
        coalesce(v_plan.bonus_credits, 30),
        now(),
        now() + (coalesce(v_plan.duration_days, 30) || ' days')::interval,
        'active'
      );
    end if;
  end loop;
end $$;
