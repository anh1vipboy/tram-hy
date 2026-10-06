// Chủ tiệm quản lý: hồ sơ tiệm, mẫu váy, logo, ảnh bìa, ảnh thực tế.
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
async function uploadImage(bucket, vendorId, file, prefix, options) {
  const blob = await compressImage(file, options);
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

// ---------- LOGO (ẢNH ĐẠI DIỆN) ----------

export async function changeLogo(shop, file) {
  const { url } = await uploadImage('vendor-portfolio', shop.id, file, 'logo', { maxSize: 512, quality: 0.9 });
  unwrap(await sb.from('vendors').update({ logo_url: url }).eq('id', shop.id));
  await removeImage('vendor-portfolio', shop.logo_url);
  return url;
}

export async function removeLogo(shop) {
  unwrap(await sb.from('vendors').update({ logo_url: null }).eq('id', shop.id));
  await removeImage('vendor-portfolio', shop.logo_url);
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
export const MAX_DRESS_ANGLE_PHOTOS = 10;

// Gồm cả mẫu đã ẩn, kèm ảnh các góc
export async function listShopDresses(vendorId) {
  const dresses = unwrap(await sb.from('dresses')
    .select('id, slug, name, type, theme, price, original_price, image_url, is_active, created_at, photos:dress_photos(id, path, url, created_at)')
    .eq('vendor_id', vendorId).order('created_at', { ascending: false }));
  for (const d of dresses) d.photos.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return dresses;
}

/**
 * dress = null → thêm mới.
 * values: { name, type, theme, price, originalPrice,
 *           imageFile      – ảnh chính (hiện ở ngoài danh sách), có thể bỏ trống
 *           angleFiles     – ảnh các góc thêm mới
 *           removePhotoIds – id ảnh góc cũ cần xóa }
 */
export async function saveDress(vendorId, dress, values) {
  const keptCount = (dress?.photos.length ?? 0) - values.removePhotoIds.length;
  if (keptCount + values.angleFiles.length > MAX_DRESS_ANGLE_PHOTOS) {
    throw new Error(`Mỗi mẫu váy tối đa ${MAX_DRESS_ANGLE_PHOTOS} ảnh các góc`);
  }

  const row = {
    name: values.name,
    type: values.type,
    theme: values.theme,
    price: values.price,
    original_price: values.originalPrice || null,
  };
  const hasNewCover = values.imageFile?.size > 0;
  if (hasNewCover) row.image_url = (await uploadImage('dress-images', vendorId, values.imageFile, 'dress')).url;

  let dressId = dress?.id;
  if (dress) {
    unwrap(await sb.from('dresses').update(row).eq('id', dress.id));
  } else {
    const slug = `${slugify(values.name)}-${randomSuffix()}`;
    dressId = unwrap(await sb.from('dresses').insert({ ...row, vendor_id: vendorId, slug }).select('id').single()).id;
  }

  for (const file of values.angleFiles) {
    const { path, url } = await uploadImage('dress-images', vendorId, file, 'angle');
    const { error } = await sb.from('dress_photos').insert({ dress_id: dressId, path, url });
    if (error) {
      await sb.storage.from('dress-images').remove([path]);
      throw new Error(error.message);
    }
  }

  const removed = dress?.photos.filter((p) => values.removePhotoIds.includes(p.id)) ?? [];
  if (removed.length) {
    unwrap(await sb.from('dress_photos').delete().in('id', removed.map((p) => p.id)));
    await sb.storage.from('dress-images').remove(removed.map((p) => p.path));
  }
  if (hasNewCover && dress?.image_url) await removeImage('dress-images', dress.image_url);
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
  // Dòng ảnh góc tự xóa theo mẫu váy (on delete cascade), còn file trong kho phải xóa tay
  const paths = [pathFromUrl('dress-images', dress.image_url), ...dress.photos.map((p) => p.path)].filter(Boolean);
  if (paths.length) await sb.storage.from('dress-images').remove(paths);
}
