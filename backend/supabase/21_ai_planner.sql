-- =====================================================================
-- TRẠM HỶ – 21_AI_PLANNER.SQL
-- Trợ lý AI trong Kế hoạch cưới (Edge Function "tu-van-ngan-sach", chế độ plan). Chạy SAU 20.
--   - Mỗi câu hỏi trả lời thành công được ghi 1 dòng → giới hạn 20 câu / người / ngày (đếm ở server).
--   - Chỉ Edge Function (service role) được ghi; người dùng chỉ đọc của mình để hiện "Còn x/20 câu".
-- Chạy lại nhiều lần không lỗi.
-- =====================================================================

create table if not exists public.ai_usage (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('plan')),
  created_at  timestamptz not null default now()
);
create index if not exists ai_usage_user_day_idx on public.ai_usage (user_id, kind, created_at);

alter table public.ai_usage enable row level security;

drop policy if exists "ai_usage_select_own" on public.ai_usage;
create policy "ai_usage_select_own" on public.ai_usage for select using (user_id = auth.uid());
