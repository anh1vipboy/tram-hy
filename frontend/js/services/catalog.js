// Đối tác, mẫu váy, đánh giá + hồ sơ mở tiệm của đối tác
import { sb, unwrap } from '../core/supabase.js';

const VENDOR_FIELDS = 'id, slug, name, category, district, address, phone, base_price, rating, review_count, is_verified, cover_url, description, status, review_note, created_at';
const DRESS_FIELDS = 'id, slug, name, type, theme, price, original_price, image_url, tryon_slug, vendor:vendors(id, slug, name, district, is_verified)';

// Chỉ tiệm đã được duyệt (admin/chủ tiệm đọc được cả tiệm chờ duyệt nên phải lọc rõ)
export async function listVendors() {
  return unwrap(await sb.from('vendors').select(VENDOR_FIELDS)
    .eq('status', 'approved').order('rating', { ascending: false }));
}

// Không lọc trạng thái: chủ tiệm / admin xem trước được trang của tiệm chờ duyệt
export async function getVendorBySlug(slug) {
  return unwrap(await sb.from('vendors').select(VENDOR_FIELDS).eq('slug', slug).maybeSingle());
}

// Các tiệm do tài khoản này quản lý (trang Kênh đối tác), gồm cả hồ sơ chờ duyệt / bị từ chối
export async function listMyShops(ownerId) {
  return unwrap(await sb.from('vendors').select(VENDOR_FIELDS).eq('owner_id', ownerId).order('created_at'));
}

export async function listDresses({ vendorId, limit } = {}) {
  let query = sb.from('dresses').select(DRESS_FIELDS).eq('is_active', true).order('price');
  if (vendorId) query = query.eq('vendor_id', vendorId);
  if (limit) query = query.limit(limit);
  return unwrap(await query);
}

export async function listReviews(vendorId) {
  return unwrap(await sb.from('reviews')
    .select('id, rating, content, reviewer_name, created_at')
    .eq('vendor_id', vendorId)
    .order('created_at', { ascending: false }));
}

// ---------- HỒ SƠ MỞ TIỆM ----------

// "Váy Cưới Hà Nội" → "vay-cuoi-ha-noi" (gợi ý đường dẫn, database tự thêm mã ngẫu nhiên cho khỏi trùng)
function slugHint(name) {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd');
}

export async function registerVendor(shop) {
  return unwrap(await sb.rpc('register_vendor', {
    p_name: shop.name,
    p_category: shop.category,
    p_district: shop.district,
    p_address: shop.address,
    p_phone: shop.phone,
    p_base_price: shop.basePrice,
    p_description: shop.description,
    p_slug_hint: slugHint(shop.name),
  }));
}

export async function updateMyShop(vendorId, shop) {
  return unwrap(await sb.from('vendors').update({
    name: shop.name,
    district: shop.district,
    address: shop.address,
    phone: shop.phone,
    base_price: shop.basePrice,
    description: shop.description || null,
  }).eq('id', vendorId).select(VENDOR_FIELDS).single());
}

export async function resubmitVendor(vendorId) {
  return unwrap(await sb.rpc('resubmit_vendor', { p_vendor_id: vendorId }));
}

// Nghe thay đổi bảng vendors (đối tác thấy kết quả duyệt ngay, admin thấy hồ sơ mới). Trả về hàm hủy.
export function subscribeVendorChanges(channelName, onChange) {
  const channel = sb.channel(channelName)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'vendors' }, onChange)
    .subscribe();
  return () => sb.removeChannel(channel);
}
