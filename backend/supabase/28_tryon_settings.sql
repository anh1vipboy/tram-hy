-- =====================================================================
-- TRẠM HỶ – 28_TRYON_SETTINGS.SQL
-- Thử váy AI có tùy chỉnh (chất lượng, số ảnh, mô hình Siêu nét):
--   1. Bảng app_settings: cài đặt chung của web. Ai cũng đọc được (không có gì bí mật), chỉ admin đổi qua RPC.
--      Khóa 'tryon' = { max_enabled: bật mô hình Siêu nét (FASHN tryon-max), daily_credits: credit/người/ngày }
--   2. tryon_jobs ghi thêm số credit đã tốn (credits) + tùy chọn đã dùng (options) → hạn mức tính theo credit.
-- Chạy SAU 27. Chạy lại nhiều lần không lỗi (giữ nguyên cài đặt admin đã đổi).
-- =====================================================================

create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id) on delete set null
);
alter table public.app_settings enable row level security;

drop policy if exists "app_settings_select_all" on public.app_settings;
create policy "app_settings_select_all" on public.app_settings for select using (true);
-- Không có policy insert/update/delete → chỉ đổi được qua hàm set_tryon_settings bên dưới.
revoke insert, update, delete on public.app_settings from anon, authenticated;

-- Mặc định: Siêu nét TẮT (chỉ bật lúc review / demo), 6 credit/người/ngày
insert into public.app_settings (key, value)
values ('tryon', '{"max_enabled": false, "daily_credits": 6}')
on conflict (key) do nothing;

create or replace function public.set_tryon_settings(p_max_enabled boolean, p_daily_credits int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên được đổi cài đặt thử váy AI';
  end if;
  if p_daily_credits is null or p_daily_credits < 1 or p_daily_credits > 50 then
    raise exception 'Hạn mức phải từ 1 đến 50 credit/người/ngày';
  end if;
  v := jsonb_build_object('max_enabled', coalesce(p_max_enabled, false), 'daily_credits', p_daily_credits);
  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('tryon', v, now(), auth.uid())
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
  return v;
end $$;
revoke execute on function public.set_tryon_settings(boolean, int) from public, anon;
grant execute on function public.set_tryon_settings(boolean, int) to authenticated;

-- Mỗi ảnh AI = 1 dòng tryon_jobs; credits = số credit FASHN của riêng ảnh đó (ảnh cũ trước SQL 28 tính 1)
alter table public.tryon_jobs add column if not exists credits int not null default 1 check (credits between 0 and 10);
alter table public.tryon_jobs add column if not exists options jsonb;
