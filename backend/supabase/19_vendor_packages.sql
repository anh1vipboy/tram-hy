-- =====================================================================
-- TRẠM HỶ – 19_VENDOR_PACKAGES.SQL
-- "Gói dịch vụ" cho tiệm không phải váy cưới: mẫu rạp & trang trí, gói chụp, gói trang điểm, sảnh & thực đơn.
-- Mỗi gói: tên, giá, giá gốc, mô tả, ảnh chính + tối đa 10 ảnh chi tiết; khách đặt đúng gói với đúng giá. Chạy SAU 18.
--   Ảnh nằm ở bucket công khai vendor-portfolio/<vendor_id>/pkg-... (quyền theo thư mục tiệm đã có từ 03 + 09).
-- Chạy lại nhiều lần không lỗi.
-- =====================================================================

-- ---------- 1. GÓI DỊCH VỤ ----------
create table if not exists public.vendor_packages (
  id              uuid primary key default gen_random_uuid(),
  vendor_id       uuid not null references public.vendors(id) on delete cascade,
  name            text not null check (length(trim(name)) between 2 and 120),
  price           bigint not null check (price between 100000 and 10000000000),
  original_price  bigint check (original_price is null or original_price > 0),
  description     text check (length(description) <= 1500),
  image_url       text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);
create index if not exists vendor_packages_vendor_idx on public.vendor_packages (vendor_id, price);

alter table public.vendor_packages enable row level security;

-- Khách xem gói đang bán của tiệm đã duyệt; chủ tiệm / admin xem hết
drop policy if exists "packages_select" on public.vendor_packages;
create policy "packages_select" on public.vendor_packages for select using (
  (is_active and exists (select 1 from public.vendors v where v.id = vendor_id and v.status = 'approved'))
  or public.owns_vendor(vendor_id) or public.is_admin());
drop policy if exists "packages_insert_owner" on public.vendor_packages;
create policy "packages_insert_owner" on public.vendor_packages for insert with check (public.owns_vendor(vendor_id));
drop policy if exists "packages_update_owner" on public.vendor_packages;
create policy "packages_update_owner" on public.vendor_packages for update
  using (public.owns_vendor(vendor_id)) with check (public.owns_vendor(vendor_id));
drop policy if exists "packages_delete_owner" on public.vendor_packages;
create policy "packages_delete_owner" on public.vendor_packages for delete using (public.owns_vendor(vendor_id));

-- Tối đa 30 gói mỗi tiệm (đếm trong trigger, không trong policy – tránh đệ quy RLS)
create or replace function public.vendor_packages_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.vendor_packages where vendor_id = new.vendor_id) >= 30 then
    raise exception 'Mỗi tiệm tối đa 30 gói – hãy xóa bớt gói cũ';
  end if;
  return new;
end $$;
drop trigger if exists vendor_packages_limit on public.vendor_packages;
create trigger vendor_packages_limit before insert on public.vendor_packages
  for each row execute function public.vendor_packages_limit();


-- ---------- 2. ẢNH CHI TIẾT CỦA GÓI ----------
create table if not exists public.package_photos (
  id          uuid primary key default gen_random_uuid(),
  package_id  uuid not null references public.vendor_packages(id) on delete cascade,
  path        text not null,      -- đường dẫn trong bucket vendor-portfolio, dùng để xóa file
  url         text not null,
  created_at  timestamptz not null default now()
);
create index if not exists package_photos_pkg_idx on public.package_photos (package_id, created_at);
alter table public.package_photos enable row level security;

drop policy if exists "package_photos_select" on public.package_photos;
create policy "package_photos_select" on public.package_photos for select
  using (exists (select 1 from public.vendor_packages p where p.id = package_id));
drop policy if exists "package_photos_insert_owner" on public.package_photos;
create policy "package_photos_insert_owner" on public.package_photos for insert
  with check (exists (select 1 from public.vendor_packages p where p.id = package_id and public.owns_vendor(p.vendor_id)));
drop policy if exists "package_photos_delete_owner" on public.package_photos;
create policy "package_photos_delete_owner" on public.package_photos for delete
  using (exists (select 1 from public.vendor_packages p where p.id = package_id and public.owns_vendor(p.vendor_id)));

create or replace function public.package_photos_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.package_photos where package_id = new.package_id) >= 10 then
    raise exception 'Mỗi gói tối đa 10 ảnh chi tiết';
  end if;
  return new;
end $$;
drop trigger if exists package_photos_limit on public.package_photos;
create trigger package_photos_limit before insert on public.package_photos
  for each row execute function public.package_photos_limit();


-- ---------- 3. ĐƠN ĐẶT THEO GÓI ----------
alter table public.bookings add column if not exists package_id uuid references public.vendor_packages(id) on delete set null;

-- Thêm tham số p_package_id (giữ nguyên các tham số cũ). Đổi danh sách tham số → phải xóa hàm cũ trước.
drop function if exists public.create_booking(uuid, public.booking_type, uuid, timestamptz, text, text, text, jsonb, bigint);

create or replace function public.create_booking(
  p_vendor_id       uuid,
  p_type            public.booking_type,
  p_dress_id        uuid        default null,
  p_appointment_at  timestamptz default null,
  p_contact_name    text        default null,
  p_contact_phone   text        default null,
  p_note            text        default null,
  p_details         jsonb       default '{}'::jsonb,
  p_custom_price    bigint      default null,   -- chỉ dùng cho may đo (giá do Atelier Builder tính)
  p_package_id      uuid        default null    -- gói dịch vụ của tiệm (giá lấy từ gói, không tin giá gửi lên)
) returns public.bookings
language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_price   bigint;
  v_dress   public.dresses;
  v_package public.vendor_packages;
  v_details jsonb := coalesce(p_details, '{}'::jsonb);
  v_booking public.bookings;
  v_pcts    int[];
  v_titles  text[];
  v_amount  bigint;
  v_sum     bigint := 0;
  i         int;
begin
  if v_uid is null then
    raise exception 'Bạn cần đăng nhập để đặt lịch';
  end if;
  if p_dress_id is not null and p_package_id is not null then
    raise exception 'Chỉ chọn một mẫu váy hoặc một gói dịch vụ';
  end if;

  if p_dress_id is not null then
    select * into v_dress from public.dresses where id = p_dress_id and is_active;
    if not found then raise exception 'Không tìm thấy mẫu váy'; end if;
    if v_dress.vendor_id <> p_vendor_id then raise exception 'Mẫu váy không thuộc đối tác này'; end if;
    v_price := v_dress.price;
  elsif p_package_id is not null then
    select * into v_package from public.vendor_packages where id = p_package_id and is_active;
    if not found then raise exception 'Gói dịch vụ không còn mở bán'; end if;
    if v_package.vendor_id <> p_vendor_id then raise exception 'Gói dịch vụ không thuộc đối tác này'; end if;
    v_price := v_package.price;
    -- lưu tên gói vào đơn: tiệm đổi tên / xóa gói sau này đơn vẫn ghi đúng gói khách đã đặt
    v_details := v_details || jsonb_build_object('package', jsonb_build_object('id', v_package.id, 'name', v_package.name));
  else
    select base_price into v_price from public.vendors where id = p_vendor_id;
    if not found then raise exception 'Không tìm thấy đối tác'; end if;
  end if;

  if p_type in ('bespoke_prompt', 'bespoke_image', 'bespoke_manual') then
    if p_custom_price is not null then
      if p_custom_price not between 5000000 and 50000000 then
        raise exception 'Giá may đo không hợp lệ';
      end if;
      v_price := p_custom_price;
    end if;
    v_pcts   := array[30, 40, 30];
    v_titles := array['Duyệt phác thảo 3D & mẫu vải', 'Thử rập mộc Toile', 'Nghiệm thu váy hoàn thiện'];
  else
    v_pcts   := array[30, 50, 20];
    v_titles := array['Cọc giữ lịch', 'Sau buổi thử / bấm máy', 'Nghiệm thu & hoàn tất'];
  end if;

  if v_price is null or v_price <= 0 then
    raise exception 'Đối tác chưa có giá, không thể đặt lịch';
  end if;

  insert into public.bookings (bride_id, vendor_id, dress_id, package_id, type, appointment_at, total_price,
                               contact_name, contact_phone, note, details)
  values (v_uid, p_vendor_id, p_dress_id, p_package_id, p_type, p_appointment_at, v_price,
          p_contact_name, p_contact_phone, p_note, v_details)
  returning * into v_booking;

  for i in 1..3 loop
    -- chặng cuối lấy phần còn lại để tổng luôn khớp total_price (tránh lệch do làm tròn)
    v_amount := case when i = 3 then v_price - v_sum else round(v_price * v_pcts[i] / 100.0) end;
    v_sum := v_sum + v_amount;
    insert into public.milestones (booking_id, stage, title, percent, amount)
    values (v_booking.id, i, v_titles[i], v_pcts[i], v_amount);
  end loop;

  return v_booking;
end $$;

revoke execute on function public.create_booking from public, anon;
grant execute on function public.create_booking to authenticated;
