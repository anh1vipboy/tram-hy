// Edge Function "thu-vay-ai": ghép váy lên ảnh cô dâu bằng AI (FASHN chuyên thử đồ, hoặc Gemini).
// Gọi từ trình duyệt (người dùng đã đăng nhập): sb.functions.invoke('thu-vay-ai', { body }).
//
// Body: { dressId | garmentPath, photoPath | sampleModel, body? }
//   dressId     – mẫu váy của tiệm trên Trạm Hỷ (lấy ảnh thật của mẫu)
//   garmentPath – hoặc ảnh váy mẫu người dùng tự tải lên (bride-photos/<user_id>/garment-...)
//   photoPath   – ảnh cô dâu đã tải lên bucket riêng tư bride-photos (<user_id>/body-...)
//   sampleModel – hoặc dùng ảnh người mẫu có sẵn của web: user | bride1..bride4
//   body        – { height, weight, heel } số đo để AI đặt độ dài váy cho đúng (model có nhận prompt)
//
// Trả về:
//   { imageUrl, remaining, provider }   – thành công (link ảnh riêng tư, hết hạn sau 1 giờ)
//   { fallback: true, reason }          – không chạy AI được → web hiện ảnh minh họa như cũ
//        reason: not-configured | free-tier | no-credits | bad-photo | no-dress-photo | provider-error
//   { error } kèm mã 4xx                – lỗi người dùng cần biết (hết lượt, chưa đăng nhập…)
//
// Biến môi trường (Supabase → Edge Functions → Secrets):
//   GEMINI_API_KEY      – key Gemini (key Free tier sẽ bị Google từ chối → tự fallback)
//   FASHN_API_KEY       – có key này thì mặc định dùng FASHN (https://app.fashn.ai → API)
//   FASHN_MODEL         – tryon-v1.6 (mặc định, 1 credit/ảnh) | tryon-max (nét hơn, nhận prompt số đo, 2 credit)
//   TRYON_PROVIDER      – ép dùng fashn | gemini (không đặt = fashn nếu có FASHN_API_KEY, ngược lại gemini)
//   GEMINI_IMAGE_MODEL  – mặc định gemini-3.1-flash-image-preview
//   DAILY_LIMIT         – số lượt AI/người/ngày, mặc định 5
//   SITE_URL            – địa chỉ web để lấy ảnh người mẫu có sẵn
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { decodeBase64, encodeBase64 } from 'jsr:@std/encoding@1/base64';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://tram-hy-alpha.vercel.app';
const PROVIDER = Deno.env.get('TRYON_PROVIDER') ?? (Deno.env.get('FASHN_API_KEY') ? 'fashn' : 'gemini');
const FASHN_MODEL = Deno.env.get('FASHN_MODEL') ?? 'tryon-v1.6';
const DAILY_LIMIT = Number(Deno.env.get('DAILY_LIMIT') ?? 5);
const SAMPLE_MODELS: Record<string, string> = {
  user: 'user_bride.png',
  bride1: 'bride_model_1.png',
  bride2: 'bride_model_2.jpg',
  bride3: 'bride_model_3.png',
  bride4: 'bride_model_4.png',
};

type Img = { mimeType: string; data: string };                 // ảnh dạng base64
type Body = { height: number; weight: number; heel: number } | null;

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

const geminiPrompt = (b: Body) => `Image 1 is a bride. Image 2 is a wedding dress.
Create a photorealistic full-body photo of the SAME person from image 1 wearing the wedding dress from image 2.
Keep her face, hairstyle, skin tone, body shape, pose and background exactly as in image 1.
Reproduce the dress faithfully: silhouette, fabric, color, neckline, sleeves, lace and embellishments.
${describeBody(b)}
Natural studio lighting, no text, no watermark.`;
type Result = { bytes: Uint8Array; mimeType: string } | { unavailable: string };

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

  const body = await res.json();
  const part = body.candidates?.[0]?.content?.parts?.find((p: { inlineData?: Img }) => p.inlineData);
  if (!part) throw new Error(`Gemini không trả ảnh: ${JSON.stringify(body).slice(0, 300)}`);
  return { bytes: decodeBase64(part.inlineData.data), mimeType: part.inlineData.mimeType || 'image/png' };
}

// FASHN (chuyên thử đồ, giữ nguyên dáng người trong ảnh) – tài liệu: https://docs.fashn.ai
//   tryon-v1.6: model_image + garment_image, category one-pieces (váy liền), 1 credit/ảnh
//   tryon-max : model_image + product_image + prompt (gửi kèm số đo), 1k balanced = 2 credit/ảnh
async function runFashn(person: Img, garment: Img, body: Body): Promise<Result> {
  const key = Deno.env.get('FASHN_API_KEY');
  if (!key) return { unavailable: 'not-configured' };
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
  const dataUrl = (img: Img) => `data:${img.mimeType};base64,${img.data}`;

  const inputs = FASHN_MODEL === 'tryon-max'
    ? {
      model_image: dataUrl(person),
      product_image: dataUrl(garment),
      prompt: `Wedding dress try-on. ${describeBody(body)}`.trim(),
      resolution: '1k',
      generation_mode: 'balanced',
      output_format: 'jpeg',
    }
    : {
      model_image: dataUrl(person),
      garment_image: dataUrl(garment),
      category: 'one-pieces',
      garment_photo_type: 'auto',      // ảnh váy trải phẳng hay ảnh người mặc – FASHN tự nhận
      mode: 'quality',                 // cùng 1 credit, chậm hơn vài giây nhưng đẹp hơn
      output_format: 'jpeg',
    };

  const start = await fetch('https://api.fashn.ai/v1/run', {
    method: 'POST',
    headers,
    body: JSON.stringify({ model_name: FASHN_MODEL, inputs }),
  });
  if (start.status === 401) return { unavailable: 'not-configured' };           // key sai
  if (start.status === 402) return { unavailable: 'no-credits' };               // hết credit
  if (!start.ok) throw new Error(`FASHN ${start.status}: ${await start.text()}`);
  const { id, error } = await start.json();
  if (!id) throw new Error(`FASHN không nhận yêu cầu: ${JSON.stringify(error)}`);

  for (let i = 0; i < 45; i++) {                                   // chờ tối đa ~90 giây
    await new Promise((r) => setTimeout(r, 2000));
    const res = await fetch(`https://api.fashn.ai/v1/status/${id}`, { headers });
    if (!res.ok) continue;                                         // lỗi mạng tạm thời → hỏi lại
    const status = await res.json();
    if (status.status === 'completed') {
      const img = await fetchImg(status.output[0]);
      return { bytes: decodeBase64(img.data), mimeType: img.mimeType };
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

  const { dressId, garmentPath, photoPath, sampleModel, body: rawBody } = await req.json().catch(() => ({}));
  const ownsPath = (path: unknown) => typeof path === 'string' && path.startsWith(`${user.id}/`) && !path.includes('..');

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

  const { count } = await admin.from('tryon_jobs').select('id', { count: 'exact', head: true })
    .eq('user_id', user.id).eq('status', 'done').gte('created_at', startOfVietnamDay());
  const used = count ?? 0;
  if (used >= DAILY_LIMIT) {
    return json({ error: `Bạn đã dùng hết ${DAILY_LIMIT} lượt thử váy AI hôm nay. Mai quay lại nhé!`, remaining: 0 }, 429);
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
  const job = { user_id: user.id, dress_id: dress?.id ?? null, provider: PROVIDER, ...(dress ? {} : { garment_path: garmentPath }) };
  let result: Result;
  try {
    result = PROVIDER === 'fashn' ? await runFashn(person, garment, body) : await runGemini(person, garment, body);
  } catch (error) {
    console.error('Thử váy AI lỗi:', error);
    await admin.from('tryon_jobs').insert({ ...job, status: 'failed', error: String(error).slice(0, 500) });
    return fallback('provider-error');
  }
  if ('unavailable' in result) return fallback(result.unavailable);

  const jobId = crypto.randomUUID();
  const ext = result.mimeType.includes('jpeg') ? 'jpg' : result.mimeType.split('/')[1] ?? 'png';
  const path = `${user.id}/${jobId}.${ext}`;
  const upload = await admin.storage.from('tryon-results').upload(path, result.bytes, { contentType: result.mimeType });
  if (upload.error) {
    console.error('Lưu ảnh kết quả lỗi:', upload.error);
    return fallback('provider-error');
  }
  const saved = await admin.from('tryon_jobs').insert({ ...job, id: jobId, status: 'done', result_path: path });
  if (saved.error) console.error('Ghi tryon_jobs lỗi (đã chạy SQL 12 chưa?):', saved.error);
  const { data: signed } = await admin.storage.from('tryon-results').createSignedUrl(path, 3600);

  return json({ imageUrl: signed?.signedUrl, remaining: DAILY_LIMIT - used - 1, provider: PROVIDER });
});
