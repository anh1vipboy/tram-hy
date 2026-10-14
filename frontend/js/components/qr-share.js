// Mã QR của thiệp (in lên thiệp giấy, bảng chào) + chia sẻ link qua Zalo / Messenger / Facebook.
// QR tạo ngay trên trình duyệt (thư viện qrcode-generator, MIT) – link thiệp không gửi qua dịch vụ bên ngoài.
import qrcode from '../vendor/qrcode-generator-1.4.4.js';

/** Ảnh QR (canvas) có nền trắng, viền trống, chú thích phía dưới – đủ nét để in */
export function qrCanvas(text, { size = 720, caption = '', color = '#2a2421' } = {}) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const pad = Math.round(size * 0.08);
  const cell = Math.floor((size - pad * 2) / count);
  const qrSize = cell * count;
  const captionH = caption ? Math.round(size * 0.13) : 0;
  const canvas = document.createElement('canvas');
  canvas.width = qrSize + pad * 2;
  canvas.height = qrSize + pad * 2 + captionH;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = color;
  for (let r = 0; r < count; r += 1) {
    for (let c = 0; c < count; c += 1) if (qr.isDark(r, c)) ctx.fillRect(pad + c * cell, pad + r * cell, cell, cell);
  }
  if (caption) {
    ctx.font = `600 ${Math.round(size * 0.045)}px "Plus Jakarta Sans", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(caption, canvas.width / 2, qrSize + pad * 1.5 + captionH / 2, canvas.width - pad * 2);
  }
  return canvas;
}

export function downloadCanvas(canvas, filename) {
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = filename;
  a.click();
}

/**
 * Điện thoại: mở bảng chia sẻ của máy (có Zalo, Messenger, Facebook…). Máy tính không hỗ trợ → sao chép link.
 * Trả về 'shared' | 'copied' | 'cancelled'.
 */
export async function shareLink({ title, text, url }) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (error) {
      if (error.name === 'AbortError') return 'cancelled';
    }
  }
  await navigator.clipboard.writeText(`${text ? `${text} ` : ''}${url}`);
  return 'copied';
}

export const facebookShareUrl = (url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
