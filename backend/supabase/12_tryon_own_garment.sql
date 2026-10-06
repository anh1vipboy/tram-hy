-- =====================================================================
-- TRẠM HỶ – 12_TRYON_OWN_GARMENT.SQL
-- Thử váy AI với ẢNH VÁY NGƯỜI DÙNG TỰ TẢI LÊN (không phải mẫu của tiệm). Chạy SAU 11.
--   Ảnh váy nằm cùng kho riêng tư bride-photos/<user_id>/garment-....jpg (quyền đã có từ file 03)
--   tryon_jobs ghi thêm đường dẫn ảnh váy để "Ảnh đã thử" hiện lại được váy nào.
-- =====================================================================

alter table public.tryon_jobs add column if not exists garment_path text;   -- null khi thử mẫu của tiệm (dùng dress_id)
