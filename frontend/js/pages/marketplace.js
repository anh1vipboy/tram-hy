import { initLayout } from '../core/layout.js';
import { $, $$, html, render, money, param, initials } from '../core/utils.js';
import { badge, VENDOR_CATEGORY } from '../core/labels.js';
import { toastError } from '../core/ui.js';
import { listVendors } from '../services/catalog.js';
import { bindMoneyInput, MAX_MONEY } from '../components/money-input.js';
import { vendorLogo } from '../components/vendor-logo.js';

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
renderCategories();
try {
  vendors = await listVendors();
} catch (error) {
  toastError(error);
}
renderVendors();

function bindFilters() {
  $('#search').addEventListener('input', (e) => { filters.search = e.target.value.trim().toLowerCase(); renderVendors(); });
  $('#sort').addEventListener('change', (e) => { filters.sort = e.target.value; renderVendors(); });
  $('#verified-only').addEventListener('change', (e) => { filters.verifiedOnly = e.target.checked; renderVendors(); });
  bindBudgetFilter();
}

// Ngân sách tối đa: chọn mốc có sẵn, hoặc "Tự nhập số tiền…" (tối đa 10 tỷ)
function bindBudgetFilter() {
  const select = $('#max-price');
  const customWrap = $('#max-custom-wrap');
  const custom = bindMoneyInput($('#max-custom'), {
    errorEl: $('#max-error'),
    min: 100_000,
    onChange: (value) => { filters.maxPrice = value; renderVendors(); },
  });

  function showCustom(show) {
    customWrap.hidden = !show;
    if (!show) custom.clearError();
  }

  select.addEventListener('change', () => {
    if (select.value === 'custom') {
      showCustom(true);
      $('#max-custom').focus();
      filters.maxPrice = $('#max-custom').value ? custom.check() : null;
    } else {
      showCustom(false);
      filters.maxPrice = Number(select.value) || null;
    }
    renderVendors();
  });

  // Ngân sách gửi từ trang chủ (?max=): khớp mốc có sẵn thì chọn mốc, không thì điền vào ô tự nhập.
  // Giá trị sai (âm, chữ, quá 10 tỷ) thì bỏ qua.
  const fromUrl = filters.maxPrice;
  filters.maxPrice = null;
  if (fromUrl > 0 && fromUrl <= MAX_MONEY) {
    if ([...select.options].some((o) => Number(o.value) === fromUrl)) {
      select.value = String(fromUrl);
      filters.maxPrice = fromUrl;
    } else {
      select.value = 'custom';
      showCustom(true);
      filters.maxPrice = custom.set(fromUrl);
    }
  }
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
        <div class="vendor-title">${vendorLogo(v, { size: 36 })}<h3>${v.name}</h3></div>
        <div class="muted small vendor-district">📍 ${v.district}</div>
        <div class="small vendor-rating"><span class="stars">★</span> <strong>${v.rating}</strong>
          <span class="muted">(${v.review_count} đánh giá)</span></div>
        <div>Từ <span class="price">${money(v.base_price)}</span></div>
        <a class="btn btn-outline btn-sm" href="vendor.html?slug=${v.slug}">Xem chi tiết</a>
      </div>
    </article>`));
}
