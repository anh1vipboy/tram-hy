-- =====================================================================
-- TRẠM HỶ – 33_PLAN_SHARE.SQL
-- Chia sẻ kế hoạch cưới cho người khác XEM (bố mẹ, nửa kia, wedding planner) bằng link bí mật. Chạy SAU 32.
-- Chạy lại nhiều lần không lỗi.
--
--   - Mỗi kế hoạch có tối đa 1 link chia sẻ: ke-hoach.html?xem=<token>. Token 18 byte ngẫu nhiên (pgcrypto) → 24 ký tự,
--     không đoán / dò được. Mặc định TẮT – chủ kế hoạch tự bật.
--   - Cùng kiểu bảo mật với thiệp (SQL 25): bảng token KHÔNG cho ai đọc / ghi trực tiếp qua API. Chủ kế hoạch bật / tắt /
--     tạo link mới bằng hàm; người xem (không cần đăng nhập) chỉ gọi được get_shared_plan(token).
--   - get_shared_plan trả về ĐÚNG phần người xem cần: thông tin đám cưới, ngân sách (danh mục / mục / số tiền / đã trả),
--     checklist, tên + số tiền + trạng thái các đơn trên Trạm Hỷ, tên cô dâu chú rể trên thiệp (nếu có).
--     KHÔNG trả: id, email, số điện thoại, tên người liên hệ, ghi chú đơn, mã đơn, số tài khoản, địa chỉ.
--   - "Tạo link mới" thay token → link cũ hết hiệu lực ngay. Tắt chia sẻ → link báo "đã tắt", bật lại dùng tiếp link cũ.
--   - Xóa kế hoạch ("Làm lại từ đầu") → link chia sẻ xóa theo.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.wedding_plan_shares (
  plan_id     uuid primary key references public.wedding_plans(id) on delete cascade,
  token       text not null unique check (token ~ '^[A-Za-z0-9_-]{24,64}$'),
  enabled     boolean not null default true,
  created_at  timestamptz not null default now(),       -- lúc tạo link hiện tại (đổi khi "Tạo link mới")
  updated_at  timestamptz not null default now()
);
alter table public.wedding_plan_shares enable row level security;
-- Không policy nào + thu hồi quyền bảng → API không đọc / sửa được, chỉ các hàm security definer bên dưới
revoke all on public.wedding_plan_shares from anon, authenticated;

-- Token ngẫu nhiên an toàn: 18 byte → base64 24 ký tự, đổi + / thành - _ để dùng thẳng trên URL (18 chia hết cho 3 → không có "=")
create or replace function public.new_plan_share_token() returns text
language plpgsql volatile set search_path = public, extensions as $$
begin
  return translate(encode(gen_random_bytes(18), 'base64'), '+/', '-_');
end $$;

-- Kế hoạch của người đang đăng nhập (mỗi tài khoản 1 kế hoạch – SQL 20)
create or replace function public.my_plan_id() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare v_plan uuid;
begin
  if auth.uid() is null then raise exception 'Vui lòng đăng nhập để chia sẻ kế hoạch'; end if;
  select id into v_plan from public.wedding_plans where owner_id = auth.uid();
  if v_plan is null then raise exception 'Bạn chưa có kế hoạch cưới'; end if;
  return v_plan;
end $$;

-- Trạng thái chia sẻ của chủ kế hoạch: { enabled, token, created_at } (chưa từng bật → enabled false, token null)
-- Không đánh dấu stable: được gọi lại ngay sau khi bật / đổi link trong cùng giao dịch, cần đọc dữ liệu mới nhất.
create or replace function public.my_plan_share() returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.wedding_plan_shares;
begin
  select * into s from public.wedding_plan_shares where plan_id = public.my_plan_id();
  if not found then return jsonb_build_object('enabled', false, 'token', null, 'created_at', null); end if;
  return jsonb_build_object('enabled', s.enabled, 'token', s.token, 'created_at', s.created_at);
end $$;

-- Bật / tắt chia sẻ. Bật lần đầu → tạo token; bật lại sau khi tắt → dùng lại token cũ.
create or replace function public.set_plan_share(p_enabled boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_plan uuid := public.my_plan_id();
begin
  if coalesce(p_enabled, false) then
    insert into public.wedding_plan_shares (plan_id, token) values (v_plan, public.new_plan_share_token())
    on conflict (plan_id) do update set enabled = true, updated_at = now();
  else
    update public.wedding_plan_shares set enabled = false, updated_at = now() where plan_id = v_plan;
  end if;
  return public.my_plan_share();
end $$;

-- Tạo link mới (đồng thời bật chia sẻ): link cũ hết hiệu lực ngay
create or replace function public.rotate_plan_share() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_plan uuid := public.my_plan_id();
begin
  insert into public.wedding_plan_shares (plan_id, token) values (v_plan, public.new_plan_share_token())
  on conflict (plan_id) do update
    set token = excluded.token, enabled = true, created_at = now(), updated_at = now();
  return public.my_plan_share();
end $$;

-- Người xem mở link. Trả { status: 'ok', plan, couple, categories, checklist, bookings }
-- hoặc { status: 'not_found' } (link sai / đã đổi link mới / kế hoạch đã xóa) | { status: 'disabled' } (chủ kế hoạch tạm tắt).
-- Không báo lỗi (raise) để web hiện lời nhắn thân thiện theo status.
create or replace function public.get_shared_plan(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s public.wedding_plan_shares;
  p public.wedding_plans;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{24,64}$' then
    return jsonb_build_object('status', 'not_found');
  end if;
  select * into s from public.wedding_plan_shares where token = p_token;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if not s.enabled then return jsonb_build_object('status', 'disabled'); end if;
  select * into p from public.wedding_plans where id = s.plan_id;
  if not found then return jsonb_build_object('status', 'not_found'); end if;

  return jsonb_build_object(
    'status', 'ok',
    'plan', jsonb_build_object(
      'wedding_date', p.wedding_date, 'region', p.region, 'total_budget', p.total_budget,
      'guests', p.guests, 'city', p.city),
    -- Tên cô dâu chú rể trên thiệp đầu tiên (nếu đã làm thiệp) – chỉ 2 tên, không lấy địa chỉ / số tài khoản của thiệp
    'couple', (select jsonb_build_object('groom_name', inv.groom_name, 'bride_name', inv.bride_name)
               from public.invitations inv where inv.owner_id = p.owner_id order by inv.created_at limit 1),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', c.name,
               'vendor_category', c.vendor_category,
               'items', coalesce((
                 select jsonb_agg(jsonb_build_object('name', bi.name, 'estimated', bi.estimated, 'actual', bi.actual, 'paid', bi.paid)
                                  order by bi.position, bi.created_at)
                 from public.budget_items bi where bi.category_id = c.id), '[]'::jsonb))
             order by c.position, c.created_at)
      from public.budget_categories c where c.plan_id = p.id), '[]'::jsonb),
    'checklist', coalesce((
      select jsonb_agg(jsonb_build_object('title', t.title, 'days_before', t.days_before, 'done', t.done,
                                          'done_at', t.done_at, 'link_category', t.link_category)
             order by t.days_before desc, t.position, t.created_at)
      from public.checklist_items t where t.plan_id = p.id), '[]'::jsonb),
    -- Đơn trên Trạm Hỷ còn hiệu lực: tên dịch vụ, tiệm, trạng thái, số tiền từng chặng. Không có liên hệ / ghi chú / mã đơn.
    'bookings', coalesce((
      select jsonb_agg(jsonb_build_object(
               'type', b.type,
               'status', b.status,
               'total_price', b.total_price,
               'appointment_at', b.appointment_at,
               'vendor', jsonb_build_object('name', v.name, 'category', v.category, 'slug', v.slug),
               'dress', case when d.id is null then null else jsonb_build_object('name', d.name) end,
               'details', jsonb_build_object('package', jsonb_build_object('name', b.details -> 'package' ->> 'name')),
               'milestones', coalesce((
                 select jsonb_agg(jsonb_build_object('stage', m.stage, 'status', m.status, 'amount', m.amount) order by m.stage)
                 from public.milestones m where m.booking_id = b.id), '[]'::jsonb))
             order by b.created_at)
      from public.bookings b
      join public.vendors v on v.id = b.vendor_id
      left join public.dresses d on d.id = b.dress_id
      where b.bride_id = p.owner_id and b.status not in ('cancelled', 'refunded')), '[]'::jsonb)
  );
end $$;

-- ---------- QUYỀN GỌI HÀM ----------
revoke execute on function public.new_plan_share_token() from public, anon, authenticated;
revoke execute on function public.my_plan_id() from public, anon, authenticated;
revoke execute on function public.my_plan_share() from public, anon;
grant execute on function public.my_plan_share() to authenticated;
revoke execute on function public.set_plan_share(boolean) from public, anon;
grant execute on function public.set_plan_share(boolean) to authenticated;
revoke execute on function public.rotate_plan_share() from public, anon;
grant execute on function public.rotate_plan_share() to authenticated;
revoke execute on function public.get_shared_plan(text) from public;
grant execute on function public.get_shared_plan(text) to anon, authenticated;
