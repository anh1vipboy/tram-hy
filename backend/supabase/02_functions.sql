-- =====================================================================
-- TRẠM HỶ – 02_FUNCTIONS.SQL
-- Nghiệp vụ đặt lịch + Escrow 3 chặng. Chạy SAU 01_schema.sql
--
-- Vì sao dùng hàm thay vì cho frontend insert/update thẳng?
--   → Nếu để trình duyệt tự ghi, người dùng có thể mở DevTools sửa giá
--     thành 1đ hoặc tự đánh dấu "đã giải ngân". Các hàm dưới đây chạy trên
--     server, tự tính giá và kiểm tra đúng người, đúng trạng thái.
--
-- Gọi từ JS:  await sb.rpc('create_booking', { p_vendor_id: ..., p_type: 'rental', ... })
-- =====================================================================


-- ---------- 1. TẠO ĐƠN + 3 CHẶNG ESCROW ----------
-- Thuê váy / dịch vụ: 30% giữ lịch → 50% sau buổi thử/bấm máy → 20% nghiệm thu
-- May đo:            30% duyệt 3D & vải → 40% thử rập Toile → 30% nghiệm thu
create or replace function public.create_booking(
  p_vendor_id       uuid,
  p_type            public.booking_type,
  p_dress_id        uuid        default null,
  p_appointment_at  timestamptz default null,
  p_contact_name    text        default null,
  p_contact_phone   text        default null,
  p_note            text        default null,
  p_details         jsonb       default '{}'::jsonb,
  p_custom_price    bigint      default null   -- chỉ dùng cho may đo (giá do Atelier Builder tính)
) returns public.bookings
language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_price   bigint;
  v_dress   public.dresses;
  v_booking public.bookings;
  v_pcts    int[];
  v_titles  text[];
  v_amount  bigint;
  v_sum     bigint := 0;
  i         int;
begin
  if v_uid is null then
    raise exception 'Bạn cần đăng nhập để đặt lịch';
  end if;

  if p_dress_id is not null then
    select * into v_dress from public.dresses where id = p_dress_id and is_active;
    if not found then raise exception 'Không tìm thấy mẫu váy'; end if;
    if v_dress.vendor_id <> p_vendor_id then raise exception 'Mẫu váy không thuộc đối tác này'; end if;
    v_price := v_dress.price;
  else
    select base_price into v_price from public.vendors where id = p_vendor_id;
    if not found then raise exception 'Không tìm thấy đối tác'; end if;
  end if;

  if p_type in ('bespoke_prompt', 'bespoke_image', 'bespoke_manual') then
    if p_custom_price is not null then
      if p_custom_price not between 5000000 and 50000000 then
        raise exception 'Giá may đo không hợp lệ';
      end if;
      v_price := p_custom_price;
    end if;
    v_pcts   := array[30, 40, 30];
    v_titles := array['Duyệt phác thảo 3D & mẫu vải', 'Thử rập mộc Toile', 'Nghiệm thu váy hoàn thiện'];
  else
    v_pcts   := array[30, 50, 20];
    v_titles := array['Cọc giữ lịch', 'Sau buổi thử / bấm máy', 'Nghiệm thu & hoàn tất'];
  end if;

  if v_price is null or v_price <= 0 then
    raise exception 'Đối tác chưa có giá, không thể đặt lịch';
  end if;

  insert into public.bookings (bride_id, vendor_id, dress_id, type, appointment_at, total_price,
                               contact_name, contact_phone, note, details)
  values (v_uid, p_vendor_id, p_dress_id, p_type, p_appointment_at, v_price,
          p_contact_name, p_contact_phone, p_note, coalesce(p_details, '{}'::jsonb))
  returning * into v_booking;

  for i in 1..3 loop
    -- chặng cuối lấy phần còn lại để tổng luôn khớp total_price (tránh lệch do làm tròn)
    v_amount := case when i = 3 then v_price - v_sum else round(v_price * v_pcts[i] / 100.0) end;
    v_sum := v_sum + v_amount;
    insert into public.milestones (booking_id, stage, title, percent, amount)
    values (v_booking.id, i, v_titles[i], v_pcts[i], v_amount);
  end loop;

  return v_booking;
end $$;


-- ---------- 2. CÔ DÂU THANH TOÁN 1 CHẶNG (tiền vào Escrow) ----------
-- Bản MVP/demo: cô dâu bấm "Đã chuyển khoản". Khi tích hợp cổng thanh toán thật
-- (PayOS/SePay), webhook trong Edge Function sẽ gọi bước này thay cho người dùng.
create or replace function public.pay_milestone(p_booking_id uuid, p_stage int)
returns public.milestones
language plpgsql security definer set search_path = public as $$
declare
  b public.bookings;
  m public.milestones;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found or b.bride_id <> auth.uid() then
    raise exception 'Bạn không có quyền với đơn này';
  end if;
  if b.status in ('disputed', 'cancelled', 'refunded', 'completed') then
    raise exception 'Đơn đang ở trạng thái %, không thể thanh toán', b.status;
  end if;
  if exists (select 1 from public.milestones
             where booking_id = p_booking_id and stage < p_stage and status = 'locked') then
    raise exception 'Cần thanh toán các đợt trước';
  end if;

  update public.milestones set status = 'paid', paid_at = now()
   where booking_id = p_booking_id and stage = p_stage and status = 'locked'
   returning * into m;
  if not found then
    raise exception 'Đợt % không ở trạng thái chờ thanh toán', p_stage;
  end if;

  if p_stage = 1 and b.status = 'pending' then
    update public.bookings set status = 'confirmed' where id = p_booking_id;
  end if;
  return m;
end $$;


-- ---------- 3. NGHIỆM THU → GIẢI NGÂN 1 CHẶNG CHO VENDOR ----------
-- Cô dâu bấm "Duyệt / Nghiệm thu" (hoặc admin). Hết 3 chặng → đơn completed.
create or replace function public.release_milestone(p_booking_id uuid, p_stage int)
returns public.milestones
language plpgsql security definer set search_path = public as $$
declare
  b public.bookings;
  m public.milestones;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found or not (b.bride_id = auth.uid() or public.is_admin()) then
    raise exception 'Bạn không có quyền với đơn này';
  end if;
  if b.status = 'disputed' then
    raise exception 'Đơn đang tranh chấp, chờ Trạm Hỷ phân xử';
  end if;

  update public.milestones set status = 'released', released_at = now()
   where booking_id = p_booking_id and stage = p_stage and status = 'paid'
   returning * into m;
  if not found then
    raise exception 'Đợt % chưa được thanh toán hoặc đã giải ngân', p_stage;
  end if;

  if not exists (select 1 from public.milestones
                 where booking_id = p_booking_id and status <> 'released') then
    update public.bookings set status = 'completed' where id = p_booking_id;
  end if;
  return m;
end $$;


-- ---------- 4. VENDOR CẬP NHẬT TIẾN ĐỘ (Kanban) ----------
-- confirmed → in_progress → ready_for_review ; hoặc từ chối đơn pending → cancelled
create or replace function public.vendor_set_status(p_booking_id uuid, p_status public.booking_status)
returns public.bookings
language plpgsql security definer set search_path = public as $$
declare
  b public.bookings;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found or not public.owns_vendor(b.vendor_id) then
    raise exception 'Bạn không có quyền với đơn này';
  end if;
  if not (   (b.status = 'confirmed'   and p_status = 'in_progress')
          or (b.status = 'in_progress' and p_status = 'ready_for_review')
          or (b.status = 'pending'     and p_status = 'cancelled')) then
    raise exception 'Không thể chuyển trạng thái từ % sang %', b.status, p_status;
  end if;

  update public.bookings set status = p_status where id = p_booking_id returning * into b;
  return b;
end $$;


-- ---------- 5. MỞ KHIẾU NẠI ----------
-- Cô dâu: 'refund_request' (váy sai cam kết, trễ hẹn...)
-- Vendor: 'no_show' (khách bùng lịch)
create or replace function public.open_dispute(p_booking_id uuid, p_kind text, p_reason text,
                                               p_evidence_urls text[] default '{}')
returns public.disputes
language plpgsql security definer set search_path = public as $$
declare
  b public.bookings;
  d public.disputes;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Không tìm thấy đơn'; end if;

  if p_kind = 'refund_request' and b.bride_id <> auth.uid() then
    raise exception 'Chỉ cô dâu của đơn mới được yêu cầu hoàn cọc';
  elsif p_kind = 'no_show' and not public.owns_vendor(b.vendor_id) then
    raise exception 'Chỉ đối tác của đơn mới được báo no-show';
  elsif p_kind not in ('refund_request', 'no_show') then
    raise exception 'Loại khiếu nại không hợp lệ';
  end if;

  if b.status in ('pending', 'completed', 'cancelled', 'refunded', 'disputed') then
    raise exception 'Không thể khiếu nại đơn ở trạng thái %', b.status;
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Vui lòng nhập lý do';
  end if;

  insert into public.disputes (booking_id, opened_by, kind, reason, evidence_urls, prev_status)
  values (p_booking_id, auth.uid(), p_kind, p_reason, coalesce(p_evidence_urls, '{}'), b.status)
  returning * into d;

  update public.bookings set status = 'disputed' where id = p_booking_id;
  return d;
end $$;


-- ---------- 6. ADMIN PHÂN XỬ KHIẾU NẠI ----------
-- p_refund = true  → hoàn toàn bộ tiền đang giữ cho cô dâu, đơn = refunded
-- p_refund = false → bên vendor đúng:
--     • no_show        : giải ngân tiền đang giữ cho vendor (đền bù), đơn = cancelled
--     • refund_request : bác yêu cầu, đơn quay lại trạng thái trước khi khiếu nại
create or replace function public.resolve_dispute(p_dispute_id uuid, p_refund boolean, p_note text default null)
returns public.disputes
language plpgsql security definer set search_path = public as $$
declare
  d public.disputes;
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên Trạm Hỷ được phân xử';
  end if;

  select * into d from public.disputes where id = p_dispute_id and status = 'open' for update;
  if not found then raise exception 'Khiếu nại không tồn tại hoặc đã xử lý'; end if;

  if p_refund then
    update public.milestones set status = 'refunded'
     where booking_id = d.booking_id and status = 'paid';
    update public.bookings set status = 'refunded' where id = d.booking_id;
  elsif d.kind = 'no_show' then
    update public.milestones set status = 'released', released_at = now()
     where booking_id = d.booking_id and status = 'paid';
    update public.bookings set status = 'cancelled' where id = d.booking_id;
  else
    update public.bookings set status = d.prev_status where id = d.booking_id;
  end if;

  update public.disputes
     set status = case when p_refund then 'resolved_refund'::public.dispute_status
                       else 'resolved_vendor'::public.dispute_status end,
         resolution_note = p_note, resolved_by = auth.uid(), resolved_at = now()
   where id = p_dispute_id
   returning * into d;
  return d;
end $$;


-- ---------- 7. ADMIN CẤP / THU HỒI TÍCH XANH ----------
create or replace function public.set_vendor_verified(p_vendor_id uuid, p_verified boolean)
returns public.vendors
language plpgsql security definer set search_path = public as $$
declare
  v public.vendors;
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên Trạm Hỷ được cấp Tích Xanh';
  end if;
  update public.vendors set is_verified = p_verified where id = p_vendor_id returning * into v;
  if not found then raise exception 'Không tìm thấy đối tác'; end if;
  return v;
end $$;


-- Khách chưa đăng nhập (anon) không cần gọi các hàm nghiệp vụ
revoke execute on function public.create_booking, public.pay_milestone, public.release_milestone,
  public.vendor_set_status, public.open_dispute, public.resolve_dispute, public.set_vendor_verified
  from public, anon;
grant execute on function public.create_booking, public.pay_milestone, public.release_milestone,
  public.vendor_set_status, public.open_dispute, public.resolve_dispute, public.set_vendor_verified
  to authenticated;
