// Đơn đặt lịch + Escrow 3 chặng. Mọi thay đổi trạng thái đều gọi hàm (RPC) trong database,
// database tự kiểm tra quyền và thứ tự – frontend không tự sửa bảng.
import { sb, unwrap } from '../core/supabase.js';

const BOOKING_FIELDS = `
  id, code, type, status, appointment_at, total_price, contact_name, contact_phone, note, details, created_at, bride_id,
  vendor:vendors(id, slug, name, category),
  dress:dresses(id, name, theme),
  milestones(id, stage, title, percent, amount, status, paid_at, released_at),
  disputes(id, kind, reason, status, resolution_note, created_at),
  reviews(id, rating)`;

function sortMilestones(bookings) {
  for (const b of bookings) {
    b.milestones.sort((a, c) => a.stage - c.stage);
    // reviews là quan hệ 1-1 nên có thể về dạng object hoặc mảng
    b.review = Array.isArray(b.reviews) ? b.reviews[0] ?? null : b.reviews ?? null;
  }
  return bookings;
}

export async function createBooking(params) {
  return unwrap(await sb.rpc('create_booking', {
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
  }));
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
