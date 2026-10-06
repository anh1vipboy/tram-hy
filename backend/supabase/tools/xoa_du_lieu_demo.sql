-- =====================================================================
-- XÓA DỮ LIỆU DEMO (do 15_demo_data.sql tạo) – chạy khi không cần demo nữa.
-- Giữ lại ảnh bìa / giới thiệu đã điền (đối tác tự sửa được).
-- Lưu ý: điểm sao / số lượt đánh giá của tiệm không tự trừ lại.
-- =====================================================================

-- Đơn mẫu → kéo theo chặng thanh toán và đánh giá mẫu (on delete cascade)
delete from public.bookings where details ->> 'seed' = 'demo';

-- 12 cô dâu mẫu → kéo theo profiles
delete from auth.users where email like '%@demo.tramhy.vn';

-- Ảnh thực tế + ảnh góc váy mẫu (link Unsplash, không có file trong Storage)
delete from public.vendor_photos where path like 'seed/%';
delete from public.dress_photos  where path like 'seed/%';

-- Mẫu váy thêm cho demo (bỏ qua mẫu đã có khách đặt)
delete from public.dresses d
 where d.slug in ('lace-vintage', 'satin-co-vuong', 'bellis-voan-tang', 'la-reine-duoi-ca',
                  'camile-tre-vai', 'juliette-crepe', 'bella-garden', 'aodai-gam-song-hy')
   and not exists (select 1 from public.bookings b where b.dress_id = d.id);
