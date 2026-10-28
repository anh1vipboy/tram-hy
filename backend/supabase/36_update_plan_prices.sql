-- ==============================================================================
-- Trạm Hỷ Migration 36: Cập nhật giá gói cước AI Studio & Sửa lỗi RPC lấy đơn Admin
-- 1. Cập nhật giá: Nàng Thơ 149.000đ, Cẩm Tú 299.000đ
-- 2. Đảm bảo profile cho tất cả tài khoản
-- 3. Sửa RPC admin_list_subscription_orders: lấy email từ auth.users (thay vì profiles.email vốn không tồn tại)
-- ==============================================================================

-- 1. Cập nhật giá các gói cước AI
update public.subscription_plans
set price = 149000
where id = 'pro_bride';

update public.subscription_plans
set price = 299000
where id = 'studio_duo';

-- 2. Đồng bộ profiles cho những tài khoản chưa có profile để không bị chặn khóa ngoại
insert into public.profiles (id, full_name, role)
select u.id, coalesce(u.raw_user_meta_data->>'full_name', 'Người dùng'), 'bride'::public.user_role
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

-- 3. Cập nhật RPC lấy đơn gói AI cho Admin (đã sửa lấy email từ auth.users, tránh lỗi column p.email does not exist)
create or replace function public.admin_list_subscription_orders()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên mới có quyền xem danh sách đơn gói AI';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', o.id,
        'code', o.code,
        'amount', o.amount,
        'status', o.status,
        'created_at', o.created_at,
        'paid_at', o.paid_at,
        'user', jsonb_build_object(
          'id', coalesce(p.id, o.user_id),
          'full_name', coalesce(p.full_name, u.raw_user_meta_data->>'full_name', 'Khách vãng lai'),
          'phone', coalesce(p.phone, ''),
          'email', coalesce(u.email, '')
        ),
        'plan', jsonb_build_object(
          'id', pl.id,
          'name', pl.name,
          'daily_credits', pl.daily_credits,
          'duration_days', pl.duration_days,
          'bonus_credits', pl.bonus_credits,
          'badge', pl.badge
        )
      ) order by o.created_at desc
    )
    from public.subscription_orders o
    left join public.profiles p on p.id = o.user_id
    left join auth.users u on u.id = o.user_id
    left join public.subscription_plans pl on pl.id = o.plan_id
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.admin_list_subscription_orders() from public, anon;
grant execute on function public.admin_list_subscription_orders() to authenticated;

-- 4. Kiểm tra các đơn cước AI hiện có trong database
select o.id, o.code, o.amount, o.status, o.created_at, o.paid_at,
       coalesce(p.full_name, u.raw_user_meta_data->>'full_name') as customer_name,
       u.email as customer_email,
       o.plan_id
from public.subscription_orders o
left join public.profiles p on p.id = o.user_id
left join auth.users u on u.id = o.user_id
order by o.created_at desc;
