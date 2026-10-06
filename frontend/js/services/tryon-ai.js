// Thử váy bằng AI thật – gọi Edge Function "thu-vay-ai" (giữ API key Gemini/FASHN ở server)
import { sb } from '../core/supabase.js';

export const AI_DAILY_LIMIT = 5;   // phải khớp DAILY_LIMIT của Edge Function

/**
 * Váy: { dressId } (mẫu của tiệm) hoặc { garmentPath } (ảnh váy tự tải lên)
 * Người: { photoPath } (ảnh cô dâu đã tải lên) hoặc { sampleModel } (người mẫu có sẵn)
 * Kèm { body: { height, weight, heel } } để AI đặt độ dài váy theo số đo.
 * Trả về { imageUrl, remaining } hoặc { fallback: true, reason } khi AI chưa chạy được.
 */
export async function aiTryOn(params) {
  const { data, error } = await sb.functions.invoke('thu-vay-ai', { body: params });
  if (error) {
    // Lỗi 4xx của function có câu tiếng Việt trong body → lấy ra để báo người dùng
    const body = await error.context?.json?.().catch(() => null);
    throw new Error(body?.error || 'Không kết nối được dịch vụ thử váy AI, vui lòng thử lại sau');
  }
  return data;
}

// Số lượt AI còn lại hôm nay (tính theo giờ Việt Nam)
export async function remainingAiTries() {
  const vn = new Date(Date.now() + 7 * 3600e3);
  const start = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - 7 * 3600e3);
  const { count, error } = await sb.from('tryon_jobs')
    .select('id', { count: 'exact', head: true })     // chỉ đếm, không tải dữ liệu
    .eq('status', 'done').gte('created_at', start.toISOString());
  if (error) throw new Error(error.message);
  return Math.max(0, AI_DAILY_LIMIT - (count ?? 0));
}

/** Ảnh đã thử bằng AI gần đây, mới nhất trước: [{ id, url, createdAt }] (link riêng tư 1 giờ) */
export async function listAiResults(limit = 12) {
  const { data: jobs, error } = await sb.from('tryon_jobs')
    .select('id, result_path, created_at')
    .eq('status', 'done').not('result_path', 'is', null)
    .order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  if (!jobs.length) return [];
  const { data: signed, error: signError } = await sb.storage.from('tryon-results')
    .createSignedUrls(jobs.map((j) => j.result_path), 3600);
  if (signError) throw new Error(signError.message);
  return jobs
    .map((j, i) => ({ id: j.id, url: signed[i]?.signedUrl, createdAt: j.created_at }))
    .filter((r) => r.url);
}
