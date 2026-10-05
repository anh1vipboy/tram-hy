-- =====================================================================
-- TRẠM HỶ – 11_AI_TRYON.SQL
-- Thử váy bằng AI thật (Edge Function "thu-vay-ai"). Chạy SAU 10.
--   1. Bảng tryon_jobs: ghi mỗi lần thử AI → đếm lượt/ngày, theo dõi chi phí
--   2. Kho ảnh kết quả "tryon-results" (riêng tư, mỗi người chỉ thấy ảnh của mình)
-- Chỉ Edge Function (quyền service role) được ghi; người dùng chỉ đọc của chính mình.
-- =====================================================================

create table if not exists public.tryon_jobs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  dress_id     uuid references public.dresses(id) on delete set null,
  provider     text not null,                                  -- gemini | fashn
  status       text not null check (status in ('done', 'failed')),
  result_path  text,                                           -- đường dẫn trong bucket tryon-results
  error        text,
  created_at   timestamptz not null default now()
);
create index if not exists tryon_jobs_user_day_idx on public.tryon_jobs (user_id, created_at);

alter table public.tryon_jobs enable row level security;

drop policy if exists "tryon_jobs_select_own" on public.tryon_jobs;
create policy "tryon_jobs_select_own" on public.tryon_jobs for select
  using (user_id = auth.uid());

-- Ảnh kết quả: tryon-results/<user_id>/<job_id>.png – riêng tư
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tryon-results', 'tryon-results', false, 10485760, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "tryon_results_select_own" on storage.objects;
create policy "tryon_results_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'tryon-results' and split_part(name, '/', 1) = auth.uid()::text);
