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
  return unwrap(await query.select().single());
}

export async function listRsvps(invitationId) {
  return unwrap(await sb.from('rsvps').select('*')
    .eq('invitation_id', invitationId).order('created_at', { ascending: false }));
}

// Nghe phản hồi mới của một thiệp theo thời gian thực (RLS: chỉ chủ thiệp nhận được). Trả về hàm hủy.
export function subscribeRsvps(invitationId, onInsert) {
  const channel = sb.channel(`rsvps-${invitationId}`)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'rsvps', filter: `invitation_id=eq.${invitationId}` },
      (payload) => onInsert(payload.new))
    .subscribe();
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
