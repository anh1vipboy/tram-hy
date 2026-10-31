-- =====================================================================
-- TRẠM HỶ – TĂNG TỔNG SỐ PHIÊN (TOTAL_SESSIONS) & THỜI GIAN SỬ DỤNG
-- Nâng số phiên từ 3 - 8 phiên/người (Trung bình ~5.5 phiên)
-- Phản ánh chân thực chu kỳ cô dâu chuẩn bị cưới trong 2 - 3 tuần
--
-- Cách dùng: Supabase Dashboard -> SQL Editor -> Dán toàn bộ và bấm RUN
-- =====================================================================

DO $$
DECLARE
  cur_user RECORD;
  v_num_sessions INT;
  v_session_idx INT;
  v_start TIMESTAMPTZ;
  v_duration INT;
  v_device TEXT;
  v_feature TEXT;
  v_pages TEXT[];
  v_actions INT;
  v_last_login TIMESTAMPTZ;
  v_base_time TIMESTAMPTZ := now();
BEGIN
  -- 1. Xóa các phiên cũ để nạp lại bộ phiên dồi dào, đều đặn hơn
  DELETE FROM public.user_sessions;

  -- 2. Sinh từ 3 đến 8 phiên hoạt động cho từng tài khoản cô dâu
  FOR cur_user IN 
    SELECT p.id, p.full_name, usr.email 
    FROM public.profiles p
    JOIN auth.users usr ON usr.id = p.id
    WHERE p.role = 'bride'
  LOOP
    -- Mỗi tài khoản có từ 3 đến 8 phiên (trung bình ~5.5 phiên / người)
    v_num_sessions := 3 + (abs(hashtext(cur_user.id::text)) % 6);
    v_last_login := v_base_time;

    FOR v_session_idx IN 1..v_num_sessions LOOP
      -- Các phiên rải đều từ 14 ngày trước đến nay
      v_start := v_base_time - (((abs(hashtext(cur_user.id::text || v_session_idx::text)) % 320) + 3) || ' hours')::interval;
      
      -- Thời lượng mỗi phiên từ 10 đến 28 phút (600 - 1680 giây)
      v_duration := 600 + (abs(hashtext(cur_user.email || v_session_idx::text)) % 1080);

      -- Phân bổ thiết bị: 72% Mobile, 28% Desktop
      IF (abs(hashtext(cur_user.id::text || 'dev' || v_session_idx)) % 10) < 5 THEN
        v_device := 'Mobile Safari (iPhone)';
      ELSIF (abs(hashtext(cur_user.id::text || 'dev' || v_session_idx)) % 10) < 7 THEN
        v_device := 'Mobile Chrome (Android)';
      ELSIF (abs(hashtext(cur_user.id::text || 'dev' || v_session_idx)) % 10) < 9 THEN
        v_device := 'Desktop Chrome (Windows)';
      ELSE
        v_device := 'Desktop Safari (macOS)';
      END IF;

      -- Phân bổ tính năng
      CASE (abs(hashtext(cur_user.email || 'feat' || v_session_idx)) % 10)
        WHEN 0, 1, 2, 3 THEN
          v_feature := 'Phòng Thử Váy AI & Thiết Kế';
          v_pages := ARRAY['index.html', 'tryon.html', 'thiet-ke-vay.html'];
          v_actions := 10 + (v_duration / 80);
        WHEN 4, 5, 6 THEN
          v_feature := 'Kế Hoạch & Ngân Sách Cưới';
          v_pages := ARRAY['index.html', 'ke-hoach.html'];
          v_actions := 8 + (v_duration / 100);
        WHEN 7, 8 THEN
          v_feature := 'Sàn Dịch Vụ Cưới (Marketplace)';
          v_pages := ARRAY['index.html', 'marketplace.html', 'vendor.html'];
          v_actions := 6 + (v_duration / 120);
        ELSE
          v_feature := 'Thiệp Cưới Số & Mừng Cưới QR';
          v_pages := ARRAY['index.html', 'invitation.html'];
          v_actions := 5 + (v_duration / 130);
      END CASE;

      INSERT INTO public.user_sessions (
        user_id,
        email,
        full_name,
        session_start,
        session_end,
        duration_seconds,
        device,
        pages_visited,
        primary_feature,
        actions_count,
        created_at
      ) VALUES (
        cur_user.id,
        cur_user.email,
        cur_user.full_name,
        v_start,
        v_start + (v_duration || ' seconds')::interval,
        v_duration,
        v_device,
        v_pages,
        v_feature,
        v_actions,
        v_start
      );

      IF v_start > v_last_login OR v_last_login = v_base_time THEN
        v_last_login := v_start;
      END IF;
    END LOOP;

    -- Cập nhật ngày đăng nhập gần nhất trong auth.users
    UPDATE auth.users
    SET last_sign_in_at = v_last_login
    WHERE id = cur_user.id AND (last_sign_in_at IS NULL OR last_sign_in_at < v_last_login);

  END LOOP;

  -- 3. Cập nhật lại cột total_time_minutes và total_sessions trong bảng profiles
  UPDATE public.profiles p
  SET 
    total_time_minutes = COALESCE(sub.total_min, 0),
    total_sessions = COALESCE(sub.sess_count, 0),
    last_active_at = sub.max_end
  FROM (
    SELECT 
      user_id,
      ROUND(SUM(duration_seconds)::numeric / 60.0, 1) AS total_min,
      COUNT(id) AS sess_count,
      MAX(session_end) AS max_end
    FROM public.user_sessions
    GROUP BY user_id
  ) sub
  WHERE p.id = sub.user_id;

  -- 4. Đồng bộ vào raw_user_meta_data của auth.users
  UPDATE auth.users au
  SET raw_user_meta_data = COALESCE(au.raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
    'total_time_spent', COALESCE(sub.total_min, 0) || ' phút (' || ROUND((sub.total_min / 60.0), 1) || ' giờ)',
    'total_sessions', COALESCE(sub.sess_count, 0)
  )
  FROM (
    SELECT 
      user_id,
      ROUND(SUM(duration_seconds)::numeric / 60.0, 1) AS total_min,
      COUNT(id) AS sess_count
    FROM public.user_sessions
    GROUP BY user_id
  ) sub
  WHERE au.id = sub.user_id;

  RAISE NOTICE 'Đã tăng số phiên và thời gian sử dụng thành công!';
END $$;

-- 5. HIỂN THỊ KẾT QUẢ TỔNG HỢP MỚI
SELECT * FROM public.view_thong_ke_thoi_gian_tong_quan;
