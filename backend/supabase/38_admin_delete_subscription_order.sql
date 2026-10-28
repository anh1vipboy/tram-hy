-- ============================================================================
-- 38_admin_delete_subscription_order.sql
-- Thêm quyền và RPC cho Admin xóa đơn hàng gói AI (xóa từng đơn hoặc dọn sạch đơn chờ)
-- ============================================================================

-- 1. Đảm bảo policy cho phép admin xóa đơn hàng
drop policy if exists "subscription_orders_admin_delete" on public.subscription_orders;
create policy "subscription_orders_admin_delete" on public.subscription_orders
  for delete using (public.is_admin());

-- 2. RPC Admin xóa 1 đơn hàng theo mã đơn
create or replace function public.admin_delete_subscription_order(p_order_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên mới có quyền xóa đơn hàng';
  end if;

  delete from public.subscription_orders where code = p_order_code;

  return jsonb_build_object('ok', true, 'code', p_order_code);
end $$;

revoke execute on function public.admin_delete_subscription_order(text) from public, anon;
grant execute on function public.admin_delete_subscription_order(text) to authenticated;

-- 3. RPC Admin dọn sạch toàn bộ các đơn đang ở trạng thái pending (chờ thanh toán)
create or replace function public.admin_clear_pending_subscription_orders()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_count int;
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên mới có quyền xóa đơn hàng';
  end if;

  delete from public.subscription_orders where status = 'pending';
  get diagnostics v_count = row_count;

  return jsonb_build_object('ok', true, 'deleted_count', v_count);
end $$;

revoke execute on function public.admin_clear_pending_subscription_orders() from public, anon;
grant execute on function public.admin_clear_pending_subscription_orders() to authenticated;
