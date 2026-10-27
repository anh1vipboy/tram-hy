// Edge Function "excel-dong-bo":
// Cung cấp File Excel cố định (.xlsx trên Supabase Storage) và Đường dẫn Đồng bộ Trực tiếp (Live Data URL)
// riêng biệt cho từng tài khoản (Quản trị viên Admin, Chủ tiệm Đối tác, hoặc Cô dâu Chú rể).
//
// 1) GET  /functions/v1/excel-dong-bo?token=<userId>.<ver>.<sig>[&scope=admin|vendor|plan]
//    → Truy vấn trực tiếp database theo thời gian thực và trả về bảng CSV UTF-8 chuẩn cho
//      Google Sheets (=IMPORTDATA) hoặc Microsoft Excel (Data → From Web).
// 2) POST /functions/v1/excel-dong-bo (cần Authorization: Bearer <jwt>)
//    - body: { action: 'info', scope?: 'admin'|'vendor'|'plan' }
//      → Trả về { liveUrl, xlsxUrl, officeOnlineUrl, googleSheetsFormula, updatedAt }
//    - body: { action: 'upload_xlsx', scope?: 'admin'|'vendor'|'plan', base64: '...' }
//      → Ghi đè (upsert) file .xlsx cố định của tài khoản lên bucket công khai `excel-exports`
//        để link .xlsx cố định luôn chứa bản mới nhất.
//    - body: { action: 'rotate', scope?: 'admin'|'vendor'|'plan' }
//      → Tăng excel_ver của tài khoản để hủy hiệu lực link cũ và cấp link cố định mới.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { SITE_ORIGIN, withCors } from '../_shared/cors.ts';

const CORS = {
  'Access-Control-Allow-Origin': SITE_ORIGIN,      // withCors() đổi theo web đang gọi (xem _shared/cors.ts)
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const BUCKET = 'excel-exports';
const PLATFORM_FEE_RATE = 0.10;

const VENDOR_CATEGORY: Record<string, string> = {
  bridal: 'Váy cưới',
  studio: 'Chụp ảnh cưới',
  decor: 'Trang trí',
  makeup: 'Trang điểm',
  venue: 'Nhà hàng tiệc',
  betrothal: 'Tráp ăn hỏi',
  entertainment: 'Âm nhạc & MC',
  car: 'Xe hoa',
};

const BOOKING_STATUS: Record<string, string> = {
  pending: 'Chờ đặt cọc',
  confirmed: 'Đã nhận cọc',
  in_progress: 'Đang thực hiện',
  ready_for_review: 'Chờ nghiệm thu',
  completed: 'Hoàn tất',
  disputed: 'Đang khiếu nại',
  cancelled: 'Đã hủy',
  refunded: 'Đã hoàn tiền',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

async function makeToken(secret: string, userId: string, ver: number, scope: string): Promise<string> {
  const sig = await hmacHex(secret, `tramhy-excel:${userId}:${ver}:${scope}`);
  return `${userId}.${ver}.${scope}.${sig}`;
}

async function verifyToken(secret: string, token: string): Promise<{ userId: string; ver: number; scope: string } | null> {
  const parts = String(token || '').split('.');
  if (parts.length !== 4) return null;
  const [userId, verStr, scope, sig] = parts;
  const ver = Number(verStr);
  if (!userId || !Number.isInteger(ver) || !['admin', 'vendor', 'plan'].includes(scope)) return null;
  const expected = await hmacHex(secret, `tramhy-excel:${userId}:${ver}:${scope}`);
  if (sig !== expected) return null;
  return { userId, ver, scope };
}

let bucketReady = false;
// deno-lint-ignore no-explicit-any
async function ensureBucket(admin: any) {
  if (bucketReady) return;
  const { data: buckets } = await admin.storage.listBuckets();
  const exists = (buckets || []).some((b: { id: string }) => b.id === BUCKET);
  if (!exists) {
    await admin.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: 10485760,
    });
  }
  bucketReady = true;
}

function xlsxObjectPath(userId: string, sig: string, scope: string) {
  const filename = scope === 'admin'
    ? 'doi-soat-san-tram-hy.xlsx'
    : scope === 'vendor'
      ? 'doanh-thu-doi-tac-tram-hy.xlsx'
      : 'ke-hoach-cuoi-tram-hy.xlsx';
  return `${userId}/${sig}/${filename}`;
}

function csvCell(val: unknown): string {
  const str = String(val ?? '').replace(/[\r\n]+/g, ' ').trim();
  if (str.includes(',') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

// deno-lint-ignore no-explicit-any
function buildOrdersCsv(bookings: any[], titleLine: string): string {
  const feePct = Math.round(PLATFORM_FEE_RATE * 100);
  const netPct = 100 - feePct;
  const rows: unknown[][] = [
    [titleLine, `Cập nhật lúc: ${fmtDate(new Date().toISOString())}`],
    [
      'Mã đơn', 'Ngày tạo', 'Lịch hẹn', 'Khách hàng', 'Số điện thoại',
      'Tiệm đối tác', 'Ngành dịch vụ', 'Trạng thái đơn',
      'Tổng giá trị đơn (100%)', `Hoa hồng Sàn (${feePct}%)`, `Đối tác thực nhận (${netPct}%)`,
      'Khách đã đóng', 'Đang giữ Escrow', 'Đã giải ngân (100%)',
      `Hoa hồng Thực thu (${feePct}%)`, `Đã trả Đối tác (${netPct}%)`,
    ],
  ];

  let sumTotal = 0;
  let sumExpectedFee = 0;
  let sumExpectedNet = 0;
  let sumCollected = 0;
  let sumEscrow = 0;
  let sumReleased = 0;
  let sumEarnedFee = 0;
  let sumPaidNet = 0;

  for (const b of bookings) {
    const isCancelled = ['cancelled', 'refunded'].includes(b.status);
    const total = Math.round(Number(b.total_price) || 0);
    const expectedFee = isCancelled ? 0 : Math.round(total * PLATFORM_FEE_RATE);
    const expectedNet = isCancelled ? 0 : total - expectedFee;
    const ms = Array.isArray(b.milestones) ? b.milestones : [];
    // deno-lint-ignore no-explicit-any
    const paidEscrow = ms.filter((m: any) => m.status === 'paid').reduce((s: number, m: any) => s + (Number(m.amount) || 0), 0);
    // deno-lint-ignore no-explicit-any
    const released = ms.filter((m: any) => m.status === 'released').reduce((s: number, m: any) => s + (Number(m.amount) || 0), 0);
    const collected = paidEscrow + released;
    const earnedFee = Math.round(released * PLATFORM_FEE_RATE);
    const paidNet = released - earnedFee;

    if (!isCancelled) {
      sumTotal += total;
      sumExpectedFee += expectedFee;
      sumExpectedNet += expectedNet;
    }
    sumCollected += collected;
    sumEscrow += paidEscrow;
    sumReleased += released;
    sumEarnedFee += earnedFee;
    sumPaidNet += paidNet;

    rows.push([
      b.code || '',
      fmtDate(b.created_at),
      fmtDate(b.appointment_at),
      b.contact_name || '',
      b.contact_phone || '',
      b.vendor?.name || '',
      VENDOR_CATEGORY[b.vendor?.category] || '',
      BOOKING_STATUS[b.status] || b.status,
      total,
      expectedFee,
      expectedNet,
      collected,
      paidEscrow,
      released,
      earnedFee,
      paidNet,
    ]);
  }

  rows.push([
    `TỔNG CỘNG (${bookings.length} ĐƠN)`, '', '', '', '', '', '', '',
    sumTotal, sumExpectedFee, sumExpectedNet, sumCollected, sumEscrow, sumReleased, sumEarnedFee, sumPaidNet,
  ]);

  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

// deno-lint-ignore no-explicit-any
function buildPlanCsv(plan: any, categories: any[], bookings: any[]): string {
  const rows: unknown[][] = [
    ['KẾ HOẠCH NGÂN SÁCH CƯỚI – TRẠM HỶ', `Cập nhật lúc: ${fmtDate(new Date().toISOString())}`],
    ['Ngày cưới', plan?.wedding_date || 'Chưa đặt', 'Tổng ngân sách', plan?.total_budget || 0, 'Thành phố', plan?.city || ''],
    [],
    ['Danh mục', 'Bên phụ trách', 'Mục chi tiêu', 'Dự kiến', 'Thực tế', 'Đã thanh toán', 'Nguồn'],
  ];

  let sumEst = 0;
  let sumAct = 0;
  let sumPaid = 0;

  for (const c of categories) {
    const raw = String(c.name || '').trim();
    const party = raw.startsWith('[NT] ') ? 'Nhà Trai' : raw.startsWith('[NG] ') ? 'Nhà Gái' : 'Hai vợ chồng';
    const cleanCat = raw.replace(/^\[(NT|NG|CH)\]\s*/, '');
    for (const i of c.items || []) {
      const est = Math.round(Number(i.estimated) || 0);
      const act = Math.round(Number(i.actual) || 0);
      const paid = i.paid ? (act || est) : 0;
      sumEst += est;
      sumAct += act;
      sumPaid += paid;
      rows.push([cleanCat, party, i.name || '', est, act, paid, i.paid ? 'Đã trả' : 'Chưa trả']);
    }
  }

  for (const b of bookings) {
    if (['cancelled', 'refunded'].includes(b.status)) continue;
    const total = Math.round(Number(b.total_price) || 0);
    const ms = Array.isArray(b.milestones) ? b.milestones : [];
    // deno-lint-ignore no-explicit-any
    const paid = ms.filter((m: any) => ['paid', 'released'].includes(m.status)).reduce((s: number, m: any) => s + (Number(m.amount) || 0), 0);
    sumEst += total;
    sumAct += total;
    sumPaid += paid;
    rows.push([
      VENDOR_CATEGORY[b.vendor?.category] || 'Đơn Trạm Hỷ',
      'Hai vợ chồng',
      `${b.code} – ${b.vendor?.name || 'Đối tác'}`,
      total,
      total,
      paid,
      `Đặt qua Trạm Hỷ (${BOOKING_STATUS[b.status] || b.status})`,
    ]);
  }

  rows.push(['TỔNG CỘNG', '', '', sumEst, sumAct, sumPaid, '']);
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

Deno.serve(withCors(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(supabaseUrl, serviceKey);

  try {
    // ---------- 1. GET: LIVE DATA FEED CHO EXCEL (FROM WEB) & GOOGLE SHEETS (=IMPORTDATA) ----------
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const token = url.searchParams.get('token') || '';
      const parsed = await verifyToken(serviceKey, token);
      if (!parsed) {
        return new Response('Link đồng bộ không hợp lệ hoặc đã được đổi mới.', {
          status: 403,
          headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }

      const { data: userRes, error: userErr } = await admin.auth.admin.getUserById(parsed.userId);
      if (userErr || !userRes?.user) {
        return new Response('Tài khoản không tồn tại.', { status: 404, headers: CORS });
      }
      const currentVer = Number(userRes.user.user_metadata?.excel_ver || 1);
      if (parsed.ver !== currentVer) {
        return new Response('Link đồng bộ này đã bị hủy do chủ tài khoản tạo link mới.', {
          status: 403,
          headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }

      const { data: profile } = await admin.from('profiles').select('role, full_name').eq('id', parsed.userId).maybeSingle();
      let csv = '';

      if (parsed.scope === 'admin' && profile?.role === 'admin') {
        const { data: bookings } = await admin
          .from('bookings')
          .select('*, vendor:vendors(id, name, category), milestones(*)')
          .order('created_at', { ascending: false });
        csv = buildOrdersCsv(bookings || [], 'ĐỐI SOÁT DOANH THU & HOA HỒNG TOÀN SÀN – TRẠM HỶ');
      } else if (parsed.scope === 'vendor') {
        const { data: shops } = await admin.from('vendors').select('id, name').eq('owner_id', parsed.userId);
        // deno-lint-ignore no-explicit-any
        const shopIds = (shops || []).map((s: any) => s.id);
        // deno-lint-ignore no-explicit-any
        const shopNames = (shops || []).map((s: any) => s.name).join(', ') || 'Đối tác';
        const { data: bookings } = shopIds.length
          ? await admin
              .from('bookings')
              .select('*, vendor:vendors(id, name, category), milestones(*)')
              .in('vendor_id', shopIds)
              .order('created_at', { ascending: false })
          : { data: [] };
        csv = buildOrdersCsv(bookings || [], `BẢNG KÊ DOANH THU & HOA HỒNG TIỆM: ${shopNames}`);
      } else {
        const { data: plan } = await admin.from('wedding_plans').select('*').eq('owner_id', parsed.userId).maybeSingle();
        const { data: categories } = plan
          ? await admin
              .from('budget_categories')
              .select('id, name, vendor_category, position, items:budget_items(*)')
              .eq('plan_id', plan.id)
              .order('position')
          : { data: [] };
        const { data: bookings } = await admin
          .from('bookings')
          .select('*, vendor:vendors(id, name, category), milestones(*)')
          .eq('bride_id', parsed.userId)
          .order('created_at', { ascending: false });
        csv = buildPlanCsv(plan, categories || [], bookings || []);
      }

      return new Response(`\uFEFF${csv}`, {
        status: 200,
        headers: {
          ...CORS,
          'Content-Type': 'text/csv; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      });
    }

    // ---------- 2. POST: LẤY LINK CỐ ĐỊNH / TỰ ĐỘNG CẬP NHẬT FILE .XLSX CỐ ĐỊNH / ĐỔI LINK MỚI ----------
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!jwt) return json({ error: 'Vui lòng đăng nhập.' }, 401);

    const { data: authData, error: authErr } = await admin.auth.getUser(jwt);
    if (authErr || !authData?.user) return json({ error: 'Phiên đăng nhập hết hạn.' }, 401);

    const user = authData.user;
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'info';
    const scope = ['admin', 'vendor', 'plan'].includes(body.scope) ? body.scope : 'plan';

    let ver = Number(user.user_metadata?.excel_ver || 1);
    if (action === 'rotate') {
      ver += 1;
      await admin.auth.admin.updateUserById(user.id, {
        user_metadata: { ...(user.user_metadata || {}), excel_ver: ver },
      });
    }

    const token = await makeToken(serviceKey, user.id, ver, scope);
    const sig = token.split('.')[3];
    const objPath = xlsxObjectPath(user.id, sig, scope);

    if (action === 'upload_xlsx' && body.base64) {
      await ensureBucket(admin);
      const binaryStr = atob(body.base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      await admin.storage.from(BUCKET).upload(objPath, bytes, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: true,
        cacheControl: '0',
      });
    }

    const xlsxUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${objPath}`;
    const liveUrl = `${supabaseUrl}/functions/v1/excel-dong-bo?token=${encodeURIComponent(token)}`;
    const officeOnlineUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(`${xlsxUrl}?t=${Date.now()}`)}`;
    const googleSheetsFormula = `=IMPORTDATA("${liveUrl}")`;

    return json({
      ok: true,
      scope,
      ver,
      xlsxUrl,
      liveUrl,
      officeOnlineUrl,
      googleSheetsFormula,
      syncedAt: new Date().toISOString(),
    });
  } catch (err) {
    return json({ error: (err as Error).message || 'Lỗi đồng bộ Cloud Excel' }, 500);
  }
}));
