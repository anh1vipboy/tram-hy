// Chủ tiệm quản lý: hồ sơ tiệm, mẫu váy, ảnh bìa, ảnh thực tế.
// Database chỉ cho sửa tiệm của chính mình (RLS + owns_vendor), ảnh lưu trong thư mục <vendor_id>/ của bucket.
import { sb, unwrap } from '../core/supabase.js';
import { compressImage } from '../core/image.js';
import { slugify, randomSuffix } from '../core/utils.js';
import { VENDOR_FIELDS } from './catalog.js';

// ---------- HỒ SƠ TIỆM ----------

// Gồm cả hồ sơ chờ duyệt / bị từ chối
export async function listMyShops(ownerId) {
  return unwrap(await sb.from('vendors').select(VENDOR_FIELDS).eq('owner_id', ownerId).order('created_at'));
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
    p_slug_hint: slugify(shop.name),   // database tự thêm mã ngẫu nhiên cho khỏi trùng
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

// ---------- ẢNH (dùng chung) ----------

/** Nén rồi tải ảnh lên bucket công khai, trả về { path, url }. */
async function uploadImage(bucket, vendorId, file, prefix) {
  const blob = await compressImage(file);
  const path = `${vendorId}/${prefix}-${Date.now()}-${randomSuffix()}.jpg`;
  unwrap(await sb.storage.from(bucket).upload(path, blob, { contentType: 'image/jpeg' }));
  return { path, url: sb.storage.from(bucket).getPublicUrl(path).data.publicUrl };
}

// Link công khai → đường dẫn trong bucket (để xóa file cũ khi thay ảnh)
function pathFromUrl(bucket, url) {
  const marker = `/object/public/${bucket}/`;
  return url?.includes(marker) ? decodeURIComponent(url.split(marker)[1]) : null;
}

// Xóa file cũ không chặn luồng chính: nếu lỗi thì chỉ còn một file thừa trong kho
async function removeImage(bucket, url) {
  const path = pathFromUrl(bucket, url);
  if (path) await sb.storage.from(bucket).remove([path]);
}

// ---------- ẢNH BÌA ----------

export async function changeCover(shop, file) {
  const { url } = await uploadImage('vendor-portfolio', shop.id, file, 'cover');
  unwrap(await sb.from('vendors').update({ cover_url: url }).eq('id', shop.id));
  await removeImage('vendor-portfolio', shop.cover_url);
  return url;
}

// ---------- ẢNH THỰC TẾ (PORTFOLIO) ----------

export async function addPortfolioPhotos(vendorId, files) {
  for (const file of files) {
    const { path, url } = await uploadImage('vendor-portfolio', vendorId, file, 'photo');
    const { error } = await sb.from('vendor_photos').insert({ vendor_id: vendorId, path, url });
    if (error) {
      await sb.storage.from('vendor-portfolio').remove([path]);
      throw new Error(error.message);
    }
  }
}

export async function deletePortfolioPhoto(photo) {
  unwrap(await sb.from('vendor_photos').delete().eq('id', photo.id));
  await sb.storage.from('vendor-portfolio').remove([photo.path]);
}

// ---------- MẪU VÁY ----------

// Gồm cả mẫu đã ẩn (chủ tiệm được xem hết)
export async function listShopDresses(vendorId) {
  return unwrap(await sb.from('dresses')
    .select('id, slug, name, type, theme, price, original_price, image_url, is_active, created_at')
    .eq('vendor_id', vendorId).order('created_at', { ascending: false }));
}

/** dress = null → thêm mới. values: { name, type, theme, price, originalPrice, imageFile } */
export async function saveDress(vendorId, dress, values) {
  const row = {
    name: values.name,
    type: values.type,
    theme: values.theme,
    price: values.price,
    original_price: values.originalPrice || null,
  };
  const hasNewImage = values.imageFile?.size > 0;
  if (hasNewImage) row.image_url = (await uploadImage('dress-images', vendorId, values.imageFile, 'dress')).url;

  const query = dress
    ? sb.from('dresses').update(row).eq('id', dress.id)
    : sb.from('dresses').insert({ ...row, vendor_id: vendorId, slug: `${slugify(values.name)}-${randomSuffix()}` });
  unwrap(await query);

  if (hasNewImage && dress?.image_url) await removeImage('dress-images', dress.image_url);
}

export async function setDressActive(dressId, active) {
  unwrap(await sb.from('dresses').update({ is_active: active }).eq('id', dressId));
}

export async function deleteDress(dress) {
  const { error } = await sb.from('dresses').delete().eq('id', dress.id);
  if (error) {
    throw new Error(error.message.includes('foreign key')
      ? 'Mẫu này đã có khách đặt nên không xóa được – hãy bấm "Ẩn" để ngừng bán'
      : error.message);
  }
  await removeImage('dress-images', dress.image_url);
}
