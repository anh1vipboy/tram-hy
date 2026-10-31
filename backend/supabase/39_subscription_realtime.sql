-- ============================================================================
-- TRẠM HỶ – 39_SUBSCRIPTION_REALTIME.SQL
-- Kích hoạt Supabase Realtime cho bảng subscription_orders
-- Giúp Modal thanh toán VietQR tự động nhận diện thanh toán và nổ pháo hoa tức thì
-- ============================================================================

-- 1. Bổ sung cột ghi chú giao dịch (notes) nếu chưa có
alter table public.subscription_orders
  add column if not exists notes text;

-- 2. Đảm bảo Realtime nhận đầy đủ thông tin khi bản ghi thay đổi
alter table public.subscription_orders replica identity full;

-- 3. Thêm bảng subscription_orders vào publication realtime
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'subscription_orders'
  ) then
    alter publication supabase_realtime add table public.subscription_orders;
  end if;
end $$;
