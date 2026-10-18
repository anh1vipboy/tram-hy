-- =====================================================================
-- TRẠM HỶ – 31_DEMO_SERVICES.SQL
-- Dữ liệu demo cho 3 loại dịch vụ mới + gói mẫu cho mọi tiệm demo không bán váy. Chạy SAU 30.
--   (29 thêm loại betrothal / entertainment / car, 30 thêm cột price_unit, min_qty, max_qty, is_demo, halls.)
--
--   1. 9 tiệm mẫu mới (tên hư cấu, không trùng doanh nghiệp thật): 3 tráp ăn hỏi, 3 MC & âm nhạc, 3 xe hoa.
--      Ảnh bìa là ảnh minh họa SVG của web (assets/images/covers) – cần deploy frontend trước thì ảnh mới hiện.
--   2. Gói mẫu (is_demo = true) cho 23 tiệm demo cũ (studio, decor, makeup, nhà hàng) và 9 tiệm mới,
--      mỗi tiệm 2–3 gói. Nhà hàng tính GIÁ MỖI BÀN (price_unit = 'table', min_qty–max_qty = số bàn của sảnh).
--   3. Nhà hàng demo: base_price = giá bàn rẻ nhất, halls = số sảnh tiệc.
--   4. 3 đánh giá mẫu cho mỗi tiệm mới (cùng cách làm với 15_demo_data.sql – cần 12 cô dâu mẫu của 15).
--
--   - Chạy lại nhiều lần không bị nhân đôi: tiệm "on conflict do nothing", gói mẫu khớp theo (tiệm, tên gói)
--     – có rồi thì cập nhật giá/mô tả, chưa có thì thêm, gói mẫu cũ không còn trong danh sách thì xóa.
--     Không đụng tới gói đối tác tự tạo (is_demo = false).
--   - Xóa sạch: tools/xoa_du_lieu_demo.sql
-- =====================================================================

-- ---------- 0. KIỂM TRA ĐÃ CHẠY 29 + 30 ----------
do $$
begin
  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                  where t.typname = 'vendor_category' and e.enumlabel = 'car') then
    raise exception 'Chưa có loại dịch vụ mới – hãy chạy 29_vendor_categories.sql trước';
  end if;
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'vendor_packages'
         and column_name in ('price_unit', 'min_qty', 'max_qty', 'is_demo')) < 4
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'vendors' and column_name = 'halls') then
    raise exception 'Chưa có cột giá theo bàn / gói mẫu – hãy chạy 30 trước';
  end if;
end $$;


-- ---------- 1. TIỆM MẪU MỚI ----------
-- review_count để thấp hơn 3 so với mục tiêu: phần 5 thêm 3 đánh giá, trigger tự cộng dồn điểm sao + lượt.
insert into public.vendors (slug, name, category, district, address, base_price, rating, review_count,
                            is_verified, status, cover_url, description) values
  ('trap-hong-dao', 'Tráp Lễ Hồng Đào', 'betrothal', 'Đống Đa, Hà Nội', 'Đống Đa, Hà Nội', 3200000, 4.9, 54, true, 'approved',
   'https://tram-hy-alpha.vercel.app/assets/images/covers/betrothal-1.svg',
   'Nhận làm tráp ăn hỏi trọn gói theo phong tục miền Bắc: tráp 5, 7, 9 lễ với trầu cau, chè, rượu, bánh cốm, bánh phu thê, hoa quả. Khay sơn mài, khăn phủ nhung đỏ, kết hoa tươi trong ngày. Có đội bê tráp nam nữ đồng phục và giao tráp tận nhà nội thành.'),
  ('moc-an-trap-cuoi', 'Mộc An Tráp Cưới', 'betrothal', 'Cầu Giấy, Hà Nội', 'Cầu Giấy, Hà Nội', 2800000, 4.7, 30, false, 'approved',
   'https://tram-hy-alpha.vercel.app/assets/images/covers/betrothal-2.svg',
   'Tráp cưới phong cách tối giản, hiện đại: tông pastel, hoa tươi nhập trong ngày, lễ vật đóng hộp tinh tế, tiện chia lại quả. Hợp các cặp đôi trẻ muốn lễ ăn hỏi nhẹ nhàng mà vẫn đủ nghi lễ.'),
  ('kinh-ky-le-vat', 'Kinh Kỳ Lễ Vật', 'betrothal', 'Hoàn Kiếm, Hà Nội', 'Hoàn Kiếm, Hà Nội', 4500000, 4.8, 38, true, 'approved',
   'https://tram-hy-alpha.vercel.app/assets/images/covers/betrothal-3.svg',
   'Lễ vật ăn hỏi cổ truyền Hà Nội: bánh cốm, bánh phu thê, mứt sen, chè Thái, rượu… sắp trên khay sơn mài thủ công. Trưởng đoàn bê tráp am hiểu nghi lễ, hướng dẫn hai họ từ lúc trao tráp đến khi lại quả.'),

  ('ha-am-band', 'Hạ Âm Band & MC', 'entertainment', 'Tây Hồ, Hà Nội', 'Tây Hồ, Hà Nội', 3500000, 4.9, 59, true, 'approved',
   'https://tram-hy-alpha.vercel.app/assets/images/covers/entertainment-1.svg',
   'MC và ban nhạc cho lễ cưới, tiệc cưới: MC song ngữ Việt – Anh, ban nhạc acoustic chơi đón khách và trong tiệc, ca sĩ hát tặng theo yêu cầu. Trao đổi kịch bản chương trình trước ngày cưới và tổng duyệt cùng nhà hàng.'),
  ('lam-giang-acoustic', 'Lam Giang Acoustic', 'entertainment', 'Ba Đình, Hà Nội', 'Ba Đình, Hà Nội', 5500000, 4.8, 25, true, 'approved',
   'https://tram-hy-alpha.vercel.app/assets/images/covers/entertainment-2.svg',
   'Ban nhạc acoustic và song tấu violin – guitar – cello cho tiệc cưới, lễ đính hôn, tiệc ngoài trời. Hơn 200 bài nhạc Việt và quốc tế, nhận soạn riêng bản phối cho khoảnh khắc cô dâu bước vào.'),
  ('sao-khue-sound', 'Sao Khuê Sound & Light', 'entertainment', 'Hà Đông, Hà Nội', 'Hà Đông, Hà Nội', 4500000, 4.6, 16, false, 'approved',
   'https://tram-hy-alpha.vercel.app/assets/images/covers/entertainment-3.svg',
   'Cho thuê âm thanh, ánh sáng, sân khấu cho đám cưới tại nhà, rạp cưới và sân vườn: loa line array, micro không dây, đèn moving head, màn LED, khói lạnh. Kỹ thuật viên trực suốt buổi, lắp đặt và tháo dỡ trong ngày.'),

  ('xe-cuoi-hac-trang', 'Xe Cưới Hạc Trắng', 'car', 'Thanh Xuân, Hà Nội', 'Thanh Xuân, Hà Nội', 2500000, 4.8, 71, true, 'approved',
   'https://tram-hy-alpha.vercel.app/assets/images/covers/car-1.svg',
   'Cho thuê xe cưới hạng sang Mercedes E-Class, S-Class màu trắng, kết hoa tươi theo màu hoa cầm tay của cô dâu. Tài xế mặc vest, thuộc đường nội thành, đón đúng giờ lành. Có xe 7, 16, 29 chỗ đưa đón họ hàng.'),
  ('may-trang-wedding-car', 'Mây Trắng Wedding Car', 'car', 'Nam Từ Liêm, Hà Nội', 'Nam Từ Liêm, Hà Nội', 2200000, 4.7, 33, true, 'approved',
   'https://tram-hy-alpha.vercel.app/assets/images/covers/car-2.svg',
   'Xe hoa điện VinFast VF 8, VF 9 và Mercedes mui trần cho rước dâu, chụp ảnh cưới. Xe đời mới, nội thất sạch, kết hoa tươi hoặc hoa lụa cao cấp. Nhận đoàn xe đưa đón khách đi tỉnh.'),
  ('xe-hoa-lua-hong', 'Xe Hoa Lụa Hồng', 'car', 'Hoàng Mai, Hà Nội', 'Hoàng Mai, Hà Nội', 1800000, 4.6, 19, false, 'approved',
   'https://tram-hy-alpha.vercel.app/assets/images/covers/car-3.svg',
   'Xe hoa giá mềm cho đám cưới tại nhà: Toyota Camry kết hoa lụa, xe 16 – 29 chỗ đưa đón họ hàng nội và ngoại thành. Báo giá trọn gói, không phát sinh phí cầu đường.')
on conflict (slug) do nothing;


-- ---------- 2. TIỆM NHẬN GÓI MẪU (23 tiệm demo cũ + 9 tiệm mới) ----------
-- i = thứ tự trong cùng loại (theo slug) – giống 15_demo_data.sql để ảnh gói không trùng ảnh bìa / ảnh thực tế
drop table if exists svc_vendors;
create temp table svc_vendors as
select v.id, v.slug, v.category::text as category, v.base_price,
       (row_number() over (partition by v.category order by v.slug) - 1)::int as i
from public.vendors v
where v.slug in (
  'tuart', 'mimosa', 'nupakachi', 'greenwedding', 'leduongstudio', 'jardinstudio',
  'storyteller', 'phidiep', 'lutece', 'mhsplanner', 'dezidecor',
  'maido', 'bulnguyen', 'callabridal', 'hanhlam', 'tinale', 'quachanh',
  'trongdong', 'lamourvenue', 'melia', 'jwmarriott', 'almaz', 'daewoo',
  'trap-hong-dao', 'moc-an-trap-cuoi', 'kinh-ky-le-vat',
  'ha-am-band', 'lam-giang-acoustic', 'sao-khue-sound',
  'xe-cuoi-hac-trang', 'may-trang-wedding-car', 'xe-hoa-lua-hong');


-- ---------- KHO ẢNH (cùng kho Unsplash với 15_demo_data.sql) ----------
drop table if exists svc_images;
create temp table svc_images (category text, n int, photo text);
insert into svc_images (category, n, photo)
select category, (row_number() over (partition by category order by ord) - 1)::int, photo
from (values
  ('studio', 1, 'photo-1519741497674-611481863552'), ('studio', 2, 'photo-1617724975854-70b5d0cedb0a'),
  ('studio', 3, 'photo-1722805740177-04256b6517f2'), ('studio', 4, 'photo-1506355639690-a1f2a100689e'),
  ('studio', 5, 'photo-1617725145063-56958eadf557'), ('studio', 6, 'photo-1600164913117-2125c1f60b01'),
  ('studio', 7, 'photo-1517456215183-9a2c3a748d0c'), ('studio', 8, 'photo-1595407753234-0882f1e77954'),
  ('studio', 9, 'photo-1648154164366-d067faecdc51'), ('studio', 10, 'photo-1629756048377-09540f52caa1'),
  ('studio', 11, 'photo-1519741196428-6a2175fa2557'), ('studio', 12, 'photo-1532712938310-34cb3982ef74'),
  ('studio', 13, 'photo-1511285560929-80b456fea0bc'), ('studio', 14, 'photo-1481653125770-b78c206c59d4'),
  ('studio', 15, 'photo-1503525443530-339273ca8a86'),
  ('decor', 1, 'photo-1738225734899-30852be7e396'), ('decor', 2, 'photo-1712068534065-f56c36e21759'),
  ('decor', 3, 'photo-1747115276395-607f2e5dc269'), ('decor', 4, 'photo-1677677403344-029c7fcd7300'),
  ('decor', 5, 'photo-1559982240-f760db87b822'), ('decor', 6, 'photo-1523438885200-e635ba2c371e'),
  ('decor', 7, 'photo-1560117531-02eeab8e3593'), ('decor', 8, 'photo-1559373098-e1caaccae791'),
  ('decor', 9, 'photo-1632316962873-47ee3d309f02'), ('decor', 10, 'photo-1758810411905-04fb6f9396e1'),
  ('decor', 11, 'photo-1469371670807-013ccf25f16a'), ('decor', 12, 'photo-1511795409834-ef04bbd61622'),
  ('decor', 13, 'photo-1464366400600-7168b8af9bc3'),
  ('makeup', 1, 'photo-1709477542149-f4e0e21d590b'), ('makeup', 2, 'photo-1709477542170-f11ee7d471a0'),
  ('makeup', 3, 'photo-1636023730877-233b9237d4ec'), ('makeup', 4, 'photo-1638959882708-9503b1cd595f'),
  ('makeup', 5, 'photo-1583784561105-a674080f391e'), ('makeup', 6, 'photo-1516975080664-ed2fc6a32937'),
  ('makeup', 7, 'photo-1512496015851-a90fb38ba796'), ('makeup', 8, 'photo-1652706299340-e8a346491541'),
  ('makeup', 9, 'photo-1682226335318-f1911fdef7c1'), ('makeup', 10, 'photo-1722805740076-7c51a8669afc'),
  ('makeup', 11, 'photo-1643216583837-f6d664d48eac'), ('makeup', 12, 'photo-1522337360788-8b13dee7a37e'),
  ('makeup', 13, 'photo-1596462502278-27bfdc403348'),
  ('venue', 1, 'photo-1723832348105-2e69f948135a'), ('venue', 2, 'photo-1525441273400-056e9c7517b3'),
  ('venue', 3, 'photo-1712314947761-a8d718bd8c32'), ('venue', 4, 'photo-1707333514312-39cf7658479c'),
  ('venue', 5, 'photo-1665607437981-973dcd6a22bb'), ('venue', 6, 'photo-1641996250159-9d2bbfb483fa'),
  ('venue', 7, 'photo-1519225421980-715cb0215aed'), ('venue', 8, 'photo-1502635385003-ee1e6a1a742d'),
  ('venue', 9, 'photo-1561593367-66c79c2294e6'), ('venue', 10, 'photo-1510076857177-7470076d4098'),
  ('venue', 11, 'photo-1519167758481-83f550bb49b3')
) as t(category, ord, photo);

create or replace function pg_temp.img(p_photo text, p_width int default 1200) returns text
language sql immutable as $$
  select 'https://images.unsplash.com/' || p_photo || '?auto=format&fit=crop&q=80&w=' || p_width
$$;

-- Ảnh thứ k của tiệm thứ i trong loại (xoay vòng kho ảnh) – y hệt pg_temp.pick của 15
create or replace function pg_temp.pick(p_category text, p_i int, p_k int) returns text
language sql stable as $$
  select photo from svc_images
  where category = p_category
    and n = (p_i * 3 + p_k) % (select count(*)::int from svc_images where category = p_category)
$$;

-- Giá tròn như bảng giá thật: dưới 10 triệu làm tròn 100.000đ, từ 10 triệu làm tròn 500.000đ
create or replace function pg_temp.round_price(p numeric) returns bigint
language sql immutable as $$
  select (case when p < 10000000 then round(p / 100000) * 100000
               else round(p / 500000) * 500000 end)::bigint
$$;


-- ---------- 3. MẪU GÓI CHO STUDIO / DECOR / MAKEUP ----------
-- Mỗi tiệm: 1 gói "entry" (giá = giá khởi điểm hiện tại của tiệm) + 1–2 gói "upper" (giá = giá khởi điểm × hệ số).
-- Tiệm thứ i lấy entry[i % 2], upper[i % 3] và (nếu i chẵn) upper[(i + 1) % 3] → các tiệm không giống hệt nhau.
drop table if exists svc_templates;
create temp table svc_templates (category text, slot text, variant int, name text, mult numeric, orig_mult numeric, description text);
insert into svc_templates (category, slot, variant, name, mult, orig_mult, description) values
  -- Chụp ảnh cưới
  ('studio', 'entry', 0, 'Pre-wedding tại studio', 1.0, null,
   'Chụp trong studio với 3 phông nền thiết kế riêng, 2 bộ trang phục cho cô dâu chú rể, đã gồm makeup và làm tóc. Nhận 25 ảnh chỉnh màu, 1 ảnh phóng lớn 60×90 cm và toàn bộ file gốc.'),
  ('studio', 'entry', 1, 'Ảnh cưới phố cổ Hà Nội', 1.0, null,
   'Một buổi chụp khoảng 4 giờ quanh hồ Hoàn Kiếm, phố cổ và cầu Long Biên, 2 bộ trang phục, makeup tại chỗ. Nhận 30 ảnh chỉnh màu và file gốc qua Google Drive sau 3 tuần.'),
  ('studio', 'upper', 0, 'Pre-wedding ngoại cảnh Mộc Châu / Tam Đảo', 1.7, 1.95,
   'Chụp trọn ngày ở ngoại cảnh, đã gồm xe đưa đón ekip, 3 bộ trang phục, makeup và làm tóc thay kiểu. Nhận 40 ảnh chỉnh màu, album 30×30 cm 20 trang và video hậu trường 1 phút.'),
  ('studio', 'upper', 1, 'Phóng sự ngày cưới (lễ gia tiên + tiệc)', 1.4, null,
   '2 thợ chụp theo suốt lễ gia tiên, rước dâu và tiệc cưới. Gửi 50 ảnh xem trước trong 48 giờ, giao 300–400 ảnh chỉnh màu sau 3 tuần.'),
  ('studio', 'upper', 2, 'Trọn gói ảnh cưới + quay phim highlight', 2.6, null,
   'Pre-wedding studio và ngoại cảnh nội thành, phóng sự ngày cưới, quay phim highlight 3–5 phút có flycam. Album cao cấp 2 cuốn và ảnh phóng lớn khung gỗ.'),
  -- Trang trí
  ('decor', 'entry', 0, 'Cổng hoa & bàn lễ gia tiên tại nhà', 1.0, null,
   'Cổng hoa lụa cao cấp 2,5 m, phông và bàn thờ gia tiên, hoa bàn lễ, đèn led trang trí. Thi công và tháo dỡ trong ngày, hợp nhà phố, nhà ống.'),
  ('decor', 'entry', 1, 'Lễ gia tiên phong cách hoàng gia', 1.0, null,
   'Phông cưới lụa đỏ – vàng, cổng hoa tươi, bàn thờ gia tiên, 2 cột hoa lối vào và đèn chùm pha lê. Có bản phối cảnh 3D trước 1 tuần.'),
  ('decor', 'upper', 0, 'Rạp cưới tại nhà trọn gói (rạp 6×12 m)', 1.6, null,
   'Dựng rạp khung thép mái che chống mưa, thảm, bàn ghế phủ khăn cho 15 bàn, cổng hoa, sân khấu nhỏ, quạt phun sương và đèn trang trí.'),
  ('decor', 'upper', 1, 'Trang trí sảnh tiệc: sân khấu, lối đi, bàn gallery', 1.9, 2.2,
   'Backdrop sân khấu 6 m, lối đi 8 trụ hoa, bàn gallery ảnh cưới, hoa bàn tiệc cho 30 bàn và hoa cầm tay cô dâu. Hoa tươi nhập trong ngày.'),
  ('decor', 'upper', 2, 'Concept tiệc cưới riêng theo yêu cầu', 2.8, null,
   'Thiết kế concept theo màu sắc và câu chuyện của hai bạn: cổng hoa, sân khấu, lối đi, khu check-in, bàn gallery, hoa bàn tiệc 40 bàn. Được chỉnh bản 3D 2 lần.'),
  -- Trang điểm
  ('makeup', 'entry', 0, 'Makeup cô dâu + làm tóc (1 buổi)', 1.0, null,
   'Trang điểm và làm tóc cô dâu cho một buổi lễ hoặc tiệc, mỹ phẩm cao cấp, mi giả và phụ kiện cài tóc. Được thử makeup trước 1 lần.'),
  ('makeup', 'entry', 1, 'Makeup cô dâu tại nhà – lễ gia tiên', 1.0, null,
   'Thợ đến tận nhà từ sáng sớm, trang điểm nhẹ nhàng hợp áo dài, búi tóc truyền thống và cài phụ kiện. Đã gồm phí di chuyển nội thành.'),
  ('makeup', 'upper', 0, 'Trọn ngày cưới: lễ sáng + tiệc tối', 1.7, null,
   'Thợ chính đi theo cả ngày: makeup lễ gia tiên buổi sáng, đổi kiểu tóc và dặm lại trước tiệc tối, hỗ trợ thay váy. Gồm buổi thử makeup trước ngày cưới.'),
  ('makeup', 'upper', 1, 'Cô dâu + mẹ hai bên', 1.5, 1.7,
   'Makeup và làm tóc cho cô dâu, trang điểm nhẹ nhàng sang trọng cho mẹ cô dâu và mẹ chú rể. Có thợ phụ đi kèm để kịp giờ lễ.'),
  ('makeup', 'upper', 2, 'Cô dâu + mẹ hai bên + 2 phù dâu', 2.2, null,
   'Ekip 3 người: makeup cô dâu trọn ngày, trang điểm cho mẹ hai bên và 2 phù dâu, làm tóc và cài hoa đồng bộ cho cả nhà.');


-- ---------- 4. GÓI VIẾT RIÊNG: NHÀ HÀNG (giá mỗi bàn 10 khách) + 9 TIỆM MỚI ----------
drop table if exists svc_explicit;
create temp table svc_explicit (slug text, name text, price bigint, original_price bigint,
                                price_unit text, min_qty int, max_qty int, description text);
insert into svc_explicit (slug, name, price, original_price, price_unit, min_qty, max_qty, description) values
  -- Nhà hàng tiệc: price = giá 1 bàn, min_qty–max_qty = số bàn sảnh nhận
  ('trongdong', 'Sảnh Ngọc Lan · Thực đơn Á 8 món', 3200000, null, 'table', 15, 35,
   'Giá cho 1 bàn 10 khách. 8 món Á truyền thống: nộm hoa chuối, súp hải sản, gà hấp lá chanh, cá chẽm sốt cà chua, bò xào lúc lắc, xôi gấc, lẩu nấm, chè hạt sen. Miễn phí sân khấu, âm thanh ánh sáng cơ bản, khăn ghế và cổng bóng.'),
  ('trongdong', 'Sảnh Hoàng Gia · Thực đơn Á – Âu 9 món', 3900000, null, 'table', 30, 60,
   'Giá cho 1 bàn 10 khách. Khai vị kiểu Âu, súp bào ngư, tôm hấp bia, gà quay mật ong, bò sốt tiêu đen, cá song hấp xì dầu, xôi cốm, lẩu hải sản, bánh và trái cây tráng miệng. Tặng tháp ly, rượu khai tiệc và MC dẫn chương trình.'),
  ('trongdong', 'Sảnh Đại Yến · Thực đơn cao cấp 10 món', 4800000, 5200000, 'table', 50, 100,
   'Giá cho 1 bàn 10 khách. 10 món có tôm hùm baby, bò Úc, cá tầm… Trần cao, màn LED sân khấu, ánh sáng moving head, phòng chờ cô dâu riêng. Tặng 1 két bia mỗi bàn.'),
  ('lamourvenue', 'Sảnh Ivory · Thực đơn Á 8 món', 3600000, null, 'table', 20, 40,
   'Giá cho 1 bàn 10 khách. Sảnh phong cách Pháp tông trắng ngà, cửa kính lấy sáng tự nhiên – hợp tiệc trưa. Tặng trang trí lối đi hoa lụa và khu check-in.'),
  ('lamourvenue', 'Sảnh Grand Gallery · Thực đơn Á – Âu 9 món', 4500000, null, 'table', 40, 80,
   'Giá cho 1 bàn 10 khách. Sảnh không cột, trần gương, sân khấu 12 m kèm màn LED. Đồ uống không cồn miễn phí, tặng rượu vang khai tiệc và bánh cưới 5 tầng.'),
  ('melia', 'Phòng tiệc Lotus · Thực đơn Á 9 món', 6500000, null, 'table', 15, 30,
   'Giá cho 1 bàn 10 khách, đã gồm phí phục vụ khách sạn. Phòng tiệc ấm cúng cho tiệc thân mật, 9 món Á do bếp khách sạn chế biến, tặng 1 đêm phòng Deluxe cho cô dâu chú rể.'),
  ('melia', 'Grand Ballroom · Thực đơn Á – Âu 10 món', 7800000, null, 'table', 40, 70,
   'Giá cho 1 bàn 10 khách. Ballroom đèn chùm pha lê, 10 món Á – Âu, bia và nước ngọt không giới hạn trong 3 giờ, tặng 1 đêm phòng Suite và bánh cưới.'),
  ('melia', 'Grand Ballroom · Tiệc Âu cao cấp + đồ uống trọn gói', 8900000, null, 'table', 40, 70,
   'Giá cho 1 bàn 10 khách. Set menu Âu 6 món phục vụ tại bàn, rượu vang, bia và cocktail trọn gói 4 giờ, hoa tươi bàn tiệc, nhạc công piano đón khách.'),
  ('jwmarriott', 'Phòng tiệc Ruby · Thực đơn Á 9 món', 7200000, null, 'table', 15, 35,
   'Giá cho 1 bàn 10 khách, đã gồm phí phục vụ. 9 món Á tinh tế, bia và nước ngọt trong 3 giờ, sân khấu và âm thanh ánh sáng chuẩn hội nghị, tặng 1 đêm phòng cho cô dâu chú rể.'),
  ('jwmarriott', 'Grand Ballroom · Thực đơn Á – Âu 10 món', 8500000, 9000000, 'table', 50, 100,
   'Giá cho 1 bàn 10 khách. Ballroom không cột, trần cao, 10 món Á – Âu, đồ uống trọn gói 4 giờ, màn LED và ánh sáng sân khấu, tặng phòng Suite và tiệc trà cho gia đình.'),
  ('almaz', 'Sảnh Sapphire · Thực đơn Á 8 món', 3000000, null, 'table', 20, 45,
   'Giá cho 1 bàn 10 khách. 8 món Á, bia và nước ngọt tính theo thực tế. Miễn phí sân khấu, âm thanh ánh sáng, MC và trang trí cơ bản; bãi đỗ xe rộng.'),
  ('almaz', 'Sảnh Kim Cương · Thực đơn Á – Âu 9 món', 3800000, null, 'table', 40, 80,
   'Giá cho 1 bàn 10 khách. 9 món Á – Âu, tặng tháp ly, rượu khai tiệc, khói lạnh khi cô dâu chú rể bước vào và màn LED trình chiếu ảnh cưới.'),
  ('almaz', 'Sảnh Hội Nghị Lớn · Thực đơn cao cấp 10 món', 4900000, null, 'table', 80, 150,
   'Giá cho 1 bàn 10 khách. Sảnh lớn cho tiệc đông khách, 10 món cao cấp, hai sân khấu, hệ thống âm thanh ánh sáng chuyên nghiệp, phòng chờ riêng cho hai họ.'),
  ('daewoo', 'Phòng tiệc Hibiscus · Thực đơn Á 8 món', 5200000, null, 'table', 15, 30,
   'Giá cho 1 bàn 10 khách, đã gồm phí phục vụ. Phòng tiệc ấm cúng, 8 món Á, nước ngọt miễn phí, tặng bánh cưới và trang trí hoa bàn tiệc.'),
  ('daewoo', 'Grand Ballroom · Thực đơn Á – Âu 10 món', 6600000, null, 'table', 40, 80,
   'Giá cho 1 bàn 10 khách. Ballroom trần cao, 10 món Á – Âu, bia và nước ngọt trong 3 giờ, sân khấu màn LED, tặng 1 đêm phòng cho cô dâu chú rể.'),

  -- Tráp ăn hỏi
  ('trap-hong-dao', 'Tráp 5 lễ truyền thống', 3200000, null, 'package', null, null,
   '5 tráp: trầu cau, chè – thuốc, rượu, bánh cốm – bánh phu thê, hoa quả. Khay sơn mài đỏ, khăn phủ nhung, kết hoa tươi. Giao và dựng tráp tận nhà nội thành Hà Nội.'),
  ('trap-hong-dao', 'Tráp 7 lễ + đội bê tráp 7 cặp', 7500000, null, 'package', null, null,
   '7 tráp lễ vật kèm đội bê tráp 7 nam 7 nữ: nữ áo dài đỏ, nam vest hoặc áo the khăn xếp. Trưởng đoàn hướng dẫn nghi lễ trao tráp, lại quả và chia lễ.'),
  ('trap-hong-dao', 'Tráp 9 lễ cao cấp trọn gói', 12900000, 14500000, 'package', null, null,
   '9 tráp với lợn sữa quay, bánh phu thê, bánh cốm, mứt sen, chè Thái, rượu vang, hoa quả nhập khẩu… Đã gồm đội bê tráp 9 cặp, trang trí bàn thờ gia tiên và phong bì lại quả.'),
  ('moc-an-trap-cuoi', 'Tráp 5 lễ tối giản tông pastel', 2800000, null, 'package', null, null,
   '5 tráp hộp gỗ sáng màu, hoa tươi tông pastel, lễ vật đóng hộp sẵn tiện chia lại quả. Hợp lễ ăn hỏi nhỏ gọn tại chung cư.'),
  ('moc-an-trap-cuoi', 'Tráp 7 lễ hoa tươi + đội bê tráp 5 cặp', 6200000, null, 'package', null, null,
   '7 tráp kết hoa tươi nhập trong ngày, đội bê tráp 5 cặp đồng phục áo dài pastel – sơ mi trắng, có người điều phối đi cùng.'),
  ('kinh-ky-le-vat', 'Tráp 7 lễ cổ truyền Hà Nội', 4500000, null, 'package', null, null,
   '7 tráp: trầu cau, chè, rượu, bánh cốm, bánh phu thê, mứt sen, hoa quả – xếp trên khay sơn mài thủ công, khăn phủ thêu chữ Hỷ.'),
  ('kinh-ky-le-vat', 'Tráp 9 lễ + đội bê tráp 9 cặp áo the khăn xếp', 10800000, null, 'package', null, null,
   '9 tráp lễ vật kèm đội bê tráp 9 cặp mặc áo the khăn xếp và áo dài gấm. Trưởng đoàn am hiểu phong tục, hướng dẫn hai họ suốt buổi lễ.'),
  ('kinh-ky-le-vat', 'Tráp 11 lễ sơn mài hoàng gia', 16500000, null, 'package', null, null,
   '11 tráp sơn mài vẽ vàng, có lợn sữa quay và xôi gấc, đội bê tráp 11 cặp, trang trí cổng và bàn thờ gia tiên nhà gái, chụp ảnh phóng sự lễ ăn hỏi 2 giờ.'),

  -- MC & âm nhạc
  ('ha-am-band', 'MC lễ cưới song ngữ Việt – Anh', 3500000, null, 'package', null, null,
   'MC dẫn lễ thành hôn và tiệc cưới (khoảng 3 giờ), soạn kịch bản theo câu chuyện của hai bạn, tổng duyệt cùng nhà hàng trước ngày cưới.'),
  ('ha-am-band', 'Ban nhạc acoustic 4 người (đón khách + trong tiệc)', 8500000, null, 'package', null, null,
   'Guitar, violin, cajon và ca sĩ chơi 45 phút đón khách và 90 phút trong tiệc. Gửi trước danh sách bài để cô dâu chú rể chọn, nhận 1 bài theo yêu cầu.'),
  ('ha-am-band', 'Trọn gói MC + ban nhạc + hát tặng', 11900000, 13500000, 'package', null, null,
   'MC song ngữ, ban nhạc acoustic 4 người và ca sĩ hát tặng cô dâu chú rể. Đã gồm âm thanh cơ bản cho sảnh dưới 40 bàn.'),
  ('lam-giang-acoustic', 'Song tấu violin – guitar đón khách (90 phút)', 5500000, null, 'package', null, null,
   '2 nhạc công chơi nhạc không lời ở khu đón khách và lúc cô dâu chú rể bước vào. Trang phục đồng bộ theo tông màu tiệc.'),
  ('lam-giang-acoustic', 'Ban nhạc acoustic 3 người + ca sĩ (cả buổi tiệc)', 9800000, null, 'package', null, null,
   'Violin, guitar, cello và 1 ca sĩ chơi suốt buổi tiệc (khoảng 3 giờ). Nhận soạn riêng một bản phối cho bài hát kỷ niệm của hai bạn.'),
  ('sao-khue-sound', 'Âm thanh tiệc cưới tại nhà', 4500000, null, 'package', null, null,
   '2 loa full, 1 loa sub, bàn mixer, 4 micro không dây, kỹ thuật viên trực suốt buổi. Phù hợp rạp cưới tại nhà dưới 25 bàn.'),
  ('sao-khue-sound', 'Âm thanh + ánh sáng sân khấu rạp cưới', 9500000, null, 'package', null, null,
   'Loa line array, 8 đèn moving head, đèn par led, khói lạnh khi cô dâu chú rể bước vào. Lắp đặt trước 1 ngày, tháo dỡ trong đêm.'),
  ('sao-khue-sound', 'Sân khấu trọn gói + màn LED 3×2 m', 18500000, null, 'package', null, null,
   'Sân khấu 6×4 m, màn LED trình chiếu ảnh cưới, âm thanh line array, ánh sáng moving head, máy tạo khói và pháo sáng lạnh. Có đạo diễn chương trình điều phối.'),

  -- Xe hoa
  ('xe-cuoi-hac-trang', 'Mercedes E300 trắng kết hoa tươi (4 giờ)', 2500000, null, 'package', null, null,
   'Xe Mercedes E300 màu trắng, kết hoa tươi đầu xe theo màu hoa cầm tay. Đã gồm tài xế, xăng, phí cầu đường nội thành; quá giờ tính 300.000đ/giờ.'),
  ('xe-cuoi-hac-trang', 'Mercedes S450 rước dâu + 1 xe 16 chỗ', 6800000, null, 'package', null, null,
   'Xe hoa Mercedes S450 cho cô dâu chú rể và 1 xe 16 chỗ đưa họ hàng, đi lại trong ngày nội thành.'),
  ('xe-cuoi-hac-trang', 'Đoàn xe rước dâu: S450 + 3 xe 7 chỗ + 1 xe 29 chỗ', 12500000, null, 'package', null, null,
   'Đoàn 5 xe đi cùng lộ trình, có điều phối viên. Xe 7 chỗ đời mới cho gia đình hai bên, xe 29 chỗ cho họ hàng, quãng đường dưới 60 km.'),
  ('may-trang-wedding-car', 'VinFast VF 8 kết hoa tươi – rước dâu nội thành', 2200000, null, 'package', null, null,
   'Xe điện VinFast VF 8 màu trắng, êm và sạch, kết hoa tươi; 4 giờ sử dụng, đã gồm tài xế và phí sạc.'),
  ('may-trang-wedding-car', 'Mercedes C300 mui trần (chụp ảnh + rước dâu)', 4500000, null, 'package', null, null,
   'Xe mui trần màu trắng cho buổi chụp ảnh cưới và rước dâu trong ngày, kết hoa lụa cao cấp, tài xế hỗ trợ dàn cảnh chụp.'),
  ('may-trang-wedding-car', 'Combo xe hoa VF 9 + 2 xe 16 chỗ đưa đón khách', 7900000, 8800000, 'package', null, null,
   '1 xe hoa VinFast VF 9 và 2 xe 16 chỗ đưa đón khách từ nhà đến nhà hàng và về, nội thành Hà Nội.'),
  ('xe-hoa-lua-hong', 'Toyota Camry kết hoa lụa (4 giờ)', 1800000, null, 'package', null, null,
   'Xe Camry trắng kết hoa lụa đầu xe và tay nắm cửa, tài xế đón đúng giờ lành, đi lại nội thành.'),
  ('xe-hoa-lua-hong', 'Xe 16 chỗ đưa đón họ hàng (khứ hồi)', 1900000, null, 'package', null, null,
   'Xe 16 chỗ đời mới, điều hòa mát, đưa đón họ hàng từ nhà đến nơi tổ chức và về, quãng đường dưới 40 km.');


-- ---------- 5. GỘP DANH SÁCH GÓI MẪU ----------
drop table if exists svc_packages;
create temp table svc_packages as
select d.id as vendor_id, d.category, d.i, t.name,
       pg_temp.round_price(d.base_price * t.mult) as price,
       case when t.orig_mult is not null then pg_temp.round_price(d.base_price * t.orig_mult) end as original_price,
       t.description, 'package'::text as price_unit, null::int as min_qty, null::int as max_qty
from svc_vendors d
join svc_templates t on t.category = d.category
 and ((t.slot = 'entry' and t.variant = d.i % 2)
   or (t.slot = 'upper' and (t.variant = d.i % 3 or (d.i % 2 = 0 and t.variant = (d.i + 1) % 3))))
where d.base_price > 0
union all
select d.id, d.category, d.i, e.name, e.price, e.original_price, e.description, e.price_unit, e.min_qty, e.max_qty
from svc_vendors d
join svc_explicit e on e.slug = d.slug;

-- Ảnh chính của gói: ảnh Unsplash cùng loại (studio, decor, makeup, nhà hàng), lệch khỏi ảnh bìa + 4 ảnh thực tế.
-- Tráp / MC / xe hoa chưa có ảnh thật → để trống, web hiện biểu tượng của loại dịch vụ.
alter table svc_packages add column image_url text;
update svc_packages s
   set image_url = pg_temp.img(pg_temp.pick(s.category, s.i, 4 + r.k), 800)
  from (select vendor_id, name, row_number() over (partition by vendor_id order by price, name)::int as k
          from svc_packages) r
 where r.vendor_id = s.vendor_id and r.name = s.name
   and s.category in ('studio', 'decor', 'makeup', 'venue');


-- ---------- 6. GHI VÀO vendor_packages (khớp theo tiệm + tên gói) ----------
-- Có rồi → cập nhật nội dung (chỉ gói mẫu, không đụng gói đối tác tự tạo)
update public.vendor_packages p
   set price          = s.price,
       original_price = s.original_price,
       description    = s.description,
       image_url      = s.image_url,
       price_unit     = s.price_unit,
       min_qty        = coalesce(s.min_qty, p.min_qty),
       max_qty        = coalesce(s.max_qty, p.max_qty)
  from svc_packages s
 where p.vendor_id = s.vendor_id and p.name = s.name and p.is_demo;

-- Chưa có → thêm. Gói trọn gói không ghi min_qty / max_qty (để mặc định của SQL 30).
insert into public.vendor_packages (vendor_id, name, price, original_price, description, image_url, price_unit, is_demo)
select s.vendor_id, s.name, s.price, s.original_price, s.description, s.image_url, s.price_unit, true
  from svc_packages s
 where s.price_unit = 'package'
   and not exists (select 1 from public.vendor_packages p where p.vendor_id = s.vendor_id and p.name = s.name);

insert into public.vendor_packages (vendor_id, name, price, original_price, description, image_url,
                                    price_unit, min_qty, max_qty, is_demo)
select s.vendor_id, s.name, s.price, s.original_price, s.description, s.image_url,
       s.price_unit, s.min_qty, s.max_qty, true
  from svc_packages s
 where s.price_unit = 'table'
   and not exists (select 1 from public.vendor_packages p where p.vendor_id = s.vendor_id and p.name = s.name);

-- Gói mẫu của bản cũ (đổi tên / bỏ bớt) → xóa
delete from public.vendor_packages p
 where p.is_demo
   and p.vendor_id in (select id from svc_vendors)
   and not exists (select 1 from svc_packages s where s.vendor_id = p.vendor_id and s.name = p.name);


-- ---------- 7. NHÀ HÀNG DEMO: SỐ SẢNH + GIÁ TỪ = GIÁ BÀN RẺ NHẤT ----------
update public.vendors v
   set halls = h.halls
  from (values ('trongdong', 5), ('lamourvenue', 3), ('melia', 2),
               ('jwmarriott', 3), ('almaz', 5), ('daewoo', 2)) as h(slug, halls)
 where v.slug = h.slug;

-- "Từ …" trên sàn khớp gói rẻ nhất của tiệm (với nhà hàng: từ tổng tiệc → giá 1 bàn)
update public.vendors v
   set base_price = m.min_price
  from (select p.vendor_id, min(p.price) as min_price
          from public.vendor_packages p
         where p.is_demo and p.is_active
         group by p.vendor_id) m
 where v.id = m.vendor_id
   and v.id in (select id from svc_vendors)
   and v.base_price <> m.min_price;


-- ---------- 8. ĐƠN HOÀN TẤT + ĐÁNH GIÁ MẪU CHO 9 TIỆM MỚI (giống phần 5 của 15_demo_data.sql) ----------
do $$
declare
  v record;
  k int;
  v_bride uuid;
  v_brides uuid[];
  v_booking uuid;
  v_price bigint;
  v_when timestamptz;
  v_rating int;
  v_texts text[];
  v_pcts int[] := array[30, 50, 20];
  v_titles text[] := array['Cọc giữ lịch', 'Trước ngày cưới', 'Nghiệm thu'];
begin
  select array_agg(u.id order by u.email) into v_brides
    from auth.users u where u.email like '%@demo.tramhy.vn';
  if v_brides is null then
    raise notice 'Chưa có cô dâu mẫu (chạy 15_demo_data.sql trước) – bỏ qua đánh giá mẫu cho tiệm mới';
    return;
  end if;

  for v in
    select d.id, d.slug, d.category, d.base_price,
           (row_number() over (order by d.category, d.slug))::int as gi
      from svc_vendors d
     where d.category in ('betrothal', 'entertainment', 'car')
     order by d.category, d.slug
  loop
    -- Tiệm đã có đơn mẫu (lần chạy trước) → bỏ qua, không nhân đôi
    if exists (select 1 from public.bookings b where b.vendor_id = v.id and b.details ->> 'seed' = 'demo') then
      continue;
    end if;

    v_texts := case v.category
      when 'betrothal' then array[
        'Tráp làm rất đẹp và chỉn chu, lễ vật tươi, đóng gói cẩn thận. Hai bên gia đình đều khen.',
        'Đội bê tráp đến đúng giờ, đồng phục gọn gàng, trưởng đoàn hướng dẫn nghi lễ rất bài bản.',
        'Tư vấn kỹ số tráp và lễ vật theo phong tục quê nhà trai, không bị thừa thiếu. Giá rõ ràng từ đầu.',
        'Hoa trên tráp tươi suốt buổi lễ, ảnh chụp lên rất sang. Giao tráp tận nhà sớm hơn hẹn.',
        'Bánh cốm, bánh phu thê ngon, ông bà khen mãi. Chỉ tiếc hộp mứt hơi nhỏ hơn ảnh mẫu một chút.',
        'Đặt cọc qua Trạm Hỷ nên rất yên tâm. Lễ ăn hỏi diễn ra suôn sẻ, cảm ơn cả đội!']
      when 'entertainment' then array[
        'MC dẫn duyên dáng, giọng ấm, biết khuấy động mà không bị lố. Chương trình chạy đúng giờ.',
        'Ban nhạc chơi đón khách rất hay, bài hát tặng cô dâu chú rể làm cả hội trường xúc động.',
        'Âm thanh rõ, không bị rè dù rạp ngoài trời. Kỹ thuật viên đến sớm thử kỹ trước giờ tiệc.',
        'Trao đổi kịch bản trước 2 tuần, MC nhớ tên đầy đủ hai họ, xử lý tình huống rất khéo.',
        'Ánh sáng sân khấu đẹp, khói lạnh lúc cô dâu bước vào lên ảnh như phim. Giá hơi cao nhưng đáng.',
        'Nhạc acoustic nhẹ nhàng đúng gu hai đứa, khách lớn tuổi cũng thích. Sẽ giới thiệu cho bạn bè.']
      else array[
        'Xe sạch bóng, hoa tươi kết rất khéo, tài xế mặc vest lịch sự và lái êm.',
        'Đến đón dâu sớm 15 phút, đi đúng lộ trình, không phát sinh thêm chi phí nào.',
        'Xe 16 chỗ đưa đón họ hàng đúng giờ, điều hòa mát, các cô chú rất hài lòng.',
        'Hoa xe đúng màu với hoa cầm tay như mình dặn, chụp ảnh cùng xe rất đẹp.',
        'Hôm cưới tắc đường nhưng tài xế chủ động đi đường tránh, vẫn kịp giờ lành. Cảm ơn nhiều!',
        'Giá hợp lý so với dòng xe, thỏa thuận rõ ràng, cọc qua Trạm Hỷ rất yên tâm.']
    end;

    select coalesce(min(p.price), v.base_price) into v_price
      from public.vendor_packages p where p.vendor_id = v.id and p.is_demo;

    for k in 1..3 loop
      v_bride  := v_brides[1 + (v.gi * 3 + k + 5) % array_length(v_brides, 1)];
      v_when   := now() - make_interval(days => 25 + ((v.gi * 11 + k * 29) % 150));
      v_rating := case when (v.gi + k) % 4 = 0 then 4 else 5 end;

      insert into public.bookings (bride_id, vendor_id, type, status, appointment_at, total_price,
                                   contact_name, note, details, created_at, updated_at)
      values (v_bride, v.id, 'service', 'completed', v_when, v_price,
              (select p.full_name from public.profiles p where p.id = v_bride), 'Đơn mẫu (demo)',
              jsonb_build_object('seed', 'demo'), v_when - interval '30 days', v_when + interval '2 days')
      returning id into v_booking;

      insert into public.milestones (booking_id, stage, title, percent, amount, status, paid_at, released_at)
      select v_booking, s, v_titles[s], v_pcts[s],
             case when s = 3 then v_price - round(v_price * 0.3) - round(v_price * 0.5)
                  else round(v_price * v_pcts[s] / 100.0) end,
             'released', v_when - make_interval(days => 30 - s * 10), v_when + make_interval(days => s)
        from generate_series(1, 3) as s;

      insert into public.reviews (booking_id, vendor_id, bride_id, rating, content, is_demo, created_at)
      values (v_booking, v.id, v_bride, v_rating,
              v_texts[1 + (v.gi + k * 2) % array_length(v_texts, 1)], true, v_when + interval '3 days');
    end loop;
  end loop;
end $$;

drop table svc_packages;
drop table svc_explicit;
drop table svc_templates;
drop table svc_images;
drop table svc_vendors;

-- Kiểm tra nhanh: mỗi loại có bao nhiêu tiệm demo / gói mẫu, giá từ thấp nhất
select v.category, count(distinct v.id) as so_tiem, count(p.id) as goi_mau,
       min(v.base_price) as gia_tu_thap_nhat, max(v.base_price) as gia_tu_cao_nhat
  from public.vendors v
  left join public.vendor_packages p on p.vendor_id = v.id and p.is_demo
 where v.category <> 'bridal'
 group by v.category
 order by v.category;
