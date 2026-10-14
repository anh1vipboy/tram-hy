-- =====================================================================
-- TRẠM HỶ – 27_INVITATION_STORAGE_SELECT.SQL
-- Sửa: xóa ảnh / video cũ của thiệp không có tác dụng. Supabase Storage cần quyền SELECT (đọc) trên file thì lệnh
-- remove() mới xóa được – thiếu thì API trả "thành công" nhưng không xóa gì → file thừa tích lại trong kho.
-- Cho chủ thư mục đọc file của chính mình (người khác vẫn không liệt kê được qua API; khách mời xem qua link công khai
-- như cũ vì 2 kho này là công khai). Chạy SAU 26. Chạy lại nhiều lần không lỗi.
-- =====================================================================

drop policy if exists "invitation_photos_select_own" on storage.objects;
create policy "invitation_photos_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'invitation-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "invitation_media_select_own" on storage.objects;
create policy "invitation_media_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'invitation-media' and (storage.foldername(name))[1] = auth.uid()::text);
