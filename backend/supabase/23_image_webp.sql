-- =====================================================================
-- TRẠM HỶ – 23_IMAGE_WEBP.SQL
-- Tăng tốc tải trang: ảnh demo trỏ về ảnh của web (assets/images/*.jpg|png, ~700KB) đổi sang bản .webp (~30–110KB).
-- Ảnh gốc vẫn còn trên web. Ảnh Unsplash do web tự xin đúng cỡ khi hiển thị (sizedImage trong core/utils.js).
-- Chỉ đổi đường dẫn, không đụng ảnh người dùng tự tải lên. Chạy lại nhiều lần không lỗi.
-- =====================================================================

create or replace function pg_temp.webp(p_url text) returns text
language sql immutable as $$
  select case
    when p_url ~ '^https://tram-hy-alpha\.vercel\.app/assets/images/[A-Za-z0-9_-]+\.(jpg|jpeg|png)$'
      then regexp_replace(p_url, '\.(jpg|jpeg|png)$', '.webp')
    else p_url
  end
$$;

update public.vendors       set cover_url = pg_temp.webp(cover_url) where cover_url is distinct from pg_temp.webp(cover_url);
update public.vendors       set logo_url  = pg_temp.webp(logo_url)  where logo_url  is distinct from pg_temp.webp(logo_url);
update public.vendor_photos set url       = pg_temp.webp(url)       where url       is distinct from pg_temp.webp(url);
update public.dresses       set image_url = pg_temp.webp(image_url) where image_url is distinct from pg_temp.webp(image_url);
update public.dress_photos  set url       = pg_temp.webp(url)       where url       is distinct from pg_temp.webp(url);
