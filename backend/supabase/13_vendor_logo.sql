-- =====================================================================
-- TRẠM HỶ – 13_VENDOR_LOGO.SQL
-- Ảnh đại diện (logo) của tiệm. Chạy SAU 12.
--   Ảnh nằm ở bucket công khai vendor-portfolio/<vendor_id>/logo-....jpg
--   (quyền tải/xóa theo thư mục tiệm đã có từ file 03 + 09)
--   Chủ tiệm tự đổi được (RLS vendors_update_owner), cấp thêm quyền sửa cột logo_url.
-- =====================================================================

alter table public.vendors add column if not exists logo_url text;

grant update (logo_url) on public.vendors to authenticated;
