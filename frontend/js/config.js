// Cấu hình kết nối Supabase.
// Publishable key được phép để công khai: dữ liệu được bảo vệ bằng Row Level Security trong database.
// TUYỆT ĐỐI không đặt secret / service_role key ở đây.
//
// Khi chạy kiểm thử tự động (tests/), Playwright gán window.__TRAMHY_TEST_SUPABASE__ trước khi trang tải
// để web dùng project Supabase test, không đụng dữ liệu thật. Người dùng bình thường không bị ảnh hưởng.
const testOverride = globalThis.__TRAMHY_TEST_SUPABASE__;

export const SUPABASE_URL = testOverride?.url ?? 'https://vsjdijmuvuetmhmszcrl.supabase.co';
export const SUPABASE_KEY = testOverride?.key ?? 'sb_publishable_2w5vXBrIRNTxEHjFJ_4Scw_4QfusfXv';

// Cloudflare Turnstile (CAPTCHA chống bot khi đăng nhập / đăng ký / quên mật khẩu).
// Site key được phép công khai. Để trống = tắt CAPTCHA ở web (database test cũng không bật CAPTCHA).
// Bật: điền site key ở đây, deploy, RỒI mới bật CAPTCHA trong Supabase (Authentication → Attack Protection).
export const TURNSTILE_SITE_KEY = testOverride ? '' : '0x4AAAAAAFRG60sMMTC5WQDR';

// Tài khoản nhận tiền cọc Escrow của Trạm Hỷ – dùng để tạo mã VietQR. Thay bằng tài khoản thật khi vận hành.
export const ESCROW_BANK = {
  bankId: 'MB',
  accountNo: '0000000000',
  accountName: 'TRAM HY ESCROW',
};

// Phí nền tảng trừ vào tiền giải ngân cho đối tác
export const PLATFORM_FEE_RATE = 0.10;

// Tiệm nhận đơn may đo tự thiết kế (slug trong bảng vendors)
export const BESPOKE_VENDOR_SLUG = 'tramhy-atelier';
