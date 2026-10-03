import { initLayout } from '../core/layout.js';
import { $, $$, html, render, money, param, initials } from '../core/utils.js';
import { badge, VENDOR_CATEGORY } from '../core/labels.js';
import { toastError } from '../core/ui.js';
import { listVendors } from '../services/catalog.js';

const filters = {
  category: param('category') || 'all',
  search: '',
  maxPrice: Number(param('max')) || null,
  verifiedOnly: false,
  sort: 'rating',
};
let vendors = [];

initLayout('marketplace');
bindFilters();
try {
  vendors = await listVendors();
} catch (error) {
  toastError(error);
}
renderCategories();
renderVendors();

function bindFilters() {
  // Ngân sách gửi từ trang chủ có thể không trùng các mốc có sẵn → thêm vào danh sách chọn
  const maxSelect = $('#max-price');
  if (filters.maxPrice && ![...maxSelect.options].some((o) => Number(o.value) === filters.maxPrice)) {
    maxSelect.add(new Option(`Dưới ${money(filters.maxPrice)}`, filters.maxPrice), 1);
  }
  maxSelect.value = filters.maxPrice ? String(filters.maxPrice) : '';

  $('#search').addEventListener('input', (e) => { filters.search = e.target.value.trim().toLowerCase(); renderVendors(); });
  $('#sort').addEventListener('change', (e) => { filters.sort = e.target.value; renderVendors(); });
  maxSelect.addEventListener('change', (e) => { filters.maxPrice = Number(e.target.value) || null; renderVendors(); });
  $('#verified-only').addEventListener('change', (e) => { filters.verifiedOnly = e.target.checked; renderVendors(); });
}

function renderCategories() {
  const categories = [['all', 'Tất cả'], ...Object.entries(VENDOR_CATEGORY)];
  render($('#category-filter'), categories.map(([key, label]) => html`
    <button class="chip ${key === filters.category ? 'active' : ''}" type="button" data-category="${key}">${label}</button>`));
  for (const chip of $$('[data-category]')) {
    chip.addEventListener('click', () => {
      filters.category = chip.dataset.category;
      renderCategories();
      renderVendors();
    });
  }
}

function applyFilters() {
  const list = vendors.filter((v) =>
    (filters.category === 'all' || v.category === filters.category)
    && (!filters.verifiedOnly || v.is_verified)
    && (!filters.maxPrice || v.base_price <= filters.maxPrice)
    && (!filters.search || `${v.name} ${v.district ?? ''}`.toLowerCase().includes(filters.search)));

  const sorters = {
    rating: (a, b) => b.rating - a.rating,
    'price-asc': (a, b) => a.base_price - b.base_price,
    'price-desc': (a, b) => b.base_price - a.base_price,
  };
  return list.sort(sorters[filters.sort]);
}

function renderVendors() {
  const list = applyFilters();
  $('#result-count').textContent = `${list.length} đối tác`;

  if (!list.length) {
    render($('#vendor-grid'), html`<div class="empty">Không có đối tác phù hợp. Thử bỏ bớt bộ lọc.</div>`);
    return;
  }
  render($('#vendor-grid'), list.map((v) => html`
    <article class="card item-card">
      ${v.cover_url
        ? html`<img class="thumb" src="${v.cover_url}" alt="" loading="lazy">`
        : html`<div class="thumb-placeholder">${initials(v.name)}</div>`}
      <div class="body">
        <div class="row">${badge(VENDOR_CATEGORY[v.category], 'gold')}
          ${v.is_verified ? badge('✓ Tích Xanh', 'blue') : ''}</div>
        <h3>${v.name}</h3>
        <div class="muted small">${v.district} · ★ ${v.rating} (${v.review_count} đánh giá)</div>
        <div>Từ <span class="price">${money(v.base_price)}</span></div>
        <a class="btn btn-outline btn-sm" href="vendor.html?slug=${v.slug}">Xem chi tiết</a>
      </div>
    </article>`));
}
