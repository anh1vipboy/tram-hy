-- =====================================================================
-- TRẠM HỶ – 15_DEMO_DATA.SQL
-- Dữ liệu demo cho buổi review: ảnh bìa, giới thiệu, ảnh thực tế cho 31 tiệm mẫu,
-- thêm mẫu váy + ảnh các góc, và đánh giá có bình luận. Chạy SAU 14.
--
--   - Ảnh: Unsplash (miễn phí dùng, link công khai) + ảnh áo dài có sẵn của web.
--   - Không ghi đè thứ đối tác đã tự tải (chỉ điền ảnh bìa / giới thiệu đang trống).
--   - Đánh giá phải gắn với đơn đã hoàn tất của một cô dâu → tạo 12 tài khoản cô dâu mẫu
--     (@demo.tramhy.vn, không đăng nhập được), mỗi tiệm 3 đơn hoàn tất + 3 đánh giá.
--     Đánh giá mẫu có is_demo = true → trang tiệm ghi chú "dữ liệu mẫu phục vụ demo".
--   - Chạy lại nhiều lần không bị nhân đôi. Xóa sạch: tools/xoa_du_lieu_demo.sql
-- =====================================================================

alter table public.reviews add column if not exists is_demo boolean not null default false;

-- ---------- KHO ẢNH THEO LOẠI DỊCH VỤ ----------
create temp table demo_images (category text, n int, photo text);
insert into demo_images (category, n, photo)
select category, (row_number() over (partition by category order by ord) - 1)::int, photo
from (values
  -- Chụp ảnh cưới
  ('studio', 1, 'photo-1519741497674-611481863552'), ('studio', 2, 'photo-1617724975854-70b5d0cedb0a'),
  ('studio', 3, 'photo-1722805740177-04256b6517f2'), ('studio', 4, 'photo-1506355639690-a1f2a100689e'),
  ('studio', 5, 'photo-1617725145063-56958eadf557'), ('studio', 6, 'photo-1600164913117-2125c1f60b01'),
  ('studio', 7, 'photo-1517456215183-9a2c3a748d0c'), ('studio', 8, 'photo-1595407753234-0882f1e77954'),
  ('studio', 9, 'photo-1648154164366-d067faecdc51'), ('studio', 10, 'photo-1629756048377-09540f52caa1'),
  ('studio', 11, 'photo-1519741196428-6a2175fa2557'), ('studio', 12, 'photo-1532712938310-34cb3982ef74'),
  ('studio', 13, 'photo-1511285560929-80b456fea0bc'), ('studio', 14, 'photo-1481653125770-b78c206c59d4'),
  ('studio', 15, 'photo-1503525443530-339273ca8a86'),
  -- Váy cưới
  ('bridal', 1, 'photo-1594552072238-b8a33785b261'), ('bridal', 2, 'photo-1529636273736-fc88b31ea9d9'),
  ('bridal', 3, 'photo-1521467752200-3bccf80f16ed'), ('bridal', 4, 'photo-1549416878-b9ca95e26903'),
  ('bridal', 5, 'photo-1492175742197-ed20dc5a6bed'), ('bridal', 6, 'photo-1502955422409-06e43fd3eff3'),
  ('bridal', 7, 'photo-1622277430358-f4d134452e2e'), ('bridal', 8, 'photo-1549488497-94b52bddac5d'),
  ('bridal', 9, 'photo-1599142296733-1c1f2073e6de'), ('bridal', 10, 'photo-1548313093-370cf4ba3892'),
  ('bridal', 11, 'photo-1549417229-7686ac5595fd'), ('bridal', 12, 'photo-1593575620619-602b4ddf6e96'),
  ('bridal', 13, 'photo-1585241920473-b472eb9ffbae'), ('bridal', 14, 'photo-1622277583249-4c1fad490804'),
  ('bridal', 15, 'photo-1524563970700-a302b6888e17'), ('bridal', 16, 'photo-1546804784-896d0dca3805'),
  ('bridal', 17, 'photo-1583939003579-730e3918a45a'), ('bridal', 18, 'photo-1537633552985-df8429e8048b'),
  -- Trang trí
  ('decor', 1, 'photo-1738225734899-30852be7e396'), ('decor', 2, 'photo-1712068534065-f56c36e21759'),
  ('decor', 3, 'photo-1747115276395-607f2e5dc269'), ('decor', 4, 'photo-1677677403344-029c7fcd7300'),
  ('decor', 5, 'photo-1559982240-f760db87b822'), ('decor', 6, 'photo-1523438885200-e635ba2c371e'),
  ('decor', 7, 'photo-1560117531-02eeab8e3593'), ('decor', 8, 'photo-1559373098-e1caaccae791'),
  ('decor', 9, 'photo-1632316962873-47ee3d309f02'), ('decor', 10, 'photo-1758810411905-04fb6f9396e1'),
  ('decor', 11, 'photo-1469371670807-013ccf25f16a'), ('decor', 12, 'photo-1511795409834-ef04bbd61622'),
  ('decor', 13, 'photo-1464366400600-7168b8af9bc3'),
  -- Trang điểm
  ('makeup', 1, 'photo-1709477542149-f4e0e21d590b'), ('makeup', 2, 'photo-1709477542170-f11ee7d471a0'),
  ('makeup', 3, 'photo-1636023730877-233b9237d4ec'), ('makeup', 4, 'photo-1638959882708-9503b1cd595f'),
  ('makeup', 5, 'photo-1583784561105-a674080f391e'), ('makeup', 6, 'photo-1516975080664-ed2fc6a32937'),
  ('makeup', 7, 'photo-1512496015851-a90fb38ba796'), ('makeup', 8, 'photo-1652706299340-e8a346491541'),
  ('makeup', 9, 'photo-1682226335318-f1911fdef7c1'), ('makeup', 10, 'photo-1722805740076-7c51a8669afc'),
  ('makeup', 11, 'photo-1643216583837-f6d664d48eac'), ('makeup', 12, 'photo-1522337360788-8b13dee7a37e'),
  ('makeup', 13, 'photo-1596462502278-27bfdc403348'),
  -- Nhà hàng tiệc
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

-- Ảnh áo dài có sẵn của web (Unsplash ít ảnh áo dài cưới)
create or replace function pg_temp.site_img(p_file text) returns text
language sql immutable as $$
  select 'https://tram-hy-alpha.vercel.app/assets/images/' || p_file
$$;

-- 31 tiệm mẫu, đánh số trong từng loại để chia ảnh không trùng nhau
create temp table demo_vendors as
select v.id, v.slug, v.category::text as category, v.name, v.base_price,
       (row_number() over (partition by v.category order by v.slug) - 1)::int as i,
       (row_number() over (order by v.category, v.slug) - 1)::int as gi
from public.vendors v
where v.slug in (
  'tuart', 'mimosa', 'nupakachi', 'greenwedding', 'leduongstudio', 'jardinstudio',
  'storyteller', 'phidiep', 'lutece', 'mhsplanner', 'dezidecor',
  'maido', 'bulnguyen', 'callabridal', 'hanhlam', 'tinale', 'quachanh',
  'trongdong', 'lamourvenue', 'melia', 'jwmarriott', 'almaz', 'daewoo',
  '2h-studio', 'bellis-bridal', 'la-reine-bridal', 'camile-bridal', 'juliette-bridal',
  'bella-atelier', 'tramhy-atelier', 'tramhy-heritage');

-- ẢNH THỨ k CỦA TIỆM: xoay vòng trong kho ảnh cùng loại, mỗi tiệm bắt đầu ở một chỗ khác nhau
create or replace function pg_temp.pick(p_category text, p_i int, p_k int) returns text
language sql stable as $$
  select photo from demo_images
  where category = p_category
    and n = (p_i * 3 + p_k) % (select count(*)::int from demo_images where category = p_category)
$$;


-- ---------- 1. ẢNH BÌA + GIỚI THIỆU ----------
update public.vendors v
   set cover_url = case when d.slug = 'tramhy-heritage' then pg_temp.site_img('user_tryon_aodai.jpg')
                        else pg_temp.img(pg_temp.pick(d.category, d.i, 0)) end
  from demo_vendors d
 where v.id = d.id and v.cover_url is null;

update public.vendors v
   set description = case d.category
         when 'studio' then 'Ekip chụp ảnh cưới với hơn 8 năm kinh nghiệm: pre-wedding studio và ngoại cảnh, phóng sự ngày cưới, quay phim highlight. Nhận ảnh chỉnh màu trong 3–4 tuần, album in cao cấp.'
         when 'decor'  then 'Thiết kế và thi công trang trí tiệc cưới trọn gói: cổng hoa, sân khấu, lối đi, bàn gallery, hoa bàn tiệc. Có bản phối cảnh 3D trước khi thi công, hoa tươi nhập trong ngày.'
         when 'makeup' then 'Trang điểm cô dâu phong cách trong trẻo, tự nhiên, giữ lớp nền bền suốt ngày dài. Gói bao gồm làm tóc, cài phụ kiện, dặm lại giữa tiệc và trang điểm cho mẹ cô dâu.'
         when 'venue'  then 'Sảnh tiệc cưới sang trọng, sức chứa từ 200 đến 1.000 khách, thực đơn Á – Âu đa dạng. Gói tiệc đã gồm sân khấu, âm thanh ánh sáng, MC và trang trí cơ bản.'
         else 'Tiệm váy cưới với bộ sưu tập thiết kế mới mỗi mùa: váy cưới thuê, may đo theo số đo, áo dài cưới. Thử váy miễn phí, chỉnh sửa vừa dáng trước ngày cưới.'
       end,
       address = coalesce(v.address, v.district)
  from demo_vendors d
 where v.id = d.id and v.description is null;


-- ---------- 2. ẢNH THỰC TẾ (4 ảnh / tiệm) ----------
insert into public.vendor_photos (vendor_id, path, url, created_at)
select d.id, 'seed/' || d.slug || '-' || k, pg_temp.img(pg_temp.pick(d.category, d.i, k)),
       now() - make_interval(days => 30 + k)
from demo_vendors d
cross join generate_series(1, 4) as k
where not exists (select 1 from public.vendor_photos p where p.vendor_id = d.id and p.path like 'seed/%');


-- ---------- 3. MẪU VÁY: thêm mẫu mới + điền ảnh còn thiếu + ảnh các góc ----------
insert into public.dresses (vendor_id, slug, name, type, theme, price, original_price, tryon_slug, image_url)
select v.id, d.slug, d.name, d.type::public.dress_type, d.theme, d.price, d.original_price, d.theme, d.image_url
from (values
  ('2h-studio',       'lace-vintage',       'Váy Ren Tay Dài Vintage',             'rental',  'fairy',      3200000, 3800000, pg_temp.img('photo-1521467752200-3bccf80f16ed', 800)),
  ('2h-studio',       'satin-co-vuong',     'Váy Satin Cổ Vuông Tối Giản',         'rental',  'minimalist', 2600000, null,    pg_temp.img('photo-1622277430358-f4d134452e2e', 800)),
  ('bellis-bridal',   'bellis-voan-tang',   'Váy Công Chúa Voan Tầng Bellis',      'rental',  'royal',      4800000, 5600000, pg_temp.img('photo-1549416878-b9ca95e26903', 800)),
  ('la-reine-bridal', 'la-reine-duoi-ca',   'Váy Đuôi Cá Ren Hoa La Reine',        'rental',  'mermaid',    3900000, null,    pg_temp.img('photo-1585241920473-b472eb9ffbae', 800)),
  ('camile-bridal',   'camile-tre-vai',     'Váy Trễ Vai Xòe Nhẹ Camile',          'rental',  'fairy',      3600000, 4200000, pg_temp.img('photo-1549488497-94b52bddac5d', 800)),
  ('juliette-bridal', 'juliette-crepe',     'Váy Crepe Suông Thanh Lịch Juliette', 'rental',  'minimalist', 3000000, null,    pg_temp.img('photo-1492175742197-ed20dc5a6bed', 800)),
  ('bella-atelier',   'bella-garden',       'Váy May Đo Hoa Nổi Garden',           'bespoke', 'fairy',     13500000, null,    pg_temp.img('photo-1593575620619-602b4ddf6e96', 800)),
  ('tramhy-heritage', 'aodai-gam-song-hy',  'Áo Dài Cưới Gấm Đỏ Song Hỷ',          'rental',  'heritage',   1800000, 2200000, pg_temp.site_img('user_tryon_aodai.jpg'))
) as d(vendor_slug, slug, name, type, theme, price, original_price, image_url)
join public.vendors v on v.slug = d.vendor_slug
on conflict (slug) do nothing;

-- Mẫu cũ chưa có ảnh thật
update public.dresses set image_url = pg_temp.site_img('user_tryon_aodai.jpg')
 where slug in ('aodai-longphung', 'aodai-hoangtoc') and image_url is null;
update public.dresses set image_url = pg_temp.img('photo-1502955422409-06e43fd3eff3', 800) where slug = 'versailles'       and image_url is null;
update public.dresses set image_url = pg_temp.img('photo-1548313093-370cf4ba3892', 800)    where slug = 'siren-mermaid'    and image_url is null;
update public.dresses set image_url = pg_temp.img('photo-1549417229-7686ac5595fd', 800)    where slug = 'sparkling-tiara'  and image_url is null;

-- 2 ảnh góc khác cho mỗi mẫu váy (áo dài dùng ảnh áo dài của web)
insert into public.dress_photos (dress_id, path, url)
select x.id, 'seed/' || x.slug || '-' || k,
       case when x.theme = 'heritage'
            then pg_temp.site_img(case k when 1 then 'user_tryon_aodai.jpg' else 'bride_model_2.jpg' end)
            else pg_temp.img(pg_temp.pick('bridal', x.i, k + 4), 800) end
from (select d.id, d.slug, d.theme, (row_number() over (order by d.slug))::int as i
        from public.dresses d
        join demo_vendors v on v.id = d.vendor_id) x
cross join generate_series(1, 2) as k
where not exists (select 1 from public.dress_photos p where p.dress_id = x.id and p.path like 'seed/%');


-- ---------- 4. CÔ DÂU MẪU (không đăng nhập được) ----------
-- Trigger handle_new_user tự tạo profiles với full_name. Provider 'email' → không gửi mail chào mừng.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
       'codau' || n || '@demo.tramhy.vn', '', now(),
       '{"provider": "email", "providers": ["email"]}'::jsonb,
       jsonb_build_object('full_name', name, 'role', 'bride'),
       now() - interval '200 days', now() - interval '200 days', '', '', '', ''
from (values
  (1, 'Nguyễn Thu Trang'), (2, 'Trần Minh Anh'), (3, 'Lê Hoài Thương'), (4, 'Phạm Ngọc Hân'),
  (5, 'Hoàng Bảo Ngọc'), (6, 'Vũ Khánh Linh'), (7, 'Đỗ Phương Thảo'), (8, 'Bùi Hà My'),
  (9, 'Đặng Thùy Dương'), (10, 'Ngô Quỳnh Chi'), (11, 'Dương Mai Phương'), (12, 'Lý Thanh Hằng')
) as b(n, name)
where not exists (select 1 from auth.users u where u.email = 'codau' || b.n || '@demo.tramhy.vn');


-- ---------- 5. ĐƠN ĐÃ HOÀN TẤT + ĐÁNH GIÁ (3 / tiệm) ----------
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
  v_pcts int[];
  v_titles text[];
  v_texts text[];
begin
  if exists (select 1 from public.bookings where details ->> 'seed' = 'demo') then
    raise notice 'Đã có đánh giá demo – bỏ qua phần 5';
    return;
  end if;

  select array_agg(u.id order by u.email) into v_brides
    from auth.users u where u.email like '%@demo.tramhy.vn';

  for v in select * from demo_vendors order by gi loop
    v_texts := case v.category
      when 'studio' then array[
        'Ekip rất có tâm, hướng dẫn tạo dáng tự nhiên nên hai vợ chồng không bị gượng. Ảnh trả đúng hẹn, màu đẹp y như mẫu.',
        'Buổi chụp ngoại cảnh kéo dài cả ngày mà mọi người vẫn vui vẻ, nhiệt tình. Album in dày dặn, rất đáng tiền.',
        'Phóng sự ngày cưới bắt được nhiều khoảnh khắc xúc động mà mình không để ý. Cả nhà xem ai cũng thích.',
        'Tư vấn concept kỹ, chọn địa điểm hợp với phong cách của hai đứa. Chỉnh ảnh nhẹ nhàng, không bị "bệt" da.',
        'Giá hợp lý so với chất lượng. Có chút trễ lịch giao ảnh vài ngày nhưng ekip báo trước và xin lỗi đàng hoàng.',
        'Quay highlight 3 phút xem lại vẫn nổi da gà. Ekip đến sớm, làm việc chuyên nghiệp từ đầu đến cuối.']
      when 'decor' then array[
        'Cổng hoa và lối đi y như bản phối cảnh 3D, hoa tươi thơm cả sảnh. Khách khen suốt buổi tiệc.',
        'Ekip thi công nhanh, dọn dẹp sạch sẽ. Bàn gallery trang trí tinh tế, ảnh chụp lên rất đẹp.',
        'Tư vấn màu sắc hợp với sảnh và váy cưới, không bị rối mắt. Đáng tiền từng đồng.',
        'Mình thay đổi ý tưởng sát ngày mà ekip vẫn hỗ trợ nhiệt tình. Sân khấu lên đèn lung linh.',
        'Hoa bàn tiệc hơi ít hơn mình hình dung, nhưng tổng thể vẫn rất đẹp và đúng hẹn.',
        'Trang trí lễ gia tiên trang trọng, ông bà hai bên rất hài lòng. Cảm ơn ekip nhiều!']
      when 'makeup' then array[
        'Lớp nền mỏng nhẹ mà giữ được từ sáng đến tối, ảnh cận mặt vẫn mịn. Chị makeup rất dễ thương.',
        'Đúng phong cách trong trẻo mình muốn, không bị già. Làm tóc chắc chắn, nhảy cả buổi không xổ.',
        'Đến đúng giờ, chuẩn bị đầy đủ phụ kiện. Còn trang điểm giúp mẹ mình nữa, mẹ khen mãi.',
        'Thử makeup trước ngày cưới để chỉnh theo ý mình, nên ngày chính rất yên tâm.',
        'Dặm lại giữa tiệc nhanh gọn, lớp son giữ màu tốt. Giá hơi cao nhưng xứng đáng.',
        'Tay nghề rất tốt, kẻ mắt sắc nét. Lần sau em gái mình cưới chắc chắn quay lại.']
      when 'venue' then array[
        'Sảnh rộng, trần cao, âm thanh ánh sáng tốt. Món ăn nóng, ngon, khách hai họ đều khen.',
        'Quản lý tiệc chu đáo, chạy chương trình đúng giờ. Phục vụ nhanh, không để bàn nào phải chờ.',
        'Thực đơn đa dạng, được thử món trước khi chốt. Bãi đỗ xe rộng, khách đi lại thuận tiện.',
        'Gói tiệc đã gồm trang trí cơ bản và MC nên đỡ phải lo nhiều. Rất đáng chọn.',
        'Có vài món ra hơi chậm lúc cao điểm nhưng nhân viên xử lý khéo. Tổng thể vẫn rất hài lòng.',
        'Không gian sang trọng, ảnh cưới chụp ở sảnh lên đẹp như mơ. Cảm ơn khách sạn!']
      else array[
        'Váy vừa như in sau một lần chỉnh, chất ren mềm, không bị ngứa. Nhân viên tư vấn rất kiên nhẫn.',
        'Thử nhiều mẫu mà không bị hối, được chụp ảnh thoải mái để về hỏi ý gia đình. Váy lên ảnh rất sang.',
        'Váy sạch, thơm, đính kết chắc chắn. Giao váy đúng hẹn, còn tặng kèm khăn voan.',
        'Mình người nhỏ nhắn mà tiệm chỉnh phom rất khéo, nhìn cao hẳn lên. Cực kỳ hài lòng!',
        'Giá thuê hợp lý so với chất lượng váy. Lúc trả váy hơi đông khách nên chờ một chút.',
        'Đặt cọc qua Trạm Hỷ nên yên tâm, tiệm làm đúng cam kết từng đợt. Sẽ giới thiệu cho bạn bè.']
    end;

    for k in 1..3 loop
      v_bride  := v_brides[1 + (v.gi * 3 + k) % array_length(v_brides, 1)];
      v_when   := now() - make_interval(days => 20 + ((v.gi * 7 + k * 23) % 160));
      v_price  := case when v.base_price > 0 then v.base_price else 3500000 + 500000 * k end;
      v_rating := case when (v.gi + k) % 5 = 0 then 4 else 5 end;
      if v.category = 'bridal' then
        v_pcts := array[30, 50, 20]; v_titles := array['Giữ lịch thử váy', 'Sau buổi thử', 'Trả váy / hoàn tất'];
      else
        v_pcts := array[30, 50, 20]; v_titles := array['Cọc giữ lịch', 'Trước ngày cưới', 'Nghiệm thu'];
      end if;

      insert into public.bookings (bride_id, vendor_id, type, status, appointment_at, total_price,
                                   contact_name, note, details, created_at, updated_at)
      select v_bride, v.id, case when v.category = 'bridal' then 'rental' else 'service' end::public.booking_type,
             'completed', v_when, v_price, p.full_name, 'Đơn mẫu (demo)',
             jsonb_build_object('seed', 'demo'), v_when - interval '30 days', v_when + interval '2 days'
        from public.profiles p where p.id = v_bride
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

drop table demo_vendors;
drop table demo_images;

-- Kiểm tra nhanh
select
  (select count(*) from public.vendors where cover_url is not null)            as tiem_co_anh_bia,
  (select count(*) from public.vendor_photos where path like 'seed/%')         as anh_thuc_te_mau,
  (select count(*) from public.dresses)                                        as mau_vay,
  (select count(*) from public.dress_photos where path like 'seed/%')          as anh_goc_vay_mau,
  (select count(*) from public.reviews where is_demo)                          as danh_gia_mau;
