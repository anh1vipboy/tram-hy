-- =====================================================================
-- TRẠM HỶ – 06_VENDOR_ONBOARDING.SQL
-- Đối tác tự đăng ký mở tiệm → admin duyệt / từ chối. Chạy SAU 05.
--   1. Thêm trạng thái hồ sơ cho bảng vendors (pending / approved / rejected)
--   2. Tiệm chưa duyệt: chỉ chủ tiệm và admin thấy; không nhận đơn
--   3. Hàm: register_vendor, resubmit_vendor, admin_review_vendor
--   4. Realtime cho vendors (đối tác thấy kết quả duyệt ngay)
-- =====================================================================

-- ---------- 1. CỘT MỚI ----------
-- Các tiệm đã có (dữ liệu mẫu) nhận 'approved'; tiệm đăng ký mới mặc định 'pending'.
alter table public.vendors
  add column if not exists status text not null default 'approved'
    check (status in ('pending', 'approved', 'rejected')),
  add column if not exists phone text,
  add column if not exists review_note text,
  add column if not exists reviewed_at timestamptz;
alter table public.vendors alter column status set default 'pending';

-- Chủ tiệm được tự sửa số điện thoại liên hệ (các cột khác đã cấp ở 01_schema.sql)
grant update (phone) on public.vendors to authenticated;


-- ---------- 2. AI THẤY TIỆM NÀO ----------
drop policy if exists "vendors_select_all" on public.vendors;
create policy "vendors_select" on public.vendors for select
  using (status = 'approved' or owner_id = auth.uid() or public.is_admin());

drop policy if exists "dresses_select" on public.dresses;
create policy "dresses_select" on public.dresses for select
  using (
    (is_active and exists (select 1 from public.vendors v where v.id = vendor_id and v.status = 'approved'))
    or public.owns_vendor(vendor_id)
    or public.is_admin()
  );

-- Không cho đặt lịch với tiệm chưa được duyệt
create or replace function public.bookings_require_approved_vendor() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.vendors where id = new.vendor_id and status = 'approved') then
    raise exception 'Đối tác này chưa được Trạm Hỷ duyệt, chưa thể đặt lịch';
  end if;
  return new;
end $$;

drop trigger if exists bookings_require_approved_vendor on public.bookings;
create trigger bookings_require_approved_vendor before insert on public.bookings
  for each row execute function public.bookings_require_approved_vendor();


-- ---------- 3. HÀM NGHIỆP VỤ ----------

-- Đối tác gửi hồ sơ mở tiệm (trạng thái pending)
create or replace function public.register_vendor(
  p_name        text,
  p_category    public.vendor_category,
  p_district    text,
  p_address     text,
  p_phone       text,
  p_base_price  bigint,
  p_description text,
  p_slug_hint   text default null      -- tên tiệm không dấu, frontend tạo sẵn để làm đường dẫn đẹp
) returns public.vendors
language plpgsql security definer set search_path = public as $$
declare
  v_slug text;
  v public.vendors;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'vendor') then
    raise exception 'Chỉ tài khoản đối tác mới đăng ký mở tiệm được';
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
  return v;
end $$;

-- Hồ sơ bị từ chối → chủ tiệm sửa thông tin (update thường) rồi gửi duyệt lại
create or replace function public.resubmit_vendor(p_vendor_id uuid)
returns public.vendors
language plpgsql security definer set search_path = public as $$
declare
  v public.vendors;
begin
  update public.vendors set status = 'pending', review_note = null, reviewed_at = null
   where id = p_vendor_id and owner_id = auth.uid() and status = 'rejected'
   returning * into v;
  if not found then raise exception 'Không có hồ sơ bị từ chối nào để gửi lại'; end if;
  return v;
end $$;

-- Admin duyệt (tiệm lên sàn) hoặc từ chối (bắt buộc ghi lý do)
create or replace function public.admin_review_vendor(p_vendor_id uuid, p_approve boolean, p_note text default null)
returns public.vendors
language plpgsql security definer set search_path = public as $$
declare
  v public.vendors;
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên Trạm Hỷ được duyệt đối tác';
  end if;
  if not p_approve and coalesce(trim(p_note), '') = '' then
    raise exception 'Vui lòng ghi lý do từ chối để đối tác sửa hồ sơ';
  end if;

  update public.vendors
     set status = case when p_approve then 'approved' else 'rejected' end,
         review_note = nullif(trim(p_note), ''),
         reviewed_at = now(),
         is_verified = case when p_approve then is_verified else false end
   where id = p_vendor_id
   returning * into v;
  if not found then raise exception 'Không tìm thấy đối tác'; end if;
  return v;
end $$;

revoke execute on function public.register_vendor, public.resubmit_vendor, public.admin_review_vendor from public, anon;
grant execute on function public.register_vendor, public.resubmit_vendor, public.admin_review_vendor to authenticated;


-- ---------- 4. REALTIME + DỌN ẢNH ----------
alter publication supabase_realtime add table public.vendors;

-- Ảnh mẫu váy trong dữ liệu mẫu là ảnh stock không đúng mẫu → bỏ, web dùng ảnh thử váy cùng kiểu.
-- Từ nay image_url chỉ chứa ảnh thật do đối tác tải lên.
update public.dresses set image_url = null;
