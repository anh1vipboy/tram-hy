// Thiết kế váy may đo (Trạm Hỷ Atelier): chọn phom, cổ, tay, vải, đuôi, phụ kiện → giá tạm tính; ảnh minh họa theo phom
// trên người mẫu; độ tôn dáng theo số đo → đặt lịch tư vấn, giữ cọc 3 đợt 30/40/30.
// Ướm váy bằng AI lên ảnh thật nằm ở Phòng thử (tryon.html) – "Đặt may theo mẫu này" ở đó dẫn về đây (?tu=anh-vay).
import { initLayout } from '../core/layout.js';
import { $, $$, html, render, money, param, debounce, sleep } from '../core/utils.js';
import { DRESS_THEME } from '../core/labels.js';
import { toastError } from '../core/ui.js';
import { BESPOKE_VENDOR_SLUG } from '../config.js';
import { getVendorBySlug } from '../services/catalog.js';
import { getBodyProfile, saveBodyProfile } from '../services/profile.js';
import { openBookingDialog } from '../components/booking-dialog.js';
import {
  MODELS, BODY_SHAPES, BESPOKE_OPTIONS, BESPOKE_EXTRAS,
  renderImageFor, fitScore, bmiInfo, bespokePrice, bespokeTheme, bespokeLabel,
} from '../data/tryon-data.js';

// ---------- TRẠNG THÁI TRANG ----------
const state = {
  profile: null,
  vendor: null,                 // tiệm may đo của Trạm Hỷ (nhận đơn)
  model: MODELS[0],             // người mẫu mặc thử ảnh minh họa
  body: { height: 160, weight: 49, heel: 7, shape: 'hourglass' },
  design: { silhouette: 'aline', neckline: 'sweetheart', sleeve: 'none', fabric: 'mikado', train: 1, extras: [] },
};

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
function selection() {
  const notes = $('#bespoke-notes').value.trim();
  const price = bespokePrice(state.design);
  return {
    title: `Váy may đo: ${bespokeLabel('silhouette', state.design.silhouette)}, ${bespokeLabel('fabric', state.design.fabric)}`,
    vendorName: state.vendor?.name ?? 'Trạm Hỷ Atelier',
    vendorId: state.vendor?.id,
    price,
    customPrice: price,
    type: notes ? 'bespoke_prompt' : 'bespoke_manual',
    details: {
      body: state.body,
      design: {
        ...Object.fromEntries(Object.keys(BESPOKE_OPTIONS).map((g) => [g, bespokeLabel(g, state.design[g])])),
        train_m: state.design.train,
        extras: BESPOKE_EXTRAS.filter((x) => state.design.extras.includes(x.key)).map((x) => x.label),
        notes,
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
  openBookingDialog(booking, 'thiet-ke-vay.html').catch(toastError);
}

// ---------- VẼ GIAO DIỆN ----------
function renderAll() {
  renderModels();
  renderBody();
  renderDesign();
  renderMirror();
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
                  data-group="${group}" data-choice="${c.key}">
            ${c.label}${c.price ? ` +${(c.price / 1e6).toLocaleString('vi-VN')}tr` : ''}
          </button>`)}
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
  $('#train-value').textContent = state.design.train;

  render($('#bespoke-extras'), BESPOKE_EXTRAS.map((x) => html`
    <label class="row small">
      <input type="checkbox" data-extra="${x.key}" ${state.design.extras.includes(x.key) ? 'checked' : ''}>
      ${x.label} (+${money(x.price)})
    </label>`));
  for (const box of $$('[data-extra]')) {
    box.addEventListener('change', () => {
      const key = box.dataset.extra;
      state.design.extras = box.checked
        ? [...state.design.extras, key]
        : state.design.extras.filter((k) => k !== key);
      renderSummary();
    });
  }
}

function renderSummary() {
  const booking = selection();
  const split = [30, 40, 30];
  const steps = ['Duyệt thiết kế & vải', 'Thử rập mộc', 'Nhận váy hoàn thiện'];
  $('#book-btn').disabled = !booking.vendorId;
  $('#cta-book').disabled = !booking.vendorId;
  render($('#summary'), html`
    <div class="stack" style="gap:6px">
      <strong>${booking.title}</strong>
      <span class="muted small">${booking.vendorName}</span>
      <span class="price" style="font-size:20px">${money(booking.price)}</span>
      <div class="milestones">
        ${split.map((p, i) => html`
          <div class="milestone">
            <span class="small muted">Đợt ${i + 1}: ${steps[i]}</span>
            <span class="amount">${money(Math.round(booking.price * p / 100))}</span>
            <span class="small">${p}%</span>
          </div>`)}
      </div>
      <p class="small muted">Tiền được Trạm Hỷ giữ, chỉ chuyển cho tiệm khi bạn nghiệm thu từng đợt. Tiệm sai cam kết → hoàn 100%.</p>
    </div>`);
  $('#cta-name').textContent = booking.title;
  $('#cta-price').textContent = money(booking.price);
}

// ---------- KHỞI CHẠY TRANG ----------
initControls();
if (param('tu') === 'anh-vay') $('#bespoke-notes').value = FROM_TRYON_NOTE;
renderAll();                       // hiện ngay ảnh minh họa & giá trong lúc chờ tải dữ liệu
state.profile = await initLayout('tryon');
await Promise.all([loadVendor(), loadBodyProfile()]);
renderAll();
