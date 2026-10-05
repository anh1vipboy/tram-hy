// Edge Function "thu-vay-ai": ghép mẫu váy thật của tiệm lên ảnh cô dâu bằng AI.
// Gọi từ trình duyệt (người dùng đã đăng nhập): sb.functions.invoke('thu-vay-ai', { body }).
//
// Body: { dressId, photoPath? | sampleModel? }
//   photoPath   – ảnh cô dâu đã tải lên bucket riêng tư bride-photos (<user_id>/...)
//   sampleModel – hoặc dùng ảnh người mẫu có sẵn của web: user | bride1..bride4
//
// Trả về:
//   { imageUrl, remaining, provider }   – thành công (link ảnh riêng tư, hết hạn sau 1 giờ)
//   { fallback: true, reason }          – không chạy AI được → web hiện ảnh minh họa như cũ
//        reason: not-configured | free-tier | no-dress-photo | provider-error
//   { error } kèm mã 4xx                – lỗi người dùng cần biết (hết lượt, chưa đăng nhập…)
//
// Biến môi trường (Supabase → Edge Functions → Secrets):
//   GEMINI_API_KEY      – key Gemini (key Free tier sẽ bị Google từ chối → tự fallback)
//   TRYON_PROVIDER      – gemini (mặc định) | fashn
//   FASHN_API_KEY       – khi chuyển sang FASHN
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
const PROVIDER = Deno.env.get('TRYON_PROVIDER') ?? 'gemini';
const DAILY_LIMIT = Number(Deno.env.get('DAILY_LIMIT') ?? 5);
const SAMPLE_MODELS: Record<string, string> = {
  user: 'user_bride.png',
  bride1: 'bride_model_1.png',
  bride2: 'bride_model_2.jpg',
  bride3: 'bride_model_3.png',
  bride4: 'bride_model_4.png',
};

const PROMPT = `Image 1 is a bride. Image 2 is a wedding dress.
Create a photorealistic full-body photo of the SAME person from image 1 wearing the wedding dress from image 2.
Keep her face, hairstyle, skin tone, body shape, pose and background exactly as in image 1.
Reproduce the dress faithfully: silhouette, fabric, color, neckline, sleeves, lace and embellishments.
Natural studio lighting, no text, no watermark.`;

type Img = { mimeType: string; data: string };                 // ảnh dạng base64
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

async function runGemini(person: Img, garment: Img): Promise<Result> {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) return { unavailable: 'not-configured' };
  const model = Deno.env.get('GEMINI_IMAGE_MODEL') ?? 'gemini-3.1-flash-image-preview';

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT }, { inlineData: person }, { inlineData: garment }] }],
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

// FASHN (chuyên thử đồ) – bật bằng TRYON_PROVIDER=fashn + FASHN_API_KEY.
// Chưa chạy thử với tài khoản thật: kiểm tra lại tài liệu https://docs.fashn.ai khi bật.
async function runFashn(person: Img, garment: Img): Promise<Result> {
  const key = Deno.env.get('FASHN_API_KEY');
  if (!key) return { unavailable: 'not-configured' };
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
  const dataUrl = (img: Img) => `data:${img.mimeType};base64,${img.data}`;

  const start = await fetch('https://api.fashn.ai/v1/run', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model_name: 'tryon-v1.6',
      inputs: { model_image: dataUrl(person), garment_image: dataUrl(garment), category: 'one-pieces' },
    }),
  });
  if (start.status === 401 || start.status === 402 || start.status === 429) return { unavailable: 'free-tier' };
  if (!start.ok) throw new Error(`FASHN ${start.status}: ${await start.text()}`);
  const { id } = await start.json();

  for (let i = 0; i < 40; i++) {                                   // chờ tối đa ~80 giây
    await new Promise((r) => setTimeout(r, 2000));
    const status = await (await fetch(`https://api.fashn.ai/v1/status/${id}`, { headers })).json();
    if (status.status === 'completed') {
      const img = await fetchImg(status.output[0]);
      return { bytes: decodeBase64(img.data), mimeType: img.mimeType };
    }
    if (status.status === 'failed') throw new Error(`FASHN failed: ${JSON.stringify(status.error)}`);
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

  const { dressId, photoPath, sampleModel } = await req.json().catch(() => ({}));

  const { data: dress } = await admin.from('dresses').select('id, image_url, is_active').eq('id', dressId).maybeSingle();
  if (!dress?.is_active) return json({ error: 'Không tìm thấy mẫu váy' }, 404);
  if (!dress.image_url) return fallback('no-dress-photo');

  const { count } = await admin.from('tryon_jobs').select('id', { count: 'exact', head: true })
    .eq('user_id', user.id).eq('status', 'done').gte('created_at', startOfVietnamDay());
  const used = count ?? 0;
  if (used >= DAILY_LIMIT) {
    return json({ error: `Bạn đã dùng hết ${DAILY_LIMIT} lượt thử váy AI hôm nay. Mai quay lại nhé!`, remaining: 0 }, 429);
  }

  let person: Img;
  if (photoPath) {
    if (!String(photoPath).startsWith(`${user.id}/`)) return json({ error: 'Ảnh không hợp lệ' }, 403);
    const { data, error } = await admin.storage.from('bride-photos').download(photoPath);
    if (error || !data) return json({ error: 'Không đọc được ảnh của bạn, hãy tải ảnh lại' }, 400);
    person = await toImg(data);
  } else if (SAMPLE_MODELS[sampleModel]) {
    person = await fetchImg(`${SITE_URL}/assets/images/${SAMPLE_MODELS[sampleModel]}`);
  } else {
    return json({ error: 'Vui lòng chọn ảnh người mẫu hoặc tải ảnh của bạn' }, 400);
  }

  let result: Result;
  try {
    const garment = await fetchImg(dress.image_url);
    result = PROVIDER === 'fashn' ? await runFashn(person, garment) : await runGemini(person, garment);
  } catch (error) {
    console.error('Thử váy AI lỗi:', error);
    await admin.from('tryon_jobs').insert({ user_id: user.id, dress_id: dress.id, provider: PROVIDER, status: 'failed', error: String(error).slice(0, 500) });
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
  await admin.from('tryon_jobs').insert({ id: jobId, user_id: user.id, dress_id: dress.id, provider: PROVIDER, status: 'done', result_path: path });
  const { data: signed } = await admin.storage.from('tryon-results').createSignedUrl(path, 3600);

  return json({ imageUrl: signed?.signedUrl, remaining: DAILY_LIMIT - used - 1, provider: PROVIDER });
});
