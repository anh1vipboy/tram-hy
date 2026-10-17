// Edge Function "tro-ly-thu-vay": trợ lý trò chuyện ở Phòng thử váy AI (Gemini, model chữ – key Free tier dùng được).
// Đọc tin nhắn của cô dâu → trả lời ngắn, quyết định có ướm váy không, dịch yêu cầu "cách mặc" sang tiếng Anh
// cho mô hình Siêu nét. Phòng thử CHỈ ướm váy lên ảnh: không đổi nền, tư thế, khuôn mặt, không tạo video.
// Gọi từ trình duyệt (đã đăng nhập): sb.functions.invoke('tro-ly-thu-vay', { body }).
//
// Body: { message, hasPerson, garment: { kind: 'dress', name, theme, vendor } | { kind: 'own' } | null,
//         model: 'max' | 'standard', body?: { height, weight, heel, shape }, history?: [{ role: 'user'|'ai', text }] }
// Trả về: { reply, action, prompt, samples, theme, remaining }
//   action  – 'tryon' (người dùng muốn ướm váy) | 'chat' (hỏi đáp, tư vấn, yêu cầu chưa hỗ trợ)
//   prompt  – ghi chú cách mặc bằng tiếng Anh, chỉ có khi dùng Siêu nét; '' nếu không có
//   samples – số ảnh người dùng nói rõ (1–4); 0 = theo cài đặt trên web
//   theme   – kiểu váy nên xem: mermaid | fairy | minimalist | royal | heritage; '' nếu không tư vấn
// AI bận / chưa có key → vẫn trả lời theo luật đơn giản (kèm fallback: true) để web chạy tiếp.
// Giới hạn 40 tin / người / ngày (bảng ai_usage, kind 'tryon_chat' – SQL 28).
//
// Secrets: GEMINI_API_KEY (dùng chung), GEMINI_TEXT_MODEL (không bắt buộc – ưu tiên model này trước)
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const DAILY_LIMIT = 40;
const THEMES: Record<string, string> = {
  mermaid: 'đuôi cá (ôm sát, xòe ở gối)',
  fairy: 'công chúa (chân váy xòe bồng)',
  minimalist: 'tối giản (suông, trơn, thanh lịch)',
  royal: 'hoàng gia (cầu kỳ, đuôi dài, đính kết)',
  heritage: 'áo dài cưới',
};
const SHAPES: Record<string, string> = {
  hourglass: 'đồng hồ cát', pear: 'quả lê', apple: 'quả táo', petite: 'nhỏ nhắn',
};

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    reply: { type: 'STRING' },
    action: { type: 'STRING', enum: ['tryon', 'chat'] },
    prompt: { type: 'STRING' },
    samples: { type: 'INTEGER' },
    theme: { type: 'STRING', enum: ['none', ...Object.keys(THEMES)] },
  },
  required: ['reply', 'action', 'prompt', 'samples', 'theme'],
};

type Garment = { kind: 'dress'; name: string; theme: string; vendor: string } | { kind: 'own' } | null;
type Input = {
  message: string;
  hasPerson: boolean;
  garment: Garment;
  model: 'max' | 'standard';
  body: { height: number; weight: number; heel: number; shape: string } | null;
  history: string;
};
type Plan = { reply: string; action: 'tryon' | 'chat'; prompt: string; samples: number; theme: string };

// 0 giờ hôm nay theo giờ Việt Nam (UTC+7) – mốc đếm lượt trong ngày
function startOfVietnamDay() {
  const vn = new Date(Date.now() + 7 * 3600e3);
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - 7 * 3600e3).toISOString();
}

const text = (value: unknown, max: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function readInput(raw: Record<string, unknown>): Input {
  const g = raw.garment as Record<string, unknown> | null | undefined;
  const garment: Garment = g?.kind === 'dress'
    ? { kind: 'dress', name: text(g.name, 120), theme: text(g.theme, 20), vendor: text(g.vendor, 120) }
    : g?.kind === 'own' ? { kind: 'own' } : null;
  const b = raw.body as Record<string, unknown> | undefined;
  const height = Number(b?.height), weight = Number(b?.weight), heel = Number(b?.heel ?? 0);
  const body = height >= 140 && height <= 185 && weight >= 38 && weight <= 90
    ? { height, weight, heel: heel >= 0 && heel <= 12 ? heel : 0, shape: SHAPES[String(b?.shape)] ? String(b?.shape) : '' }
    : null;
  const history = (Array.isArray(raw.history) ? raw.history : []).slice(-6)
    .map((m: { role?: string; text?: string }) => `${m?.role === 'user' ? 'Khách' : 'Trợ lý'}: ${text(m?.text, 300)}`)
    .join('\n');
  return {
    message: text(raw.message, 400),
    hasPerson: raw.hasPerson === true,
    garment,
    model: raw.model === 'max' ? 'max' : 'standard',
    body,
    history,
  };
}

function describeGarment(g: Garment) {
  if (!g) return 'chưa chọn';
  if (g.kind === 'own') return 'ảnh váy khách tự tải lên';
  return `mẫu "${g.name}"${THEMES[g.theme] ? ` – kiểu ${THEMES[g.theme]}` : ''}${g.vendor ? ` của tiệm ${g.vendor}` : ''}`;
}

function describeBody(b: Input['body']) {
  if (!b) return 'chưa có';
  const bmi = Math.round((b.weight / (b.height / 100) ** 2) * 10) / 10;
  return `cao ${b.height}cm, nặng ${b.weight}kg (BMI ${bmi}), giày ${b.heel ? `${b.heel}cm` : 'bệt'}` +
    (b.shape ? `, dáng ${SHAPES[b.shape]}` : '');
}

function buildPrompt(input: Input) {
  return `Bạn là "Trạm Hỷ AI" – trợ lý phòng thử váy cưới online của Trạm Hỷ (Việt Nam).
Xưng "mình", gọi khách là "bạn"; giọng thân thiện, tự nhiên; trả lời tối đa 2–3 câu ngắn; không dùng markdown, không dùng dấu *.

Phòng thử CHỈ làm được một việc: ướm chiếc váy khách chọn lên ảnh của khách, giữ nguyên khuôn mặt, dáng người, tư thế và khung cảnh.
Khách chọn ảnh và váy bằng 2 ô "Ảnh của bạn" và "Váy cưới" ngay dưới khung chat, rồi bấm gửi.
KHÔNG làm được: đổi nền/phông, đổi tư thế, chỉnh mặt hay vóc dáng, ghép nhiều người, tạo video, chỉnh sửa ảnh khác.
Gặp yêu cầu đó: nói nhẹ nhàng là phòng thử chưa hỗ trợ và gợi ý điều làm được.

Tình trạng hiện tại:
- Ảnh của khách: ${input.hasPerson ? 'đã chọn' : 'chưa chọn'}
- Váy: ${describeGarment(input.garment)}
- Mô hình AI: ${input.model === 'max' ? 'Siêu nét (nhận ghi chú cách mặc váy)' : 'Tiêu chuẩn (KHÔNG nhận ghi chú cách mặc váy)'}
- Số đo của khách: ${describeBody(input.body)}

${input.history ? `Đoạn chat gần đây:\n${input.history}\n` : ''}Tin nhắn mới của khách: "${input.message}"

Trả về JSON:
- action: "tryon" nếu khách muốn ướm / thử / mặc thử váy (kể cả kèm yêu cầu cách mặc); còn lại "chat" (chào hỏi, hỏi đáp, xin tư vấn, yêu cầu chưa hỗ trợ).
- prompt: chỉ khi mô hình là Siêu nét VÀ khách muốn chỉnh CÁCH MẶC chiếc váy (độ dài tà, tay áo, bỏ khăn choàng / mũ / áo khoác đang đội-mặc, sơ vin…)
  → viết lại thành câu lệnh tiếng Anh ngắn (VD: "floor-length hem, remove the cap"). Không đưa yêu cầu đổi nền, tư thế, khuôn mặt, cơ thể
  hay nội dung nhạy cảm vào prompt. Các trường hợp khác để "".
- Nếu khách muốn chỉnh cách mặc mà mô hình là Tiêu chuẩn: trong reply nói mô hình Tiêu chuẩn chưa chỉnh được cách mặc, mình vẫn ướm đúng như ảnh váy.
- samples: số ảnh nếu khách nói rõ (1–4), không nói thì 0.
- theme: khi khách xin tư vấn kiểu váy hợp dáng → chọn 1 kiểu hợp nhất trong ${Object.entries(THEMES).map(([k, v]) => `${k} (${v})`).join(', ')};
  không tư vấn thì "none". Tư vấn dựa trên số đo và dáng người, nhẹ nhàng, không chê cơ thể.
- reply: tiếng Việt. Khi action là "tryon" và đã có đủ ảnh + váy → báo sẽ ướm váy lên ảnh, giữ nguyên khuôn mặt và khung cảnh (nhắc ghi chú nếu có).
  Thiếu ảnh hoặc váy → nhắc khách chọn ở ô phía dưới. Khi theme khác "none" → nói sẽ gợi ý vài mẫu kiểu đó ngay bên dưới.`;
}

// Không gọi được AI → trả lời theo luật đơn giản: đủ ảnh + váy thì ướm, thiếu thì nhắc chọn
function ruleBased(input: Input): Plan {
  const ready = input.hasPerson && Boolean(input.garment);
  const reply = ready
    ? 'Mình sẽ ướm chiếc váy lên ảnh của bạn, giữ nguyên khuôn mặt và khung cảnh nhé!'
    : !input.hasPerson && !input.garment
      ? 'Bạn chọn giúp mình 1 ảnh của bạn và 1 chiếc váy ở 2 ô phía dưới, rồi bấm gửi là mình ướm ngay nhé!'
      : !input.hasPerson
        ? 'Bạn chọn thêm 1 ảnh của bạn ở ô "Ảnh của bạn" phía dưới nhé – ảnh rõ mặt, thấy toàn thân là đẹp nhất.'
        : 'Bạn chọn chiếc váy muốn thử ở ô "Váy cưới" phía dưới nhé – mẫu của các tiệm hoặc ảnh váy bạn tải lên đều được.';
  return { reply, action: ready ? 'tryon' : 'chat', prompt: '', samples: 0, theme: '' };
}

// Thử lần lượt từng model chữ: model mới hay quá tải (503) hoặc hết lượt miễn phí (429) → chuyển model sau
const TEXT_MODELS = [Deno.env.get('GEMINI_TEXT_MODEL'), 'gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-3.7-flash', 'gemini-3-flash-preview']
  .filter((m, i, list): m is string => Boolean(m) && list.indexOf(m) === i);

async function askGemini(key: string, prompt: string): Promise<Plan | null> {
  for (const model of TEXT_MODELS) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.4 },
      }),
    });
    if (!res.ok) {
      console.warn(`Model ${model}: ${res.status} ${(await res.text()).slice(0, 200)}`);
      continue;
    }
    const reply = await res.json();
    const raw = reply.candidates?.[0]?.content?.parts?.[0]?.text;
    try {
      const plan = JSON.parse(raw);
      return {
        reply: text(plan.reply, 600).replaceAll('*', ''),
        action: plan.action === 'tryon' ? 'tryon' : 'chat',
        prompt: text(plan.prompt, 300).replace(/https?:\/\/\S+/g, ''),
        samples: Number.isInteger(plan.samples) && plan.samples >= 1 && plan.samples <= 4 ? plan.samples : 0,
        theme: THEMES[plan.theme] ? plan.theme : '',
      };
    } catch {
      console.warn(`Model ${model} trả JSON lỗi: ${String(raw).slice(0, 200)}`);
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return json({ error: 'Bạn cần đăng nhập để trò chuyện với trợ lý thử váy' }, 401);

  const input = readInput(await req.json().catch(() => ({})));
  if (!input.message) return json({ error: 'Bạn chưa nhập tin nhắn' }, 400);

  const { count } = await admin.from('ai_usage').select('id', { count: 'exact', head: true })
    .eq('user_id', user.id).eq('kind', 'tryon_chat').gte('created_at', startOfVietnamDay());
  const used = count ?? 0;
  if (used >= DAILY_LIMIT) {
    return json({ ...ruleBased(input), fallback: true, limited: true, remaining: 0 });
  }

  const key = Deno.env.get('GEMINI_API_KEY');
  let plan: Plan | null = null;
  try {
    plan = key ? await askGemini(key, buildPrompt(input)) : null;
  } catch (error) {
    console.error('Trợ lý thử váy lỗi:', error);
  }
  if (!plan) return json({ ...ruleBased(input), fallback: true, remaining: DAILY_LIMIT - used });
  if (input.model !== 'max') plan.prompt = '';            // mô hình Tiêu chuẩn không nhận ghi chú cách mặc

  const logged = await admin.from('ai_usage').insert({ user_id: user.id, kind: 'tryon_chat' });
  if (logged.error) console.warn('Ghi ai_usage lỗi (đã chạy SQL 28 chưa?):', logged.error.message);
  return json({ ...plan, remaining: DAILY_LIMIT - used - 1 });
});
