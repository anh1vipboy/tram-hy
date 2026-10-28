// Thiết kế váy may đo (Trạm Hỷ Atelier): chọn phom, cổ, tay, vải, đuôi, điểm nhấn; ảnh minh họa theo phom
// trên người mẫu; độ tôn dáng theo số đo → khách chọn NGÂN SÁCH MONG MUỐN → đặt lịch tư vấn, giữ cọc 3 đợt 30/40/30.
// Không hiện giá theo từng lựa chọn: váy may đo không định giá cố định theo chi tiết được – Atelier tư vấn thiết kế
// vừa ngân sách và chốt giá sau buổi tư vấn. Ngân sách (giữa khoảng nếu chọn khoảng) là giá tạm tính của đơn.
// Ướm váy bằng AI lên ảnh thật nằm ở Phòng thử (tryon.html) – "Đặt may theo mẫu này" ở đó dẫn về đây (?tu=anh-vay).
import { initLayout } from '../core/layout.js';
import { $, $$, html, render, money, param, debounce, sleep } from '../core/utils.js';
import { DRESS_THEME } from '../core/labels.js';
import { toast, toastError } from '../core/ui.js';
import { BESPOKE_VENDOR_SLUG } from '../config.js';
import { getVendorBySlug } from '../services/catalog.js';
import { getBodyProfile, saveBodyProfile } from '../services/profile.js';
import { openBookingDialog } from '../components/booking-dialog.js';
import { parseMoney } from '../components/money-input.js';
import {
  MODELS, BODY_SHAPES, BESPOKE_OPTIONS, BESPOKE_EXTRAS,
  BESPOKE_BUDGETS, BESPOKE_BUDGET_MIN, BESPOKE_BUDGET_MAX, clampBudget,
  renderImageFor, fitScore, bmiInfo, bespokeTheme, bespokeLabel,
} from '../data/tryon-data.js';

// ---------- TRẠNG THÁI TRANG ----------
const state = {
  profile: null,
  vendor: null,                 // tiệm may đo của Trạm Hỷ (nhận đơn)
  model: MODELS[0],             // người mẫu mặc thử ảnh minh họa
  body: { height: 160, weight: 49, heel: 7, shape: 'hourglass' },
  design: { silhouette: 'aline', neckline: 'sweetheart', sleeve: 'none', fabric: 'mikado', train: 1, extras: [] },
  // Ngân sách khách chọn: { key } = một khoảng có sẵn, { amount } = số tiền cụ thể, null = chưa chọn.
  // Không chọn sẵn: Atelier cần biết đúng mức khách mong muốn, không phải mức mặc định của trang.
  budget: null,
  budgetError: '',
};

// 3 đợt giữ cọc của đơn may đo – cùng tỉ lệ / thứ tự với create_booking (SQL 30)
const STEPS = [
  { percent: 30, title: 'Duyệt phác thảo & mẫu vải' },
  { percent: 40, title: 'Thử rập mộc' },
  { percent: 30, title: 'Nhận váy hoàn thiện' },
];

// Đến từ Phòng thử ("Đặt may theo mẫu này") → ghi chú sẵn để thợ may xem ảnh váy khi tư vấn
const FROM_TRYON_NOTE = 'May theo ảnh váy mẫu tôi đã ướm thử bằng AI trên Trạm Hỷ (sẽ gửi ảnh khi tư vấn).';

// ---------- TẢI DỮ LIỆU ----------
async function loadVendor() {
  try {
    state.vendor = await getVendorBySlug(BESPOKE_VENDOR_SLUG);
  } catch (error) {
    toastError(error);
  }
}

async function loadBodyProfile() {
  if (!state.profile) {
    $('#body-save-note').textContent = 'Đăng nhập để lưu số đo cho lần sau.';
    return;
  }
  try {
    const saved = await getBodyProfile(state.profile.id);
    if (saved) {
      state.body = { height: saved.height_cm, weight: saved.weight_kg, heel: saved.heel_cm, shape: saved.body_shape || 'hourglass' };
    }
    $('#body-save-note').textContent = 'Số đo được tự lưu vào tài khoản của bạn.';
  } catch (error) {
    toastError(error);
  }
}

const persistBody = debounce(async () => {
  if (!state.profile) return;
  try {
    await saveBodyProfile(state.profile.id, state.body);
  } catch (error) {
    toastError(error);
  }
}, 800);

// ---------- NGÂN SÁCH ----------
const millions = (n) => `${(n / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} triệu`;

/**
 * Đọc ô số tiền (ô có data-money nên tự thêm dấu chấm khi gõ, giống các ô tiền khác của Trạm Hỷ).
 * Trên điện thoại gõ "15" nhanh hơn "15.000.000" → số ≤ 100 hiểu là triệu đồng. Trả về số đồng, null khi ô trống.
 */
function parseBudget(text) {
  const value = parseMoney(text);
  return value !== null && value <= 100 ? value * 1e6 : value;
}

const budgetErrorFor = (amount) => (amount < BESPOKE_BUDGET_MIN || amount > BESPOKE_BUDGET_MAX
  ? `Váy may đo nhận ngân sách từ ${millions(BESPOKE_BUDGET_MIN)} đến ${millions(BESPOKE_BUDGET_MAX)} – bạn chỉnh lại nhé.`
  : '');

/** Ngân sách đang chọn → { label, min, max, estimate, isRange } hoặc null (chưa chọn / số tiền chưa hợp lệ) */
function budgetChoice() {
  const { budget, budgetError } = state;
  if (!budget || budgetError) return null;
  if (budget.key) {
    const range = BESPOKE_BUDGETS.find((r) => r.key === budget.key);
    return { label: range.label, min: range.min, max: range.max, estimate: clampBudget(range.estimate), isRange: true };
  }
  return { label: money(budget.amount), min: budget.amount, max: budget.amount, estimate: clampBudget(budget.amount), isRange: false };
}

function chooseRange(key) {
  state.budget = { key };
  state.budgetError = '';
  $('#budget-amount').value = '';
  $('#budget-range').value = BESPOKE_BUDGETS.find((r) => r.key === key).estimate;
  renderBudget();
  renderSummary();
}

function initBudget() {
  const input = $('#budget-amount');
  const slider = $('#budget-range');

  // Gõ tới đâu cập nhật tới đó; rời ô thì đổi cách gõ nhanh "15" thành 15.000.000 cho rõ
  input.addEventListener('input', () => {
    const amount = parseBudget(input.value);
    if (amount === null) {
      state.budget = null;
      state.budgetError = '';
    } else {
      state.budget = { amount };
      state.budgetError = budgetErrorFor(amount);
      if (!state.budgetError) slider.value = amount;
    }
    renderBudget();
    renderSummary();
  });
  input.addEventListener('change', () => {
    if (state.budget?.amount && !state.budgetError) input.value = state.budget.amount.toLocaleString('vi-VN');
  });

  // Kéo thanh trượt = chọn số tiền cụ thể (bước 500 nghìn)
  slider.addEventListener('input', () => {
    const amount = Number(slider.value);
    state.budget = { amount };
    state.budgetError = '';
    input.value = amount.toLocaleString('vi-VN');
    renderBudget();
    renderSummary();
  });
}

function renderBudget() {
  const active = state.budget?.key;
  render($('#budget-options'), BESPOKE_BUDGETS.map((r) => html`
    <button class="budget-option ${r.key === active ? 'active' : ''}" type="button" data-budget="${r.key}"
            aria-pressed="${r.key === active}">
      ${r.popular ? html`<span class="budget-badge">Phổ biến</span>` : ''}
      <strong>${r.label}</strong>
      <span>${r.hint}</span>
    </button>`));
  for (const btn of $$('[data-budget]')) btn.addEventListener('click', () => chooseRange(btn.dataset.budget));

  const exact = state.budget?.amount !== undefined;
  $('.budget-exact').classList.toggle('active', exact && !state.budgetError);
  $('#budget-amount').setAttribute('aria-invalid', String(Boolean(state.budgetError)));
  const hint = $('#budget-hint');
  hint.className = state.budgetError ? 'field-error' : 'small muted';
  if (state.budgetError) hint.textContent = state.budgetError;
  else if (exact) hint.textContent = `Ngân sách của bạn: ${money(state.budget.amount)} (≈ ${millions(state.budget.amount)}).`;
  else hint.textContent = 'Gõ nhanh: "15" = 15 triệu đồng.';
}

const goToBudget = () => {
  $('#budget-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
  $(state.budgetError ? '#budget-amount' : '[data-budget]').focus({ preventScroll: true });
};

// Bấm đặt lịch khi chưa chọn ngân sách → đưa khách tới đúng chỗ cần chọn, nháy viền để dễ thấy
function nudgeBudget() {
  const card = $('#budget-card');
  card.classList.remove('nudge');
  void card.offsetWidth;                       // chạy lại hiệu ứng nếu bấm nhiều lần
  card.classList.add('nudge');
  toast(state.budgetError || 'Chọn ngân sách mong muốn trước nhé – Atelier sẽ tư vấn thiết kế vừa mức này.', 'error');
  goToBudget();
}

// ---------- SỰ KIỆN ----------
function initControls() {
  for (const [id, key] of [['#height', 'height'], ['#weight', 'weight']]) {
    $(id).addEventListener('input', (e) => {
      state.body[key] = Number(e.target.value);
      renderBody();
      renderFit();
      persistBody();
    });
  }
  $('#heel').addEventListener('change', (e) => {
    state.body.heel = Number(e.target.value);
    renderFit();
    persistBody();
  });
  $('#train').addEventListener('input', (e) => {
    state.design.train = Number(e.target.value);
    renderDesign();
    renderSummary();
  });
  $('#bespoke-notes').addEventListener('input', debounce(renderSummary, 300));
  $('#book-btn').addEventListener('click', book);
  $('#cta-book').addEventListener('click', book);
  initBudget();
}

// Hiệu ứng dựng phom ngắn rồi hiện ảnh minh họa mới
async function redraw() {
  renderAll();
  const scan = $('#mirror-scan');
  scan.hidden = false;
  await sleep(900);
  scan.hidden = true;
}

// ---------- ĐẶT LỊCH ----------
const extraLabels = () => BESPOKE_EXTRAS.filter((x) => state.design.extras.includes(x.key)).map((x) => x.label);

function selection() {
  const notes = $('#bespoke-notes').value.trim();
  const budget = budgetChoice();
  return {
    title: `Váy may đo: ${bespokeLabel('silhouette', state.design.silhouette)}, ${bespokeLabel('fabric', state.design.fabric)}`,
    vendorName: state.vendor?.name ?? 'Trạm Hỷ Atelier',
    vendorId: state.vendor?.id,
    budget,
    // Giá đơn = ngân sách khách mong muốn (giữa khoảng), kẹp 5–50 triệu như create_booking → chia 3 đợt 30/40/30
    price: budget?.estimate,
    customPrice: budget?.estimate,
    // Hộp thoại đặt lịch ghi rõ đây là ngân sách dự kiến, không phải giá chốt
    priceLabel: 'Ngân sách dự kiến',
    priceText: budget?.label,
    priceNote: budget && (budget.isRange
      ? `Các đợt cọc tạm tính theo ${money(budget.estimate)} (giữa khoảng bạn chọn). Giá chính thức chốt cùng Atelier sau buổi tư vấn.`
      : 'Các đợt cọc tạm tính theo ngân sách này. Giá chính thức chốt cùng Atelier sau buổi tư vấn.'),
    type: notes ? 'bespoke_prompt' : 'bespoke_manual',
    details: {
      body: state.body,
      design: {
        ...Object.fromEntries(Object.keys(BESPOKE_OPTIONS).map((g) => [g, bespokeLabel(g, state.design[g])])),
        train_m: state.design.train,
        extras: extraLabels(),
        notes,
        // Atelier xem mức khách mong muốn để tư vấn thiết kế vừa túi tiền
        budget: budget?.label,
        budget_min: budget?.min,
        budget_max: budget?.max,
      },
    },
  };
}

function book() {
  const booking = selection();
  if (!booking.vendorId) {
    toastError(new Error('Chưa tải xong thông tin tiệm may, vui lòng thử lại'));
    return;
  }
  if (!booking.budget) {
    nudgeBudget();
    return;
  }
  openBookingDialog(booking, 'thiet-ke-vay.html').catch(toastError);
}

// ---------- VẼ GIAO DIỆN ----------
function renderAll() {
  renderModels();
  renderBody();
  renderDesign();
  renderMirror();
  renderBudget();
  renderSummary();
}

function renderMirror() {
  const theme = bespokeTheme(state.design);
  $('#mirror-img').src = renderImageFor(state.model.key, theme);
  $('#mirror-label').textContent = `Minh họa: ${DRESS_THEME[theme]}`;
  renderFit();
}

function renderFit() {
  const { score, tip } = fitScore(state.body, bespokeTheme(state.design));
  $('#fit-score').textContent = `${score}%`;
  $('#fit-tip').textContent = tip;
}

function renderModels() {
  render($('#models'), MODELS.map((m) => html`
    <button class="model ${m.key === state.model.key ? 'active' : ''}" type="button" data-model="${m.key}">
      <img src="${m.photo}" alt="">${m.name}
    </button>`));
  for (const btn of $$('[data-model]')) {
    btn.addEventListener('click', () => {
      state.model = MODELS.find((m) => m.key === btn.dataset.model);
      redraw();
    });
  }
}

function renderBody() {
  $('#height').value = state.body.height;
  $('#weight').value = state.body.weight;
  $('#heel').value = String(state.body.heel);
  $('#height-value').textContent = state.body.height;
  $('#weight-value').textContent = state.body.weight;
  const bmi = bmiInfo(state.body.height, state.body.weight);
  render($('#bmi'), html`BMI <strong>${bmi.value.toLocaleString('vi-VN')}</strong> · ${bmi.label}
    <span class="muted">– ${bmi.tip}</span>`);

  render($('#shapes'), BODY_SHAPES.map((s) => html`
    <button class="chip ${s.key === state.body.shape ? 'active' : ''}" type="button" data-shape="${s.key}">${s.label}</button>`));
  for (const chip of $$('[data-shape]')) {
    chip.addEventListener('click', () => {
      state.body.shape = chip.dataset.shape;
      renderBody();
      renderFit();
      persistBody();
    });
  }
}

function renderDesign() {
  render($('#bespoke-options'), Object.entries(BESPOKE_OPTIONS).map(([group, { label, choices }]) => html`
    <div class="field"><span>${label}</span>
      <div class="chips">
        ${choices.map((c) => html`
          <button class="chip ${state.design[group] === c.key ? 'active' : ''}" type="button"
                  data-group="${group}" data-choice="${c.key}" aria-pressed="${state.design[group] === c.key}">${c.label}</button>`)}
      </div>
    </div>`));
  for (const chip of $$('[data-group]')) {
    chip.addEventListener('click', () => {
      state.design[chip.dataset.group] = chip.dataset.choice;
      if (chip.dataset.group === 'silhouette') redraw();
      else { renderDesign(); renderSummary(); }
    });
  }

  $('#train').value = state.design.train;
  $('#train-value').textContent = state.design.train.toLocaleString('vi-VN');

  // Điểm nhấn thêm: bật / tắt như công tắc, không kèm giá – Atelier tư vấn khi gặp
  render($('#bespoke-extras'), BESPOKE_EXTRAS.map((x) => {
    const on = state.design.extras.includes(x.key);
    return html`<button class="chip ${on ? 'active' : ''}" type="button" data-extra="${x.key}"
      aria-pressed="${on}">${on ? '✓' : '+'} ${x.label}</button>`;
  }));
  for (const btn of $$('[data-extra]')) {
    btn.addEventListener('click', () => {
      const key = btn.dataset.extra;
      state.design.extras = state.design.extras.includes(key)
        ? state.design.extras.filter((k) => k !== key)
        : [...state.design.extras, key];
      renderDesign();
      renderSummary();
    });
  }
}

function renderSummary() {
  const booking = selection();
  const { design } = state;
  const specs = [
    `Cổ: ${bespokeLabel('neckline', design.neckline)}`,
    `Tay: ${bespokeLabel('sleeve', design.sleeve)}`,
    `Đuôi ${design.train.toLocaleString('vi-VN')}m`,
    ...extraLabels(),
  ];
  $('#book-btn').disabled = !booking.vendorId;
  $('#cta-book').disabled = !booking.vendorId;
  render($('#summary'), html`
    <div class="stack" style="gap:14px">
      <div>
        <strong>${booking.title}</strong>
        <div class="muted small">${booking.vendorName}</div>
        <div class="small bespoke-specs">${specs.join(' · ')}</div>
      </div>
      <div class="bespoke-budget ${booking.budget ? '' : 'is-empty'}" id="bespoke-budget">
        <span class="small muted">Ngân sách dự kiến</span>
        ${booking.budget
          ? html`<strong>${booking.budget.label}</strong>
            <span class="small muted">Giá chốt sau buổi tư vấn cùng Atelier.</span>`
          : html`<strong>Chưa chọn</strong>
            <button class="budget-goto small" type="button" data-goto-budget>Chọn ngân sách ở bước 3 →</button>`}
      </div>
      <ol class="bespoke-steps" aria-label="Thanh toán 3 đợt qua Trạm Hỷ">
        ${STEPS.map((s, i) => html`
          <li><span class="bespoke-step-pct">${s.percent}%</span>
            <span class="small"><strong>Đợt ${i + 1}</strong><br>${s.title}</span></li>`)}
      </ol>
      <p class="small muted" style="margin:0">Tiền được Trạm Hỷ giữ, chỉ chuyển cho tiệm khi bạn nghiệm thu từng đợt. Tiệm sai cam kết → hoàn 100%.</p>
    </div>`);
  $('[data-goto-budget]')?.addEventListener('click', goToBudget);
  $('#cta-name').textContent = booking.title;
  $('#cta-price').textContent = booking.budget ? `Ngân sách: ${booking.budget.label}` : 'Chưa chọn ngân sách';
}

// ---------- KHỞI CHẠY TRANG ----------
initControls();
if (param('tu') === 'anh-vay') $('#bespoke-notes').value = FROM_TRYON_NOTE;
renderAll();                       // hiện ngay ảnh minh họa trong lúc chờ tải dữ liệu
state.profile = await initLayout('bespoke');
await Promise.all([loadVendor(), loadBodyProfile()]);
renderAll();
