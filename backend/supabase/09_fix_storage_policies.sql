-- =====================================================================
-- TRẠM HỶ – 09_FIX_STORAGE_POLICIES.SQL
-- Sửa lỗi đối tác tải ảnh bị báo "new row violates row-level security policy". Chạy SAU 08.
--
-- Nguyên nhân: policy cũ (03) viết
--     exists (select 1 from public.vendors v where v.id::text = (storage.foldername(name))[1] ...)
-- Trong câu select đó, "name" bị Postgres hiểu là cột vendors.name (tên tiệm) thay vì
-- storage.objects.name (đường dẫn file) → không bao giờ khớp → mọi lần tải ảnh đều bị chặn.
-- Cách sửa: kiểm tra thư mục bằng một hàm riêng, policy chỉ truyền đường dẫn file vào.
-- =====================================================================

-- Thư mục đầu tiên của đường dẫn file ("<vendor_id>/ten-anh.jpg") có phải tiệm của người đang đăng nhập?
create or replace function public.owns_vendor_folder(p_object_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.vendors v
    where v.id::text = split_part(p_object_name, '/', 1) and v.owner_id = auth.uid()
  );
$$;

drop policy if exists "vendor_images_insert_owner" on storage.objects;
create policy "vendor_images_insert_owner" on storage.objects for insert to authenticated
  with check (bucket_id in ('dress-images', 'vendor-portfolio') and public.owns_vendor_folder(name));

drop policy if exists "vendor_images_delete_owner" on storage.objects;
create policy "vendor_images_delete_owner" on storage.objects for delete to authenticated
  using (bucket_id in ('dress-images', 'vendor-portfolio') and public.owns_vendor_folder(name));
