-- =====================================================================
-- TRẠM HỶ – 42_THEM_TRUONG_TONG_THOI_GIAN_PROFILES.SQL
-- Thêm trường đếm tổng thời gian sử dụng web và số phiên vào bảng profiles
-- và đồng bộ vào raw_user_meta_data của auth.users
--
-- Cách dùng: Supabase Dashboard -> SQL Editor -> Dán toàn bộ file này -> Run
-- =====================================================================

-- 1. Thêm các cột vào bảng public.profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS total_time_minutes NUMERIC(8,1) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_sessions INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

-- 2. Cập nhật dữ liệu tổng thời gian từ public.user_sessions vào public.profiles
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

-- 3. Đồng bộ cả vào raw_user_meta_data trong auth.users để khi click xem chi tiết User ở Authentication Dashboard là thấy ngay
UPDATE auth.users u
SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
  'total_time_spent', COALESCE(sub.total_min, 0) || ' phút',
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
WHERE u.id = sub.user_id;

-- 4. Tạo trigger tự động: Mỗi khi có phiên mới hoặc cập nhật thời gian từ user_sessions, tự động cộng dồn vào profiles
CREATE OR REPLACE FUNCTION public.sync_user_total_time()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.profiles
  SET 
    total_time_minutes = (
      SELECT ROUND(COALESCE(SUM(duration_seconds), 0)::numeric / 60.0, 1)
      FROM public.user_sessions WHERE user_id = NEW.user_id
    ),
    total_sessions = (
      SELECT COUNT(id) FROM public.user_sessions WHERE user_id = NEW.user_id
    ),
    last_active_at = NEW.session_end
  WHERE id = NEW.user_id;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trigger_sync_user_total_time ON public.user_sessions;
CREATE TRIGGER trigger_sync_user_total_time
  AFTER INSERT OR UPDATE ON public.user_sessions
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_total_time();

RAISE NOTICE 'Đã thêm trường total_time_minutes và cập nhật thành công cho toàn bộ tài khoản!';
