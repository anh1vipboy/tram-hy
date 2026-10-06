import { initLayout } from '../core/layout.js';
import { $, $$, html, render, money } from '../core/utils.js';
import { badge, DRESS_THEME, VENDOR_CATEGORY } from '../core/labels.js';
import { toastError, withBusy } from '../core/ui.js';
import { listDresses, listVendors } from '../services/catalog.js';
import { dressThumbButton, bindDressGalleries } from '../components/dress-gallery.js';
import { bindMoneyInput } from '../components/money-input.js';
import { adviseBudget } from '../services/budget-ai.js';

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
// Ngân sách cưới: 10 triệu → 10 tỷ. Nhập sai thì báo lỗi dưới ô và ẩn kết quả cũ.
const budgetInput = bindMoneyInput($('#budget-input'), {
  errorEl: $('#budget-error'),
  min: 10_000_000,
  onChange: (value) => { if (!value) renderBudget(null); },   // đang nhập sai thì ẩn kết quả cũ
});
$('#budget-form').addEventListener('submit', (e) => {
  e.preventDefault();
  renderBudget(budgetInput.check());
});
renderBudget(budgetInput.check());

async function loadFeaturedDresses() {
  const container = $('#featured-dresses');
  try {
    const dresses = await listDresses({ limit: 4 });
    render(container, dresses.map((dress) => html`
      <article class="card item-card">
        ${dressThumbButton(dress)}
        <div class="body">
          <div class="row">${badge(DRESS_THEME[dress.theme] ?? dress.theme, 'gold')}
            ${dress.type === 'bespoke' ? badge('May đo', 'purple') : badge('Thuê sẵn')}</div>
          <h3>${dress.name}</h3>
          <div class="muted small">${dress.vendor.name}</div>
          <div class="price">${money(dress.price)}</div>
          <a class="btn btn-primary btn-sm" href="tryon.html?dress=${dress.slug}">Thử váy này</a>
        </div>
      </article>`));
    bindDressGalleries(container, dresses);
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


// ---------- CHIA NGÂN SÁCH ----------
// Chia nhanh theo tỷ lệ cố định (tức thì), hoặc nhờ AI tư vấn theo số khách / thành phố / ưu tiên.

function fixedSplit(total) {
  return BUDGET_SPLIT.map((item) => ({ ...item, amount: Math.round(total * item.percent / 100) }));
}

function renderBudget(total) {
  renderAllocations(total ? fixedSplit(total) : null);
}

/** allocations: [{ category, label, amount, percent, reason? }] · extra: { ai, tips, warning, note } */
function renderAllocations(allocations, extra = {}) {
  if (!allocations) {
    render($('#budget-result'), '');
    return;
  }
  render($('#budget-result'), html`
    ${extra.ai ? html`<div class="badge badge-purple" style="width:fit-content">✨ Gợi ý bởi AI theo đám cưới của bạn</div>` : ''}
    ${extra.note ? html`<p class="small muted" style="margin:0">${extra.note}</p>` : ''}
    ${extra.warning ? html`<div class="notice notice-error small">${extra.warning}</div>` : ''}
    ${allocations.map((item) => html`
      <div class="stack" style="gap:2px">
        <div class="row">
          <span style="width:150px">${item.label}</span>
          <strong>${money(item.amount)}</strong>
          <span class="muted small">(${item.percent}%)</span>
          <span class="spacer"></span>
          ${item.category !== 'other'
            ? html`<a class="small" href="marketplace.html?category=${item.category}&max=${item.amount}">Tìm đối tác →</a>`
            : ''}
        </div>
        ${item.reason ? html`<div class="small muted">${item.reason}</div>` : ''}
      </div>`)}
    ${extra.tips?.length ? html`
      <div class="notice small"><strong>Mẹo cho bạn</strong>
        <ul style="margin:4px 0 0;padding-left:18px">${extra.tips.map((t) => html`<li>${t}</li>`)}</ul></div>` : ''}`);
}

const AI_FALLBACK_NOTE = {
  'not-configured': 'AI tư vấn chưa được bật – đang hiển thị cách chia theo tỷ lệ phổ biến.',
  busy: 'AI đang quá tải, đang hiển thị cách chia theo tỷ lệ phổ biến. Thử lại sau ít phút nhé.',
  error: 'Chưa kết nối được AI, đang hiển thị cách chia theo tỷ lệ phổ biến.',
};

$$('#ai-priorities .chip').forEach((chip) => {
  chip.addEventListener('click', () => chip.classList.toggle('active'));
});

$('#ai-budget-btn').addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
  const total = budgetInput.check();
  if (!total) return;
  const guests = Number($('#ai-guests').value);
  if ($('#ai-guests').value && (!Number.isInteger(guests) || guests < 10 || guests > 3000)) {
    toastError(new Error('Số khách mời từ 10 đến 3.000'));
    return;
  }

  render($('#budget-result'), html`<div class="muted">✨ AI đang tính toán cho đám cưới của bạn…</div>`);
  try {
    const result = await adviseBudget({
      total,
      guests: guests || undefined,
      city: $('#ai-city').value,
      priorities: $$('#ai-priorities .chip.active').map((c) => c.textContent.trim()),
      note: $('#ai-note').value.trim(),
    });
    if (result.fallback) {
      renderAllocations(fixedSplit(total), { note: AI_FALLBACK_NOTE[result.reason] ?? AI_FALLBACK_NOTE.error });
    } else {
      renderAllocations(result.allocations, { ai: true, tips: result.tips, warning: result.warning });
    }
  } catch (error) {
    toastError(error);
    renderBudget(total);
  }
}));
