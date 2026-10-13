// Thiệp cưới online + phản hồi tham dự (RSVP)
import { sb, unwrap } from '../core/supabase.js';

export async function getMyInvitation(userId) {
  return unwrap(await sb.from('invitations').select('*')
    .eq('owner_id', userId).order('created_at').limit(1).maybeSingle());
}

export async function getInvitationBySlug(slug) {
  return unwrap(await sb.from('invitations').select('*').eq('slug', slug).maybeSingle());
}

export async function saveInvitation(userId, invitation, values) {
  const row = { ...values, owner_id: userId };
  const query = invitation
    ? sb.from('invitations').update(row).eq('id', invitation.id)
    : sb.from('invitations').insert(row);
  const result = await query.select().single();
  // Database chưa chạy SQL 22 (chưa có cột template / details / photo_url)
  if (result.error?.code === 'PGRST204') throw new Error('Trạm Hỷ đang cập nhật mẫu thiệp mới, bạn thử lưu lại sau ít phút nhé.');
  return unwrap(result);
}

// Ảnh cưới trên thiệp: invitation-photos/<user_id>/anh-<thời gian>.jpg (bucket công khai – khách mời xem được)
export async function uploadInvitationPhoto(userId, blob) {
  const path = `${userId}/anh-${Date.now()}.jpg`;
  unwrap(await sb.storage.from('invitation-photos').upload(path, blob, { contentType: 'image/jpeg', upsert: false }));
  return sb.storage.from('invitation-photos').getPublicUrl(path).data.publicUrl;
}

// Xóa ảnh cũ khi đổi ảnh (bỏ qua lỗi – ảnh thừa không ảnh hưởng thiệp)
export async function removeInvitationPhoto(url) {
  const path = String(url || '').split('/invitation-photos/')[1];
  if (path) await sb.storage.from('invitation-photos').remove([decodeURIComponent(path)]).catch(() => {});
}

export async function listRsvps(invitationId) {
  return unwrap(await sb.from('rsvps').select('id, invitation_id, guest_name, attending, guest_count, message, created_at')
    .eq('invitation_id', invitationId).order('created_at', { ascending: false }));
}

// Nghe phản hồi mới của một thiệp theo thời gian thực (RLS: chỉ chủ thiệp nhận được). Trả về hàm hủy.
// onReady: gọi mỗi lần kết nối xong (cả khi mạng chập chờn rồi nối lại) → tải lại để không sót phản hồi.
export function subscribeRsvps(invitationId, onInsert, onReady) {
  const channel = sb.channel(`rsvps-${invitationId}`)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'rsvps', filter: `invitation_id=eq.${invitationId}` },
      (payload) => onInsert(payload.new))
    .subscribe((status) => { if (status === 'SUBSCRIBED') onReady?.(); });
  return () => sb.removeChannel(channel);
}

// Khách mời không cần đăng nhập
export async function submitRsvp(invitationId, { guestName, attending, guestCount, message }) {
  unwrap(await sb.from('rsvps').insert({
    invitation_id: invitationId,
    guest_name: guestName,
    attending,
    guest_count: guestCount,
    message,
  }));
}

// ---------- SỔ LỜI CHÚC (SQL 24) ----------
// Khách: chỉ đọc được lời chúc đã duyệt (RLS). Chủ thiệp: đọc hết, duyệt / ẩn / xóa.
export async function listWishes(invitationId) {
  return unwrap(await sb.from('guestbook_entries').select('id, guest_name, message, status, created_at')
    .eq('invitation_id', invitationId).order('created_at', { ascending: false }).limit(300));
}

export async function submitWish(invitationId, { guestName, message }) {
  unwrap(await sb.from('guestbook_entries').insert({ invitation_id: invitationId, guest_name: guestName, message }));
}

export async function setWishStatus(id, status) {
  unwrap(await sb.from('guestbook_entries').update({ status }).eq('id', id));
}

export async function deleteWish(id) {
  unwrap(await sb.from('guestbook_entries').delete().eq('id', id));
}

// Lời chúc mới cho thiệp của mình (realtime). Trả về hàm hủy.
export function subscribeWishes(invitationId, onInsert) {
  const channel = sb.channel(`guestbook-${invitationId}`)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'guestbook_entries', filter: `invitation_id=eq.${invitationId}` },
      (payload) => onInsert(payload.new))
    .subscribe();
  return () => sb.removeChannel(channel);
}
