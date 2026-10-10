// Thông báo trong chuông (bảng notifications – SQL 18). Database tự tạo thông báo, web chỉ đọc / đánh dấu đã đọc.
import { sb, unwrap } from '../core/supabase.js';

const FIELDS = 'id, kind, icon, title, body, link, read_at, created_at';

export async function listNotifications(limit = 30) {
  return unwrap(await sb.from('notifications').select(FIELDS).order('created_at', { ascending: false }).limit(limit));
}

export async function countUnread() {
  const { count, error } = await sb.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function markRead(id) {
  unwrap(await sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id).is('read_at', null));
}

export async function markAllRead() {
  unwrap(await sb.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null));
}

/** Nghe thông báo mới của chính mình (RLS chỉ gửi đúng người). Trả về hàm hủy. */
export function subscribeNotifications(userId, onInsert) {
  const channel = sb.channel(`notifications-${userId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      (payload) => onInsert(payload.new))
    .subscribe();
  return () => sb.removeChannel(channel);
}
