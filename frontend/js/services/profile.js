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
export async function uploadBridePhoto(userId, file) {
  const blob = await compressImage(file, { maxSize: 2000, quality: 0.9 });
  const path = `${userId}/body-${Date.now()}.jpg`;
  unwrap(await sb.storage.from('bride-photos').upload(path, blob, { contentType: 'image/jpeg' }));
  return path;
}
