-- =====================================================================
-- TRẠM HỶ – 26_INVITATION_MEDIA.SQL
-- Kho video thiệp cưới: cô dâu chú rể tải video từ máy lên (mục 8 – Video cưới). Chạy SAU 25.
--   Bucket công khai invitation-media/<user_id>/... (khách mời xem được), tối đa 50MB / file (giới hạn gói Free của Supabase).
--   Chỉ chủ thư mục được tải lên / thay / xóa. Chạy lại nhiều lần không lỗi.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('invitation-media', 'invitation-media', true, 52428800,
        array['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "invitation_media_insert_own" on storage.objects;
create policy "invitation_media_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'invitation-media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "invitation_media_update_own" on storage.objects;
create policy "invitation_media_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'invitation-media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "invitation_media_delete_own" on storage.objects;
create policy "invitation_media_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'invitation-media' and (storage.foldername(name))[1] = auth.uid()::text);
