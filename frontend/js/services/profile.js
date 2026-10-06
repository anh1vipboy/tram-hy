// Số đo cơ thể + ảnh riêng tư của cô dâu
import { sb, unwrap } from '../core/supabase.js';
import { compressImage } from '../core/image.js';

export async function getBodyProfile(userId) {
  return unwrap(await sb.from('body_profiles').select('*').eq('user_id', userId).maybeSingle());
}

export async function saveBodyProfile(userId, body) {
  return unwrap(await sb.from('body_profiles').upsert({
    user_id: userId,
    height_cm: body.height,
    weight_kg: body.weight,
    heel_cm: body.heel,
    body_shape: body.shape,
  }));
}

// Ảnh lưu trong bucket riêng tư bride-photos/<user_id>/... – chỉ chính chủ đọc được
//   kind 'body'    → ảnh toàn thân của cô dâu (body-....jpg)
//   kind 'garment' → ảnh váy mẫu cô dâu tự tải lên để AI ướm thử (garment-....jpg)
const PHOTO_BUCKET = 'bride-photos';
export const MAX_BRIDE_PHOTOS = 6;
export const MAX_GARMENT_PHOTOS = 10;

export async function uploadBridePhoto(userId, file, kind = 'body') {
  const blob = await compressImage(file, { maxSize: 2000, quality: 0.9 });
  const path = `${userId}/${kind}-${Date.now()}.jpg`;
  unwrap(await sb.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: 'image/jpeg' }));
  return path;
}

/** Ảnh đã lưu theo loại, mới nhất trước: [{ path, url }] – url là link tạm 1 giờ (bucket riêng tư) */
export async function listBridePhotos(userId, kind = 'body') {
  const files = unwrap(await sb.storage.from(PHOTO_BUCKET)
    .list(userId, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } }));
  const paths = files.filter((f) => f.id && f.name.startsWith(`${kind}-`)).map((f) => `${userId}/${f.name}`);
  if (!paths.length) return [];
  const signed = unwrap(await sb.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 3600));
  return signed.filter((s) => s.signedUrl).map((s) => ({ path: s.path, url: s.signedUrl }));
}

export async function deleteBridePhoto(path) {
  unwrap(await sb.storage.from(PHOTO_BUCKET).remove([path]));
}
