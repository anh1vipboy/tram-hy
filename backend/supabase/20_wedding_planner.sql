-- =====================================================================
-- TRẠM HỶ – 20_WEDDING_PLANNER.SQL
-- "Đám cưới của tôi": kế hoạch cưới của từng cặp đôi – ngân sách theo nghi lễ + checklist chuẩn bị. Chạy SAU 19.
--   - Mỗi tài khoản 1 kế hoạch. Danh mục / mục chi tiêu / việc cần làm tạo từ mẫu (Bắc hoặc Nam) rồi tự sửa.
--   - Đơn đặt qua Trạm Hỷ KHÔNG lưu ở đây – web tự cộng vào danh mục tương ứng khi hiển thị (luôn khớp đơn thật).
--   - Chỉ chủ kế hoạch đọc / sửa (RLS).
-- Chạy lại nhiều lần không lỗi.
-- =====================================================================

create table if not exists public.wedding_plans (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null unique references public.profiles(id) on delete cascade,
  wedding_date  date,
  region        text not null default 'bac' check (region in ('bac', 'nam')),
  total_budget  bigint not null default 0 check (total_budget between 0 and 10000000000),
  guests        int check (guests between 0 and 5000),
  city          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.budget_categories (
  id               uuid primary key default gen_random_uuid(),
  plan_id          uuid not null references public.wedding_plans(id) on delete cascade,
  name             text not null check (length(trim(name)) between 1 and 80),
  vendor_category  public.vendor_category,       -- danh mục khớp loại tiệm → đơn Trạm Hỷ tự hiện ở đây
  position         int not null default 0,
  created_at       timestamptz not null default now()
);
create index if not exists budget_categories_plan_idx on public.budget_categories (plan_id, position);

create table if not exists public.budget_items (
  id           uuid primary key default gen_random_uuid(),
  plan_id      uuid not null references public.wedding_plans(id) on delete cascade,
  category_id  uuid not null references public.budget_categories(id) on delete cascade,
  name         text not null check (length(trim(name)) between 1 and 120),
  estimated    bigint not null default 0 check (estimated between 0 and 10000000000),
  actual       bigint not null default 0 check (actual between 0 and 10000000000),
  paid         boolean not null default false,
  position     int not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists budget_items_category_idx on public.budget_items (category_id, position);

create table if not exists public.checklist_items (
  id           uuid primary key default gen_random_uuid(),
  plan_id      uuid not null references public.wedding_plans(id) on delete cascade,
  title        text not null check (length(trim(title)) between 1 and 160),
  days_before  int not null default 0,              -- bao nhiêu ngày trước ngày cưới (âm = sau ngày cưới)
  link_category public.vendor_category,             -- có thì hiện nút "Tìm đối tác →"
  done         boolean not null default false,
  done_at      timestamptz,
  position     int not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists checklist_items_plan_idx on public.checklist_items (plan_id, days_before desc, position);

-- ---------- QUYỀN: chỉ chủ kế hoạch ----------
alter table public.wedding_plans enable row level security;
alter table public.budget_categories enable row level security;
alter table public.budget_items enable row level security;
alter table public.checklist_items enable row level security;

create or replace function public.owns_plan(p_plan_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.wedding_plans where id = p_plan_id and owner_id = auth.uid())
$$;

drop policy if exists "plans_own" on public.wedding_plans;
create policy "plans_own" on public.wedding_plans for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "budget_categories_own" on public.budget_categories;
create policy "budget_categories_own" on public.budget_categories for all
  using (public.owns_plan(plan_id)) with check (public.owns_plan(plan_id));

drop policy if exists "budget_items_own" on public.budget_items;
create policy "budget_items_own" on public.budget_items for all
  using (public.owns_plan(plan_id)) with check (
    public.owns_plan(plan_id)
    and exists (select 1 from public.budget_categories c where c.id = category_id and c.plan_id = budget_items.plan_id));

drop policy if exists "checklist_items_own" on public.checklist_items;
create policy "checklist_items_own" on public.checklist_items for all
  using (public.owns_plan(plan_id)) with check (public.owns_plan(plan_id));

-- Giới hạn chống lạm dụng: 40 danh mục, 400 mục chi tiêu, 300 việc / kế hoạch
create or replace function public.planner_limits() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_count int; v_max int;
begin
  execute format('select count(*) from public.%I where plan_id = $1', tg_table_name) into v_count using new.plan_id;
  v_max := case tg_table_name when 'budget_categories' then 40 when 'budget_items' then 400 else 300 end;
  if v_count >= v_max then
    raise exception 'Kế hoạch đã đạt tối đa % dòng ở mục này', v_max;
  end if;
  return new;
end $$;

drop trigger if exists planner_limits on public.budget_categories;
create trigger planner_limits before insert on public.budget_categories for each row execute function public.planner_limits();
drop trigger if exists planner_limits on public.budget_items;
create trigger planner_limits before insert on public.budget_items for each row execute function public.planner_limits();
drop trigger if exists planner_limits on public.checklist_items;
create trigger planner_limits before insert on public.checklist_items for each row execute function public.planner_limits();

create or replace function public.wedding_plans_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists wedding_plans_touch on public.wedding_plans;
create trigger wedding_plans_touch before update on public.wedding_plans for each row execute function public.wedding_plans_touch();

revoke execute on function public.planner_limits() from public, anon, authenticated;
