// Dữ liệu công khai: đối tác, mẫu váy, đánh giá (không cần đăng nhập)
import { sb, unwrap } from '../core/supabase.js';

const VENDOR_FIELDS = 'id, slug, name, category, district, address, base_price, rating, review_count, is_verified, cover_url, description';
const DRESS_FIELDS = 'id, slug, name, type, theme, price, original_price, image_url, tryon_slug, vendor:vendors(id, slug, name, district, is_verified)';

export async function listVendors() {
  return unwrap(await sb.from('vendors').select(VENDOR_FIELDS).order('rating', { ascending: false }));
}

export async function getVendorBySlug(slug) {
  return unwrap(await sb.from('vendors').select(VENDOR_FIELDS).eq('slug', slug).maybeSingle());
}

// Các tiệm do tài khoản này quản lý (trang Kênh đối tác)
export async function listMyShops(ownerId) {
  return unwrap(await sb.from('vendors').select(VENDOR_FIELDS).eq('owner_id', ownerId));
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
