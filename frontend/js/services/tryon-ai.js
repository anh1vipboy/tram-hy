// Thử váy bằng AI thật – gọi Edge Function "thu-vay-ai" (ướm váy) và "tro-ly-thu-vay" (trợ lý chat).
// API key Gemini/FASHN chỉ nằm ở server.
import { sb } from '../core/supabase.js';

// Mặc định khi chưa chạy SQL 28 – phải khớp DAILY_LIMIT của Edge Function
const DEFAULT_SETTINGS = { maxEnabled: false, dailyCredits: 6 };
const MISSING_SQL = 'Database chưa có phần cài đặt này – hãy chạy file backend/supabase/28_tryon_settings.sql '
  + 'trong Supabase (SQL Editor) rồi thử lại.';

// Credit FASHN mỗi ảnh: Tiêu chuẩn luôn 1; Siêu nét (1K) theo chất lượng – phải khớp creditCost() của function
const MAX_CREDITS = { fast: 1, balanced: 2, quality: 3 };
export const tryonCost = (o) => o.samples * (o.model === 'max' ? MAX_CREDITS[o.quality] : 1);

// Lỗi 4xx của Edge Function có câu tiếng Việt trong body → lấy ra để báo người dùng
async function invoke(name, body, fallbackMessage, signal) {
  const { data, error } = await sb.functions.invoke(name, { body, signal });
  if (error) {
    if (signal?.aborted) {
      const abortErr = new Error('Đã dừng');
      abortErr.name = 'AbortError';
      throw abortErr;
    }
    const detail = await error.context?.json?.().catch(() => null);
    const err = new Error(detail?.error || fallbackMessage);
    if (typeof detail?.remaining === 'number') err.remaining = detail.remaining;
    throw err;
  }
  return data;
}

/**
 * Ướm váy. Váy: { dressId } (mẫu của tiệm) hoặc { garmentPath } (ảnh váy tự tải lên).
 * Người: { photoPath } (ảnh đã tải lên) hoặc { sampleModel } (người mẫu có sẵn).
 * Kèm { body, options, prompt?, message? } – xem đầu file Edge Function thu-vay-ai.
 * Trả về { imageUrl, images, batchId, remaining, limit } hoặc { fallback: true, reason } khi AI chưa chạy được.
 * Lỗi 4xx: Error có .remaining khi hết credit.
 */
export const aiTryOn = (params, signal) =>
  invoke('thu-vay-ai', params, 'Không kết nối được dịch vụ thử váy AI, vui lòng thử lại sau', signal);

/**
 * Hỏi trợ lý thử váy: { message, hasPerson, garment, model, body, history }
 * → { reply, action: 'tryon'|'chat', prompt, samples, theme, remaining }
 */
export const askTryonAssistant = (params, signal) =>
  invoke('tro-ly-thu-vay', params, 'Trợ lý đang bận, bạn thử lại sau ít phút nhé', signal);

/** Cài đặt thử váy AI do admin chỉnh: { maxEnabled, dailyCredits, ready } – ready = false khi chưa chạy SQL 28 */
export async function getTryonSettings() {
  const { data, error } = await sb.from('app_settings').select('value').eq('key', 'tryon').maybeSingle();
  if (error || !data) return { ...DEFAULT_SETTINGS, ready: !error };
  return {
    maxEnabled: data.value.max_enabled === true,
    dailyCredits: Number(data.value.daily_credits) || DEFAULT_SETTINGS.dailyCredits,
    ready: true,
  };
}

/** Admin bật/tắt Siêu nét và đổi hạn mức credit/người/ngày */
export async function saveTryonSettings({ maxEnabled, dailyCredits }) {
  const { error } = await sb.rpc('set_tryon_settings', { p_max_enabled: maxEnabled, p_daily_credits: dailyCredits });
  if (error) throw new Error(error.code === 'PGRST202' ? MISSING_SQL : error.message);
}

// 0 giờ hôm nay theo giờ Việt Nam (UTC+7)
function startOfVietnamDay() {
  const vn = new Date(Date.now() + 7 * 3600e3);
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - 7 * 3600e3).toISOString();
}

// Credit đã dùng hôm nay (chỉ ảnh thành công). Chưa có cột credits (SQL 28) → mỗi ảnh = 1.
export async function creditsUsedToday() {
  const start = startOfVietnamDay();
  const { data, error } = await sb.from('tryon_jobs').select('credits').eq('status', 'done').gte('created_at', start);
  if (!error) return data.reduce((t, j) => t + (j.credits ?? 1), 0);
  const { count, error: countError } = await sb.from('tryon_jobs')
    .select('id', { count: 'exact', head: true })     // chỉ đếm, không tải dữ liệu
    .eq('status', 'done').gte('created_at', start);
  if (countError) throw new Error(countError.message);
  return count ?? 0;
}

// Link tạm 1 giờ cho file trong bucket riêng tư: path → url (file đã xóa → không có trong kết quả)
async function signPaths(bucket, paths) {
  if (!paths.length) return new Map();
  const { data, error } = await sb.storage.from(bucket).createSignedUrls(paths, 3600);
  if (error) throw new Error(error.message);
  return new Map(data.filter((s) => s.signedUrl).map((s) => [s.path, s.signedUrl]));
}

/**
 * Lịch sử ướm thử theo từng lần gửi, MỚI NHẤT TRƯỚC – để dựng lại khung trò chuyện:
 *   { batches: [{ id, createdAt, message, model, images, personUrl, personSample, personDeleted, dressId, garmentUrl }], cursor }
 * cursor: đưa vào { before } để xem các lần cũ hơn; null = hết.
 * personSample: mã người mẫu có sẵn (bride1…) khi lần đó dùng người mẫu của web; personDeleted: ảnh người đã bị xóa.
 * Lần ướm trước SQL 28 không ghi ảnh người → cả 3 trường đều trống.
 */
export async function listTryonHistory({ before = null, limit = 24 } = {}) {
  const query = (columns) => {
    let q = sb.from('tryon_jobs').select(columns).eq('status', 'done').not('result_path', 'is', null)
      .order('created_at', { ascending: false }).limit(limit);
    if (before) q = q.lt('created_at', before);
    return q;
  };
  let { data: jobs, error } = await query('id, batch_id, result_path, dress_id, garment_path, options, message, created_at');
  if (error) ({ data: jobs, error } = await query('id, result_path, dress_id, garment_path, created_at'));   // chưa chạy SQL 28
  if (error) throw new Error(error.message);

  // Gom các ảnh cùng một lần gửi (batch_id); ảnh cũ trước SQL 28 mỗi ảnh là một lần
  const groups = [];
  for (const job of jobs) {
    const key = job.batch_id ?? job.id;
    const last = groups.at(-1);
    if (last?.key === key) last.jobs.push(job);
    else groups.push({ key, jobs: [job] });
  }
  // Trang đầy → lần cuối có thể bị cắt dở: bỏ ra, để lần "xem thêm" lấy trọn
  const full = jobs.length === limit && groups.length > 1;
  if (full) groups.pop();

  const personOf = (job) => job.options?.person ?? null;
  const resultUrls = await signPaths('tryon-results', groups.flatMap((g) => g.jobs.map((j) => j.result_path)));
  const privatePaths = [...new Set(groups.flatMap((g) => g.jobs)
    .flatMap((j) => [j.garment_path, personOf(j)])
    .filter((p) => p && !p.startsWith('sample:')))];
  const photoUrls = await signPaths('bride-photos', privatePaths);

  const batches = groups.map(({ key, jobs: list }) => {
    const first = list.at(-1);                       // ảnh đầu tiên của lần gửi (danh sách đang mới → cũ)
    const person = personOf(first);
    return {
      id: key,
      createdAt: first.created_at,
      message: first.message ?? '',
      model: first.options?.model ?? null,
      images: list.slice().reverse().map((j) => resultUrls.get(j.result_path)).filter(Boolean),
      personUrl: person && !person.startsWith('sample:') ? photoUrls.get(person) ?? null : null,
      personSample: person?.startsWith('sample:') ? person.slice(7) : null,
      personDeleted: Boolean(person) && !person.startsWith('sample:') && !photoUrls.has(person),
      dressId: first.dress_id,
      garmentUrl: first.garment_path ? photoUrls.get(first.garment_path) ?? null : null,
    };
  }).filter((b) => b.images.length);

  const oldest = groups.at(-1)?.jobs.at(-1)?.created_at ?? null;
  return { batches, cursor: full ? oldest : null };
}
