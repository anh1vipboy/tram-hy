-- =====================================================================
-- XÓA DỮ LIỆU DEMO (do 15_demo_data.sql và 31_demo_services.sql tạo) – chạy khi không cần demo nữa.
-- Giữ lại ảnh bìa / giới thiệu đã điền (đối tác tự sửa được).
-- Lưu ý: điểm sao / số lượt đánh giá của tiệm không tự trừ lại; giá khởi điểm của nhà hàng demo vẫn tính theo bàn.
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

-- Gói mẫu (31). Đơn thật đã đặt gói mẫu vẫn giữ tên gói trong details, package_id tự về null.
-- Cột is_demo có từ SQL 30 → kiểm tra trước để file vẫn chạy được trên database chưa chạy 30.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'vendor_packages' and column_name = 'is_demo') then
    delete from public.vendor_packages where is_demo;
  end if;
end $$;

-- 9 tiệm mẫu tráp ăn hỏi / MC & âm nhạc / xe hoa (31) – bỏ qua tiệm đã có đơn thật
-- (gói, ảnh, tài khoản nhận tiền của tiệm tự xóa theo – on delete cascade)
delete from public.vendors v
 where v.slug in ('trap-hong-dao', 'moc-an-trap-cuoi', 'kinh-ky-le-vat',
                  'ha-am-band', 'lam-giang-acoustic', 'sao-khue-sound',
                  'xe-cuoi-hac-trang', 'may-trang-wedding-car', 'xe-hoa-lua-hong')
   and not exists (select 1 from public.bookings b where b.vendor_id = v.id);
