import { initLayout } from '../core/layout.js';
import { $, html, render, money, param, date } from '../core/utils.js';
import { badge, DRESS_THEME, VENDOR_CATEGORY, VENDOR_STATUS } from '../core/labels.js';
import { toastError } from '../core/ui.js';
import { getVendorBySlug, listDresses, listReviews, listVendorPhotos } from '../services/catalog.js';
import { dressThumbButton, bindDressGalleries } from '../components/dress-gallery.js';
import { openBookingDialog } from '../components/booking-dialog.js';
import { vendorLogo } from '../components/vendor-logo.js';

const page = $('#vendor-page');
const slug = param('slug');

initLayout('marketplace');

try {
  const vendor = slug ? await getVendorBySlug(slug) : null;
  if (!vendor) {
    render(page, html`<div class="empty">Không tìm thấy đối tác. <a href="marketplace.html">Quay lại danh sách</a></div>`);
  } else {
    document.title = `${vendor.name} – Trạm Hỷ`;
    const [dresses, reviews, photos] = await Promise.all([
      vendor.category === 'bridal' ? listDresses({ vendorId: vendor.id }) : [],
      listReviews(vendor.id),
      listVendorPhotos(vendor.id),
    ]);
    renderPage(vendor, dresses, reviews, photos);
  }
} catch (error) {
  render(page, html`<div class="empty">Không tải được thông tin đối tác.</div>`);
  toastError(error);
}

function renderPage(vendor, dresses, reviews, photos) {
  const isBridal = vendor.category === 'bridal';
  render(page, html`
    <a href="marketplace.html" class="small">← Dịch vụ cưới</a>
    ${vendor.status !== 'approved' ? html`<div class="notice" style="margin-top:12px"><strong>Bản xem trước – tiệm chưa hiện với khách</strong>
      Trạng thái hồ sơ: ${VENDOR_STATUS[vendor.status]?.label}. Chỉ chủ tiệm và Trạm Hỷ xem được trang này.</div>` : ''}
    <div class="grid-2" style="margin-top:12px;align-items:start">
      <div class="stack">
        ${vendor.cover_url ? html`<img src="${vendor.cover_url}" alt="" style="border-radius:var(--radius);aspect-ratio:16/9;object-fit:cover;width:100%">` : ''}
        <div>
          <div class="row">${badge(VENDOR_CATEGORY[vendor.category], 'gold')}
            ${vendor.is_verified ? badge('✓ Đối tác Tích Xanh', 'blue') : badge('Chưa xác minh')}</div>
          <div class="vendor-title" style="margin-top:8px">${vendorLogo(vendor, { size: 64 })}<h1 style="margin:0">${vendor.name}</h1></div>
          <p class="muted">${vendor.address || vendor.district} · ★ ${vendor.rating} (${vendor.review_count} đánh giá)</p>
          ${vendor.description ? html`<p>${vendor.description}</p>` : ''}
        </div>
      </div>
      ${vendor.status !== 'approved' ? '' : isBridal ? bridalBox(vendor) : serviceBox(vendor)}
    </div>

    ${photos.length ? html`
      <section class="section" style="margin-top:32px">
        <h2>Ảnh thực tế</h2>
        <p class="muted small">Ảnh do tiệm chụp và đăng – bấm để xem ảnh lớn.</p>
        <div class="photo-grid">${photos.map((p) => html`
          <a class="photo" href="${p.url}" target="_blank" rel="noopener"><img src="${p.url}" alt="" loading="lazy"></a>`)}</div>
      </section>` : ''}

    ${isBridal ? html`
      <section class="section" style="margin-top:32px">
        <h2>Mẫu váy của tiệm</h2>
        ${dresses.length ? html`<div class="grid">${dresses.map(dressCard)}</div>`
                         : html`<div class="empty">Tiệm chưa đăng mẫu váy.</div>`}
      </section>` : ''}

    <section class="section" style="margin-top:32px">
      <h2>Đánh giá từ khách đã cưới</h2>
      <p class="muted small">Chỉ khách có đơn hoàn tất qua Trạm Hỷ mới được đánh giá.</p>
      ${reviews.some((r) => r.is_demo) ? html`<p class="small muted">Một số đánh giá là dữ liệu mẫu phục vụ demo.</p>` : ''}
      ${reviews.length ? html`<div class="stack">${reviews.map(reviewCard)}</div>`
                       : html`<div class="empty">Chưa có đánh giá xác thực nào.</div>`}
    </section>`);

  bindDressGalleries(page, dresses);

  $('#book-service')?.addEventListener('click', () => {
    openBookingDialog({
      vendorId: vendor.id,
      vendorName: vendor.name,
      type: 'service',
      title: `Gói dịch vụ ${VENDOR_CATEGORY[vendor.category].toLowerCase()}`,
      price: vendor.base_price,
    }, `vendor.html?slug=${vendor.slug}`).catch(toastError);
  });
}

function serviceBox(vendor) {
  const split = [30, 50, 20];
  const labels = ['Cọc giữ lịch', 'Sau buổi thực hiện', 'Nghiệm thu'];
  return html`
    <aside class="card stack">
      <div class="eyebrow">Thanh toán bảo chứng</div>
      <div>Gói từ <span class="price" style="font-size:22px">${money(vendor.base_price)}</span></div>
      <table>
        ${split.map((p, i) => html`<tr><td>Đợt ${i + 1}: ${labels[i]} (${p}%)</td>
          <td class="price">${money(Math.round(vendor.base_price * p / 100))}</td></tr>`)}
      </table>
      <button class="btn btn-primary btn-block" id="book-service" type="button">Đặt lịch qua Trạm Hỷ</button>
      <p class="small muted">Tiền cọc được Trạm Hỷ giữ. Đối tác sai cam kết → hoàn 100%.</p>
    </aside>`;
}

function bridalBox(vendor) {
  return html`
    <aside class="card stack">
      <div class="eyebrow">Thử trước khi thuê</div>
      <p>Mỗi mẫu váy của ${vendor.name} đều thử được trên ảnh của bạn tại Phòng thử AI trước khi đặt lịch.</p>
      <div>Váy từ <span class="price" style="font-size:22px">${money(vendor.base_price)}</span></div>
    </aside>`;
}

function dressCard(dress) {
  return html`
    <article class="card item-card">
      ${dressThumbButton(dress)}
      <div class="body">
        <div class="row">${badge(DRESS_THEME[dress.theme] ?? dress.theme, 'gold')}
          ${dress.type === 'bespoke' ? badge('May đo', 'purple') : badge('Thuê sẵn')}</div>
        <h3>${dress.name}</h3>
        <div class="price">${money(dress.price)}</div>
        <a class="btn btn-primary btn-sm" href="tryon.html?dress=${dress.slug}">Thử váy này</a>
      </div>
    </article>`;
}

function reviewCard(review) {
  return html`
    <div class="card">
      <div class="row"><strong>${review.reviewer_name}</strong>
        <span class="price">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</span>
        <span class="spacer"></span><span class="muted small">${date(review.created_at)}</span></div>
      ${review.content ? html`<p style="margin:8px 0 0">${review.content}</p>` : ''}
    </div>`;
}
