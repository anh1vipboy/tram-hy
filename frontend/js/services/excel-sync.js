// Dịch vụ quản lý File Excel Cố định trên Đám mây (.xlsx) & Đường dẫn Đồng bộ Trực tiếp (Live Data URL)
// riêng cho từng tài khoản (Admin, Đối tác, Cô dâu Chú rể) qua Edge Function "excel-dong-bo".
import { sb } from '../core/supabase.js';

function bytesToBase64(bytes) {
  let binary = '';
  const len = bytes.byteLength;
  const chunk = 0x8000;
  for (let i = 0; i < len; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function callExcelSync(body) {
  const { data, error } = await sb.functions.invoke('excel-dong-bo', { body });
  if (error) throw new Error(error.message || 'Không kết nối được dịch vụ đồng bộ Cloud Excel');
  if (data?.error) throw new Error(data.error);
  return data;
}

/** Lấy thông tin Link Excel cố định (.xlsx) và Link Live Data của tài khoản đang đăng nhập */
export function getAccountExcelLinks(scope = 'plan') {
  return callExcelSync({ action: 'info', scope });
}

/** Ghi đè (upsert) file .xlsx cố định trên đám mây của tài khoản bằng dữ liệu mới nhất */
export function uploadAccountCloudXlsx(scope, xlsxBytes) {
  const u8 = xlsxBytes instanceof Uint8Array ? xlsxBytes : new Uint8Array(xlsxBytes);
  return callExcelSync({
    action: 'upload_xlsx',
    scope,
    base64: bytesToBase64(u8),
  });
}

/** Đổi link Excel cố định mới cho tài khoản (hủy hiệu lực link cũ ngay lập tức) */
export function rotateAccountExcelLinks(scope = 'plan') {
  return callExcelSync({ action: 'rotate', scope });
}
