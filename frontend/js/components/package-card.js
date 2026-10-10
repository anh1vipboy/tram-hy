// Thẻ "gói dịch vụ" (mẫu rạp, gói chụp, gói trang điểm, sảnh & thực đơn) – dùng ở trang tiệm và Kênh đối tác
import { html } from '../core/utils.js';
import { discountPercent } from '../core/labels.js';
import { openPackageGallery } from './dress-gallery.js';

/** Số ảnh của gói: ảnh chính + ảnh chi tiết (photos là [{count}] khi đọc công khai, hoặc danh sách ảnh ở trang quản lý) */
export function packagePhotoCount(pkg) {
  const details = Array.isArray(pkg.photos) ? (pkg.photos[0]?.count ?? pkg.photos.length) : 0;
  return (pkg.image_url ? 1 : 0) + details;
}

/** Ảnh trên thẻ gói – bấm mở trình xem ảnh (gắn bằng bindPackageGalleries) */
export function packageThumbButton(pkg, placeholder = '✨') {
  const count = packagePhotoCount(pkg);
  const off = discountPercent(pkg);
  return pkg.image_url
    ? html`
      <button class="thumb-button" type="button" data-package-gallery="${pkg.id}" aria-label="Xem ảnh ${pkg.name}">
        <img class="thumb" src="${pkg.image_url}" alt="${pkg.name}" loading="lazy">
        ${count > 1 ? html`<span class="photo-count">${count} ảnh</span>` : ''}
        ${off ? html`<span class="sale-ribbon">Giảm ${off}%</span>` : ''}
      </button>`
    : html`<div class="thumb-placeholder" aria-hidden="true">${placeholder}</div>`;
}

/** options(pkg) → { subtitle, action } cho trình xem ảnh của từng gói */
export function bindPackageGalleries(container, packages, options = () => ({})) {
  container.querySelectorAll('[data-package-gallery]').forEach((btn) => {
    const pkg = packages.find((p) => p.id === btn.dataset.packageGallery);
    btn.addEventListener('click', () => openPackageGallery(pkg, options(pkg)));
  });
}
