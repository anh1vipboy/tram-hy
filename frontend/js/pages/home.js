import { initLayout } from '../core/layout.js';
import { $, html, render, money } from '../core/utils.js';
import { badge, DRESS_THEME, VENDOR_CATEGORY } from '../core/labels.js';
import { toastError } from '../core/ui.js';
import { listDresses, listVendors } from '../services/catalog.js';
import { dressThumb } from '../data/tryon-data.js';

// Tỷ lệ chia ngân sách cưới phổ biến (category khớp bảng vendors)
const BUDGET_SPLIT = [
  { category: 'venue',  label: 'Nhà hàng tiệc', percent: 50 },
  { category: 'studio', label: 'Chụp ảnh cưới', percent: 20 },
  { category: 'bridal', label: 'Váy cưới',      percent: 10 },
  { category: 'decor',  label: 'Trang trí',     percent: 12 },
  { category: 'makeup', label: 'Trang điểm',    percent: 8 },
];

initLayout('home');
loadFeaturedDresses();
loadTopVendors();
$('#budget-form').addEventListener('submit', (e) => {
  e.preventDefault();
  renderBudget(Number($('#budget-input').value));
});
renderBudget(Number($('#budget-input').value));

async function loadFeaturedDresses() {
  const container = $('#featured-dresses');
  try {
    const dresses = await listDresses({ limit: 4 });
    render(container, dresses.map((dress) => html`
      <article class="card item-card">
        <img class="thumb" src="${dressThumb(dress)}" alt="${dress.name}" loading="lazy">
        <div class="body">
          <div class="row">${badge(DRESS_THEME[dress.theme] ?? dress.theme, 'gold')}
            ${dress.type === 'bespoke' ? badge('May đo', 'purple') : badge('Thuê sẵn')}</div>
          <h3>${dress.name}</h3>
          <div class="muted small">${dress.vendor.name}</div>
          <div class="price">${money(dress.price)}</div>
          <a class="btn btn-primary btn-sm" href="tryon.html?dress=${dress.slug}">Thử váy này</a>
        </div>
      </article>`));
  } catch (error) {
    render(container, html`<div class="empty">Không tải được mẫu váy.</div>`);
    toastError(error);
  }
}

async function loadTopVendors() {
  const container = $('#top-vendors');
  try {
    const vendors = (await listVendors()).filter((v) => v.is_verified).slice(0, 5);
    render(container, vendors.map((v) => html`
      <a class="row" href="vendor.html?slug=${v.slug}" style="color:inherit">
        <strong>${v.name}</strong><span class="verified" title="Đối tác Tích Xanh">✓</span>
        <span class="spacer"></span>
        <span class="muted small">${VENDOR_CATEGORY[v.category]} · ★ ${v.rating}</span>
      </a>`));
  } catch (error) {
    toastError(error);
  }
}

function renderBudget(total) {
  if (!total || total < 1) return;
  render($('#budget-result'), BUDGET_SPLIT.map((item) => html`
    <div class="row">
      <span style="width:120px">${item.label}</span>
      <strong>${money(Math.round(total * item.percent / 100))}</strong>
      <span class="muted small">(${item.percent}%)</span>
      <span class="spacer"></span>
      <a class="small" href="marketplace.html?category=${item.category}&max=${Math.round(total * item.percent / 100)}">Tìm đối tác →</a>
    </div>`));
}
