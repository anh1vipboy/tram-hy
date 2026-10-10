// Dữ liệu công khai: đối tác, mẫu váy, đánh giá, ảnh thực tế (thao tác của chủ tiệm nằm ở shop.js)
import { sb, unwrap } from '../core/supabase.js';

export const VENDOR_FIELDS = 'id, slug, name, category, district, address, phone, base_price, rating, review_count, is_verified, cover_url, logo_url, description, status, review_note, created_at';
// photos: số ảnh các góc (để hiện nhãn "N ảnh" và nút xem ảnh)
const DRESS_FIELDS = 'id, slug, name, type, theme, price, original_price, image_url, tryon_slug, photos:dress_photos(count), vendor:vendors(id, slug, name, district, is_verified)';

// Chỉ tiệm đã được duyệt (admin/chủ tiệm đọc được cả tiệm chờ duyệt nên phải lọc rõ)
export async function listVendors() {
  return unwrap(await sb.from('vendors').select(VENDOR_FIELDS)
    .eq('status', 'approved').order('rating', { ascending: false }));
}

// Không lọc trạng thái: chủ tiệm / admin xem trước được trang của tiệm chờ duyệt
export async function getVendorBySlug(slug) {
  return unwrap(await sb.from('vendors').select(VENDOR_FIELDS).eq('slug', slug).maybeSingle());
}

export async function listDresses({ vendorId, limit } = {}) {
  let query = sb.from('dresses').select(DRESS_FIELDS).eq('is_active', true).order('price');
  if (vendorId) query = query.eq('vendor_id', vendorId);
  if (limit) query = query.limit(limit);
  return unwrap(await query);
}

export async function listReviews(vendorId) {
  // '*' để có cả is_demo (SQL 15) mà không lỗi khi database chưa có cột này; bảng đánh giá vốn công khai
  return unwrap(await sb.from('reviews')
    .select('*')
    .eq('vendor_id', vendorId)
    .order('created_at', { ascending: false }));
}

// Nghe thay đổi bảng vendors (đối tác thấy kết quả duyệt ngay, admin thấy hồ sơ mới). Trả về hàm hủy.
export function subscribeVendorChanges(channelName, onChange) {
  const channel = sb.channel(channelName)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'vendors' }, onChange)
    .subscribe();
  return () => sb.removeChannel(channel);
}

export async function listVendorPhotos(vendorId) {
  return unwrap(await sb.from('vendor_photos').select('id, path, url, created_at')
    .eq('vendor_id', vendorId).order('created_at'));
}

// Ảnh các góc của một mẫu váy (ảnh chính nằm ở dresses.image_url)
// Gói dịch vụ đang bán của tiệm (SQL 19). Chưa chạy SQL → trả danh sách rỗng, trang tiệm vẫn hiện bình thường.
export async function listPackages(vendorId) {
  const { data, error } = await sb.from('vendor_packages')
    .select('id, vendor_id, name, price, original_price, description, image_url, photos:package_photos(count)')
    .eq('vendor_id', vendorId).eq('is_active', true).order('price');
  if (error) return [];
  return data;
}

export async function listPackagePhotos(packageId) {
  return unwrap(await sb.from('package_photos').select('id, url, created_at')
    .eq('package_id', packageId).order('created_at'));
}

export async function listDressPhotos(dressId) {
  return unwrap(await sb.from('dress_photos').select('id, url, created_at')
    .eq('dress_id', dressId).order('created_at'));
}
