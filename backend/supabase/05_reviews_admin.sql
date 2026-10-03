-- =====================================================================
-- TRẠM HỶ – 05_REVIEWS_ADMIN.SQL
-- Bổ sung cho frontend mới. Chạy SAU 04_seed.sql
--   1. Đánh giá: lưu tên người đánh giá + tự cập nhật điểm sao của đối tác
--   2. Admin gắn tài khoản vào tiệm (biến tài khoản thành chủ tiệm)
--   3. Xóa ảnh bìa stock không đúng đối tác trong dữ liệu mẫu
-- =====================================================================

-- ---------- 1. ĐÁNH GIÁ ----------
-- Bảng profiles là riêng tư, nên lưu sẵn tên người đánh giá để ai cũng xem được.
alter table public.reviews add column if not exists reviewer_name text;

create or replace function public.reviews_fill_name() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select coalesce(nullif(trim(full_name), ''), 'Cô dâu Trạm Hỷ') into new.reviewer_name
    from public.profiles where id = new.bride_id;
  return new;
end $$;

create trigger reviews_fill_name before insert on public.reviews
  for each row execute function public.reviews_fill_name();

-- Cộng dồn vào điểm trung bình hiện có (dữ liệu mẫu đã có sẵn số lượt đánh giá)
create or replace function public.reviews_update_vendor_rating() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.vendors
     set rating       = round((rating * review_count + new.rating) / (review_count + 1.0), 1),
         review_count = review_count + 1
   where id = new.vendor_id;
  return new;
end $$;

create trigger reviews_update_vendor_rating after insert on public.reviews
  for each row execute function public.reviews_update_vendor_rating();


-- ---------- 2. ADMIN GẮN CHỦ TIỆM ----------
-- Đối tác đăng ký tài khoản → admin nhập email để giao quyền quản lý tiệm.
create or replace function public.admin_link_vendor_owner(p_vendor_id uuid, p_email text)
returns public.vendors
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid;
  v public.vendors;
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên Trạm Hỷ được gắn chủ tiệm';
  end if;

  select id into v_user_id from auth.users where lower(email) = lower(trim(p_email));
  if v_user_id is null then
    raise exception 'Không tìm thấy tài khoản có email %', p_email;
  end if;

  update public.profiles set role = 'vendor' where id = v_user_id and role = 'bride';
  update public.vendors set owner_id = v_user_id where id = p_vendor_id returning * into v;
  if not found then raise exception 'Không tìm thấy đối tác'; end if;
  return v;
end $$;

revoke execute on function public.admin_link_vendor_owner from public, anon;
grant execute on function public.admin_link_vendor_owner to authenticated;


-- ---------- 3. DỌN ẢNH BÌA MẪU ----------
-- Ảnh bìa trong dữ liệu mẫu là ảnh stock không đúng với đối tác (vài ảnh còn bị lỗi).
-- Xóa để web hiển thị ảnh đại diện chữ cái; đối tác sẽ tải ảnh thật lên bucket vendor-portfolio.
update public.vendors set cover_url = null;
