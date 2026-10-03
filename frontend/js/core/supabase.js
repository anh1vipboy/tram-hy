import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from '../config.js';

// Phần "#..." của URL khi quay về từ link xác nhận email (chứa phiên đăng nhập hoặc lỗi).
// Phải đọc TRƯỚC khi tạo client, vì supabase-js sẽ đọc rồi xóa nó khỏi thanh địa chỉ.
export const authRedirectParams = new URLSearchParams(location.hash.slice(1));

// Một client duy nhất cho toàn bộ web. Phiên đăng nhập được supabase-js tự lưu trong trình duyệt.
// flowType 'implicit': link xác nhận email mở được trên thiết bị khác (đăng ký trên máy tính,
// bấm link trên điện thoại) – kiểu 'pkce' chỉ hoạt động trên đúng trình duyệt đã đăng ký.
export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { flowType: 'implicit', detectSessionInUrl: true, persistSession: true },
});

// Supabase trả về { data, error } – hàm này trả data hoặc ném lỗi để code gọi dùng try/catch cho gọn.
export function unwrap({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}
