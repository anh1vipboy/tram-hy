// Thử váy bằng AI thật – gọi Edge Function "thu-vay-ai" (giữ API key Gemini/FASHN ở server)
import { sb } from '../core/supabase.js';

// Mặc định khi chưa chạy SQL 28 – phải khớp DAILY_LIMIT của Edge Function
const DEFAULT_SETTINGS = { maxEnabled: false, dailyCredits: 6 };

// Credit FASHN mỗi ảnh: Tiêu chuẩn luôn 1; Siêu nét (1K) theo chất lượng – phải khớp creditCost() của function
const MAX_CREDITS = { fast: 1, balanced: 2, quality: 3 };
export const tryonCost = (o) => o.samples * (o.model === 'max' ? MAX_CREDITS[o.quality] : 1);

/**
 * Váy: { dressId } (mẫu của tiệm) hoặc { garmentPath } (ảnh váy tự tải lên)
 * Người: { photoPath } (ảnh cô dâu đã tải lên) hoặc { sampleModel } (người mẫu có sẵn)
 * Kèm { body: { height, weight, heel } } để AI đặt độ dài váy theo số đo, { options } tùy chỉnh (xem function).
 * Trả về { imageUrl, images, remaining, limit } hoặc { fallback: true, reason } khi AI chưa chạy được.
 * Lỗi 4xx: Error có .remaining khi hết credit.
 */
export async function aiTryOn(params) {
  const { data, error } = await sb.functions.invoke('thu-vay-ai', { body: params });
  if (error) {
    // Lỗi 4xx của function có câu tiếng Việt trong body → lấy ra để báo người dùng
    const body = await error.context?.json?.().catch(() => null);
    const err = new Error(body?.error || 'Không kết nối được dịch vụ thử váy AI, vui lòng thử lại sau');
    if (typeof body?.remaining === 'number') err.remaining = body.remaining;
    throw err;
  }
  return data;
}

/** Cài đặt thử váy AI do admin chỉnh: { maxEnabled, dailyCredits } */
export async function getTryonSettings() {
  const { data, error } = await sb.from('app_settings').select('value').eq('key', 'tryon').maybeSingle();
  if (error || !data) return { ...DEFAULT_SETTINGS };          // chưa chạy SQL 28
  return {
    maxEnabled: data.value.max_enabled === true,
    dailyCredits: Number(data.value.daily_credits) || DEFAULT_SETTINGS.dailyCredits,
  };
}

/** Admin bật/tắt Siêu nét và đổi hạn mức credit/người/ngày */
export async function saveTryonSettings({ maxEnabled, dailyCredits }) {
  const { error } = await sb.rpc('set_tryon_settings', { p_max_enabled: maxEnabled, p_daily_credits: dailyCredits });
  if (error) throw new Error(error.message);
}

// Credit đã dùng hôm nay (tính theo giờ Việt Nam, chỉ ảnh thành công). Chưa có cột credits → mỗi ảnh = 1.
export async function creditsUsedToday() {
  const vn = new Date(Date.now() + 7 * 3600e3);
  const start = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - 7 * 3600e3).toISOString();
  const { data, error } = await sb.from('tryon_jobs').select('credits').eq('status', 'done').gte('created_at', start);
  if (!error) return data.reduce((t, j) => t + (j.credits ?? 1), 0);
  const { count, error: countError } = await sb.from('tryon_jobs')
    .select('id', { count: 'exact', head: true })     // chỉ đếm, không tải dữ liệu
    .eq('status', 'done').gte('created_at', start);
  if (countError) throw new Error(countError.message);
  return count ?? 0;
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
