// Tư vấn chia ngân sách cưới bằng AI – gọi Edge Function "tu-van-ngan-sach" (giữ key Gemini ở server)
import { sb } from '../core/supabase.js';

/**
 * { total, guests, city, priorities, note } →
 *   { source: 'ai', allocations, tips, warning }  hoặc  { fallback: true, reason }
 * Lỗi mạng / chưa deploy function cũng trả về fallback để trang dùng cách chia cố định.
 */
export async function adviseBudget(input) {
  const { data, error } = await sb.functions.invoke('tu-van-ngan-sach', { body: input });
  if (error) {
    const body = await error.context?.json?.().catch(() => null);
    if (body?.error) throw new Error(body.error);       // lỗi dữ liệu nhập (vd ngân sách ngoài khoảng)
    return { fallback: true, reason: 'error' };
  }
  return data;
}

// ---------- Trợ lý AI trong Kế hoạch cưới (cần đăng nhập, 20 câu / ngày – đếm ở server) ----------
export const PLAN_AI_DAILY_LIMIT = 20;

/**
 * { question, history } → { source: 'ai', reply, changes: [{ id, name, category, from, to, reason }], remaining }
 *   hoặc { fallback: true, reason }. Hết lượt / chưa đăng nhập → ném lỗi có lời nhắn tiếng Việt.
 */
export async function askPlanAssistant({ question, history }) {
  const { data, error } = await sb.functions.invoke('tu-van-ngan-sach', { body: { mode: 'plan', question, history } });
  if (error) {
    const body = await error.context?.json?.().catch(() => null);
    // Function bản cũ (chưa deploy chế độ plan) không hiểu mode → đòi ngân sách: coi như trợ lý chưa bật
    if (body?.error?.startsWith('Ngân sách phải')) return { fallback: true, reason: 'not-configured' };
    if (body?.error) throw Object.assign(new Error(body.error), { remaining: body.remaining });
    return { fallback: true, reason: 'error' };
  }
  return data;
}

/** Số câu còn được hỏi hôm nay (ngày theo giờ Việt Nam) */
export async function planAssistantRemaining(userId) {
  const vn = new Date(Date.now() + 7 * 3600e3);
  const dayStart = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - 7 * 3600e3).toISOString();
  const { count, error } = await sb.from('ai_usage').select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('kind', 'plan').gte('created_at', dayStart);
  if (error) return PLAN_AI_DAILY_LIMIT;
  return Math.max(0, PLAN_AI_DAILY_LIMIT - (count ?? 0));
}
