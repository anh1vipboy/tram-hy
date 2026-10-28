-- ==============================================================================
-- Trạm Hỷ Migration 37: Công tắc Bật/Tắt toàn bộ tính năng Thử Váy AI (Admin)
-- Hỗ trợ Admin tạm dừng thử AI để bảo vệ token khi có nhiều người truy cập
-- Chạy an toàn, hoàn toàn KHÔNG lo bị trùng lặp dữ liệu (Idempotent)
-- ==============================================================================

-- 1. Cập nhật hàm set_tryon_settings nhận thêm tham số p_enabled (mặc định true)
create or replace function public.set_tryon_settings(
  p_max_enabled boolean,
  p_daily_credits int,
  p_enabled boolean default true
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên được đổi cài đặt thử váy AI';
  end if;
  if p_daily_credits is null or p_daily_credits < 1 or p_daily_credits > 50 then
    raise exception 'Hạn mức phải từ 1 đến 50 credit/người/ngày';
  end if;
  v := jsonb_build_object(
    'enabled', coalesce(p_enabled, true),
    'max_enabled', coalesce(p_max_enabled, false),
    'daily_credits', p_daily_credits
  );
  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('tryon', v, now(), auth.uid())
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
  return v;
end $$;

revoke execute on function public.set_tryon_settings(boolean, int, boolean) from public, anon;
grant execute on function public.set_tryon_settings(boolean, int, boolean) to authenticated;

-- 2. Phân quyền bảo mật: Cho phép tài khoản Admin sửa bảng app_settings
drop policy if exists "app_settings_admin_all" on public.app_settings;
create policy "app_settings_admin_all" on public.app_settings
  for all using (public.is_admin()) with check (public.is_admin());
grant insert, update, delete on public.app_settings to authenticated;

-- 3. Xem cấu hình cài đặt hiện tại
select key, value, updated_at from public.app_settings where key = 'tryon';
