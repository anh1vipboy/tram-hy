// Thu nhỏ ảnh trước khi tải lên: ảnh điện thoại 5–10MB → JPEG ~200–500KB, tải nhanh và tiết kiệm dung lượng.
export async function compressImage(file, { maxSize = 1600, quality = 0.85 } = {}) {
  if (!file?.type?.startsWith('image/')) throw new Error('Vui lòng chọn file ảnh');

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);   // tự xoay đúng chiều theo thông tin EXIF của ảnh
  } catch {
    throw new Error('Không đọc được ảnh này – hãy dùng ảnh JPG hoặc PNG');
  }

  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Không nén được ảnh'))), 'image/jpeg', quality);
  });
}
