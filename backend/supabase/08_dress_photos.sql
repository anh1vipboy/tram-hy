-- =====================================================================
-- TRẠM HỶ – 08_DRESS_PHOTOS.SQL
-- Chạy SAU 07.
--   1. Sửa lỗi tải ảnh "new row violates row-level security policy"
--   2. Ảnh nhiều góc cho mỗi mẫu váy (ảnh chính vẫn là dresses.image_url)
-- =====================================================================

-- ---------- 1. QUYỀN ĐỌC CHO 2 KHO ẢNH CÔNG KHAI ----------
-- Storage ghi file xong sẽ đọc lại dòng vừa ghi (và đọc trước khi xóa) → cần quyền SELECT,
-- thiếu là báo lỗi RLS dù đã có quyền INSERT. Hai kho này vốn công khai nên cho đọc tự do.
drop policy if exists "public_images_select" on storage.objects;
create policy "public_images_select" on storage.objects for select
  using (bucket_id in ('dress-images', 'vendor-portfolio'));


-- ---------- 2. ẢNH CÁC GÓC CỦA MẪU VÁY ----------
create table if not exists public.dress_photos (
  id          uuid primary key default gen_random_uuid(),
  dress_id    uuid not null references public.dresses(id) on delete cascade,
  path        text not null,      -- đường dẫn trong bucket dress-images, dùng để xóa file
  url         text not null,
  created_at  timestamptz not null default now()
);
create index if not exists dress_photos_dress_idx on public.dress_photos (dress_id, created_at);

alter table public.dress_photos enable row level security;

-- Xem được ảnh nếu xem được mẫu váy (RLS của bảng dresses quyết định)
drop policy if exists "dress_photos_select" on public.dress_photos;
create policy "dress_photos_select" on public.dress_photos for select
  using (exists (select 1 from public.dresses d where d.id = dress_id));

drop policy if exists "dress_photos_insert_owner" on public.dress_photos;
create policy "dress_photos_insert_owner" on public.dress_photos for insert
  with check (exists (select 1 from public.dresses d where d.id = dress_id and public.owns_vendor(d.vendor_id)));

drop policy if exists "dress_photos_delete_owner" on public.dress_photos;
create policy "dress_photos_delete_owner" on public.dress_photos for delete
  using (exists (select 1 from public.dresses d where d.id = dress_id and public.owns_vendor(d.vendor_id)));

-- Tối đa 10 ảnh góc mỗi mẫu (đếm trong trigger, không đếm trong policy để tránh "infinite recursion")
create or replace function public.dress_photos_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.dress_photos where dress_id = new.dress_id) >= 10 then
    raise exception 'Mỗi mẫu váy tối đa 10 ảnh các góc';
  end if;
  return new;
end $$;

drop trigger if exists dress_photos_limit on public.dress_photos;
create trigger dress_photos_limit before insert on public.dress_photos
  for each row execute function public.dress_photos_limit();
