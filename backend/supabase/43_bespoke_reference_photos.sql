-- =====================================================================
-- TRẠM HỶ – 43_BESPOKE_REFERENCE_PHOTOS.SQL
-- Ảnh tham khảo của đơn may đo (trang Thiết kế váy). Chạy SAU 42.
--   Khách đính tối đa 3 ảnh riêng tư vào đơn: bookings.details.design.references = [{ bucket, path }]
--     bucket bride-photos  : ảnh của khách / ảnh váy khách tự tải lên (<bride_id>/...)
--     bucket tryon-results : ảnh AI ướm thử (<bride_id>/...)
--   Chủ tiệm nhận đơn (và admin) được XEM đúng những ảnh đó, chỉ khi đơn chưa hủy / chưa hoàn tiền.
--   Đường dẫn phải nằm trong thư mục của chính cô dâu đặt đơn → khách không thể "đính" ảnh của người khác.
-- =====================================================================

-- Viết thành hàm security definer (giống owns_vendor_folder ở 03/09): viết subquery thẳng trong policy
-- thì "name" bị hiểu nhầm thành cột của bảng khác.
create or replace function public.can_see_booking_reference(p_bucket text, p_object_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.bookings b
    where b.status not in ('cancelled', 'refunded')
      and (public.owns_vendor(b.vendor_id) or public.is_admin())
      and split_part(p_object_name, '/', 1) = b.bride_id::text
      and b.details -> 'design' -> 'references'
          @> jsonb_build_array(jsonb_build_object('bucket', p_bucket, 'path', p_object_name))
  );
$$;

drop policy if exists "booking_references_select" on storage.objects;
create policy "booking_references_select" on storage.objects for select to authenticated
  using (bucket_id in ('bride-photos', 'tryon-results') and public.can_see_booking_reference(bucket_id, name));
