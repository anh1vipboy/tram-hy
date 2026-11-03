-- ============================================================================
-- TRẠM HỶ – 41_BOOKING_PAYMENT_REALTIME.SQL
-- Hỗ trợ thanh toán VietQR thật cho Booking Escrow qua SePay Webhook
-- ============================================================================

-- 1. Bật replica identity full để Supabase Realtime gửi đầy đủ dữ liệu khi UPDATE
alter table public.milestones replica identity full;
alter table public.bookings replica identity full;

-- 2. Hàm thanh toán milestone cấp hệ thống (Service Role / Webhook gọi an toàn)
create or replace function public.system_pay_milestone(
  p_booking_id uuid,
  p_stage int,
  p_transaction_id text default null
)
returns public.milestones
language plpgsql security definer set search_path = public as $$
declare
  b public.bookings;
  m public.milestones;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Không tìm thấy booking: %', p_booking_id;
  end if;

  if b.status in ('disputed', 'cancelled', 'refunded', 'completed') then
    raise exception 'Đơn đang ở trạng thái %, không thể thanh toán', b.status;
  end if;

  -- Kiểm tra đợt trước đó đã thanh toán chưa
  if exists (
    select 1 from public.milestones
    where booking_id = p_booking_id and stage < p_stage and status = 'locked'
  ) then
    raise exception 'Cần thanh toán các đợt trước đợt %', p_stage;
  end if;

  -- Cập nhật milestone sang paid
  update public.milestones
  set status = 'paid',
      paid_at = coalesce(paid_at, now())
  where booking_id = p_booking_id and stage = p_stage and status = 'locked'
  returning * into m;

  -- Nếu đợt này đã paid từ trước thì lấy thông tin trả về
  if not found then
    select * into m from public.milestones
    where booking_id = p_booking_id and stage = p_stage;
    return m;
  end if;

  -- Nếu là đợt 1 và booking đang 'pending', tự động chuyển booking sang 'confirmed'
  if p_stage = 1 and b.status = 'pending' then
    update public.bookings
    set status = 'confirmed',
        updated_at = now()
    where id = p_booking_id;
  end if;

  -- Ghi nhận mã giao dịch SePay vào details của booking (nếu có)
  if p_transaction_id is not null then
    update public.bookings
    set details = jsonb_set(
      coalesce(details, '{}'::jsonb),
      array['sepay_transactions', 'stage_' || p_stage::text],
      to_jsonb(json_build_object(
        'transaction_id', p_transaction_id,
        'paid_at', now(),
        'stage', p_stage,
        'amount', m.amount
      ))
    )
    where id = p_booking_id;
  end if;

  return m;
end $$;

-- Phân quyền thực thi
revoke execute on function public.system_pay_milestone(uuid, int, text) from public, anon;
grant execute on function public.system_pay_milestone(uuid, int, text) to authenticated, service_role;
