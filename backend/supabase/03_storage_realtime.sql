-- =====================================================================
-- TRẠM HỶ – 03_STORAGE_REALTIME.SQL
-- Kho ảnh (Storage) + cập nhật thời gian thực (Realtime). Chạy SAU 02.
-- =====================================================================

-- ---------- 1. BUCKET ẢNH ----------
-- bride-photos     : ảnh toàn thân cô dâu → RIÊNG TƯ, mỗi người chỉ thấy thư mục của mình
-- dress-images     : ảnh mẫu váy          → công khai
-- vendor-portfolio : ảnh portfolio studio → công khai
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('bride-photos',     'bride-photos',     false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('dress-images',     'dress-images',     true,  5242880,  array['image/jpeg', 'image/png', 'image/webp']),
  ('vendor-portfolio', 'vendor-portfolio', true,  5242880,  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Ảnh cô dâu: đường dẫn bắt buộc dạng  <user_id>/ten-file.jpg
create policy "bride_photos_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'bride-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "bride_photos_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'bride-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "bride_photos_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'bride-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Ảnh váy / portfolio: ai cũng xem (bucket public). Chủ tiệm upload vào  <vendor_id>/ten-file.jpg
create policy "vendor_images_insert_owner" on storage.objects for insert to authenticated
  with check (
    bucket_id in ('dress-images', 'vendor-portfolio')
    and exists (select 1 from public.vendors v
                where v.id::text = (storage.foldername(name))[1] and v.owner_id = auth.uid())
  );
create policy "vendor_images_delete_owner" on storage.objects for delete to authenticated
  using (
    bucket_id in ('dress-images', 'vendor-portfolio')
    and exists (select 1 from public.vendors v
                where v.id::text = (storage.foldername(name))[1] and v.owner_id = auth.uid())
  );


-- ---------- 2. REALTIME ----------
-- Cô dâu cọc xong → Kanban của vendor & màn admin tự nhảy, không cần F5.
-- Realtime vẫn tôn trọng RLS: ai chỉ nhận được thay đổi của dòng họ được phép xem.
alter publication supabase_realtime add table public.bookings, public.milestones, public.disputes;
