// Trình xem ảnh mẫu váy: ảnh chính + ảnh các góc. Bấm mũi tên, phím ← →, hoặc vuốt trên điện thoại.
import { html, render, money, sizedImage } from '../core/utils.js';
import { toastError } from '../core/ui.js';
import { listDressPhotos, listPackagePhotos } from '../services/catalog.js';
import { dressThumb } from '../data/tryon-data.js';
import { discountPercent } from '../core/labels.js';

/** Số ảnh thật của mẫu (ảnh chính + ảnh góc) – dùng cho nhãn "N ảnh" trên thẻ váy. */
export function realPhotoCount(dress) {
  const angles = Array.isArray(dress.photos) ? (dress.photos[0]?.count ?? dress.photos.length) : 0;
  return (dress.image_url ? 1 : 0) + angles;
}

/** Ảnh trên thẻ váy: bấm vào mở trình xem ảnh. Dùng cùng bindDressGalleries(). */
export function dressThumbButton(dress, { showTryonPill = true } = {}) {
  const count = realPhotoCount(dress);
  return html`
    <div class="thumb-wrap">
      <button class="thumb-button" type="button" data-gallery="${dress.id}" aria-label="Xem ảnh thực tế ${dress.name}">
        <img class="thumb" src="${sizedImage(dressThumb(dress), 640)}" alt="${dress.name}" loading="lazy" decoding="async">
        ${count > 1 ? html`<span class="photo-count">${count} ảnh</span>` : ''}
        ${discountPercent(dress) ? html`<span class="sale-ribbon">Giảm ${discountPercent(dress)}%</span>` : ''}
      </button>
      ${showTryonPill && dress.slug ? html`
        <a class="tryon-float-pill" href="tryon.html?dress=${dress.slug}" title="Ướm thử mẫu váy này lên ảnh của bạn bằng AI">
          <span aria-hidden="true">✨</span> Thử váy AI
        </a>` : ''}
    </div>`;
}

export function bindDressGalleries(container, dresses, options = {}) {
  container.querySelectorAll('[data-gallery]').forEach((btn) => {
    const dress = dresses.find((d) => d.id === btn.dataset.gallery);
    if (dress) btn.addEventListener('click', () => openDressGallery(dress, options));
  });
}

export async function openDressGallery(dress, { onBook = null } = {}) {
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
  const hasBook = typeof onBook === 'function';
  openPhotoGallery({
    title: dress.name,
    subtitle: dress.vendor?.name ?? '',
    price: dress.price,
    images,
    note: !dress.image_url && images.length === 1 ? 'Tiệm chưa đăng ảnh thật – đây là ảnh minh họa cùng kiểu váy.' : '',
    secondaryAction: hasBook && dress.slug
      ? { label: 'Thử váy này', href: `tryon.html?dress=${dress.slug}` }
      : null,
    action: hasBook
      ? { label: dress.type === 'bespoke' ? 'Đặt may mẫu này' : 'Đặt thuê mẫu này', onClick: () => onBook(dress) }
      : (dress.slug ? { label: 'Thử váy này', href: `tryon.html?dress=${dress.slug}` } : null),
  });
}

/** Gói dịch vụ: ảnh chính + ảnh chi tiết. action: { label, onClick } (vd "Đặt gói này") */
export async function openPackageGallery(pkg, { subtitle = '', action = null } = {}) {
  let images;
  try {
    const details = Array.isArray(pkg.photos) && pkg.photos[0]?.url ? pkg.photos : await listPackagePhotos(pkg.id);
    images = [pkg.image_url, ...details.map((p) => p.url)].filter(Boolean);
  } catch (error) {
    toastError(error);
    return;
  }
  if (!images.length) return;
  openPhotoGallery({ title: pkg.name, subtitle, price: pkg.price, images, note: pkg.description || '', action });
}

/** Trình xem ảnh dùng chung (váy, gói dịch vụ, album thiệp cưới). price / action không bắt buộc; start = ảnh mở đầu tiên.
 *  action / secondaryAction: { label, href } hoặc { label, onClick } */
export function openPhotoGallery({ title, subtitle, price, images, note, action, secondaryAction = null, start = 0 }) {
  let index = start;

  const dialog = document.createElement('dialog');
  dialog.className = 'modal lightbox';
  document.body.append(dialog);

  function draw() {
    render(dialog, html`
      <div class="lightbox-stage">
        <img src="${images[index]}" alt="${title} – ảnh ${index + 1}">
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
        <div style="min-width:0">
          <strong>${title}</strong>
          <div class="small muted">${subtitle || ''}${subtitle && price ? ' · ' : ''}${price ? html`<span class="price">${money(price)}</span>` : ''}</div>
          ${note ? html`<div class="small muted lightbox-note">${note}</div>` : ''}
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          ${secondaryAction?.href ? html`<a class="btn btn-outline btn-sm" href="${secondaryAction.href}">${secondaryAction.label}</a>` : ''}
          ${secondaryAction?.onClick ? html`<button class="btn btn-outline btn-sm" type="button" data-secondary-action>${secondaryAction.label}</button>` : ''}
          ${action?.href ? html`<a class="btn btn-primary btn-sm" href="${action.href}">${action.label}</a>` : ''}
          ${action?.onClick ? html`<button class="btn btn-primary btn-sm" type="button" data-action>${action.label}</button>` : ''}
        </div>
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
    if (e.target.closest('[data-secondary-action]') && secondaryAction?.onClick) { dialog.close(); secondaryAction.onClick(); }
    if (e.target.closest('[data-action]') && action?.onClick) { dialog.close(); action.onClick(); }
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
