-- =====================================================================
-- TRẠM HỶ – 17_BECOME_PARTNER.SQL
-- "Trở thành đối tác" như các sàn lớn: một tài khoản dùng cho cả mua lẫn bán. Chạy SAU 16.
--   1. Cô dâu tự mở tiệm được (không cần tạo tài khoản mới / nhờ admin) → gửi hồ sơ xong tự thành đối tác.
--      Đối tác vẫn đặt dịch vụ cho đám cưới của mình như bình thường.
--   2. Bảng vendor_payouts: tài khoản ngân hàng nhận tiền giải ngân – RIÊNG TƯ
--      (bảng vendors ai cũng đọc được nên không để số tài khoản ở đó). Chỉ chủ tiệm + admin xem.
-- Chạy lại nhiều lần không lỗi.
-- =====================================================================

-- ---------- 1. ĐĂNG KÝ MỞ TIỆM (cho phép cả cô dâu) ----------
create or replace function public.register_vendor(
  p_name        text,
  p_category    public.vendor_category,
  p_district    text,
  p_address     text,
  p_phone       text,
  p_base_price  bigint,
  p_description text,
  p_slug_hint   text default null
) returns public.vendors
language plpgsql security definer set search_path = public as $$
declare
  v_slug text;
  v public.vendors;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role in ('bride', 'vendor')) then
    raise exception 'Tài khoản này không mở tiệm được – hãy đăng nhập bằng tài khoản cá nhân';
  end if;
  if exists (select 1 from public.vendors where owner_id = auth.uid() and status = 'pending') then
    raise exception 'Bạn đã có một hồ sơ đang chờ duyệt';
  end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Vui lòng nhập tên tiệm'; end if;
  if coalesce(trim(p_phone), '') = '' then raise exception 'Vui lòng nhập số điện thoại liên hệ'; end if;
  if p_base_price is null or p_base_price <= 0 then raise exception 'Giá khởi điểm không hợp lệ'; end if;

  v_slug := trim(both '-' from regexp_replace(lower(coalesce(p_slug_hint, '')), '[^a-z0-9]+', '-', 'g'));
  v_slug := coalesce(nullif(v_slug, ''), 'doi-tac') || '-' || substr(md5(random()::text), 1, 5);

  insert into public.vendors (slug, owner_id, name, category, district, address, phone, base_price, description, status)
  values (v_slug, auth.uid(), trim(p_name), p_category, trim(p_district), trim(p_address), trim(p_phone),
          p_base_price, nullif(trim(p_description), ''), 'pending')
  returning * into v;

  -- Cô dâu gửi hồ sơ mở tiệm → thành đối tác (vẫn giữ quyền đặt dịch vụ như khách)
  update public.profiles set role = 'vendor' where id = auth.uid() and role = 'bride';
  return v;
end $$;

revoke execute on function public.register_vendor from public, anon;
grant execute on function public.register_vendor to authenticated;


-- ---------- 2. TÀI KHOẢN NHẬN TIỀN GIẢI NGÂN (riêng tư) ----------
create table if not exists public.vendor_payouts (
  vendor_id     uuid primary key references public.vendors(id) on delete cascade,
  bank_code     text not null,
  account_no    text not null check (account_no ~ '^[0-9]{6,20}$'),
  account_name  text not null check (length(trim(account_name)) between 2 and 80),
  updated_at    timestamptz not null default now()
);
alter table public.vendor_payouts enable row level security;

drop policy if exists "payouts_select_owner_admin" on public.vendor_payouts;
create policy "payouts_select_owner_admin" on public.vendor_payouts for select
  using (public.owns_vendor(vendor_id) or public.is_admin());
drop policy if exists "payouts_insert_owner" on public.vendor_payouts;
create policy "payouts_insert_owner" on public.vendor_payouts for insert
  with check (public.owns_vendor(vendor_id));
drop policy if exists "payouts_update_owner" on public.vendor_payouts;
create policy "payouts_update_owner" on public.vendor_payouts for update
  using (public.owns_vendor(vendor_id)) with check (public.owns_vendor(vendor_id));

-- Tên chủ tài khoản viết hoa không dấu như trên thẻ ngân hàng; thời gian do server đặt
create or replace function public.vendor_payouts_clean() returns trigger
language plpgsql as $$
begin
  new.account_name := upper(trim(regexp_replace(new.account_name, '\s+', ' ', 'g')));
  new.account_no   := regexp_replace(new.account_no, '\s', '', 'g');
  new.updated_at   := now();
  return new;
end $$;
drop trigger if exists vendor_payouts_clean on public.vendor_payouts;
create trigger vendor_payouts_clean before insert or update on public.vendor_payouts
  for each row execute function public.vendor_payouts_clean();
