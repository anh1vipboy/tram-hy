// Dữ liệu công khai: đối tác, mẫu váy, đánh giá, ảnh thực tế (thao tác của chủ tiệm nằm ở shop.js)
import { sb, unwrap } from '../core/supabase.js';

export const VENDOR_FIELDS = 'id, slug, name, category, district, address, phone, base_price, rating, review_count, is_verified, cover_url, logo_url, description, status, review_note, created_at';
// photos: số ảnh các góc (để hiện nhãn "N ảnh" và nút xem ảnh)
const DRESS_FIELDS = 'id, slug, name, type, theme, price, original_price, image_url, tryon_slug, photos:dress_photos(count), vendor:vendors(id, slug, name, district, is_verified)';

const CACHE_PREFIX = 'tramhy.catalog.';
const FRESH_MS = 30_000;      // < 30 giây: dùng luôn không cần hỏi lại
const MAX_AGE_MS = 300_000;   // < 5 phút: trả ngay từ bộ nhớ phiên (0ms) + làm mới ngầm phía sau

function readCache(key) {
  if (globalThis.__TRAMHY_TEST_SUPABASE__) return null;
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (!entry || Date.now() - entry.ts > MAX_AGE_MS) return null;
    return entry;
  } catch {
    return null;
  }
}

function writeCache(key, data) {
  try {
    sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ ts: Date.now(), data }));
  } catch { /* bộ nhớ phiên đầy hoặc bị chặn */ }
}

export function clearCatalogCache() {
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith(CACHE_PREFIX)) sessionStorage.removeItem(key);
    }
  } catch { /* bỏ qua */ }
}

async function swrCache(key, fetcher) {
  const hit = readCache(key);
  if (hit) {
    if (Date.now() - hit.ts > FRESH_MS) {
      fetcher().then((fresh) => writeCache(key, fresh)).catch(() => {});
    }
    return hit.data;
  }
  const data = await fetcher();
  writeCache(key, data);
  return data;
}

// Chỉ tiệm đã được duyệt (admin/chủ tiệm đọc được cả tiệm chờ duyệt nên phải lọc rõ)
export async function listVendors({ verifiedOnly = false, limit } = {}) {
  // Nếu đã có sẵn toàn bộ danh sách đối tác trong phiên, lọc trực tiếp (0ms) không cần gọi mạng
  if (verifiedOnly || limit) {
    const allHit = readCache('vendors:all');
    if (allHit) {
      let list = allHit.data;
      if (verifiedOnly) list = list.filter((v) => v.is_verified);
      return limit ? list.slice(0, limit) : list;
    }
  }
  const key = `vendors:${verifiedOnly ? 'verified' : 'all'}:${limit || 'all'}`;
  return swrCache(key, async () => {
    let query = sb.from('vendors').select(VENDOR_FIELDS)
      .eq('status', 'approved').order('rating', { ascending: false });
    if (verifiedOnly) query = query.eq('is_verified', true);
    if (limit) query = query.limit(limit);
    return unwrap(await query);
  });
}

// Không lọc trạng thái: chủ tiệm / admin xem trước được trang của tiệm chờ duyệt
export async function getVendorBySlug(slug) {
  return unwrap(await sb.from('vendors').select(VENDOR_FIELDS).eq('slug', slug).maybeSingle());
}

/** Số liệu thật cho trang Giới thiệu (chỉ đếm, không tải dữ liệu): { vendors, verified, dresses } */
export async function platformStats() {
  return swrCache('stats', async () => {
    const count = async (query) => {
      const { count: total, error } = await query;
      if (error) throw new Error(error.message);
      return total ?? 0;
    };
    const vendors = () => sb.from('vendors').select('id', { count: 'exact', head: true }).eq('status', 'approved');
    const [all, verified, dresses] = await Promise.all([
      count(vendors()),
      count(vendors().eq('is_verified', true)),
      count(sb.from('dresses').select('id', { count: 'exact', head: true }).eq('is_active', true)),
    ]);
    return { vendors: all, verified, dresses };
  });
}

export async function listDresses({ vendorId, limit } = {}) {
  if (!vendorId && limit) {
    const allHit = readCache('dresses:all:all');
    if (allHit) return allHit.data.slice(0, limit);
  }
  const key = `dresses:${vendorId || 'all'}:${limit || 'all'}`;
  return swrCache(key, async () => {
    let query = sb.from('dresses').select(DRESS_FIELDS).eq('is_active', true).order('price');
    if (vendorId) query = query.eq('vendor_id', vendorId);
    if (limit) query = query.limit(limit);
    return unwrap(await query);
  });
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
    .on('postgres_changes', { event: '*', schema: 'public', table: 'vendors' }, (payload) => {
      clearCatalogCache();
      onChange(payload);
    })
    .subscribe();
  return () => sb.removeChannel(channel);
}

export async function listVendorPhotos(vendorId) {
  return unwrap(await sb.from('vendor_photos').select('id, path, url, created_at')
    .eq('vendor_id', vendorId).order('created_at'));
}

// Ảnh các góc của một mẫu váy (ảnh chính nằm ở dresses.image_url)
// Gói dịch vụ đang bán của tiệm (SQL 19). Chưa chạy SQL → trả danh sách rỗng, trang tiệm vẫn hiện bình thường.
// price_unit / min_qty / max_qty (giá theo bàn của nhà hàng) và is_demo có từ SQL 30 – chưa có thì đọc như cũ.
const PACKAGE_FIELDS = 'id, vendor_id, name, price, original_price, description, image_url, photos:package_photos(count)';
const ALL_PACKAGE_FIELDS = `${PACKAGE_FIELDS}, vendor:vendors!inner(id, slug, name, category, district, rating, is_verified, status)`;

export async function listPackages(vendorId) {
  const query = (fields) => sb.from('vendor_packages').select(fields)
    .eq('vendor_id', vendorId).eq('is_active', true).order('price');
  let { data, error } = await query(`${PACKAGE_FIELDS}, price_unit, min_qty, max_qty, is_demo`);
  if (error) ({ data, error } = await query(PACKAGE_FIELDS));
  if (error) return [];
  return data;
}

/** Toàn bộ gói dịch vụ đang bán của các đối tác đã duyệt (dùng cho trang Dịch vụ cưới) */
export async function listAllPackages() {
  return swrCache('packages:all', async () => {
    const query = (fields) => sb.from('vendor_packages').select(fields)
      .eq('is_active', true).eq('vendor.status', 'approved').order('price');
    let { data, error } = await query(`${ALL_PACKAGE_FIELDS}, price_unit, min_qty, max_qty, is_demo`);
    if (error) ({ data, error } = await query(ALL_PACKAGE_FIELDS));
    if (error) return [];
    return data;
  });
}

export async function listPackagePhotos(packageId) {
  return unwrap(await sb.from('package_photos').select('id, url, created_at')
    .eq('package_id', packageId).order('created_at'));
}

export async function listDressPhotos(dressId) {
  return unwrap(await sb.from('dress_photos').select('id, url, created_at')
    .eq('dress_id', dressId).order('created_at'));
}
