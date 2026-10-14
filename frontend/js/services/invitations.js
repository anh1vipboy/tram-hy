// Thiệp cưới online + phản hồi tham dự (RSVP) + sổ lời chúc.
// Bảo mật (SQL 25): bảng thiệp chỉ chủ thiệp đọc trực tiếp. Khách mời làm mọi việc qua hàm ở server kèm LINK thiệp (slug)
// – có link mới mở được, không liệt kê được thiệp của người khác. Mật khẩu là tùy chọn.
import { sb, unwrap } from '../core/supabase.js';

// Lỗi từ hàm server có dạng "MÃ: lời nhắn" → bỏ mã, giữ lời nhắn tiếng Việt (mã nằm ở error.code)
function rpcError(error) {
  const m = /^([A-Z_]+): (.*)$/s.exec(error.message || '');
  return Object.assign(new Error(m ? m[2] : error.message), { code: m?.[1] });
}
async function rpc(name, args) {
  const { data, error } = await sb.rpc(name, args);
  if (error) throw rpcError(error);
  // Sai link / sai mật khẩu: hàm trả { error } thay vì báo lỗi (để server còn ghi lại lần thử sai – chống dò)
  if (data && typeof data === 'object' && !Array.isArray(data) && data.error) throw new Error(data.error);
  return data;
}

export async function getMyInvitation(userId) {
  return unwrap(await sb.from('invitations').select('*')
    .eq('owner_id', userId).order('created_at').limit(1).maybeSingle());
}

/** Khách mở thiệp bằng link → { status: 'ok' | 'locked' | 'wrong_password' | 'not_found', invitation } */
export async function openInvitation(slug, password = null) {
  return rpc('open_invitation', { p_slug: slug, p_password: password });
}

export async function saveInvitation(userId, invitation, values) {
  const query = invitation
    ? sb.from('invitations').update(values).eq('id', invitation.id)   // không gửi owner_id (không được sửa)
    : sb.from('invitations').insert({ ...values, owner_id: userId });
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
  return unwrap(await sb.from('rsvps').select('id, invitation_id, guest_name, attending, guest_count, message, event_ids, answers, created_at')
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
// Khách gửi phản hồi qua link thiệp: sự kiện sẽ dự (eventIds) + câu trả lời câu hỏi tùy chỉnh (answers: { id câu hỏi: trả lời })
export async function submitRsvp(slug, password, { guestName, attending, guestCount, message, eventIds = [], answers = {} }) {
  await rpc('submit_rsvp', {
    p_slug: slug, p_password: password, p_guest_name: guestName, p_attending: attending, p_guest_count: guestCount,
    p_message: message, p_event_ids: eventIds, p_answers: answers,
  });
}

// ---------- SỔ LỜI CHÚC (SQL 24) ----------
// Khách: chỉ đọc được lời chúc đã duyệt (RLS). Chủ thiệp: đọc hết, duyệt / ẩn / xóa.
// Chủ thiệp: mọi lời chúc (RLS chỉ cho chủ thiệp đọc)
export async function listWishes(invitationId) {
  return unwrap(await sb.from('guestbook_entries').select('id, guest_name, message, status, reply, replied_at, created_at')
    .eq('invitation_id', invitationId).order('created_at', { ascending: false }).limit(300));
}

// Khách: lời chúc đã duyệt (kèm lời đáp của cô dâu chú rể), đọc qua link thiệp
export async function listApprovedWishes(slug, password) {
  return rpc('list_wishes', { p_slug: slug, p_password: password });
}

export async function submitWish(slug, password, { guestName, message }) {
  await rpc('submit_wish', { p_slug: slug, p_password: password, p_guest_name: guestName, p_message: message });
}

export async function replyWish(id, reply) {
  const text = String(reply || '').trim();
  unwrap(await sb.from('guestbook_entries').update({ reply: text || null, replied_at: text ? new Date().toISOString() : null }).eq('id', id));
}

// Mật khẩu thiệp (rỗng = bỏ khóa) và thống kê lượt xem – chỉ chủ thiệp
export async function setInvitationPassword(invitationId, password) {
  await rpc('set_invitation_password', { p_invitation: invitationId, p_password: password || '' });
}

export async function invitationStats(invitationId) {
  return rpc('invitation_stats', { p_invitation: invitationId });
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
