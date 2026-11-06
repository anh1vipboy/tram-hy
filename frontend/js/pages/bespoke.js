// Thiết kế váy may đo (Trạm Hỷ Atelier): chọn phom, cổ, tay, vải, đuôi, điểm nhấn; ảnh minh họa theo phom
// trên người mẫu; độ tôn dáng theo số đo → khách chọn NGÂN SÁCH MONG MUỐN → đặt lịch tư vấn, giữ cọc 3 đợt 30/40/30.
// Không hiện giá theo từng lựa chọn: váy may đo không định giá cố định theo chi tiết được – Atelier tư vấn thiết kế
// vừa ngân sách và chốt giá sau buổi tư vấn. Ngân sách (giữa khoảng nếu chọn khoảng) là giá tạm tính của đơn.
// Ướm váy bằng AI lên ảnh thật nằm ở Phòng thử (tryon.html) – "Đặt may theo mẫu này" ở đó dẫn về đây (?tu=anh-vay).
// AI ngay tại trang (tùy chọn, không chặn đặt lịch): "Vẽ váy của tôi" → ảnh váy đúng thông số → "Ướm lên người mẫu".
// Ảnh vẽ chỉ gửi kèm đơn khi còn khớp thiết kế hiện tại (đổi chip → phải vẽ lại).
import { initLayout } from '../core/layout.js';
import { loginUrl } from '../core/auth.js';
import { aiDesignDress, aiTryOn, getTryonSettings, creditsUsedToday, listTryonHistory } from '../services/tryon-ai.js';
import { $, $$, html, render, money, param, debounce, sleep } from '../core/utils.js';
import { toast, toastError, openDialog } from '../core/ui.js';
import { BESPOKE_VENDOR_SLUG } from '../config.js';
import { getVendorBySlug } from '../services/catalog.js';
import {
  getBodyProfile, saveBodyProfile, listBridePhotos, uploadBridePhoto, deleteBridePhoto, MAX_BRIDE_PHOTOS,
} from '../services/profile.js';
import { openPersonSheet, openShotSheet } from '../components/tryon-sheets.js?v=6';
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
  ai: { enabled: false, busy: '', remaining: null },   // busy: '' | 'draw' | 'tryon'
  wearer: null,                 // ảnh của chính khách { path, url } để AI ướm – null = người mẫu state.model
  myPhotos: [],                 // ảnh toàn thân khách đã lưu (riêng tư) [{ path, url }]
  refs: [],                     // ảnh tham khảo gửi Atelier cùng đơn [{ bucket, path, url, name }] – tối đa MAX_REFS
};
const MAX_REFS = 3;              // khớp lời hứa với khách; Atelier xem được nhờ policy SQL 43

// Ảnh AI đã vẽ trong phiên, theo thông số: specKey → { url, hash, tryons: { [modelKey]: url } }
const aiDraws = new Map();
const specKey = (d) => JSON.stringify([d.silhouette, d.neckline, d.sleeve, d.fabric, d.train, [...d.extras].sort()]);
const currentDraw = () => aiDraws.get(specKey(state.design));

// Chưa đăng nhập mà bấm vẽ → đi đăng nhập, mang theo thiết kế để quay lại không mất lựa chọn
const DESIGN_PARAM = 'thiet-ke';
function restoreDesign() {
  let saved;
  try { saved = JSON.parse(param(DESIGN_PARAM) || 'null'); } catch { return; }
  if (!saved) return;
  for (const [group, { choices }] of Object.entries(BESPOKE_OPTIONS)) {
    if (choices.some((c) => c.key === saved[group])) state.design[group] = saved[group];
  }
  if ([0.5, 1, 1.5, 2, 2.5].includes(saved.train)) state.design.train = saved.train;
  if (Array.isArray(saved.extras)) state.design.extras = BESPOKE_EXTRAS.map((x) => x.key).filter((k) => saved.extras.includes(k));
}

// 3 đợt giữ cọc của đơn may đo – cùng tỉ lệ / thứ tự với create_booking (SQL 30)
const STEPS = [
  { percent: 30, title: 'Duyệt phác thảo & mẫu vải' },
  { percent: 40, title: 'Thử rập mộc' },
  { percent: 30, title: 'Nhận váy hoàn thiện' },
];

// Đến từ Phòng thử ("Đặt may theo mẫu này") → ghi chú sẵn để thợ may xem ảnh váy khi tư vấn
const FROM_TRYON_NOTE = 'May theo ảnh váy mẫu tôi đã ướm thử bằng AI trên Trạm Hỷ (sẽ gửi ảnh khi tư vấn).';
const FROM_TRYON_NOTE_ATTACHED = 'May theo ảnh váy mẫu tôi đã ướm thử bằng AI trên Trạm Hỷ (ảnh trong mục Ảnh tham khảo).';

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
    renderMirror();
    renderSummary();
  });
  $('#mirror-ai').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ai]');
    if (btn && !btn.disabled) runAi(btn.dataset.ai);
  });
  $('#bespoke-notes').addEventListener('input', debounce(renderSummary, 300));
  initRefs();
  $('#book-btn').addEventListener('click', book);
  $('#cta-book').addEventListener('click', book);
  initBudget();
}

// ---------- AI: VẼ VÁY & ƯỚM ----------
async function loadAi() {
  try {
    const settings = await getTryonSettings();
    state.ai.enabled = settings.enabled;
    if (settings.enabled && state.profile) state.ai.remaining = Math.max(0, settings.dailyCredits - await creditsUsedToday());
  } catch {
    state.ai.enabled = false;                    // không đọc được cài đặt → giữ trang như cũ, không hiện nút AI
  }
}

const AI_FALLBACK = 'AI chưa vẽ được lúc này – bạn vẫn đặt lịch tư vấn bình thường nhé.';

async function runAi(kind) {
  if (state.ai.busy) return;
  if (!state.profile) {
    location.href = loginUrl(backToHere());
    return;
  }
  const key = specKey(state.design);
  const wearer = state.wearer;
  const who = wearerKey();
  state.ai.busy = kind;
  const scan = $('#mirror-scan');
  scan.textContent = kind === 'draw' ? 'AI đang vẽ váy theo thiết kế của bạn… (khoảng 20 giây)' : `AI đang ướm váy lên ${wearerName()}…`;
  scan.hidden = false;
  renderAiBar();
  try {
    const result = kind === 'draw'
      ? await aiDesignDress(state.design)
      : await aiTryOn({
        designHash: aiDraws.get(key).hash,
        ...(wearer ? { photoPath: wearer.path } : { sampleModel: state.model.key }),
        body: state.body,
        options: { model: 'standard', samples: 1, photoType: 'flat-lay' },
      });
    if (result.fallback) {
      toast(AI_FALLBACK, 'error');
      return;
    }
    if (typeof result.remaining === 'number') state.ai.remaining = result.remaining;
    if (kind === 'draw') aiDraws.set(key, { url: result.designUrl, hash: result.designHash, tryons: {} });
    else {
      const url = result.images?.[0] ?? result.imageUrl;
      aiDraws.get(key).tryons[who] = url;
      // Ảnh ướm thiết kế này lên người → tự thêm vào ảnh tham khảo cho Atelier (nếu còn chỗ)
      if (result.paths?.[0]) addRef({ bucket: 'tryon-results', path: result.paths[0], url, name: 'AI ướm thiết kế' }, { quiet: true });
    }
  } catch (error) {
    if (typeof error.remaining === 'number') state.ai.remaining = error.remaining;
    toastError(error);
  } finally {
    state.ai.busy = '';
    scan.hidden = true;
    scan.textContent = 'Đang dựng phom váy theo thiết kế của bạn…';
    renderMirror();
    renderSummary();
  }
}

function renderAiBar() {
  const bar = $('#mirror-ai');
  bar.hidden = !state.ai.enabled;
  if (!state.ai.enabled) return;
  const draw = currentDraw();
  const { busy, remaining } = state.ai;
  const stale = !draw && aiDraws.size > 0;
  const noCredit = remaining === 0;
  const status = !state.profile ? 'Đăng nhập để vẽ váy bằng AI.'
    : noCredit ? 'Hôm nay bạn đã hết lượt AI – vẫn đặt lịch tư vấn được nhé.'
      : stale ? 'Thiết kế đã đổi so với ảnh AI – vẽ lại để xem đúng mẫu.'
        : typeof remaining === 'number' ? `Còn ${remaining} lượt AI hôm nay · mỗi lần vẽ hoặc ướm dùng 1 lượt.` : '';
  render(bar, html`
    <div class="mirror-ai-actions">
      <button class="btn btn-primary btn-sm" type="button" data-ai="draw" ${busy || noCredit || draw ? 'disabled' : ''}>
        ${busy === 'draw' ? 'Đang vẽ…' : draw ? '✓ Đã vẽ thiết kế này' : stale ? '↻ Vẽ lại theo thiết kế mới' : '✨ Vẽ váy của tôi bằng AI'}</button>
      ${draw ? html`<button class="btn btn-light btn-sm" type="button" data-ai="tryon"
          ${busy || noCredit || draw.tryons[wearerKey()] ? 'disabled' : ''}>
          ${busy === 'tryon' ? 'Đang ướm…' : `👰 Ướm lên ${wearerName()}`}</button>` : ''}
    </div>
    ${status ? html`<p class="small mirror-ai-status" aria-live="polite">${status}</p>` : ''}
    ${draw ? html`<p class="small mirror-ai-status">Ảnh AI minh họa – váy thật do Atelier chốt sau buổi tư vấn.</p>` : ''}`);
}

// ---------- ẢNH CỦA KHÁCH (người mặc thử) ----------
const wearerKey = () => state.wearer?.path ?? state.model.key;
const wearerName = () => (state.wearer ? 'ảnh của bạn' : state.model.name);
const backToHere = () => `thiet-ke-vay.html?${new URLSearchParams({ [DESIGN_PARAM]: JSON.stringify(state.design) })}`;
const TEN_MB = 10 * 1024 * 1024;

async function loadMyPhotos() {
  if (!state.profile) return;
  try {
    state.myPhotos = await listBridePhotos(state.profile.id, 'body');
  } catch (error) {
    toastError(error);
  }
}

function pickWearer(photo) {
  state.wearer = photo;
  renderModels();
  renderMirror();
}

async function uploadWearer(file) {
  if (file.size > TEN_MB) return toastError(new Error('Ảnh tối đa 10MB'));
  if (state.myPhotos.length >= MAX_BRIDE_PHOTOS) {
    return toastError(new Error(`Bạn đã lưu đủ ${MAX_BRIDE_PHOTOS} ảnh – bấm × trên ảnh cũ để xóa bớt rồi tải lại`));
  }
  const url = URL.createObjectURL(file);
  try {
    const path = await uploadBridePhoto(state.profile.id, file, 'body');
    const saved = { path, url };
    state.myPhotos.unshift(saved);
    pickWearer(saved);
    toast('Đã lưu ảnh riêng tư vào tài khoản – bấm “Ướm lên ảnh của bạn” sau khi vẽ váy.', 'success');
  } catch (error) {
    toastError(error);
  }
}

async function deleteMyPhoto(path) {
  const done = await openDialog({
    title: 'Xóa ảnh này?',
    content: html`<p>Ảnh sẽ bị xóa hẳn khỏi tài khoản của bạn và không khôi phục được.</p>`,
    confirmText: 'Xóa ảnh',
    danger: true,
    onConfirm: () => deleteBridePhoto(path),
  });
  if (!done) return false;
  state.myPhotos = state.myPhotos.filter((p) => p.path !== path);
  state.refs = state.refs.filter((r) => r.path !== path);
  if (state.wearer?.path === path) state.wearer = null;
  renderModels();
  renderMirror();
  renderRefs();
  return true;
}

function openWearerPicker() {
  openPersonSheet({
    loggedIn: Boolean(state.profile),
    loginHref: loginUrl(backToHere()),
    getPhotos: () => state.myPhotos,
    max: MAX_BRIDE_PHOTOS,
    selectedKey: state.wearer?.path ?? `sample:${state.model.key}`,
    onPick: (key) => {
      if (key.startsWith('sample:')) {
        state.model = MODELS.find((m) => m.key === key.slice(7)) ?? state.model;
        pickWearer(null);
      } else {
        pickWearer(state.myPhotos.find((p) => p.path === key) ?? null);
      }
    },
    onDelete: deleteMyPhoto,
    onUpload: uploadWearer,
  });
}

// ---------- ẢNH THAM KHẢO GỬI ATELIER (tối đa 3) ----------
const sameRef = (a, b) => a.bucket === b.bucket && a.path === b.path;

function addRef(ref, { quiet = false } = {}) {
  if (state.refs.some((r) => sameRef(r, ref))) return quiet || toast('Ảnh này đã có trong ảnh tham khảo.');
  if (state.refs.length >= MAX_REFS) {
    if (!quiet) toastError(new Error(`Tối đa ${MAX_REFS} ảnh tham khảo – bấm × để bỏ bớt ảnh cũ.`));
    return;
  }
  state.refs.push(ref);
  renderRefs();
  renderSummary();
  if (!quiet) toast('Đã thêm vào ảnh tham khảo.', 'success');
}

function removeRef(index) {
  state.refs.splice(index, 1);
  renderRefs();
  renderSummary();
}

// Các lần ướm ở Phòng thử → ảnh chọn được: ảnh kết quả + ảnh váy khách tự tải (nếu có)
async function tryonShots() {
  const { batches } = await listTryonHistory();
  return batches.flatMap((b) => [
    ...b.resultPaths.map((path, i) => ({ key: `tryon-results|${path}`, url: b.images[i], name: 'Ảnh ướm AI' })),
    ...(b.garmentPath && b.garmentUrl ? [{ key: `bride-photos|${b.garmentPath}`, url: b.garmentUrl, name: 'Váy bạn tải lên' }] : []),
  ]);
}

async function openTryonPicker() {
  if (!state.profile) {
    location.href = loginUrl(backToHere());
    return;
  }
  let shots;
  try {
    shots = await tryonShots();
  } catch (error) {
    toastError(error);
    return;
  }
  openShotSheet({
    title: 'Ảnh đã ướm ở Phòng thử',
    shots,
    empty: 'Bạn chưa ướm váy nào ở Phòng thử AI.',
    onPick: (key) => {
      const shot = shots.find((s) => s.key === key);
      const [bucket, path] = key.split('|');
      addRef({ bucket, path, url: shot.url, name: shot.name });
    },
  });
}

async function uploadRef(file) {
  if (file.size > TEN_MB) return toastError(new Error('Ảnh tối đa 10MB'));
  if (state.refs.length >= MAX_REFS) return toastError(new Error(`Tối đa ${MAX_REFS} ảnh tham khảo – bấm × để bỏ bớt ảnh cũ.`));
  try {
    const path = await uploadBridePhoto(state.profile.id, file, 'garment');
    addRef({ bucket: 'bride-photos', path, url: URL.createObjectURL(file), name: 'Váy bạn thích' });
  } catch (error) {
    toastError(error);
  }
}

// Đến từ Phòng thử với ?batch= → tự đính ảnh váy khách tải + ảnh ướm của lần đó
async function attachBatch(batchId) {
  try {
    const { batches } = await listTryonHistory();
    const batch = batches.find((b) => b.id === batchId);
    if (!batch) return false;
    if (batch.garmentPath && batch.garmentUrl) addRef({ bucket: 'bride-photos', path: batch.garmentPath, url: batch.garmentUrl, name: 'Váy bạn tải lên' }, { quiet: true });
    if (batch.resultPaths[0]) addRef({ bucket: 'tryon-results', path: batch.resultPaths[0], url: batch.images[0], name: 'Ảnh ướm AI' }, { quiet: true });
    return state.refs.length > 0;
  } catch {
    return false;                                   // không lấy được → giữ ghi chú cũ, khách gửi ảnh khi tư vấn
  }
}

function renderRefs() {
  const loggedIn = Boolean(state.profile);
  const full = state.refs.length >= MAX_REFS;
  render($('#bespoke-refs'), html`
    ${state.refs.length ? html`
      <div class="ref-grid">
        ${state.refs.map((r, i) => html`
          <figure class="ref-item">
            <img src="${r.url}" alt="${r.name}" loading="lazy" decoding="async">
            <figcaption class="small ellipsis">${r.name}</figcaption>
            <button type="button" class="pick-remove" data-ref-remove="${i}" aria-label="Bỏ ảnh tham khảo">×</button>
          </figure>`)}
      </div>` : ''}
    <div class="ref-actions">
      <button class="btn btn-outline btn-sm" type="button" data-ref-tryon ${full ? 'disabled' : ''}>🖼️ Lấy từ Phòng thử AI</button>
      ${loggedIn
        ? html`<label class="btn btn-outline btn-sm ${full ? 'is-disabled' : ''}">📤 Tải ảnh váy bạn thích
            <input type="file" accept="image/jpeg,image/png,image/webp" hidden data-ref-upload ${full ? 'disabled' : ''}></label>`
        : html`<a class="btn btn-outline btn-sm" href="${loginUrl(backToHere())}">🔑 Đăng nhập để tải ảnh</a>`}
    </div>
    <p class="small muted ref-note">${state.refs.length}/${MAX_REFS} ảnh · Ảnh tham khảo sẽ gửi cho Atelier khi bạn đặt lịch
      (chỉ tiệm nhận đơn xem được, tự thu hồi nếu đơn bị hủy).</p>`);
}

function initRefs() {
  const box = $('#bespoke-refs');
  box.addEventListener('click', (e) => {
    const remove = e.target.closest('[data-ref-remove]');
    if (remove) removeRef(Number(remove.dataset.refRemove));
    else if (e.target.closest('[data-ref-tryon]:not(:disabled)')) openTryonPicker();
  });
  box.addEventListener('change', (e) => {
    if (!e.target.matches('[data-ref-upload]')) return;
    const file = e.target.files[0];
    e.target.value = '';
    if (file) uploadRef(file);
  });
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
        // Ảnh AI vẽ đúng thiết kế đang chọn (ảnh công khai dress-images/bespoke/<hash>) – Atelier xem trong đơn
        ai_design_hash: currentDraw()?.hash,
        // Ảnh riêng tư khách đính kèm – chủ tiệm xem được theo policy SQL 43 (đơn chưa hủy)
        references: state.refs.map(({ bucket, path }) => ({ bucket, path })),
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
  renderRefs();
  renderBudget();
  renderSummary();
}

function renderMirror() {
  const theme = bespokeTheme(state.design);
  const draw = currentDraw();
  const tryon = draw?.tryons[wearerKey()];
  $('#mirror-img').src = tryon || draw?.url || state.wearer?.url || renderImageFor(state.model.key, theme);
  $('#mirror-label').textContent = tryon ? `AI ướm lên ${wearerName()}`
    : draw ? 'Ảnh AI theo thiết kế của bạn'
      : state.wearer ? 'Ảnh của bạn – vẽ váy rồi bấm ướm'
        : `Minh họa: ${bespokeLabel('silhouette', state.design.silhouette)}`;
  renderFit();
  renderAiBar();
}

function renderFit() {
  const { score, tip } = fitScore(state.body, bespokeTheme(state.design));
  $('#fit-score').textContent = `${score}%`;
  $('#fit-tip').textContent = tip;
}

function renderModels() {
  const own = state.wearer;
  render($('#models'), html`
    <button class="model ${own ? 'active' : ''}" type="button" data-wearer aria-pressed="${Boolean(own)}">
      ${own ? html`<img src="${own.url}" alt="">` : html`<span class="model-add" aria-hidden="true">📷</span>`}Ảnh của bạn
    </button>
    ${MODELS.map((m) => html`
    <button class="model ${!own && m.key === state.model.key ? 'active' : ''}" type="button" data-model="${m.key}"
            aria-pressed="${!own && m.key === state.model.key}">
      <img src="${m.photo}" alt="">${m.name}
    </button>`)}`);
  $('[data-wearer]').addEventListener('click', openWearerPicker);
  for (const btn of $$('[data-model]')) {
    btn.addEventListener('click', () => {
      state.model = MODELS.find((m) => m.key === btn.dataset.model);
      state.wearer = null;
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
      else { renderDesign(); renderMirror(); renderSummary(); }
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
      renderMirror();
      renderSummary();
    });
  }
}

// Chia tiền 3 đợt giống create_booking (SQL 30): đợt 1–2 làm tròn theo %, đợt cuối = phần còn lại
function stepAmounts(total) {
  const first = STEPS.slice(0, -1).map((s) => Math.round(total * s.percent / 100));
  return [...first, total - first.reduce((a, b) => a + b, 0)];
}
console.assert(stepAmounts(15000000).join() === '4500000,6000000,4500000' && stepAmounts(10000001).reduce((a, b) => a + b) === 10000001);

function renderSummary() {
  const booking = selection();
  const amounts = booking.budget ? stepAmounts(booking.budget.estimate) : null;
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
            <span class="small"><strong>Đợt ${i + 1}</strong><br>${s.title}</span>
            ${amounts ? html`<strong class="bespoke-step-amount">${money(amounts[i])}</strong>` : ''}</li>`)}
      </ol>
      ${amounts ? html`<p class="small muted" style="margin:0">${booking.budget.isRange
        ? `Số tiền từng đợt tạm tính theo ${money(booking.budget.estimate)} (giữa khoảng bạn chọn).`
        : 'Số tiền từng đợt tạm tính theo ngân sách bạn nhập.'} Giá chốt sau buổi tư vấn có thể thay đổi.</p>` : ''}
      <p class="small muted" style="margin:0">Tiền được Trạm Hỷ giữ, chỉ chuyển cho tiệm khi bạn nghiệm thu từng đợt. Tiệm sai cam kết → hoàn 100%.</p>
    </div>`);
  $('[data-goto-budget]')?.addEventListener('click', goToBudget);
  $('#cta-name').textContent = booking.title;
  $('#cta-price').textContent = booking.budget ? `Ngân sách: ${booking.budget.label}` : 'Chưa chọn ngân sách';
}

// ---------- KHỞI CHẠY TRANG ----------
initControls();
restoreDesign();
if (param('tu') === 'anh-vay') $('#bespoke-notes').value = FROM_TRYON_NOTE;
renderAll();                       // hiện ngay ảnh minh họa trong lúc chờ tải dữ liệu
state.profile = await initLayout('bespoke');
await Promise.all([loadVendor(), loadBodyProfile(), loadAi(), loadMyPhotos()]);
if (state.profile && param('batch') && await attachBatch(param('batch'))) $('#bespoke-notes').value = FROM_TRYON_NOTE_ATTACHED;
renderAll();
