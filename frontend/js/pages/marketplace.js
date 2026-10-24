import { initLayout } from '../core/layout.js';
import { loginUrl } from '../core/auth.js';
import { $, $$, html, render, money, param, initials, sizedImage } from '../core/utils.js';
import { badge, priceTag, discountPercent, DRESS_THEME, VENDOR_CATEGORY } from '../core/labels.js';
import { openDialog, toast, toastError, withBusy } from '../core/ui.js';
import { listVendors, listDresses, listAllPackages } from '../services/catalog.js?v=2';
import { getPlan, listBudget, addServiceToPlanBudget } from '../services/planner.js';
import { exportCompareExcel } from '../components/plan-export.js';
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
let currentUser = null;
let userPlan = null;
let categoryBudgets = {};     // { [vendorCategory]: estimatedSum }
let pinnedNames = new Set();  // tên mục đã có trong kế hoạch (lowercase)
let compareList = [];         // tối đa 3 mục đang chọn để so sánh

// Nhà hàng tiệc ghi giá MỖI BÀN (base_price = giá 1 bàn), các loại tiệm khác ghi giá trọn gói.
// "Ngân sách tối đa" và sắp xếp theo giá phải so cùng một kiểu tiền → nhà hàng quy ra cả tiệc 30 bàn
// (cỡ tiệc cưới phổ biến). Không quy đổi thì nhà hàng 3,5 triệu/bàn lọt cả mốc ngân sách 5 triệu.
const TYPICAL_TABLES = 30;
const comparableVendorPrice = (v) => (v.category === 'venue' ? v.base_price * TYPICAL_TABLES : v.base_price);
const comparablePkgPrice = (p) => (p.vendor?.category === 'venue' ? p.price * TYPICAL_TABLES : p.price);

const layoutPromise = initLayout('marketplace');
bindFilters();
renderViewTabs();
renderCategories();

try {
  [vendors, dresses, packages, currentUser] = await Promise.all([
    listVendors(),
    listDresses(),
    listAllPackages().catch(() => []),
    layoutPromise,
  ]);
  if (currentUser) {
    await loadUserPlanBudget(currentUser.id).catch(() => {});
  }
} catch (error) {
  toastError(error);
}
renderPlanSyncBar();
renderViewTabs();
renderCategories();
renderResults();

async function loadUserPlanBudget(userId) {
  userPlan = await getPlan(userId);
  if (!userPlan) return;
  const cats = await listBudget(userPlan.id);
  categoryBudgets = {};
  pinnedNames = new Set();
  for (const c of cats) {
    const sum = (c.items || []).reduce((s, i) => s + (i.estimated || 0), 0);
    if (c.vendor_category) {
      categoryBudgets[c.vendor_category] = (categoryBudgets[c.vendor_category] || 0) + sum;
    }
    for (const i of c.items || []) {
      pinnedNames.add(i.name.trim().toLowerCase());
    }
  }
}

function activeCatKey() {
  if (filters.view === 'dresses') return 'bridal';
  return filters.category !== 'all' && filters.category !== 'sale' ? filters.category : null;
}

function renderPlanSyncBar() {
  const bar = $('#plan-sync-bar');
  if (!bar) return;
  if (!userPlan) {
    bar.hidden = true;
    return;
  }
  const catKey = activeCatKey();
  const catBudget = catKey ? categoryBudgets[catKey] : null;
  bar.hidden = false;
  render(bar, html`
    <div class="plan-sync-text">
      <span class="plan-sync-icon" aria-hidden="true">💍</span>
      <div>
        <strong>Đã đồng bộ Kế hoạch cưới của bạn</strong>
        <span class="small muted">
          ${catBudget
            ? ` · Ngân sách dự kiến mục ${VENDOR_CATEGORY[catKey] || 'này'}: ${money(catBudget)}`
            : ' · Bấm "+ Ngân sách" trên bất kỳ mẫu váy, gói dịch vụ hay tiệm nào để đưa vào bảng dự kiến'}
        </span>
      </div>
    </div>
    <div class="row" style="gap:8px">
      ${catBudget && filters.maxPrice !== catBudget ? html`
        <button type="button" class="btn btn-outline btn-sm" data-filter-plan-budget="${catBudget}">
          Lọc theo ngân sách (${money(catBudget)})
        </button>` : ''}
      <a class="btn btn-outline btn-sm" href="ke-hoach.html?tab=budget">Mở Kế hoạch cưới →</a>
    </div>`);
  bar.querySelector('[data-filter-plan-budget]')?.addEventListener('click', (e) => {
    const val = Number(e.currentTarget.dataset.filterPlanBudget);
    if (!val) return;
    filters.maxPrice = val;
    renderPlanSyncBar();
    renderResults();
    toast(`Đã lọc theo ngân sách dự kiến ${money(val)}`, 'success');
  });
}

function budgetMatchBadge(vendorCategory, price) {
  const budget = categoryBudgets[vendorCategory];
  if (!budget || !price) return '';
  if (price <= budget) return badge('✓ Trong ngân sách', 'green');
  return '';
}

function isPinned(itemName) {
  return pinnedNames.has(String(itemName || '').trim().toLowerCase());
}

function isCompared(id) {
  return compareList.some((x) => x.id === id);
}

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
  const items = [
    ['vendors',  'Đối tác',      vendors.length],
    ['dresses',  'Mẫu váy cưới', dresses.length],
    ['packages', 'Gói dịch vụ',  packages.length],
  ];
  render($('#view-tabs'), items.map(([key, label, count]) => html`
    <button class="tab ${filters.view === key ? 'active' : ''}" type="button" role="tab"
            data-view="${key}" aria-selected="${filters.view === key}">
      <span>${label}</span>
      ${count ? html`<span class="tab-badge">${count}</span>` : ''}
    </button>`));
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
  renderPlanSyncBar();
  if (filters.view === 'dresses') renderDresses();
  else if (filters.view === 'packages') renderPackages();
  else renderVendors();
  bindCardActions();
  renderCompareTray();
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

function bindSwitchButtons() {
  $('#result-count').querySelectorAll('[data-switch-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      filters.view = btn.dataset.switchView;
      syncUrl();
      renderViewTabs();
      renderCategories();
      renderResults();
    });
  });
}

function renderVendors() {
  const list = applyVendorFilters();
  render($('#result-count'), html`
    <span class="result-count-text">Hiển thị <strong>${list.length}</strong> đối tác bảo chứng</span>
    <div class="result-switch">
      <span class="result-switch-label">Khám phá mẫu lẻ:</span>
      <button type="button" class="result-switch-pill" data-switch-view="dresses">
        <span>Mẫu váy cưới</span>
        ${dresses.length ? html`<b>${dresses.length}</b>` : ''}
        <span class="arrow" aria-hidden="true">→</span>
      </button>
      <button type="button" class="result-switch-pill" data-switch-view="packages">
        <span>Gói dịch vụ</span>
        ${packages.length ? html`<b>${packages.length}</b>` : ''}
        <span class="arrow" aria-hidden="true">→</span>
      </button>
    </div>`);
  bindSwitchButtons();

  if (!list.length) {
    render($('#vendor-grid'), html`<div class="empty">Không có đối tác phù hợp. Thử bỏ bớt bộ lọc.</div>`);
    return;
  }
  render($('#vendor-grid'), list.map((v) => {
    const estPrice = comparableVendorPrice(v);
    const planItemName = `${VENDOR_CATEGORY[v.category] ?? 'Dịch vụ'} – ${v.name}`;
    const pinned = isPinned(planItemName);
    const compared = isCompared(`vendor:${v.id}`);
    return html`
      <article class="card item-card">
        ${v.cover_url
          ? html`<img class="thumb" src="${sizedImage(v.cover_url, 720)}" alt="" loading="lazy" decoding="async">`
          : html`<div class="thumb-placeholder">${initials(v.name)}</div>`}
        <div class="body">
          <div class="row">${badge(VENDOR_CATEGORY[v.category], 'gold')}
            ${v.is_verified ? badge('✓ Tích Xanh', 'blue') : ''}
            ${budgetMatchBadge(v.category, estPrice)}</div>
          <div class="vendor-title">${vendorLogo(v, { size: 36 })}<h3>${v.name}</h3></div>
          <div class="muted small vendor-district">📍 ${v.district}</div>
          <div class="small vendor-rating"><span class="stars">★</span> <strong>${v.rating}</strong>
            <span class="muted">(${v.review_count} đánh giá)</span></div>
          ${v.category === 'venue'
            ? html`<div>Từ <span class="price">${money(v.base_price)}</span>/bàn</div>
                   <div class="small muted">≈ ${money(estPrice)} cho tiệc ${TYPICAL_TABLES} bàn</div>`
            : html`<div>Từ <span class="price">${money(v.base_price)}</span></div>`}
          <div class="row card-action-row" style="margin-top:auto;padding-top:6px">
            <a class="btn btn-outline btn-sm" style="flex:1" href="vendor.html?slug=${v.slug}">Xem tiệm</a>
            <button type="button" class="btn btn-sm ${pinned ? 'btn-pinned' : 'btn-outline'}"
                    data-pin-category="${v.category}"
                    data-pin-cat-title="${VENDOR_CATEGORY[v.category] ?? 'Dịch vụ cưới'}"
                    data-pin-name="${planItemName}"
                    data-pin-price="${estPrice}"
                    title="Đưa vào dự kiến Ngân sách trong Kế hoạch cưới">
              ${pinned ? '✓ Trong kế hoạch' : '+ Ngân sách'}
            </button>
            <button type="button" class="btn btn-sm btn-compare-icon ${compared ? 'active' : ''}"
                    data-compare-id="vendor:${v.id}"
                    data-compare-type="${VENDOR_CATEGORY[v.category] ?? 'Đối tác'}"
                    data-compare-title="${v.name}"
                    data-compare-vendor="${v.name}"
                    data-compare-district="${v.district ?? ''}"
                    data-compare-verified="${v.is_verified ? '1' : ''}"
                    data-compare-rating="${v.rating ?? ''}"
                    data-compare-price="${estPrice}"
                    data-compare-orig="0"
                    data-compare-cat="${v.category}"
                    data-compare-thumb="${v.cover_url || ''}"
                    data-compare-note="${v.category === 'venue' ? `${money(v.base_price)}/bàn (quy đổi ${TYPICAL_TABLES} bàn)` : 'Giá khởi điểm tại tiệm'}"
                    data-compare-url="${new URL(`vendor.html?slug=${v.slug}`, location.href).href}"
                    title="Thêm vào khay so sánh báo giá">
              ⚖
            </button>
          </div>
        </div>
      </article>`;
  }));
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
  render($('#result-count'), html`
    <span class="result-count-text">Hiển thị <strong>${list.length}</strong> mẫu váy cưới · bấm vào ảnh để xem các góc chụp thực tế</span>
    <div class="result-switch">
      <button type="button" class="result-switch-pill" data-switch-view="packages">
        <span>Xem Gói dịch vụ</span>
        ${packages.length ? html`<b>${packages.length}</b>` : ''}
        <span class="arrow" aria-hidden="true">→</span>
      </button>
      <button type="button" class="result-switch-pill" data-switch-view="vendors">
        <span>Xem Đối tác</span>
        ${vendors.length ? html`<b>${vendors.length}</b>` : ''}
        <span class="arrow" aria-hidden="true">→</span>
      </button>
    </div>`);
  bindSwitchButtons();

  const grid = $('#vendor-grid');
  if (!list.length) {
    render(grid, html`<div class="empty">Không có mẫu váy phù hợp với bộ lọc đang chọn.</div>`);
    return;
  }
  render(grid, list.map((dress) => {
    const planItemName = `Váy cưới ${dress.name} (${dress.vendor?.name ?? ''})`;
    const pinned = isPinned(planItemName);
    const compared = isCompared(`dress:${dress.id}`);
    return html`
      <article class="card item-card">
        ${dressThumbButton(dress)}
        <div class="body">
          <div class="row">
            ${isHotDress(dress) ? badge('🔥 Hot', 'red') : ''}
            ${badge(DRESS_THEME[dress.theme] ?? dress.theme, 'gold')}
            ${dress.type === 'bespoke' ? badge('May đo', 'purple') : badge('Thuê sẵn')}
            ${budgetMatchBadge('bridal', dress.price)}
          </div>
          <h3>${dress.name}</h3>
          <a class="muted small ellipsis" href="vendor.html?slug=${dress.vendor.slug}">
            🏪 ${dress.vendor.name}${dress.vendor.is_verified ? html` <b class="verified" title="Đối tác Tích Xanh">✓</b>` : ''}${dress.vendor.district ? ` · ${dress.vendor.district}` : ''}
          </a>
          <div>${priceTag(dress)}</div>
          <div class="row card-action-row" style="margin-top:auto;padding-top:6px">
            <a class="btn btn-primary btn-sm" style="flex:1" href="tryon.html?dress=${dress.slug}">✨ Thử váy AI</a>
            <button type="button" class="btn btn-sm ${pinned ? 'btn-pinned' : 'btn-outline'}"
                    data-pin-category="bridal"
                    data-pin-cat-title="Váy cưới &amp; Áo dài"
                    data-pin-name="${planItemName}"
                    data-pin-price="${dress.price}"
                    title="Đưa mẫu váy này vào dự kiến Ngân sách trong Kế hoạch cưới">
              ${pinned ? '✓ Đã ghim' : '+ Ngân sách'}
            </button>
            <button type="button" class="btn btn-sm btn-compare-icon ${compared ? 'active' : ''}"
                    data-compare-id="dress:${dress.id}"
                    data-compare-type="Mẫu váy cưới (${DRESS_THEME[dress.theme] ?? dress.theme})"
                    data-compare-title="${dress.name}"
                    data-compare-vendor="${dress.vendor?.name ?? ''}"
                    data-compare-district="${dress.vendor?.district ?? ''}"
                    data-compare-verified="${dress.vendor?.is_verified ? '1' : ''}"
                    data-compare-rating="${dress.vendor?.rating ?? ''}"
                    data-compare-price="${dress.price}"
                    data-compare-orig="${dress.original_price ?? 0}"
                    data-compare-cat="bridal"
                    data-compare-thumb="${dress.image_url || ''}"
                    data-compare-note="${dress.type === 'bespoke' ? 'May đo thiết kế riêng' : 'Thuê sẵn tại tiệm'}"
                    data-compare-url="${new URL(`tryon.html?dress=${dress.slug}`, location.href).href}"
                    title="Thêm vào khay so sánh báo giá">
              ⚖
            </button>
          </div>
        </div>
      </article>`;
  }));
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
  render($('#result-count'), html`
    <span class="result-count-text">Hiển thị <strong>${list.length}</strong> gói dịch vụ trọn gói · giữ cọc an toàn 3 đợt qua Trạm Hỷ</span>
    <div class="result-switch">
      <button type="button" class="result-switch-pill" data-switch-view="dresses">
        <span>Xem Mẫu váy cưới</span>
        ${dresses.length ? html`<b>${dresses.length}</b>` : ''}
        <span class="arrow" aria-hidden="true">→</span>
      </button>
      <button type="button" class="result-switch-pill" data-switch-view="vendors">
        <span>Xem Đối tác</span>
        ${vendors.length ? html`<b>${vendors.length}</b>` : ''}
        <span class="arrow" aria-hidden="true">→</span>
      </button>
    </div>`);
  bindSwitchButtons();

  const grid = $('#vendor-grid');
  if (!list.length) {
    render(grid, html`<div class="empty">Không có gói dịch vụ phù hợp với bộ lọc đang chọn.</div>`);
    return;
  }
  render(grid, list.map((pkg) => {
    const isVenue = pkg.vendor?.category === 'venue';
    const estPrice = comparablePkgPrice(pkg);
    const icon = CATEGORY_ICON[pkg.vendor?.category] || '✨';
    const planItemName = `${pkg.name} (${pkg.vendor?.name ?? ''})`;
    const pinned = isPinned(planItemName);
    const compared = isCompared(`pkg:${pkg.id}`);
    return html`
      <article class="card item-card">
        ${packageThumbButton(pkg, icon)}
        <div class="body">
          <div class="row">
            ${badge(VENDOR_CATEGORY[pkg.vendor?.category] ?? 'Dịch vụ', 'gold')}
            ${pkg.vendor?.is_verified ? badge('✓ Tích Xanh', 'blue') : ''}
            ${budgetMatchBadge(pkg.vendor?.category, estPrice)}
          </div>
          <h3>${pkg.name}</h3>
          <a class="muted small ellipsis" href="vendor.html?slug=${pkg.vendor?.slug}">
            🏪 ${pkg.vendor?.name}${pkg.vendor?.district ? ` · ${pkg.vendor.district}` : ''}
          </a>
          ${pkg.description ? html`<p class="muted small package-desc" style="margin:0">${pkg.description}</p>` : ''}
          <div>${packagePrice(pkg, isVenue)}</div>
          <div class="row card-action-row" style="margin-top:auto;padding-top:6px">
            <button class="btn btn-primary btn-sm" type="button" style="flex:1" data-book-pkg="${pkg.id}">Đặt gói này</button>
            <button type="button" class="btn btn-sm ${pinned ? 'btn-pinned' : 'btn-outline'}"
                    data-pin-category="${pkg.vendor?.category ?? ''}"
                    data-pin-cat-title="${VENDOR_CATEGORY[pkg.vendor?.category] ?? 'Dịch vụ cưới'}"
                    data-pin-name="${planItemName}"
                    data-pin-price="${estPrice}"
                    title="Đưa gói này vào dự kiến Ngân sách trong Kế hoạch cưới">
              ${pinned ? '✓ Đã ghim' : '+ Ngân sách'}
            </button>
            <button type="button" class="btn btn-sm btn-compare-icon ${compared ? 'active' : ''}"
                    data-compare-id="pkg:${pkg.id}"
                    data-compare-type="Gói ${VENDOR_CATEGORY[pkg.vendor?.category] ?? 'Dịch vụ'}"
                    data-compare-title="${pkg.name}"
                    data-compare-vendor="${pkg.vendor?.name ?? ''}"
                    data-compare-district="${pkg.vendor?.district ?? ''}"
                    data-compare-verified="${pkg.vendor?.is_verified ? '1' : ''}"
                    data-compare-rating="${pkg.vendor?.rating ?? ''}"
                    data-compare-price="${estPrice}"
                    data-compare-orig="${pkg.original_price ? (isVenue ? pkg.original_price * TYPICAL_TABLES : pkg.original_price) : 0}"
                    data-compare-cat="${pkg.vendor?.category ?? ''}"
                    data-compare-thumb="${pkg.image_url || ''}"
                    data-compare-note="${pkg.description ?? ''}"
                    data-compare-url="${new URL(`vendor.html?slug=${pkg.vendor?.slug ?? ''}`, location.href).href}"
                    title="Thêm vào khay so sánh báo giá">
              ⚖
            </button>
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

// ---------- 4. GHIM VÀO NGÂN SÁCH KẾ HOẠCH & SO SÁNH BÁO GIÁ ----------
function bindCardActions() {
  const grid = $('#vendor-grid');
  grid.querySelectorAll('[data-pin-name]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!currentUser) {
        toast('Bạn đăng nhập để lưu mục này vào Ngân sách Kế hoạch cưới nhé!');
        location.href = loginUrl(`marketplace.html${location.search}`);
        return;
      }
      await withBusy(btn, async () => {
        try {
          const itemName = btn.dataset.pinName;
          const price = Number(btn.dataset.pinPrice) || 0;
          const res = await addServiceToPlanBudget(currentUser.id, {
            vendorCategory: btn.dataset.pinCategory || null,
            categoryTitle: btn.dataset.pinCatTitle || 'Dịch vụ cưới',
            itemName,
            price,
          });
          await loadUserPlanBudget(currentUser.id);
          renderPlanSyncBar();
          renderResults();
          toast(
            res.updated
              ? `Đã cập nhật giá dự kiến "${itemName}" (${money(price)}) trong Kế hoạch cưới!`
              : `Đã thêm "${itemName}" (${money(price)}) vào Ngân sách Kế hoạch cưới!`,
            'success',
          );
        } catch (error) {
          toastError(error);
        }
      });
    });
  });

  grid.querySelectorAll('[data-compare-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.compareId;
      const idx = compareList.findIndex((x) => x.id === id);
      if (idx >= 0) {
        compareList.splice(idx, 1);
      } else {
        if (compareList.length >= 3) {
          toast('Khay so sánh tối đa 3 dịch vụ cùng lúc – hãy bỏ bớt 1 mục nhé.');
          return;
        }
        compareList.push({
          id,
          typeLabel: btn.dataset.compareType,
          title: btn.dataset.compareTitle,
          vendorName: btn.dataset.compareVendor,
          district: btn.dataset.compareDistrict,
          verified: btn.dataset.compareVerified === '1',
          rating: btn.dataset.compareRating,
          price: Number(btn.dataset.comparePrice) || 0,
          originalPrice: Number(btn.dataset.compareOrig) || 0,
          category: btn.dataset.compareCat,
          thumb: btn.dataset.compareThumb,
          note: btn.dataset.compareNote,
          url: btn.dataset.compareUrl,
        });
      }
      renderResults();
    });
  });
}

function renderCompareTray() {
  const tray = $('#compare-tray');
  if (!tray) return;
  if (!compareList.length) {
    tray.hidden = true;
    return;
  }
  tray.hidden = false;
  render(tray, html`
    <div class="compare-tray-items">
      ${compareList.map((it) => html`
        <div class="compare-pill">
          ${it.thumb ? html`<img src="${sizedImage(it.thumb, 120)}" alt="">` : ''}
          <div class="compare-pill-info">
            <strong class="ellipsis">${it.title}</strong>
            <span class="small muted">${money(it.price)}</span>
          </div>
          <button type="button" class="compare-remove" data-remove-compare="${it.id}" aria-label="Bỏ khỏi so sánh">✕</button>
        </div>`)}
    </div>
    <div class="compare-tray-actions">
      <button type="button" class="btn btn-primary btn-sm" data-open-compare>⚖ So sánh chi tiết (${compareList.length}/3)</button>
      <button type="button" class="btn btn-outline btn-sm" data-export-compare>⬇ Xuất Excel báo giá</button>
      <button type="button" class="btn btn-link btn-sm" data-clear-compare>Xóa</button>
    </div>`);

  tray.querySelectorAll('[data-remove-compare]').forEach((b) => b.addEventListener('click', () => {
    compareList = compareList.filter((x) => x.id !== b.dataset.removeCompare);
    renderResults();
  }));
  tray.querySelector('[data-clear-compare]').addEventListener('click', () => {
    compareList = [];
    renderResults();
  });
  tray.querySelector('[data-export-compare]').addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
    try {
      await exportCompareExcel(compareList);
      toast('Đã tải file Excel bảng so sánh báo giá.', 'success');
    } catch (error) {
      toastError(error);
    }
  }));
  tray.querySelector('[data-open-compare]').addEventListener('click', openCompareModal);
}

async function openCompareModal() {
  await openDialog({
    title: `⚖ So sánh dịch vụ & báo giá (${compareList.length} mục)`,
    confirmText: '⬇ Xuất Excel bảng so sánh',
    cancelText: 'Đóng',
    content: html`
      <div class="table-wrap compare-table-wrap">
        <table class="compare-table">
          <thead>
            <tr>
              <th>Tiêu chí</th>
              ${compareList.map((it) => html`<th>${it.title}</th>`)}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Phân loại</strong></td>
              ${compareList.map((it) => html`<td>${badge(it.typeLabel, 'gold')}</td>`)}
            </tr>
            <tr>
              <td><strong>Đối tác &amp; Khu vực</strong></td>
              ${compareList.map((it) => html`<td><strong>${it.vendorName}</strong>${it.district ? html`<div class="small muted">📍 ${it.district}</div>` : ''}</td>`)}
            </tr>
            <tr>
              <td><strong>Bảo chứng &amp; Đánh giá</strong></td>
              ${compareList.map((it) => html`<td>
                ${it.verified ? badge('✓ Tích Xanh', 'blue') : badge('Đối tác')}
                ${it.rating ? html` <span class="small"><span class="stars">★</span> <b>${it.rating}</b></span>` : ''}
              </td>`)}
            </tr>
            <tr>
              <td><strong>Mức giá dự kiến</strong></td>
              ${compareList.map((it) => html`<td>
                <strong class="price">${money(it.price)}</strong>
                ${it.originalPrice > it.price ? html`<div class="small muted"><s>${money(it.originalPrice)}</s></div>` : ''}
              </td>`)}
            </tr>
            <tr>
              <td><strong>So với Kế hoạch cưới</strong></td>
              ${compareList.map((it) => {
                const b = categoryBudgets[it.category];
                if (!b) return html`<td class="small muted">Chưa đặt ngân sách mục này</td>`;
                const diff = b - it.price;
                return html`<td>${diff >= 0
                  ? html`<span class="badge badge-green">✓ Trong ngân sách (dư ${money(diff)})</span>`
                  : html`<span class="badge badge-red">Vượt dự kiến ${money(Math.abs(diff))}</span>`}</td>`;
              })}
            </tr>
            <tr>
              <td><strong>Ghi chú</strong></td>
              ${compareList.map((it) => html`<td class="small muted">${it.note || '—'}</td>`)}
            </tr>
            <tr>
              <td><strong>Hành động</strong></td>
              ${compareList.map((it) => html`<td><a class="btn btn-outline btn-sm" href="${it.url}">Xem chi tiết →</a></td>`)}
            </tr>
          </tbody>
        </table>
      </div>`,
    onConfirm: async () => {
      await exportCompareExcel(compareList);
      toast('Đã tải file Excel bảng so sánh báo giá.', 'success');
      return true;
    },
  });
}
