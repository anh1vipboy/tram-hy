import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from '../config.js';

// Một client duy nhất cho toàn bộ web. Phiên đăng nhập được supabase-js tự lưu trong trình duyệt.
export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// Supabase trả về { data, error } – hàm này trả data hoặc ném lỗi để code gọi dùng try/catch cho gọn.
export function unwrap({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}
