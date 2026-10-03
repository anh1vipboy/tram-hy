// Cấu hình kết nối Supabase.
// Publishable key được phép để công khai: dữ liệu được bảo vệ bằng Row Level Security trong database.
// TUYỆT ĐỐI không đặt secret / service_role key ở đây.
export const SUPABASE_URL = 'https://vsjdijmuvuetmhmszcrl.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_2w5vXBrIRNTxEHjFJ_4Scw_4QfusfXv';

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
