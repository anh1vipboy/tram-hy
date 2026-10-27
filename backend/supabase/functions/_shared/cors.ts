// CORS dùng chung cho các Edge Function được gọi từ trình duyệt.
// Chỉ web Trạm Hỷ (SITE_URL), các địa chỉ thêm trong ALLOWED_ORIGINS và máy chạy thử (localhost / 127.0.0.1)
// được trình duyệt cho gọi. Web lạ vẫn gửi được yêu cầu nhưng trình duyệt chặn không cho đọc kết quả.
// Không ảnh hưởng lời gọi ngoài trình duyệt (Excel, Google Sheets, webhook database, cron) – các nơi đó không xét CORS.
//
// Biến môi trường (không bắt buộc):
//   SITE_URL         – địa chỉ web chính, mặc định https://tram-hy-alpha.vercel.app
//   ALLOWED_ORIGINS  – thêm địa chỉ khác, cách nhau dấu phẩy (vd: https://tramhy.vn,https://www.tramhy.vn)

const trimSlash = (url: string) => url.trim().replace(/\/+$/, '');

const DEFAULT_ORIGINS = [
  'https://tramhy.id.vn',
  'https://www.tramhy.id.vn',
  'https://tram-hy-alpha.vercel.app',
];

export const SITE_ORIGIN = trimSlash(Deno.env.get('SITE_URL') ?? 'https://tramhy.id.vn');

const ALLOWED = new Set([
  ...DEFAULT_ORIGINS,
  SITE_ORIGIN,
  ...(Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map(trimSlash).filter(Boolean),
]);
const LOCAL_DEV = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

export const isAllowedOrigin = (origin: string | null) => Boolean(origin && (ALLOWED.has(origin) || LOCAL_DEV.test(origin)));

/**
 * Bọc hàm xử lý của Deno.serve: gắn Access-Control-Allow-Origin đúng theo web đang gọi (nếu được phép),
 * ngược lại trả SITE_ORIGIN → trình duyệt của web lạ tự chặn.
 */
export function withCors(handler: (req: Request) => Response | Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    const res = await handler(req);
    const origin = req.headers.get('Origin');
    const headers = new Headers(res.headers);
    headers.set('Access-Control-Allow-Origin', isAllowedOrigin(origin) ? origin! : SITE_ORIGIN);
    headers.append('Vary', 'Origin');
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  };
}

/**
 * Chống SSRF: Chỉ cho phép tải ảnh từ các giao thức và host an toàn, chặn hoàn toàn
 * localhost, mạng nội bộ (private IP) và Cloud Metadata endpoints (169.254.169.254).
 */
export function isSafeImageUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host === '169.254.169.254' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
