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
// Trái: người dùng nhập. Phải: bảng chia (tỷ lệ cố định hoặc AI) + trò chuyện với AI để điều chỉnh.

const CHAT_LIMIT = 15;   // số câu hỏi mỗi lần mở trang – giữ lượt miễn phí của Gemini
const AI_FALLBACK_NOTE = {
  'not-configured': 'AI tư vấn chưa được bật – đang hiển thị cách chia theo tỷ lệ phổ biến.',
  busy: 'AI đang quá tải, đang hiển thị cách chia theo tỷ lệ phổ biến. Thử lại sau ít phút nhé.',
  error: 'Chưa kết nối được AI, đang hiển thị cách chia theo tỷ lệ phổ biến.',
};

const budget = {
  plan: null,          // bảng chia đang hiển thị: [{ category, label, amount, percent, reason? }]
  extra: {},           // { ai, tips, warning, note }
  history: [],         // [{ role: 'user' | 'ai', text }] gửi kèm để AI nhớ ngữ cảnh
  asked: 0,
};

// Ngân sách cưới: 10 triệu → 10 tỷ. Nhập sai thì báo lỗi dưới ô và ẩn kết quả cũ.
const budgetInput = bindMoneyInput($('#budget-input'), {
  errorEl: $('#budget-error'),
  min: 10_000_000,
  onChange: (value) => { if (!value) showPlan(null); },
});

function fixedSplit(total) {
  return BUDGET_SPLIT.map((item) => ({ ...item, amount: Math.round(total * item.percent / 100) }));
}

/** Thông tin đám cưới ở cột trái; null nếu nhập sai (đã báo lỗi) */
function readWedding() {
  const total = budgetInput.check();
  if (!total) return null;
  const guests = Number($('#ai-guests').value);
  if ($('#ai-guests').value && (!Number.isInteger(guests) || guests < 10 || guests > 3000)) {
    toastError(new Error('Số khách mời từ 10 đến 3.000'));
    return null;
  }
  return {
    total,
    guests: guests || undefined,
    city: $('#ai-city').value,
    priorities: $$('#ai-priorities .chip.active').map((c) => c.textContent.trim()),
    note: $('#ai-note').value.trim(),
  };
}

function showPlan(plan, extra = {}) {
  budget.plan = plan;
  budget.extra = extra;
  render($('#budget-source'), plan
    ? (extra.ai ? html`<span class="badge badge-purple">✨ Gợi ý bởi AI</span>` : html`<span class="badge">Tỷ lệ phổ biến</span>`)
    : '');
  if (!plan) {
    render($('#budget-result'), '');
    return;
  }
  render($('#budget-result'), html`
    ${extra.note ? html`<p class="small muted" style="margin:0">${extra.note}</p>` : ''}
    ${extra.warning ? html`<div class="notice notice-error small">${extra.warning}</div>` : ''}
    ${plan.map((item) => html`
      <div class="budget-item">
        <div class="row">
          <span class="budget-label">${item.label}</span>
          <strong>${money(item.amount)}</strong>
          <span class="muted small">(${item.percent}%)</span>
          <span class="spacer"></span>
          ${item.category !== 'other'
            ? html`<a class="small" href="marketplace.html?category=${item.category}&max=${item.amount}">Tìm đối tác →</a>`
            : ''}
        </div>
        <div class="budget-bar"><span style="width:${Math.min(100, item.percent)}%"></span></div>
        ${item.reason ? html`<div class="small muted">${item.reason}</div>` : ''}
      </div>`)}
    ${extra.tips?.length ? html`
      <div class="notice small"><strong>Mẹo cho bạn</strong>
        <ul style="margin:4px 0 0;padding-left:18px">${extra.tips.map((t) => html`<li>${t}</li>`)}</ul></div>` : ''}`);
}

function resetChat() {
  budget.history = [];
  $$('#chat-log .msg').slice(1).forEach((m) => m.remove());   // giữ câu chào
}

function addMessage(role, text) {
  const el = document.createElement('div');
  el.className = `msg ${role}`;
  el.textContent = text;
  $('#chat-log').append(el);
  $('#chat-log').scrollTop = $('#chat-log').scrollHeight;
  return el;
}

function updateChatRemaining() {
  $('#chat-remaining').textContent = `Còn ${CHAT_LIMIT - budget.asked}/${CHAT_LIMIT} câu hỏi`;
}

// Chia nhanh theo tỷ lệ cố định – tức thì, không cần AI
$('#quick-split-btn').addEventListener('click', () => {
  const total = budgetInput.check();
  if (!total) return;
  resetChat();
  showPlan(fixedSplit(total));
});

// AI tư vấn theo số khách / thành phố / ưu tiên (Enter trong form cũng chạy cái này)
$('#budget-form').addEventListener('submit', (e) => {
  e.preventDefault();
  withBusy($('#ai-budget-btn'), async () => {
    const wedding = readWedding();
    if (!wedding) return;
    render($('#budget-result'), html`<div class="muted">✨ AI đang tính toán cho đám cưới của bạn…</div>`);
    resetChat();
    try {
      const result = await adviseBudget(wedding);
      if (result.fallback) {
        showPlan(fixedSplit(wedding.total), { note: AI_FALLBACK_NOTE[result.reason] ?? AI_FALLBACK_NOTE.error });
      } else {
        showPlan(result.allocations, { ai: true, tips: result.tips, warning: result.warning });
      }
    } catch (error) {
      toastError(error);
      showPlan(fixedSplit(wedding.total));
    }
  });
});

$$('#ai-priorities .chip').forEach((chip) => {
  chip.addEventListener('click', () => chip.classList.toggle('active'));
});

// Trò chuyện: gửi câu hỏi + bảng chia hiện tại + lịch sử; AI có thể trả bảng chia mới
async function ask(question) {
  question = question.trim();
  if (!question) return;
  if (budget.asked >= CHAT_LIMIT) {
    toastError(new Error('Bạn đã hỏi đủ lượt cho lần này – tải lại trang để hỏi tiếp nhé'));
    return;
  }
  const wedding = readWedding();
  if (!wedding) return;
  if (!budget.plan) showPlan(fixedSplit(wedding.total));

  addMessage('user', question);
  $('#chat-input').value = '';
  const typing = addMessage('ai typing', 'AI đang trả lời…');
  try {
    const result = await adviseBudget({
      ...wedding,
      question,
      plan: budget.plan.map(({ category, percent }) => ({ category, percent })),
      history: budget.history,
    });
    typing.remove();
    if (result.fallback) {
      addMessage('ai', result.reason === 'busy'
        ? 'AI đang quá tải, bạn thử hỏi lại sau ít phút nhé.'
        : 'Mình chưa kết nối được AI, bạn thử lại sau nhé.');
      return;
    }
    budget.asked += 1;
    updateChatRemaining();
    budget.history.push({ role: 'user', text: question }, { role: 'ai', text: result.reply });
    addMessage('ai', result.allocations ? `${result.reply}\n\n→ Đã cập nhật bảng chia ở trên.` : result.reply);
    if (result.allocations) {
      showPlan(result.allocations, { ai: true, tips: budget.extra.tips, note: 'Đã điều chỉnh theo trao đổi của bạn.' });
    }
  } catch (error) {
    typing.remove();
    toastError(error);
  }
}

$('#chat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  withBusy($('#chat-form button'), () => ask($('#chat-input').value));
});
$$('#chat-suggest .chip').forEach((chip) => {
  chip.addEventListener('click', () => withBusy(chip, () => ask(chip.textContent)));
});

$$('#ai-budget-btn, #quick-split-btn, #chat-form [type=submit]').forEach((b) => { b.disabled = false; });   // xử lý đã gắn → mở nút
// Mở trang: hiện ngay cách chia theo tỷ lệ phổ biến
updateChatRemaining();
showPlan(fixedSplit(budgetInput.check()));
