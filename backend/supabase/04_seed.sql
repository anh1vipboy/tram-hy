-- =====================================================================
-- TRẠM HỶ – 04_SEED.SQL
-- Dữ liệu mẫu lấy từ marketplace.html và tryon.html hiện tại. Chạy SAU 03.
-- Chạy lại nhiều lần không bị trùng (on conflict do nothing).
-- =====================================================================

-- ---------- ĐỐI TÁC DỊCH VỤ (studio, decor, makeup, nhà hàng) ----------
insert into public.vendors (slug, name, category, district, base_price, rating, review_count, is_verified, cover_url) values
  ('tuart',         'TuArt Wedding',              'studio', 'Hai Bà Trưng, Hà Nội',  9900000, 4.9, 128, true,  'https://images.unsplash.com/photo-1532712938310-34cb3982ef74?auto=format&fit=crop&q=80&w=600'),
  ('mimosa',        'Mimosa Wedding',             'studio', 'Thanh Xuân, Hà Nội',    7500000, 4.8,  96, true,  'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&q=80&w=600'),
  ('nupakachi',     'Nupakachi Studio',           'studio', 'Hoàn Kiếm, Hà Nội',    15000000, 4.9,  42, true,  'https://images.unsplash.com/photo-1507504038482-7621c379a64f?auto=format&fit=crop&q=80&w=600'),
  ('greenwedding',  'Green Wedding',              'studio', 'Tây Hồ, Hà Nội',        8500000, 4.7,  54, false, 'https://images.unsplash.com/photo-1481653125770-b78c206c59d4?auto=format&fit=crop&q=80&w=600'),
  ('leduongstudio', 'Lê Dương Studio',            'studio', 'Cầu Giấy, Hà Nội',      6500000, 4.6,  42, true,  'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&q=80&w=600'),
  ('jardinstudio',  'Jardin de L''Amour Studio',  'studio', 'Tây Hồ, Hà Nội',       18500000, 4.9,  74, true,  'https://images.unsplash.com/photo-1519225495810-7512c696505a?auto=format&fit=crop&q=80&w=600'),
  ('storyteller',   '7799 Storyteller',           'decor',  'Hoàn Kiếm, Hà Nội',    25000000, 4.9, 128, true,  'https://images.unsplash.com/photo-1469371670807-013ccf25f16a?auto=format&fit=crop&q=80&w=600'),
  ('phidiep',       'Phi Điệp Wedding',           'decor',  'Ba Đình, Hà Nội',      15000000, 4.7,  54, true,  'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&q=80&w=600'),
  ('lutece',        'Lutèce Wedding & Event',     'decor',  'Hai Bà Trưng, Hà Nội', 45000000, 4.8,  31, true,  'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&q=80&w=600'),
  ('mhsplanner',    'MHs Planner Decor',          'decor',  'Thanh Xuân, Hà Nội',   32000000, 4.7,  48, true,  'https://images.unsplash.com/photo-1478812954026-9c750f0e89fc?auto=format&fit=crop&q=80&w=600'),
  ('dezidecor',     'Dezi Wedding Decor',         'decor',  'Ba Đình, Hà Nội',      20000000, 4.6,  29, false, 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&q=80&w=600'),
  ('maido',         'Mai Đỗ Makeup Academy',      'makeup', 'Cầu Giấy, Hà Nội',      3500000, 4.9,  84, true,  'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&q=80&w=600'),
  ('bulnguyen',     'Bul Nguyễn Makeup Academy',  'makeup', 'Đống Đa, Hà Nội',       4500000, 4.8,  62, true,  'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&q=80&w=600'),
  ('callabridal',   'Calla Bridal',               'makeup', 'Hoàn Kiếm, Hà Nội',    18000000, 4.9, 154, true,  'https://images.unsplash.com/photo-1594552072238-b8a33785b261?auto=format&fit=crop&q=80&w=600'),
  ('hanhlam',       'Hạnh Lâm Makeup Academy',    'makeup', 'Ba Đình, Hà Nội',       5500000, 4.9, 198, true,  'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&q=80&w=600'),
  ('tinale',        'Tina Lê Make Up',            'makeup', 'Đống Đa, Hà Nội',       4000000, 4.7, 112, true,  'https://images.unsplash.com/photo-1522338257859-7f21fa7e4529?auto=format&fit=crop&q=80&w=600'),
  ('quachanh',      'Quách Ánh Makeup Studio',    'makeup', 'Hoàn Kiếm, Hà Nội',     6000000, 4.8, 145, true,  'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&q=80&w=600'),
  ('trongdong',     'Trống Đồng Palace',          'venue',  'Tây Hồ, Hà Nội',       85000000, 4.8, 210, true,  'https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?auto=format&fit=crop&q=80&w=600'),
  ('lamourvenue',   'L''Amour Wedding Gallery',   'venue',  'Mỹ Đình, Hà Nội',     120000000, 4.9,  95, true,  'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&q=80&w=600'),
  ('melia',         'Melia Hanoi Venue',          'venue',  'Hoàn Kiếm, Hà Nội',   350000000, 4.9,  52, true,  'https://images.unsplash.com/photo-1549417229-aa67d3263c09?auto=format&fit=crop&q=80&w=600'),
  ('jwmarriott',    'JW Marriott Hanoi Venue',    'venue',  'Nam Từ Liêm, Hà Nội', 550000000, 5.0,  84, true,  'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&q=80&w=600'),
  ('almaz',         'Almaz Convention Center',    'venue',  'Long Biên, Hà Nội',   150000000, 4.8, 110, true,  'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&q=80&w=600'),
  ('daewoo',        'Daewoo Hotel Venue',         'venue',  'Ba Đình, Hà Nội',     220000000, 4.7,  76, true,  'https://images.unsplash.com/photo-1549417229-aa67d3263c09?auto=format&fit=crop&q=80&w=600')
on conflict (slug) do nothing;

-- ---------- TIỆM VÁY / XƯỞNG MAY ĐO ----------
insert into public.vendors (slug, name, category, district, rating, review_count, is_verified) values
  ('2h-studio',            '2H Studio',                       'bridal', 'Cầu Giấy, Hà Nội',  5.0, 142, true),
  ('bellis-bridal',        'Bellis Bridal',                   'bridal', 'Hoàn Kiếm, Hà Nội', 4.9,  88, true),
  ('la-reine-bridal',      'La Reine Bridal',                 'bridal', 'Ba Đình, Hà Nội',   4.8,  65, true),
  ('camile-bridal',        'Camile Bridal',                   'bridal', 'Đống Đa, Hà Nội',   4.8,  57, true),
  ('juliette-bridal',      'Juliette Bridal',                 'bridal', 'Thanh Xuân, Hà Nội',4.7,  41, true),
  ('bella-atelier',        'Bella Bridal Atelier',            'bridal', 'Tây Hồ, Hà Nội',    5.0,  26, true),
  ('tramhy-atelier',       'Trạm Hỷ Atelier (NTK Hoàng Nam & Lê Lan)', 'bridal', 'Tây Hồ, Hà Nội', 5.0, 79, true),
  ('tramhy-heritage',      'Trạm Hỷ Heritage Silk',           'bridal', 'Hoàn Kiếm, Hà Nội', 4.9,  38, true)
on conflict (slug) do nothing;

-- ---------- MẪU VÁY (10 mẫu trong tryon.html) ----------
insert into public.dresses (vendor_id, slug, name, type, theme, price, original_price, tryon_slug, image_url)
select v.id, d.slug, d.name, d.type::public.dress_type, d.theme, d.price, d.original_price, d.tryon_slug, d.image_url
from (values
  ('2h-studio',       'royal-mermaid',     'Váy Cưới Đuôi Cá Đính Pha Lê Royal',                 'rental',  'mermaid',     3500000,  4200000, 'mermaid',           'https://images.unsplash.com/photo-1594552072238-b8a33785b261?auto=format&fit=crop&q=80&w=600'),
  ('bellis-bridal',   'bellis-ballgown',   'Váy Tùng Xòe Ren Pháp Bellis',                       'rental',  'fairy',       4200000,  5000000, 'fairy',             'https://images.unsplash.com/photo-1546804784-896d0dca3805?auto=format&fit=crop&q=80&w=600'),
  ('la-reine-bridal', 'korean-satin',      'Váy Satin Lụa Trơn Hàn Quốc',                        'rental',  'minimalist',  2800000,  3400000, 'minimalist',        'https://images.unsplash.com/photo-1583939003579-730e3918a45a?auto=format&fit=crop&q=80&w=600'),
  ('tramhy-heritage', 'aodai-longphung',   'Áo Dài Thêu Long Phụng Cát Hỷ',                      'rental',  'heritage',    2200000,  null,    'aodai',             null),
  ('camile-bridal',   'versailles',        'Váy Đại Lễ Tùng Xòe Versailles',                     'rental',  'royal',       5500000,  null,    'royal',             null),
  ('juliette-bridal', 'siren-mermaid',     'Váy Đuôi Cá Cắt Xẻ Phối Ren Siren',                  'rental',  'mermaid',     4500000,  null,    'siren',             null),
  ('tramhy-atelier',  'mikado-couture',    'Váy May Đo Mikado Couture',                          'bespoke', 'minimalist', 12500000,  null,    'bespoke_mikado',    'https://images.unsplash.com/photo-1537633552985-df8429e8048b?auto=format&fit=crop&q=80&w=600'),
  ('tramhy-atelier',  'chantilly-royal',   'Váy May Đo Ren Chantilly Hoàng Gia',                 'bespoke', 'royal',      18000000,  null,    'bespoke_chantilly', 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&q=80&w=600'),
  ('bella-atelier',   'sparkling-tiara',   'Váy May Đo Công Chúa Sparkling Tiara',               'bespoke', 'fairy',      15500000,  null,    'bespoke_fairy',     null),
  ('tramhy-heritage', 'aodai-hoangtoc',    'Áo Dài Cưới Gấm Hoàng Tộc Thêu Phượng Triều Nguyễn', 'bespoke', 'heritage',    9800000,  null,    'bespoke_aodai',     null)
) as d(vendor_slug, slug, name, type, theme, price, original_price, tryon_slug, image_url)
join public.vendors v on v.slug = d.vendor_slug
on conflict (slug) do nothing;

-- Giá khởi điểm của tiệm váy = mẫu rẻ nhất
update public.vendors v
   set base_price = sub.min_price
  from (select vendor_id, min(price) as min_price from public.dresses group by vendor_id) sub
 where v.id = sub.vendor_id and v.category = 'bridal';
