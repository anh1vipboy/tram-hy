// Trình xem ảnh mẫu váy: ảnh chính + ảnh các góc. Bấm mũi tên, phím ← →, hoặc vuốt trên điện thoại.
import { html, render, money } from '../core/utils.js';
import { toastError } from '../core/ui.js';
import { listDressPhotos } from '../services/catalog.js';
import { dressThumb } from '../data/tryon-data.js';
import { discountPercent } from '../core/labels.js';

/** Số ảnh thật của mẫu (ảnh chính + ảnh góc) – dùng cho nhãn "N ảnh" trên thẻ váy. */
export function realPhotoCount(dress) {
  const angles = Array.isArray(dress.photos) ? (dress.photos[0]?.count ?? dress.photos.length) : 0;
  return (dress.image_url ? 1 : 0) + angles;
}

/** Ảnh trên thẻ váy: bấm vào mở trình xem ảnh. Dùng cùng bindDressGalleries(). */
export function dressThumbButton(dress) {
  const count = realPhotoCount(dress);
  return html`
    <button class="thumb-button" type="button" data-gallery="${dress.id}" aria-label="Xem ảnh ${dress.name}">
      <img class="thumb" src="${dressThumb(dress)}" alt="${dress.name}" loading="lazy">
      ${count > 1 ? html`<span class="photo-count">${count} ảnh</span>` : ''}
      ${discountPercent(dress) ? html`<span class="sale-ribbon">Giảm ${discountPercent(dress)}%</span>` : ''}
    </button>`;
}

export function bindDressGalleries(container, dresses) {
  container.querySelectorAll('[data-gallery]').forEach((btn) => {
    btn.addEventListener('click', () => openDressGallery(dresses.find((d) => d.id === btn.dataset.gallery)));
  });
}

export async function openDressGallery(dress) {
  let images;
  try {
    const angles = Array.isArray(dress.photos) && dress.photos[0]?.url
      ? dress.photos                                   // đã có sẵn (trang quản lý của tiệm)
      : await listDressPhotos(dress.id);
    images = [dressThumb(dress), ...angles.map((p) => p.url)];
  } catch (error) {
    toastError(error);
    return;
  }
  const isIllustration = !dress.image_url && images.length === 1;
  let index = 0;

  const dialog = document.createElement('dialog');
  dialog.className = 'modal lightbox';
  document.body.append(dialog);

  function draw() {
    render(dialog, html`
      <div class="lightbox-stage">
        <img src="${images[index]}" alt="${dress.name} – ảnh ${index + 1}">
        ${images.length > 1 ? html`
          <button class="lightbox-nav prev" type="button" data-step="-1" aria-label="Ảnh trước">‹</button>
          <button class="lightbox-nav next" type="button" data-step="1" aria-label="Ảnh sau">›</button>
          <span class="lightbox-count">${index + 1} / ${images.length}</span>` : ''}
        <button class="lightbox-close" type="button" data-close aria-label="Đóng">✕</button>
      </div>
      ${images.length > 1 ? html`
        <div class="lightbox-thumbs">
          ${images.map((src, i) => html`
            <button type="button" class="${i === index ? 'active' : ''}" data-go="${i}"><img src="${src}" alt=""></button>`)}
        </div>` : ''}
      <div class="lightbox-info">
        <div>
          <strong>${dress.name}</strong>
          <div class="small muted">${dress.vendor?.name ?? ''} · <span class="price">${money(dress.price)}</span></div>
          ${isIllustration ? html`<div class="small muted">Tiệm chưa đăng ảnh thật – đây là ảnh minh họa cùng kiểu váy.</div>` : ''}
        </div>
        ${dress.slug ? html`<a class="btn btn-primary btn-sm" href="tryon.html?dress=${dress.slug}">Thử váy này</a>` : ''}
      </div>`);
  }

  const go = (i) => {
    index = (i + images.length) % images.length;
    draw();
  };

  dialog.addEventListener('click', (e) => {
    const target = e.target.closest('[data-step], [data-go], [data-close]');
    if (target?.dataset.step) go(index + Number(target.dataset.step));
    else if (target?.dataset.go) go(Number(target.dataset.go));
    else if (target?.hasAttribute('data-close') || e.target === dialog) dialog.close();
  });
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') go(index - 1);
    if (e.key === 'ArrowRight') go(index + 1);
  });
  // Vuốt trái / phải trên điện thoại
  let touchX = null;
  dialog.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  dialog.addEventListener('touchend', (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
    touchX = null;
  });
  dialog.addEventListener('close', () => dialog.remove());

  draw();
  dialog.showModal();
}
