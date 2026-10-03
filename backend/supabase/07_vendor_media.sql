-- =====================================================================
-- TRẠM HỶ – 07_VENDOR_MEDIA.SQL
-- Ảnh thực tế (portfolio) của tiệm. Chạy SAU 06.
--   - Ảnh lưu trong bucket công khai vendor-portfolio/<vendor_id>/... (đã tạo ở 03)
--   - Bảng vendor_photos ghi danh sách ảnh để sắp xếp, đếm, phân quyền
--   - Ảnh bìa: cột vendors.cover_url · Ảnh mẫu váy: cột dresses.image_url (đã có sẵn)
-- =====================================================================

create table public.vendor_photos (
  id          uuid primary key default gen_random_uuid(),
  vendor_id   uuid not null references public.vendors(id) on delete cascade,
  path        text not null,              -- đường dẫn trong bucket, dùng để xóa file
  url         text not null,              -- link công khai để hiển thị
  created_at  timestamptz not null default now()
);
create index on public.vendor_photos (vendor_id, created_at);

alter table public.vendor_photos enable row level security;

-- Xem được ảnh nếu xem được tiệm (tiệm chờ duyệt: chỉ chủ tiệm + admin)
create policy "vendor_photos_select" on public.vendor_photos for select
  using (exists (select 1 from public.vendors v where v.id = vendor_id));

-- Chủ tiệm thêm ảnh
create policy "vendor_photos_insert_owner" on public.vendor_photos for insert
  with check (public.owns_vendor(vendor_id));

-- Tối đa 20 ảnh mỗi tiệm. Đếm trong trigger chứ không trong policy: policy của một bảng
-- mà tự truy vấn chính bảng đó sẽ bị Postgres báo "infinite recursion".
create or replace function public.vendor_photos_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.vendor_photos where vendor_id = new.vendor_id) >= 20 then
    raise exception 'Mỗi tiệm tối đa 20 ảnh thực tế';
  end if;
  return new;
end $$;

create trigger vendor_photos_limit before insert on public.vendor_photos
  for each row execute function public.vendor_photos_limit();

create policy "vendor_photos_delete_owner" on public.vendor_photos for delete
  using (public.owns_vendor(vendor_id));
