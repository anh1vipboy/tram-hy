-- =====================================================================
-- TRẠM HỶ – 29_VENDOR_CATEGORIES.SQL
-- Thêm 3 loại dịch vụ cưới mới cho sàn. Chạy SAU 28.
--   betrothal     = Tráp ăn hỏi (tráp lễ, đội bê tráp)
--   entertainment = MC & âm nhạc (MC, ban nhạc, âm thanh ánh sáng)
--   car           = Xe hoa (xe cưới, xe đưa đón khách)
--
-- VÌ SAO TÁCH RIÊNG FILE NÀY: Postgres không cho DÙNG giá trị enum mới trong cùng transaction
-- vừa thêm nó (lỗi "unsafe use of new value"). SQL Editor chạy cả file trong một transaction,
-- nên file này chỉ thêm giá trị – chạy xong (Run) rồi mới chạy 30 và 31 (31 tạo tiệm mẫu dùng loại mới).
--
-- Các hàm nhận loại dịch vụ (register_vendor ở 17, bảng kế hoạch cưới ở 20) đều dùng kiểu
-- public.vendor_category nên tự nhận loại mới, không phải sửa thêm.
-- Chạy lại nhiều lần không lỗi (if not exists).
-- =====================================================================

alter type public.vendor_category add value if not exists 'betrothal';
alter type public.vendor_category add value if not exists 'entertainment';
alter type public.vendor_category add value if not exists 'car';
