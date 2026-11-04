-- =====================================================================
-- TRẠM HỶ – 42_SHOPPING_CART.SQL
-- Bảng giỏ hàng dịch vụ cưới (cart_items) đồng bộ đa thiết bị cho Cô dâu / Chú rể.
-- Chạy lại nhiều lần không lỗi.
-- =====================================================================

create table if not exists public.cart_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  item_key    text not null,
  item_type   text not null check (item_type in ('dress', 'package', 'vendor')),
  vendor_id   uuid not null references public.vendors(id) on delete cascade,
  dress_id    uuid references public.dresses(id) on delete cascade,
  package_id  uuid references public.vendor_packages(id) on delete cascade,
  quantity    int not null default 1 check (quantity between 1 and 500),
  snapshot    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  unique (user_id, item_key)
);

create index if not exists cart_items_user_idx on public.cart_items (user_id, created_at desc);

alter table public.cart_items enable row level security;

drop policy if exists "cart_items_select_own" on public.cart_items;
create policy "cart_items_select_own" on public.cart_items
  for select using (user_id = auth.uid());

drop policy if exists "cart_items_insert_own" on public.cart_items;
create policy "cart_items_insert_own" on public.cart_items
  for insert with check (user_id = auth.uid());

drop policy if exists "cart_items_update_own" on public.cart_items;
create policy "cart_items_update_own" on public.cart_items
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "cart_items_delete_own" on public.cart_items;
create policy "cart_items_delete_own" on public.cart_items
  for delete using (user_id = auth.uid());

grant select, insert, update, delete on public.cart_items to authenticated;
