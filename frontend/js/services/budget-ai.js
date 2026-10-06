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
