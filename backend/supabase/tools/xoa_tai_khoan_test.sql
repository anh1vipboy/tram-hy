-- =====================================================================
-- TRẠM HỶ – XÓA TÀI KHOẢN TEST (kèm toàn bộ dữ liệu của tài khoản đó)
-- Dùng khi Supabase báo "Database error deleting user" (tài khoản đã có đơn đặt lịch).
--
-- Cách dùng: SQL Editor → New query → dán file này → sửa danh sách email ở dòng có dấu ← → Run
-- CHỈ dùng cho tài khoản test: đơn hàng, tiền cọc, khiếu nại của tài khoản sẽ mất vĩnh viễn.
-- =====================================================================
do $$
declare
  emails text[] := array[
    'emailtest1@gmail.com',      -- ← thay bằng email cần xóa
    'emailtest2@gmail.com'       -- ← thêm/bớt dòng tùy ý (dòng cuối không có dấu phẩy)
  ];
  user_ids uuid[];
begin
  select array_agg(id) into user_ids from auth.users where lower(email) = any(select lower(unnest(emails)));
  if user_ids is null then
    raise notice 'Không tìm thấy tài khoản nào khớp danh sách email';
    return;
  end if;

  -- Đơn của các tài khoản này (milestones, disputes, reviews của đơn tự xóa theo)
  delete from public.bookings where bride_id = any(user_ids);
  -- Khiếu nại / đánh giá do tài khoản này tạo trên đơn của người khác
  delete from public.disputes where opened_by = any(user_ids);
  delete from public.reviews  where bride_id  = any(user_ids);
  update public.disputes set resolved_by = null where resolved_by = any(user_ids);
  -- Tiệm do tài khoản quản lý: giữ tiệm, chỉ bỏ chủ
  update public.vendors set owner_id = null where owner_id = any(user_ids);
  -- Xóa tài khoản (profiles, số đo, thiệp cưới, RSVP tự xóa theo)
  delete from auth.users where id = any(user_ids);

  raise notice 'Đã xóa % tài khoản', array_length(user_ids, 1);
end $$;
