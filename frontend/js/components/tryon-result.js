// Khung ảnh ướm thử trong khung chat: ảnh lớn + dải ảnh nhỏ (1–4 ảnh), phóng to, so sánh trước/sau, tải ảnh.
import { html, render } from '../core/utils.js';
import { openPhotoGallery } from './dress-gallery.js';

// Link ảnh kết quả là link Supabase (khác tên miền) → thuộc tính download không có tác dụng.
// Tải về dạng blob rồi lưu; lỗi mạng thì mở ảnh ở tab mới để người dùng tự lưu.
async function downloadImage(url) {
  try {
    const blob = await (await fetch(url)).blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `tram-hy-thu-vay-${Date.now()}.${blob.type.includes('png') ? 'png' : 'jpg'}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  } catch {
    window.open(url, '_blank', 'noopener');
  }
}

/**
 * images: link các ảnh kết quả; original: ảnh gốc của người (null nếu không còn) để so sánh trước/sau;
 * meta: chữ nhỏ cạnh nhãn (VD "Siêu nét · 2 ảnh"). Trả về phần tử DOM đã gắn sự kiện.
 */
export function resultViewer({ images, original = null, meta = '' }) {
  const el = document.createElement('div');
  el.className = 'gen';
  let index = 0;
  let comparing = false;

  function draw() {
    render(el, html`
      <div class="gen-head">
        <span class="gen-tag">✨ Ảnh ướm thử</span>
        ${meta ? html`<span class="gen-meta">${meta}</span>` : ''}
      </div>
      <div class="gen-frame">
        <img class="gen-main" src="${images[index]}" alt="Ảnh ướm thử ${index + 1}">
        ${comparing ? html`
          <div class="gen-compare"><img src="${original}" alt="Ảnh gốc"></div>
          <span class="gen-side before">Trước</span><span class="gen-side after">Sau</span>
          <input class="gen-range" type="range" min="0" max="100" value="50"
                 aria-label="Kéo để so sánh ảnh gốc và ảnh đã ướm váy">` : ''}
        <button class="gen-zoom" type="button" data-zoom aria-label="Phóng to ảnh" title="Phóng to">⤢</button>
      </div>
      ${images.length > 1 ? html`
        <div class="gen-thumbs">
          ${images.map((src, i) => html`
            <button type="button" class="${i === index ? 'active' : ''}" data-pick="${i}" aria-label="Xem ảnh ${i + 1}">
              <img src="${src}" alt=""><span>${i + 1}</span>
            </button>`)}
        </div>` : ''}
      <div class="gen-actions">
        ${original ? html`<button type="button" class="btn btn-outline btn-sm" data-compare>
          ${comparing ? 'Tắt so sánh' : '⇆ So sánh trước/sau'}</button>` : ''}
        <button type="button" class="btn btn-outline btn-sm" data-download>⬇ Tải ảnh</button>
      </div>`);
    // Khung theo đúng tỷ lệ ảnh (ảnh selfie, ảnh toàn thân…) → không cắt mất gấu váy
    const main = el.querySelector('.gen-main');
    const fit = () => main.naturalWidth && el.querySelector('.gen-frame')
      .style.setProperty('--ratio', String(main.naturalWidth / main.naturalHeight));
    if (main.complete) fit(); else main.addEventListener('load', fit, { once: true });
  }

  el.addEventListener('click', (e) => {
    const target = e.target.closest('[data-pick], [data-zoom], [data-compare], [data-download]');
    if (!target) return;
    if (target.dataset.pick) {
      index = Number(target.dataset.pick);
      draw();
    } else if (target.hasAttribute('data-zoom')) {
      openPhotoGallery({ title: 'Ảnh ướm thử', subtitle: meta, images, start: index });
    } else if (target.hasAttribute('data-compare')) {
      comparing = !comparing;
      draw();
    } else {
      downloadImage(images[index]);
    }
  });
  // Thanh so sánh: đường chia khớp tâm núm kéo (thanh cách mép 14px + nửa núm 8px mỗi bên)
  el.addEventListener('input', (e) => {
    if (!e.target.matches('.gen-range')) return;
    el.querySelector('.gen-frame').style.setProperty('--split', `calc(22px + (100% - 44px) * ${e.target.value / 100})`);
  });

  draw();
  return el;
}
