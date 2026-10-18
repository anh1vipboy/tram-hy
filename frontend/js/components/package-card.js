// Thẻ "gói dịch vụ" (mẫu rạp, gói chụp, gói trang điểm, sảnh & thực đơn) – dùng ở trang tiệm và Kênh đối tác
import { html, money, sizedImage } from '../core/utils.js';
import { discountPercent, priceTag } from '../core/labels.js';
import { openPackageGallery } from './dress-gallery.js';

// Nhà hàng tiệc tính giá MỖI BÀN. Gói không ghi số bàn / đặt chung không chọn gói → nhận 5–300 bàn
// (đúng như create_booking trong SQL 30 – đổi ở đây thì đổi cả ở đó).
export const VENUE_TABLES = { min: 5, max: 300 };

/** Số bàn nhận được của gói nhà hàng: { min, max } (pkg = null → mặc định khi đặt chung) */
export function tableRange(pkg) {
  const max = pkg?.max_qty ?? VENUE_TABLES.max;
  return { min: Math.min(pkg?.min_qty ?? VENUE_TABLES.min, max), max };
}

/** Giá trên thẻ gói. perTable (nhà hàng): "3.500.000đ/bàn · 20–50 bàn", có giảm giá thì kèm giá gốc mỗi bàn */
export function packagePrice(pkg, perTable = false) {
  if (!perTable) return priceTag(pkg);
  const off = discountPercent(pkg);
  const { min, max } = tableRange(pkg);
  return html`
    <span class="price-tag">
      <span class="price">${money(pkg.price)}/bàn</span>
      ${off ? html`<s class="old-price">${money(pkg.original_price)}</s><span class="sale-badge">-${off}%</span>` : ''}
      <span class="small muted">· ${min}–${max} bàn</span>
    </span>`;
}

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
        <img class="thumb" src="${sizedImage(pkg.image_url, 640)}" alt="${pkg.name}" loading="lazy">
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
