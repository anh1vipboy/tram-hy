// Đơn đặt lịch + Escrow 3 chặng. Mọi thay đổi trạng thái đều gọi hàm (RPC) hoặc Edge Function trong database,
// database tự kiểm tra quyền và thứ tự – frontend không tự sửa bảng.
import { sb, unwrap } from '../core/supabase.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

const SLA_ENDPOINT = `${SUPABASE_URL}/functions/v1/khieu-nai-sla`;

const BOOKING_FIELDS = `
  id, code, type, status, appointment_at, total_price, contact_name, contact_phone, note, details, created_at, updated_at, bride_id,
  vendor:vendors(id, slug, name, category, phone),
  dress:dresses(id, name, theme),
  milestones(id, stage, title, percent, amount, status, paid_at, released_at),
  disputes(id, kind, reason, status, prev_status, resolution_note, created_at, resolved_at),
  reviews(id, rating)`;

function sortMilestones(bookings) {
  for (const b of bookings) {
    b.milestones.sort((a, c) => a.stage - c.stage);
    // reviews là quan hệ 1-1 nên có thể về dạng object hoặc mảng
    b.review = Array.isArray(b.reviews) ? b.reviews[0] ?? null : b.reviews ?? null;
  }
  return bookings;
}

// Database tự tính giá (nhà hàng: giá mỗi bàn × số bàn) và tự chặn trùng lịch – lỗi trả về đã là câu dễ hiểu.
export async function createBooking(params) {
  const { data, error } = await sb.rpc('create_booking', {
    p_vendor_id: params.vendorId,
    p_type: params.type,
    p_dress_id: params.dressId ?? null,
    p_appointment_at: params.appointmentAt ?? null,
    p_contact_name: params.contactName ?? null,
    p_contact_phone: params.contactPhone ?? null,
    p_note: params.note ?? null,
    p_details: params.details ?? {},
    p_custom_price: params.customPrice ?? null,
    ...(params.packageId ? { p_package_id: params.packageId } : {}),   // gói dịch vụ (SQL 19)
    ...(params.quantity != null ? { p_quantity: params.quantity } : {}), // số bàn nhà hàng tiệc (SQL 30)
  });
  if (error) {
    // Web đã có ô "Số bàn" nhưng database chưa chạy SQL 30 (chưa có p_quantity) → không báo lỗi kỹ thuật
    if (params.quantity != null && error.code === 'PGRST202') {
      throw new Error('Trạm Hỷ đang cập nhật cách tính giá theo bàn – bạn thử lại sau ít phút nhé');
    }
    throw new Error(error.message);
  }
  return data;
}

/**
 * Giờ đã có lịch của một tiệm trong khoảng [from, to) – chỉ giờ hẹn, không kèm thông tin khách (SQL 30).
 * Đơn đã hủy / hoàn tiền không tính. Trả về mảng Date đã sắp xếp.
 */
export async function vendorBusyTimes(vendorId, from, to) {
  const rows = unwrap(await sb.rpc('vendor_busy_times', {
    p_vendor_id: vendorId,
    p_from: new Date(from).toISOString(),
    p_to: new Date(to).toISOString(),
  }));
  return (rows ?? []).map((r) => new Date(r.appointment_at));
}

/** Số sảnh tiệc của nhà hàng – mỗi sảnh nhận 1 tiệc/ngày (SQL 30). Database chưa có cột → coi như 1 sảnh. */
export async function vendorHalls(vendorId) {
  const { data, error } = await sb.from('vendors').select('halls').eq('id', vendorId).maybeSingle();
  return error ? 1 : (data?.halls ?? 1);
}

// Đơn mà mình là cô dâu
export async function listMyBookings(userId) {
  return sortMilestones(unwrap(await sb.from('bookings')
    .select(BOOKING_FIELDS).eq('bride_id', userId).order('created_at', { ascending: false })));
}

// Đơn của các tiệm mình quản lý
export async function listVendorBookings(vendorIds) {
  if (!vendorIds.length) return [];
  return sortMilestones(unwrap(await sb.from('bookings')
    .select(BOOKING_FIELDS).in('vendor_id', vendorIds).order('appointment_at', { ascending: true })));
}

// Admin: toàn bộ đơn
export async function listAllBookings() {
  return sortMilestones(unwrap(await sb.from('bookings')
    .select(BOOKING_FIELDS).order('created_at', { ascending: false })));
}

export async function payMilestone(bookingId, stage) {
  return unwrap(await sb.rpc('pay_milestone', { p_booking_id: bookingId, p_stage: stage }));
}

export async function releaseMilestone(bookingId, stage) {
  return unwrap(await sb.rpc('release_milestone', { p_booking_id: bookingId, p_stage: stage }));
}

export async function vendorSetStatus(bookingId, status) {
  return unwrap(await sb.rpc('vendor_set_status', { p_booking_id: bookingId, p_status: status }));
}

// kind: 'refund_request' (cô dâu) hoặc 'no_show' (đối tác)
export async function openDispute(bookingId, kind, reason) {
  return unwrap(await sb.rpc('open_dispute', { p_booking_id: bookingId, p_kind: kind, p_reason: reason }));
}

async function callDisputeSla(payload) {
  const { data: sessionData } = await sb.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error('Vui lòng đăng nhập để thực hiện thao tác này.');
  const res = await fetch(SLA_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Không thể xử lý yêu cầu lúc này.');
  return json;
}

/** Khách hàng phản hồi khiếu nại: xin dời lịch hẹn mới ('reschedule') hoặc gửi giải trình ('rebuttal') */
export function respondDisputeAsBride(bookingId, { responseType, message, proposedAppointmentAt }) {
  return callDisputeSla({
    action: 'bride_respond',
    bookingId,
    responseType,
    message,
    proposedAppointmentAt,
  });
}

/** Đối tác gửi phản hồi giải trình khi khách yêu cầu hoàn cọc */
export function respondDisputeAsVendor(bookingId, { message }) {
  return callDisputeSla({
    action: 'vendor_respond',
    bookingId,
    message,
  });
}

/** Khôi phục đơn hàng & cập nhật lịch hẹn mới (do Tiệm đồng ý dời lịch, Khách rút khiếu nại, hoặc Admin duyệt) */
export function restoreDisputedBooking(bookingId, { newAppointmentAt, note } = {}) {
  return callDisputeSla({
    action: 'restore_booking',
    bookingId,
    newAppointmentAt,
    note,
  });
}

/** Kích hoạt xử lý tự động theo hạn chót SLA (48h khiếu nại không phản hồi / 72h quên bấm nghiệm thu) */
export function triggerBookingSla(bookingId) {
  return callDisputeSla({
    action: 'trigger_sla',
    bookingId,
  });
}

export async function addReview({ booking, rating, content }) {
  return unwrap(await sb.from('reviews').insert({
    booking_id: booking.id,
    vendor_id: booking.vendor.id,
    bride_id: booking.bride_id,
    rating,
    content,
  }));
}

// Nghe thay đổi đơn/chặng/khiếu nại theo thời gian thực (RLS vẫn áp dụng). Trả về hàm hủy đăng ký.
export function subscribeBookingChanges(channelName, onChange) {
  const channel = sb.channel(channelName);
  for (const table of ['bookings', 'milestones', 'disputes']) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange);
  }
  channel.subscribe();
  return () => sb.removeChannel(channel);
}

/**
 * Kiểm tra nhanh đơn hàng cần xử lý khẩn cấp (đang khiếu nại / chờ nghiệm thu / sắp đến giờ hẹn trong 24h)
 * để hiển thị thanh cảnh báo toàn trang giúp khách bận không bị quên.
 */
export async function getUrgentBookingAlert(profile) {
  if (!profile?.id) return null;
  if (profile.role === 'admin') {
    const { data: disputes } = await sb
      .from('disputes')
      .select('id, kind, created_at, booking:bookings(code, details, vendor:vendors(name))')
      .eq('status', 'open')
      .order('created_at', { ascending: true })
      .limit(5);
    if (!disputes?.length) return null;
    const withReply = disputes.find((d) => d.booking?.details?.dispute_response);
    const target = withReply || disputes[0];
    return {
      tone: 'urgent',
      icon: '⚖️',
      title: withReply
        ? `Khách hàng đã gửi đề xuất lịch mới / giải trình cho đơn ${target.booking?.code}`
        : `Đang có ${disputes.length} khiếu nại chờ Quản trị viên phân xử`,
      sub: `Đơn ${target.booking?.code || ''} · ${target.booking?.vendor?.name || ''}`,
      cta: 'Mở trang phân xử →',
      href: 'admin.html?tab=disputes',
    };
  }

  // Khách hàng (bride)
  const { data: myBookings } = await sb
    .from('bookings')
    .select('id, code, status, appointment_at, total_price, details, updated_at, vendor:vendors(name), milestones(amount, status), disputes(id, kind, reason, status, created_at)')
    .eq('bride_id', profile.id)
    .in('status', ['disputed', 'ready_for_review', 'confirmed', 'in_progress'])
    .order('updated_at', { ascending: false })
    .limit(10);

  if (!myBookings?.length) return null;

  // 1. Ưu tiên cao nhất: Đơn đang bị khiếu nại (đặc biệt là đối tác báo khách không đến mà khách chưa phản hồi)
  const disputed = myBookings.find((b) => b.status === 'disputed' && b.disputes?.some((d) => d.status === 'open'));
  if (disputed) {
    const open = disputed.disputes.find((d) => d.status === 'open');
    const held = (disputed.milestones || []).filter((m) => m.status === 'paid').reduce((s, m) => s + m.amount, 0);
    const remainMs = new Date(open.created_at).getTime() + 48 * 3_600_000 - Date.now();
    const hours = Math.max(0, Math.floor(remainMs / 3_600_000));
    const mins = Math.max(0, Math.floor((remainMs % 3_600_000) / 60_000));
    const hasResp = Boolean(disputed.details?.dispute_response);
    return {
      tone: 'urgent',
      icon: '🚨',
      title: open.kind === 'no_show'
        ? (hasResp
            ? `Đơn ${disputed.code}: Đã gửi đề xuất lịch hẹn mới cho ${disputed.vendor?.name}`
            : `Cần bạn phản hồi: ${disputed.vendor?.name} báo bạn không đến lịch hẹn đơn ${disputed.code}`)
        : `Đơn ${disputed.code} đang trong quá trình xử lý hoàn cọc`,
      sub: hasResp
        ? `Tiền cọc ${held.toLocaleString('vi-VN')}đ đang được bảo lưu trong lúc chờ xác nhận.`
        : (remainMs > 0
            ? `Còn ${hours}h ${mins}p để bạn xin dời lịch hẹn mới hoặc giải trình trước khi hệ thống tự xử lý tiền cọc (${held.toLocaleString('vi-VN')}đ).`
            : `Đã quá 48h hạn phản hồi – hãy vào đơn gửi giải trình hoặc xin dời lịch ngay!`),
      cta: hasResp ? 'Xem tiến độ →' : 'Xin dời lịch / Phản hồi ngay →',
      href: `bookings.html?focus=${disputed.code}`,
    };
  }

  // 2. Đơn đối tác đã báo hoàn thành, chờ khách nghiệm thu (SLA 72h)
  const reviewable = myBookings.find((b) => b.status === 'ready_for_review');
  if (reviewable) {
    return {
      tone: 'warn',
      icon: '📋',
      title: `${reviewable.vendor?.name} đã hoàn thành đơn ${reviewable.code} – Chờ bạn nghiệm thu`,
      sub: 'Kiểm tra dịch vụ và bấm Nghiệm thu (hoặc phản hồi nếu chưa hài lòng) trong vòng 72 giờ.',
      cta: 'Nghiệm thu ngay →',
      href: `bookings.html?focus=${reviewable.code}`,
    };
  }

  // 3. Lịch hẹn sắp diễn ra trong 24 giờ tới (nhắc khách bận không quên lịch)
  const now = Date.now();
  const upcoming = myBookings.find((b) => {
    if (!b.appointment_at || !['confirmed', 'in_progress'].includes(b.status)) return false;
    const diff = new Date(b.appointment_at).getTime() - now;
    return diff > -3_600_000 && diff <= 24 * 3_600_000;
  });
  if (upcoming) {
    return {
      tone: 'info',
      icon: '⏰',
      title: `Nhắc lịch hẹn hôm nay / ngày mai: Đơn ${upcoming.code} tại ${upcoming.vendor?.name}`,
      sub: `Giờ hẹn: ${new Date(upcoming.appointment_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })}. Nếu bận đột xuất, hãy liên hệ tiệm sớm để đổi lịch không mất cọc.`,
      cta: 'Xem lịch hẹn →',
      href: `bookings.html?focus=${upcoming.code}`,
    };
  }

  return null;
}
