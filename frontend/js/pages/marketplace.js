import { initLayout } from '../core/layout.js';
import { $, $$, html, render, money, param, initials, sizedImage } from '../core/utils.js';
import { badge, priceTag, discountPercent, DRESS_THEME, VENDOR_CATEGORY } from '../core/labels.js';
import { toastError } from '../core/ui.js';
import { listVendors, listDresses, listAllPackages } from '../services/catalog.js';
import { bindMoneyInput, MAX_MONEY } from '../components/money-input.js';
import { vendorLogo } from '../components/vendor-logo.js';
import { dressThumbButton, bindDressGalleries } from '../components/dress-gallery.js';
import { packageThumbButton, bindPackageGalleries, packagePrice } from '../components/package-card.js';
import { openBookingDialog } from '../components/booking-dialog.js';

const HOT_DRESS_REGEX = /alina|song hỷ|hàn quốc|pha lê royal|camile|bellis|triều nguyễn|mikado/i;
const isHotDress = (d) => (d.photos?.[0]?.count ?? 0) >= 3 || discountPercent(d) >= 20 || HOT_DRESS_REGEX.test(d.name);

const CATEGORY_ICON = {
  bridal: '👗', studio: '📸', decor: '🌸', makeup: '💄',
  venue: '🏛️', betrothal: '🎁', entertainment: '🎶', car: '🚗',
};

const initialView = ['vendors', 'dresses', 'packages'].includes(param('view')) ? param('view') : 'vendors';
const filters = {
  view: initialView,
  category: param('category') || 'all',
  dressFilter: param('theme') || 'all',
  search: '',
  maxPrice: Number(param('max')) || null,
  verifiedOnly: false,
  sort: 'rating',
};

let vendors = [];
let dresses = [];
let packages = [];

// Nhà hàng tiệc ghi giá MỖI BÀN (base_price = giá 1 bàn), các loại tiệm khác ghi giá trọn gói.
// "Ngân sách tối đa" và sắp xếp theo giá phải so cùng một kiểu tiền → nhà hàng quy ra cả tiệc 30 bàn
// (cỡ tiệc cưới phổ biến). Không quy đổi thì nhà hàng 3,5 triệu/bàn lọt cả mốc ngân sách 5 triệu.
const TYPICAL_TABLES = 30;
const comparableVendorPrice = (v) => (v.category === 'venue' ? v.base_price * TYPICAL_TABLES : v.base_price);
const comparablePkgPrice = (p) => (p.vendor?.category === 'venue' ? p.price * TYPICAL_TABLES : p.price);

initLayout('marketplace');
bindFilters();
renderViewTabs();
renderCategories();

try {
  [vendors, dresses, packages] = await Promise.all([
    listVendors(),
    listDresses(),
    listAllPackages().catch(() => []),
  ]);
} catch (error) {
  toastError(error);
}
renderViewTabs();
renderCategories();
renderResults();

function syncUrl() {
  const url = new URL(location.href);
  if (filters.view === 'vendors') url.searchParams.delete('view');
  else url.searchParams.set('view', filters.view);
  history.replaceState(null, '', url);
}

function bindFilters() {
  $('#view-tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('[data-view]');
    if (!tab || tab.dataset.view === filters.view) return;
    filters.view = tab.dataset.view;
    syncUrl();
    renderViewTabs();
    renderCategories();
    renderResults();
  });
  $('#search').addEventListener('input', (e) => { filters.search = e.target.value.trim().toLowerCase(); renderResults(); });
  $('#sort').addEventListener('change', (e) => { filters.sort = e.target.value; renderResults(); });
  $('#verified-only').addEventListener('change', (e) => { filters.verifiedOnly = e.target.checked; renderResults(); });
  bindBudgetFilter();
}

function renderViewTabs() {
  const vCount = vendors.length ? ` (${vendors.length})` : '';
  const dCount = dresses.length ? ` (${dresses.length})` : '';
  const pCount = packages.length ? ` (${packages.length})` : '';
  const items = [
    ['vendors',  `🏪 Đối tác${vCount}`],
    ['dresses',  `👗 Mẫu váy cưới${dCount}`],
    ['packages', `🎁 Gói dịch vụ${pCount}`],
  ];
  render($('#view-tabs'), items.map(([key, label]) => html`
    <button class="tab ${filters.view === key ? 'active' : ''}" type="button" role="tab"
            data-view="${key}" aria-selected="${filters.view === key}">${label}</button>`));
}

// Ngân sách tối đa: chọn mốc có sẵn, hoặc "Tự nhập số tiền…" (tối đa 10 tỷ)
function bindBudgetFilter() {
  const select = $('#max-price');
  const customWrap = $('#max-custom-wrap');
  const custom = bindMoneyInput($('#max-custom'), {
    errorEl: $('#max-error'),
    min: 100_000,
    onChange: (value) => { filters.maxPrice = value; renderResults(); },
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
    renderResults();
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
  const box = $('#category-filter');
  if (filters.view === 'dresses') {
    const dressChips = [
      ['all',     'Tất cả'],
      ['hot',     '🔥 Hot Trend'],
      ['sale',    '🏷️ Đang ưu đãi'],
      ['rental',  'Thuê sẵn'],
      ['bespoke', 'May đo thiết kế'],
      ...Object.entries(DRESS_THEME),
    ];
    render(box, dressChips.map(([key, label]) => html`
      <button class="chip ${key === filters.dressFilter ? 'active' : ''}" type="button" data-dress-filter="${key}">${label}</button>`));
    for (const chip of $$('[data-dress-filter]', box)) {
      chip.addEventListener('click', () => {
        filters.dressFilter = chip.dataset.dressFilter;
        renderCategories();
        renderResults();
      });
    }
    return;
  }

  const entries = filters.view === 'packages'
    ? [['all', 'Tất cả'], ['sale', '🏷️ Đang ưu đãi'], ...Object.entries(VENDOR_CATEGORY).filter(([k]) => k !== 'bridal')]
    : [['all', 'Tất cả'], ...Object.entries(VENDOR_CATEGORY)];

  render(box, entries.map(([key, label]) => html`
    <button class="chip ${key === filters.category ? 'active' : ''}" type="button" data-category="${key}">${label}</button>`));
  for (const chip of $$('[data-category]', box)) {
    chip.addEventListener('click', () => {
      filters.category = chip.dataset.category;
      renderCategories();
      renderResults();
    });
  }
}

function renderResults() {
  if (filters.view === 'dresses') renderDresses();
  else if (filters.view === 'packages') renderPackages();
  else renderVendors();
}

// ---------- 1. CHẾ ĐỘ XEM ĐỐI TÁC (TIỆM) ----------
function applyVendorFilters() {
  const list = vendors.filter((v) =>
    (filters.category === 'all' || v.category === filters.category)
    && (!filters.verifiedOnly || v.is_verified)
    && (!filters.maxPrice || comparableVendorPrice(v) <= filters.maxPrice)
    && (!filters.search || `${v.name} ${v.district ?? ''} ${VENDOR_CATEGORY[v.category] ?? ''}`.toLowerCase().includes(filters.search)));

  const sorters = {
    rating: (a, b) => b.rating - a.rating,
    'price-asc': (a, b) => comparableVendorPrice(a) - comparableVendorPrice(b),
    'price-desc': (a, b) => comparableVendorPrice(b) - comparableVendorPrice(a),
  };
  return list.sort(sorters[filters.sort]);
}

function renderVendors() {
  const list = applyVendorFilters();
  render($('#result-count'), html`${list.length} đối tác · Muốn xem từng mẫu lẻ? Bấm qua mục
    <button type="button" class="btn-link" style="padding:0;font-weight:700" data-switch-view="dresses">👗 Mẫu váy cưới (${dresses.length})</button>
    hoặc <button type="button" class="btn-link" style="padding:0;font-weight:700" data-switch-view="packages">🎁 Gói dịch vụ (${packages.length})</button>`);

  $('#result-count').querySelectorAll('[data-switch-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      filters.view = btn.dataset.switchView;
      syncUrl();
      renderViewTabs();
      renderCategories();
      renderResults();
    });
  });

  if (!list.length) {
    render($('#vendor-grid'), html`<div class="empty">Không có đối tác phù hợp. Thử bỏ bớt bộ lọc.</div>`);
    return;
  }
  render($('#vendor-grid'), list.map((v) => html`
    <article class="card item-card">
      ${v.cover_url
        ? html`<img class="thumb" src="${sizedImage(v.cover_url, 720)}" alt="" loading="lazy" decoding="async">`
        : html`<div class="thumb-placeholder">${initials(v.name)}</div>`}
      <div class="body">
        <div class="row">${badge(VENDOR_CATEGORY[v.category], 'gold')}
          ${v.is_verified ? badge('✓ Tích Xanh', 'blue') : ''}</div>
        <div class="vendor-title">${vendorLogo(v, { size: 36 })}<h3>${v.name}</h3></div>
        <div class="muted small vendor-district">📍 ${v.district}</div>
        <div class="small vendor-rating"><span class="stars">★</span> <strong>${v.rating}</strong>
          <span class="muted">(${v.review_count} đánh giá)</span></div>
        ${v.category === 'venue'
          ? html`<div>Từ <span class="price">${money(v.base_price)}</span>/bàn</div>
                 <div class="small muted">≈ ${money(comparableVendorPrice(v))} cho tiệc ${TYPICAL_TABLES} bàn</div>`
          : html`<div>Từ <span class="price">${money(v.base_price)}</span></div>`}
        <a class="btn btn-outline btn-sm" href="vendor.html?slug=${v.slug}">Xem chi tiết tiệm</a>
      </div>
    </article>`));
}

// ---------- 2. CHẾ ĐỘ XEM TOÀN BỘ MẪU VÁY CƯỚI ----------
function matchDressChip(d) {
  const f = filters.dressFilter;
  if (f === 'all') return true;
  if (f === 'hot') return isHotDress(d);
  if (f === 'sale') return discountPercent(d) > 0;
  if (f === 'rental') return d.type !== 'bespoke';
  if (f === 'bespoke') return d.type === 'bespoke';
  return d.theme === f;
}

function applyDressFilters() {
  const list = dresses.filter((d) =>
    matchDressChip(d)
    && (!filters.verifiedOnly || d.vendor?.is_verified)
    && (!filters.maxPrice || d.price <= filters.maxPrice)
    && (!filters.search || `${d.name} ${d.vendor?.name ?? ''} ${d.vendor?.district ?? ''} ${DRESS_THEME[d.theme] ?? ''}`.toLowerCase().includes(filters.search)));

  const sorters = {
    rating: (a, b) => Number(isHotDress(b)) - Number(isHotDress(a)) || discountPercent(b) - discountPercent(a) || a.price - b.price,
    'price-asc': (a, b) => a.price - b.price,
    'price-desc': (a, b) => b.price - a.price,
  };
  return [...list].sort(sorters[filters.sort]);
}

function renderDresses() {
  const list = applyDressFilters();
  $('#result-count').textContent = `${list.length} mẫu váy cưới · bấm vào ảnh để xem các góc chụp thực tế`;

  const grid = $('#vendor-grid');
  if (!list.length) {
    render(grid, html`<div class="empty">Không có mẫu váy phù hợp với bộ lọc đang chọn.</div>`);
    return;
  }
  render(grid, list.map((dress) => html`
    <article class="card item-card">
      ${dressThumbButton(dress)}
      <div class="body">
        <div class="row">
          ${isHotDress(dress) ? badge('🔥 Hot', 'red') : ''}
          ${badge(DRESS_THEME[dress.theme] ?? dress.theme, 'gold')}
          ${dress.type === 'bespoke' ? badge('May đo', 'purple') : badge('Thuê sẵn')}
        </div>
        <h3>${dress.name}</h3>
        <a class="muted small ellipsis" href="vendor.html?slug=${dress.vendor.slug}">
          🏪 ${dress.vendor.name}${dress.vendor.is_verified ? html` <b class="verified" title="Đối tác Tích Xanh">✓</b>` : ''}${dress.vendor.district ? ` · ${dress.vendor.district}` : ''}
        </a>
        <div>${priceTag(dress)}</div>
        <div class="row" style="margin-top:auto;padding-top:6px">
          <a class="btn btn-primary btn-sm" style="flex:1" href="tryon.html?dress=${dress.slug}">✨ Thử váy AI</a>
          <a class="btn btn-outline btn-sm" href="vendor.html?slug=${dress.vendor.slug}">Xem tiệm</a>
        </div>
      </div>
    </article>`));
  bindDressGalleries(grid, list);
}

// ---------- 3. CHẾ ĐỘ XEM TOÀN BỘ GÓI DỊCH VỤ LẺ ----------
function applyPackageFilters() {
  const list = packages.filter((p) =>
    (filters.category === 'all'
      || (filters.category === 'sale' ? discountPercent(p) > 0 : p.vendor?.category === filters.category))
    && (!filters.verifiedOnly || p.vendor?.is_verified)
    && (!filters.maxPrice || comparablePkgPrice(p) <= filters.maxPrice)
    && (!filters.search || `${p.name} ${p.description ?? ''} ${p.vendor?.name ?? ''} ${p.vendor?.district ?? ''}`.toLowerCase().includes(filters.search)));

  const sorters = {
    rating: (a, b) => (b.vendor?.rating ?? 0) - (a.vendor?.rating ?? 0) || discountPercent(b) - discountPercent(a),
    'price-asc': (a, b) => comparablePkgPrice(a) - comparablePkgPrice(b),
    'price-desc': (a, b) => comparablePkgPrice(b) - comparablePkgPrice(a),
  };
  return [...list].sort(sorters[filters.sort]);
}

function renderPackages() {
  const list = applyPackageFilters();
  $('#result-count').textContent = `${list.length} gói dịch vụ · đặt lịch giữ cọc 3 đợt trực tiếp qua Trạm Hỷ`;

  const grid = $('#vendor-grid');
  if (!list.length) {
    render(grid, html`<div class="empty">Không có gói dịch vụ phù hợp với bộ lọc đang chọn.</div>`);
    return;
  }
  render(grid, list.map((pkg) => {
    const isVenue = pkg.vendor?.category === 'venue';
    const icon = CATEGORY_ICON[pkg.vendor?.category] || '✨';
    return html`
      <article class="card item-card">
        ${packageThumbButton(pkg, icon)}
        <div class="body">
          <div class="row">
            ${badge(VENDOR_CATEGORY[pkg.vendor?.category] ?? 'Dịch vụ', 'gold')}
            ${pkg.vendor?.is_verified ? badge('✓ Tích Xanh', 'blue') : ''}
          </div>
          <h3>${pkg.name}</h3>
          <a class="muted small ellipsis" href="vendor.html?slug=${pkg.vendor?.slug}">
            🏪 ${pkg.vendor?.name}${pkg.vendor?.district ? ` · ${pkg.vendor.district}` : ''}
          </a>
          ${pkg.description ? html`<p class="muted small package-desc" style="margin:0">${pkg.description}</p>` : ''}
          <div>${packagePrice(pkg, isVenue)}</div>
          <div class="row" style="margin-top:auto;padding-top:6px">
            <button class="btn btn-primary btn-sm" type="button" style="flex:1" data-book-pkg="${pkg.id}">Đặt gói này</button>
            <a class="btn btn-outline btn-sm" href="vendor.html?slug=${pkg.vendor?.slug}">Xem tiệm</a>
          </div>
        </div>
      </article>`;
  }));

  const bookPkg = (pkg) => {
    const isVenue = pkg.vendor?.category === 'venue';
    openBookingDialog({
      vendorId: pkg.vendor_id,
      vendorName: pkg.vendor?.name ?? '',
      type: 'service',
      packageId: pkg.id,
      title: pkg.name,
      price: pkg.price,
      ...(isVenue ? { isVenue, unitPrice: pkg.price, minQty: pkg.min_qty, maxQty: pkg.max_qty } : {}),
    }, `marketplace.html?view=packages`).catch(toastError);
  };

  bindPackageGalleries(grid, list, (pkg) => ({
    subtitle: pkg.vendor?.name ?? '',
    action: { label: 'Đặt gói này', onClick: () => bookPkg(pkg) },
  }));
  grid.querySelectorAll('[data-book-pkg]').forEach((btn) => {
    const pkg = list.find((p) => p.id === btn.dataset.bookPkg);
    if (pkg) btn.addEventListener('click', () => bookPkg(pkg));
  });
}
