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
const PHOTO_BUCKET = 'bride-photos';
export const MAX_BRIDE_PHOTOS = 6;

export async function uploadBridePhoto(userId, file) {
  const blob = await compressImage(file, { maxSize: 2000, quality: 0.9 });
  const path = `${userId}/body-${Date.now()}.jpg`;
  unwrap(await sb.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: 'image/jpeg' }));
  return path;
}

/** Ảnh toàn thân đã lưu, mới nhất trước: [{ path, url }] – url là link tạm 1 giờ (bucket riêng tư) */
export async function listBridePhotos(userId) {
  const files = unwrap(await sb.storage.from(PHOTO_BUCKET)
    .list(userId, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } }));
  const paths = files.filter((f) => f.id && f.name.startsWith('body-')).map((f) => `${userId}/${f.name}`);
  if (!paths.length) return [];
  const signed = unwrap(await sb.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 3600));
  return signed.filter((s) => s.signedUrl).map((s) => ({ path: s.path, url: s.signedUrl }));
}

export async function deleteBridePhoto(path) {
  unwrap(await sb.storage.from(PHOTO_BUCKET).remove([path]));
}
