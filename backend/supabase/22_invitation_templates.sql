-- =====================================================================
-- TRẠM HỶ – 22_INVITATION_TEMPLATES.SQL
-- Thiệp cưới nâng cấp: chọn mẫu thiệp, thông tin nhà trai / nhà gái, lễ thành hôn + tiệc cưới, ảnh cưới. Chạy SAU 21.
--   - template : mã mẫu thiệp (danh sách ở frontend/js/data/invitation-templates.js)
--   - details  : các thông tin phụ (bố mẹ hai bên, địa chỉ, giờ lễ, nhà hàng…) – gom 1 cột jsonb, giới hạn dung lượng
--   - photo_url: ảnh cô dâu chú rể (bucket công khai invitation-photos/<owner_id>/...)
--   Cột theme cũ giữ nguyên để thiệp đã tạo vẫn mở được; thiệp cũ được gán mẫu tương ứng màu đã chọn.
-- Chạy lại nhiều lần không lỗi.
-- =====================================================================

alter table public.invitations add column if not exists template text;
alter table public.invitations add column if not exists details jsonb not null default '{}'::jsonb;
alter table public.invitations add column if not exists photo_url text;

-- Thiệp tạo trước bản này: chọn mẫu theo màu cũ (chỉ chạy cho dòng chưa có mẫu)
update public.invitations set template = case theme
    when 'red' then 'do-hy' when 'green' then 'bach-dan' when 'pink' then 'hong-phan' else 'champagne' end
  where template is null;
alter table public.invitations alter column template set default 'la-tim';
alter table public.invitations alter column template set not null;

alter table public.invitations drop constraint if exists invitations_template_check;
alter table public.invitations add constraint invitations_template_check
  check (template ~ '^[a-z0-9-]{2,30}$');
alter table public.invitations drop constraint if exists invitations_details_check;
alter table public.invitations add constraint invitations_details_check
  check (jsonb_typeof(details) = 'object' and pg_column_size(details) <= 8000);

-- ---------- ẢNH THIỆP: công khai (khách mời xem), chỉ chủ thư mục được tải lên / xóa ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('invitation-photos', 'invitation-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "invitation_photos_insert_own" on storage.objects;
create policy "invitation_photos_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'invitation-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "invitation_photos_update_own" on storage.objects;
create policy "invitation_photos_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'invitation-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "invitation_photos_delete_own" on storage.objects;
create policy "invitation_photos_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'invitation-photos' and (storage.foldername(name))[1] = auth.uid()::text);
