// Edge Function "thu-vay-ai": ghép váy lên ảnh cô dâu bằng AI (FASHN chuyên thử đồ, hoặc Gemini).
// Gọi từ trình duyệt (người dùng đã đăng nhập): sb.functions.invoke('thu-vay-ai', { body }).
// Chỉ ƯỚM váy lên người (1 ảnh người + 1 ảnh váy → ảnh thử) – không đổi nền, không đổi khung, không video.
//
// Body: { dressId | garmentPath, photoPath | sampleModel, body?, options?, prompt?, message? }
//   dressId     – mẫu váy của tiệm trên Trạm Hỷ (lấy ảnh thật của mẫu)
//   garmentPath – hoặc ảnh váy mẫu người dùng tự tải lên (bride-photos/<user_id>/garment-...)
//   photoPath   – ảnh cô dâu đã tải lên bucket riêng tư bride-photos (<user_id>/body-...)
//   sampleModel – hoặc dùng ảnh người mẫu có sẵn của web: user | bride1..bride4
//   body        – { height, weight, heel } số đo để AI đặt độ dài váy cho đúng (model có nhận prompt)
//   prompt      – ghi chú cách mặc bằng tiếng Anh (trợ lý tro-ly-thu-vay dịch từ tin nhắn) – chỉ Siêu nét dùng
//   message     – tin nhắn gốc của người dùng, lưu lại để hiện trong lịch sử trò chuyện
//   options     – tùy chỉnh (sai/thiếu → mặc định), xem readOptions():
//     model    standard (FASHN tryon-v1.6) | max (tryon-max – chỉ khi admin bật Siêu nét ở trang Quản trị)
//     quality  fast | balanced | quality
//     samples  1–4 ảnh mỗi lần
//     category one-pieces | tops | bottoms | auto        (chỉ standard)
//     photoType auto | flat-lay | model                  (chỉ standard)
//     cleanOriginal true = xóa kỹ đồ đang mặc            (chỉ standard: segmentation_free = false)
//     seed     số nguyên – đổi seed để ra "kiểu khác"
//
// Credit (FASHN tính): standard 1/ảnh; max 1k: fast 1 · balanced 2 · quality 3 /ảnh. Gemini: 1 ảnh = 1.
// Hạn mức mỗi người/ngày tính theo TỔNG credit (app_settings 'tryon'.daily_credits, SQL 28). Tài khoản admin không giới hạn.
//
// Trả về:
//   { imageUrl, images, batchId, remaining, limit, credits, provider } – thành công (link riêng tư, hết hạn sau 1 giờ)
//   { fallback: true, reason }          – không chạy AI được → web hiện ảnh minh họa như cũ
//        reason: not-configured | free-tier | no-credits | bad-photo | no-dress-photo | provider-error
//   { error } kèm mã 4xx                – lỗi người dùng cần biết (hết credit, chưa đăng nhập…)
//
// Biến môi trường (Supabase → Edge Functions → Secrets):
//   GEMINI_API_KEY      – key Gemini; FASHN hết credit thì tự chuyển sang Gemini (nếu có key)
//   FASHN_API_KEY       – có key này thì mặc định dùng FASHN (https://app.fashn.ai → API)
//   TRYON_PROVIDER      – ép dùng fashn | gemini (không đặt = fashn nếu có FASHN_API_KEY, ngược lại gemini)
//   GEMINI_IMAGE_MODEL  – mặc định gemini-3.1-flash-image-preview
//   DAILY_LIMIT         – hạn mức credit dự phòng khi chưa chạy SQL 28, mặc định 6
//   SITE_URL            – địa chỉ web để lấy ảnh người mẫu có sẵn
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { decodeBase64, encodeBase64 } from 'jsr:@std/encoding@1/base64';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://tram-hy-alpha.vercel.app';
const PROVIDER = Deno.env.get('TRYON_PROVIDER') ?? (Deno.env.get('FASHN_API_KEY') ? 'fashn' : 'gemini');
const DEFAULT_LIMIT = Number(Deno.env.get('DAILY_LIMIT') ?? 6);
const SAMPLE_MODELS: Record<string, string> = {
  user: 'user_bride.png',
  bride1: 'bride_model_1.png',
  bride2: 'bride_model_2.jpg',
  bride3: 'bride_model_3.png',
  bride4: 'bride_model_4.png',
};

type Img = { mimeType: string; data: string };                 // ảnh dạng base64
type Body = { height: number; weight: number; heel: number } | null;
type Options = {
  model: 'standard' | 'max';
  quality: 'fast' | 'balanced' | 'quality';
  samples: number;
  category: string;
  photoType: string;
  cleanOriginal: boolean;
  seed: number;
};
type Output = { bytes: Uint8Array; mimeType: string };
type Result = { images: Output[] } | { unavailable: string };

// Số đo hợp lệ (khớp thanh trượt ở Phòng thử) → câu mô tả cho AI; sai thì bỏ qua
function readBody(raw: Record<string, unknown> | undefined): Body {
  const height = Number(raw?.height), weight = Number(raw?.weight), heel = Number(raw?.heel ?? 0);
  if (!(height >= 140 && height <= 185 && weight >= 38 && weight <= 90 && heel >= 0 && heel <= 12)) return null;
  return { height, weight, heel };
}
const describeBody = (b: Body) => b
  ? `The person is ${b.height} cm tall, weighs ${b.weight} kg and wears ${b.heel ? `${b.heel} cm heels` : 'flat shoes'}: ` +
    'scale the dress to her real proportions, waistline at her natural waist, a floor-length hem just touching the floor.'
  : '';

// Chữ tự do từ trình duyệt: 1 dòng, bỏ link, giới hạn độ dài
const cleanText = (value: unknown, max: number) =>
  typeof value === 'string' ? value.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim().slice(0, max) : '';

// Tùy chọn từ trình duyệt → chỉ nhận giá trị trong danh sách cho phép
const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? value as T : fallback;
function readOptions(raw: Record<string, unknown> | undefined): Options {
  const samples = Math.trunc(Number(raw?.samples));
  const seed = Math.trunc(Number(raw?.seed));
  return {
    model: pick(raw?.model, ['standard', 'max'] as const, 'standard'),
    quality: pick(raw?.quality, ['fast', 'balanced', 'quality'] as const, 'quality'),
    samples: samples >= 1 && samples <= 4 ? samples : 1,
    category: pick(raw?.category, ['one-pieces', 'tops', 'bottoms', 'auto'] as const, 'one-pieces'),
    photoType: pick(raw?.photoType, ['auto', 'flat-lay', 'model'] as const, 'auto'),
    cleanOriginal: raw?.cleanOriginal === true,
    seed: seed >= 0 && seed < 2 ** 31 ? seed : Math.floor(Math.random() * 2 ** 31),
  };
}
const MAX_CREDITS = { fast: 1, balanced: 2, quality: 3 } as const;   // tryon-max 1k, mỗi ảnh
const creditCost = (o: Options) => o.samples * (o.model === 'max' ? MAX_CREDITS[o.quality] : 1);

// Cài đặt admin (SQL 28). Chưa chạy SQL 28 → Siêu nét tắt, hạn mức theo DAILY_LIMIT.
async function readSettings(admin: SupabaseClient) {
  const { data } = await admin.from('app_settings').select('value').eq('key', 'tryon').maybeSingle();
  const limit = Number(data?.value?.daily_credits);
  return { maxEnabled: data?.value?.max_enabled === true, limit: limit >= 1 ? limit : DEFAULT_LIMIT };
}

// Credit đã dùng hôm nay (chỉ tính ảnh thành công). Chưa có cột credits → mỗi ảnh tính 1.
async function creditsUsedToday(admin: SupabaseClient, userId: string) {
  const since = startOfVietnamDay();
  const { data, error } = await admin.from('tryon_jobs').select('credits')
    .eq('user_id', userId).eq('status', 'done').gte('created_at', since);
  if (!error) return (data ?? []).reduce((t, j) => t + (j.credits ?? 1), 0);
  const { count } = await admin.from('tryon_jobs').select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('status', 'done').gte('created_at', since);
  return count ?? 0;
}

const geminiPrompt = (b: Body) => `Image 1 is a bride. Image 2 is a wedding dress.
Create a photorealistic full-body photo of the SAME person from image 1 wearing the wedding dress from image 2.
Keep her face, hairstyle, skin tone, body shape, pose and background exactly as in image 1.
Reproduce the dress faithfully: silhouette, fabric, color, neckline, sleeves, lace and embellishments.
${describeBody(b)}
Natural studio lighting, no text, no watermark.`;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const fallback = (reason: string) => json({ fallback: true, reason });

// 0 giờ hôm nay theo giờ Việt Nam (UTC+7) – mốc đếm lượt trong ngày
function startOfVietnamDay() {
  const vn = new Date(Date.now() + 7 * 3600e3);
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - 7 * 3600e3).toISOString();
}

async function toImg(blob: Blob): Promise<Img> {
  return { mimeType: blob.type || 'image/jpeg', data: encodeBase64(new Uint8Array(await blob.arrayBuffer())) };
}

async function fetchImg(url: string): Promise<Img> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Không tải được ảnh ${url}: ${res.status}`);
  return toImg(await res.blob());
}

// ---------- NHÀ CUNG CẤP AI ----------

async function runGemini(person: Img, garment: Img, body: Body): Promise<Result> {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) return { unavailable: 'not-configured' };
  const model = Deno.env.get('GEMINI_IMAGE_MODEL') ?? 'gemini-3.1-flash-image-preview';

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: geminiPrompt(body) }, { inlineData: person }, { inlineData: garment }] }],
      generationConfig: { responseModalities: ['IMAGE'] },
    }),
  });
  // Key Free tier / chưa bật thanh toán: Google trả 429 (quota = 0) hoặc 403
  if (res.status === 429 || res.status === 403) {
    console.warn('Gemini từ chối (chưa bật thanh toán?)', res.status, await res.text());
    return { unavailable: 'free-tier' };
  }
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);

  const reply = await res.json();
  const part = reply.candidates?.[0]?.content?.parts?.find((p: { inlineData?: Img }) => p.inlineData);
  if (!part) throw new Error(`Gemini không trả ảnh: ${JSON.stringify(reply).slice(0, 300)}`);
  return { images: [{ bytes: decodeBase64(part.inlineData.data), mimeType: part.inlineData.mimeType || 'image/png' }] };
}

// FASHN (chuyên thử đồ, giữ nguyên dáng người trong ảnh) – tài liệu: https://docs.fashn.ai
//   tryon-v1.6: model_image + garment_image, 1 credit/ảnh (mode chỉ đổi tốc độ/độ đẹp, không đổi giá)
//   tryon-max : model_image + product_image + prompt (gửi kèm số đo), luôn 1k, giá theo generation_mode
async function runFashn(person: Img, garment: Img, body: Body, o: Options, styling: string): Promise<Result> {
  const key = Deno.env.get('FASHN_API_KEY');
  if (!key) return { unavailable: 'not-configured' };
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
  const dataUrl = (img: Img) => `data:${img.mimeType};base64,${img.data}`;

  const [modelName, inputs] = o.model === 'max'
    ? ['tryon-max', {
      model_image: dataUrl(person),
      product_image: dataUrl(garment),
      prompt: `Wedding dress try-on. ${describeBody(body)} ${styling}`.trim(),
      resolution: '1k',
      generation_mode: o.quality,
      num_images: o.samples,
      seed: o.seed,
      output_format: 'jpeg',
    }]
    : ['tryon-v1.6', {
      model_image: dataUrl(person),
      garment_image: dataUrl(garment),
      category: o.category,
      garment_photo_type: o.photoType,          // ảnh váy trải phẳng hay ảnh người mặc (auto = FASHN tự nhận)
      segmentation_free: !o.cleanOriginal,      // false = xóa kỹ đồ đang mặc trước khi ướm
      mode: { fast: 'performance', balanced: 'balanced', quality: 'quality' }[o.quality],
      num_samples: o.samples,
      seed: o.seed,
      output_format: 'jpeg',
    }];

  const start = await fetch('https://api.fashn.ai/v1/run', {
    method: 'POST',
    headers,
    body: JSON.stringify({ model_name: modelName, inputs }),
  });
  if (start.status === 401) return { unavailable: 'not-configured' };           // key sai
  if (start.status === 402) return { unavailable: 'no-credits' };               // hết credit
  if (!start.ok) throw new Error(`FASHN ${start.status}: ${await start.text()}`);
  const { id, error } = await start.json();
  if (!id) throw new Error(`FASHN không nhận yêu cầu: ${JSON.stringify(error)}`);

  for (let i = 0; i < 65; i++) {                                   // chờ tối đa ~130 giây (Siêu nét ~50 giây/lượt)
    await new Promise((r) => setTimeout(r, 2000));
    const res = await fetch(`https://api.fashn.ai/v1/status/${id}`, { headers });
    if (!res.ok) continue;                                         // lỗi mạng tạm thời → hỏi lại
    const status = await res.json();
    if (status.status === 'completed') {
      const images = await Promise.all((status.output as string[]).map(async (url) => {
        const img = await fetchImg(url);
        return { bytes: decodeBase64(img.data), mimeType: img.mimeType };
      }));
      return { images };
    }
    if (status.status === 'failed') {
      // Ảnh không hợp lệ (không thấy người / không thấy váy…) → báo người dùng đổi ảnh
      const name = status.error?.name ?? '';
      if (/Image|Pose|Load/i.test(name)) return { unavailable: 'bad-photo' };
      throw new Error(`FASHN failed: ${JSON.stringify(status.error)}`);
    }
  }
  throw new Error('FASHN quá thời gian chờ');
}

// ---------- XỬ LÝ YÊU CẦU ----------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return json({ error: 'Bạn cần đăng nhập để thử váy bằng AI' }, 401);

  const { dressId, garmentPath, photoPath, sampleModel, body: rawBody, options: rawOptions, prompt: rawPrompt, message: rawMessage } =
    await req.json().catch(() => ({}));
  const styling = cleanText(rawPrompt, 300);
  const message = cleanText(rawMessage, 500);
  const ownsPath = (path: unknown) => typeof path === 'string' && path.startsWith(`${user.id}/`) && !path.includes('..');

  const settings = await readSettings(admin);
  // Admin: không giới hạn credit/ngày và dùng được Siêu nét kể cả khi đang tắt (thử trước khi bật cho mọi người)
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const unlimited = profile?.role === 'admin';
  const options = readOptions(rawOptions);
  if (options.model === 'max' && !settings.maxEnabled && !unlimited) {
    return json({ error: 'Mô hình Siêu nét đang tắt – hãy chọn Tiêu chuẩn' }, 403);
  }
  // Gemini chỉ trả 1 ảnh, không có tùy chỉnh → tính 1 credit
  const provider = PROVIDER;
  const cost = provider === 'fashn' ? creditCost(options) : 1;

  // Váy: mẫu của tiệm (dressId) hoặc ảnh váy người dùng tự tải (garmentPath)
  let dress: { id: string; image_url: string | null } | null = null;
  if (garmentPath) {
    if (!ownsPath(garmentPath)) return json({ error: 'Ảnh váy không hợp lệ' }, 403);
  } else {
    const { data } = await admin.from('dresses').select('id, image_url, is_active').eq('id', dressId).maybeSingle();
    if (!data?.is_active) return json({ error: 'Không tìm thấy mẫu váy' }, 404);
    if (!data.image_url) return fallback('no-dress-photo');
    dress = data;
  }

  const used = unlimited ? 0 : await creditsUsedToday(admin, user.id);
  const left = unlimited ? Infinity : Math.max(0, settings.limit - used);
  if (cost > left) {
    return json({
      error: left
        ? `Hôm nay bạn còn ${left} credit, lựa chọn này cần ${cost} credit – hãy giảm số ảnh hoặc chất lượng.`
        : `Bạn đã dùng hết ${settings.limit} credit thử váy AI hôm nay. Mai quay lại nhé!`,
      remaining: left,
      limit: settings.limit,
    }, 429);
  }

  let person: Img;
  if (photoPath) {
    if (!ownsPath(photoPath)) return json({ error: 'Ảnh không hợp lệ' }, 403);
    const { data, error } = await admin.storage.from('bride-photos').download(photoPath);
    if (error || !data) return json({ error: 'Không đọc được ảnh của bạn, hãy tải ảnh lại' }, 400);
    person = await toImg(data);
  } else if (SAMPLE_MODELS[sampleModel]) {
    person = await fetchImg(`${SITE_URL}/assets/images/${SAMPLE_MODELS[sampleModel]}`);
  } else {
    return json({ error: 'Vui lòng chọn ảnh người mẫu hoặc tải ảnh của bạn' }, 400);
  }

  let garment: Img;
  if (dress) {
    garment = await fetchImg(dress.image_url!);
  } else {
    const { data, error } = await admin.storage.from('bride-photos').download(garmentPath);
    if (error || !data) return json({ error: 'Không đọc được ảnh váy, hãy tải ảnh lại' }, 400);
    garment = await toImg(data);
  }

  const body = readBody(rawBody);
  // garment_path chỉ ghi khi dùng ảnh váy tự tải (cột có từ SQL 12 – thử mẫu của tiệm không phụ thuộc file này)
  const baseJob = { user_id: user.id, dress_id: dress?.id ?? null, ...(dress ? {} : { garment_path: garmentPath }) };
  let usedProvider = provider;
  let result: Result;
  try {
    result = provider === 'fashn' ? await runFashn(person, garment, body, options, styling) : await runGemini(person, garment, body);
    // FASHN hết credit → vẫn cho người dùng ướm bằng Gemini (1 ảnh) nếu có key
    if ('unavailable' in result && result.unavailable === 'no-credits' && Deno.env.get('GEMINI_API_KEY')) {
      console.warn('FASHN hết credit → chuyển sang Gemini');
      usedProvider = 'gemini';
      const backup = await runGemini(person, garment, body);
      if (!('unavailable' in backup)) result = backup;
    }
  } catch (error) {
    console.error('Thử váy AI lỗi:', error);
    await admin.from('tryon_jobs').insert({ ...baseJob, provider: usedProvider, status: 'failed', error: String(error).slice(0, 500) });
    return fallback('provider-error');
  }
  if ('unavailable' in result) return fallback(result.unavailable);

  // Credit thật của từng ảnh (Gemini = 1 cho cả lượt). options ghi kèm ảnh người đã dùng → web dựng lại lịch sử trò chuyện.
  const perImage = usedProvider === 'fashn' ? cost / result.images.length : 1;
  const personRef = photoPath ?? `sample:${sampleModel}`;
  const jobOptions = usedProvider === 'fashn'
    ? { ...options, person: personRef, ...(options.model === 'max' && styling ? { prompt: styling } : {}) }
    : { model: 'gemini', person: personRef };
  const batchId = crypto.randomUUID();                             // 1 lần gửi = 1 lượt, gồm 1–4 ảnh
  const urls: string[] = [];
  let charged = 0;
  for (const [i, img] of result.images.entries()) {
    const jobId = crypto.randomUUID();
    const ext = img.mimeType.includes('jpeg') ? 'jpg' : img.mimeType.split('/')[1] ?? 'png';
    const path = `${user.id}/${jobId}.${ext}`;
    const upload = await admin.storage.from('tryon-results').upload(path, img.bytes, { contentType: img.mimeType });
    if (upload.error) {
      console.error('Lưu ảnh kết quả lỗi:', upload.error);
      continue;
    }
    // Gemini: chỉ ảnh đầu tính credit; FASHN: chia đều (làm tròn lên, tổng không vượt cost)
    const credits = usedProvider === 'fashn' ? Math.min(Math.ceil(perImage), cost - charged) : (i === 0 ? 1 : 0);
    charged += credits;
    const job = { ...baseJob, id: jobId, provider: usedProvider, status: 'done', result_path: path };
    let saved = await admin.from('tryon_jobs')
      .insert({ ...job, credits, options: jobOptions, batch_id: batchId, message: message || null });
    if (saved.error) saved = await admin.from('tryon_jobs').insert(job);          // chưa chạy SQL 28
    if (saved.error) console.error('Ghi tryon_jobs lỗi (đã chạy SQL 12 chưa?):', saved.error);
    const { data: signed } = await admin.storage.from('tryon-results').createSignedUrl(path, 3600);
    if (signed?.signedUrl) urls.push(signed.signedUrl);
  }
  if (!urls.length) return fallback('provider-error');

  return json({
    imageUrl: urls[0],
    images: urls,
    batchId,
    remaining: unlimited ? null : Math.max(0, left - charged),
    limit: settings.limit,
    unlimited,
    credits: charged,
    provider: usedProvider,
  });
});
