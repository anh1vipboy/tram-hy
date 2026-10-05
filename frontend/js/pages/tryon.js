import { initLayout } from '../core/layout.js';
import { $, $$, html, render, money, param, debounce, sleep } from '../core/utils.js';
import { badge, DRESS_THEME } from '../core/labels.js';
import { toast, toastError } from '../core/ui.js';
import { BESPOKE_VENDOR_SLUG } from '../config.js';
import { listDresses, getVendorBySlug } from '../services/catalog.js';
import { getBodyProfile, saveBodyProfile, uploadBridePhoto } from '../services/profile.js';
import { openBookingDialog } from '../components/booking-dialog.js';
import { openDressGallery, realPhotoCount } from '../components/dress-gallery.js';
import { aiTryOn, remainingAiTries, AI_DAILY_LIMIT } from '../services/tryon-ai.js';
import { loginUrl } from '../core/auth.js';
import {
  MODELS, BODY_SHAPES, BESPOKE_OPTIONS, BESPOKE_EXTRAS,
  renderImageFor, dressThumb, fitScore, bespokePrice, bespokeTheme, bespokeLabel,
} from '../data/tryon-data.js';

// ---------- TRẠNG THÁI TRANG ----------
const state = {
  profile: null,
  dresses: [],
  bespokeVendor: null,
  mode: 'catalog',              // 'catalog' | 'bespoke'
  themeFilter: 'all',
  dress: null,                  // mẫu đang chọn (mode catalog)
  model: MODELS[0],
  customPhotoUrl: null,         // ảnh người dùng tự tải lên (xem trước trong trình duyệt)
  customPhotoPath: null,        // đường dẫn ảnh đó trong kho riêng tư (có khi đã đăng nhập & tải xong)
  aiResults: new Map(),         // ảnh AI đã ghép: "người mẫu|váy" → link (tránh gọi AI lại, tốn tiền)
  aiRemaining: null,            // số lượt AI còn lại hôm nay (null = chưa biết)
  aiBusy: false,
  showOriginal: false,
  body: { height: 160, weight: 49, heel: 7, shape: 'hourglass' },
  bespoke: { silhouette: 'aline', neckline: 'sweetheart', sleeve: 'none', fabric: 'mikado', train: 1, extras: [] },
};

// ---------- TẢI DỮ LIỆU ----------
async function loadDresses() {
  try {
    [state.dresses, state.bespokeVendor] = await Promise.all([listDresses(), getVendorBySlug(BESPOKE_VENDOR_SLUG)]);
    state.dress = state.dresses.find((d) => d.slug === param('dress')) ?? state.dresses[0] ?? null;
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

  $('#photo-input').addEventListener('change', onPhotoSelected);
  $('#toggle-original').addEventListener('click', () => {
    state.showOriginal = !state.showOriginal;
    renderMirror();
  });

  for (const tab of $$('[data-mode]')) {
    tab.addEventListener('click', () => {
      state.mode = tab.dataset.mode;
      for (const t of $$('[data-mode]')) t.classList.toggle('active', t === tab);
      $('#catalog-panel').hidden = state.mode !== 'catalog';
      $('#bespoke-panel').hidden = state.mode !== 'bespoke';
      tryOn();
    });
  }

  $('#train').addEventListener('input', (e) => {
    state.bespoke.train = Number(e.target.value);
    renderBespoke();
    renderSummary();
  });
  $('#bespoke-notes').addEventListener('input', debounce(renderSummary, 300));

  $('#book-btn').addEventListener('click', book);
  $('#ai-tryon').addEventListener('click', runAiTryOn);
  $('#cta-book').addEventListener('click', book);
}

async function onPhotoSelected(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    toastError(new Error('Ảnh tối đa 10MB'));
    return;
  }
  if (state.customPhotoUrl) URL.revokeObjectURL(state.customPhotoUrl);
  state.customPhotoUrl = URL.createObjectURL(file);
  state.customPhotoPath = null;
  state.model = { key: 'custom', name: 'Ảnh của bạn', photo: state.customPhotoUrl };
  renderModels();
  tryOn({ reveal: true });

  if (state.profile) {
    try {
      state.customPhotoPath = await uploadBridePhoto(state.profile.id, file);   // AI thật cần ảnh nằm trên server
      toast('Ảnh đã được lưu riêng tư trong tài khoản của bạn.', 'success');
      renderAiButton();
    } catch (error) {
      toastError(error);
    }
  }
}

// ---------- THỬ VÁY BẰNG AI THẬT ----------
// Chọn váy chỉ hiện ảnh minh họa (miễn phí, tức thì). AI thật chỉ chạy khi bấm nút vì mỗi lần tốn phí.
// AI chưa bật (key Free tier / chưa cấu hình) → server trả fallback → giữ ảnh minh họa, báo lý do.

const AI_FALLBACK_MESSAGES = {
  'not-configured': 'AI thử váy thật chưa được bật – đang hiển thị ảnh minh họa cùng kiểu váy.',
  'free-tier': 'AI thử váy thật chưa được bật – đang hiển thị ảnh minh họa cùng kiểu váy.',
  'no-dress-photo': 'Mẫu này chưa có ảnh thật từ tiệm nên chưa thử bằng AI được.',
  'provider-error': 'Dịch vụ AI đang bận, vui lòng thử lại sau ít phút.',
};

// Khóa ảnh AI theo đúng người mẫu/ảnh + đúng váy đang chọn
const aiKey = () => `${state.model.key === 'custom' ? state.customPhotoPath : state.model.key}|${state.dress?.id}`;
const currentAiImage = () => (state.mode === 'catalog' ? state.aiResults.get(aiKey()) : null);

async function loadAiRemaining() {
  if (!state.profile) return;
  try {
    state.aiRemaining = await remainingAiTries();
  } catch {
    state.aiRemaining = null;        // chưa chạy SQL 11 → không biết số lượt, nút vẫn dùng được
  }
}

function renderAiButton() {
  const box = $('#ai-tryon-box');
  const button = $('#ai-tryon');
  const hint = $('#ai-hint');
  box.hidden = state.mode !== 'catalog' || !state.dress;
  if (box.hidden) return;

  let reason = '';
  if (!state.profile) reason = 'Đăng nhập để ghép váy lên ảnh bằng AI thật';
  else if (!state.dress.image_url) reason = 'Mẫu này chưa có ảnh thật từ tiệm';
  else if (state.model.key === 'custom' && !state.customPhotoPath) reason = 'Đang lưu ảnh của bạn…';
  else if (state.aiRemaining === 0) reason = `Đã dùng hết ${AI_DAILY_LIMIT} lượt AI hôm nay`;
  else if (currentAiImage()) reason = 'Đang xem ảnh AI đã ghép';
  else if (state.aiRemaining !== null) reason = `Còn ${state.aiRemaining}/${AI_DAILY_LIMIT} lượt hôm nay`;

  // Chưa đăng nhập vẫn bấm được → đưa tới trang đăng nhập
  button.disabled = state.aiBusy || (Boolean(state.profile) && (!state.dress.image_url
    || (state.model.key === 'custom' && !state.customPhotoPath) || state.aiRemaining === 0 || Boolean(currentAiImage())));
  hint.textContent = reason;
}

async function runAiTryOn() {
  if (!state.profile) {
    location.href = loginUrl(`tryon.html?dress=${state.dress.slug}`);
    return;
  }
  const key = aiKey();
  const scan = $('#mirror-scan');
  const defaultScanText = scan.textContent;
  state.aiBusy = true;
  renderAiButton();
  scan.textContent = 'AI đang ghép váy lên ảnh của bạn… (khoảng 10–30 giây)';
  scan.hidden = false;
  try {
    const result = await aiTryOn(state.model.key === 'custom'
      ? { dressId: state.dress.id, photoPath: state.customPhotoPath }
      : { dressId: state.dress.id, sampleModel: state.model.key });

    if (result.fallback) {
      toast(AI_FALLBACK_MESSAGES[result.reason] ?? AI_FALLBACK_MESSAGES['provider-error']);
    } else {
      state.aiResults.set(key, result.imageUrl);
      state.aiRemaining = result.remaining;
      state.showOriginal = false;
      toast('Đã ghép váy bằng AI! Ảnh được lưu riêng tư trong tài khoản của bạn.', 'success');
    }
  } catch (error) {
    if (/hết .* lượt/.test(error.message)) state.aiRemaining = 0;
    toastError(error);
  } finally {
    state.aiBusy = false;
    scan.hidden = true;
    scan.textContent = defaultScanText;
    renderMirror();
  }
}

const isPhoneLayout = () => matchMedia('(max-width: 900px)').matches;

// Hiệu ứng AI xử lý ngắn rồi hiện kết quả.
// reveal: trên điện thoại gương nằm ở đầu trang → cuộn lên để người dùng thấy kết quả vừa chọn.
async function tryOn({ reveal = false } = {}) {
  state.showOriginal = false;
  renderAll();
  if (reveal && isPhoneLayout()) $('.mirror').scrollIntoView({ behavior: 'smooth', block: 'start' });
  const scan = $('#mirror-scan');
  scan.hidden = false;
  await sleep(900);
  scan.hidden = true;
}

// ---------- GIÁ TRỊ SUY RA ----------
function currentTheme() {
  return state.mode === 'bespoke' ? bespokeTheme(state.bespoke) : state.dress?.theme;
}

// Thông tin để đặt lịch, tùy chế độ đang chọn
function currentSelection() {
  if (state.mode === 'catalog') {
    const dress = state.dress;
    if (!dress) return null;
    return {
      title: dress.name,
      vendorName: dress.vendor.name,
      vendorId: dress.vendor.id,
      dressId: dress.id,
      price: dress.price,
      type: dress.type === 'bespoke' ? 'bespoke_manual' : 'rental',
      details: { body: state.body },
    };
  }

  const notes = $('#bespoke-notes').value.trim();
  const price = bespokePrice(state.bespoke);
  return {
    title: `Váy may đo: ${bespokeLabel('silhouette', state.bespoke.silhouette)}, ${bespokeLabel('fabric', state.bespoke.fabric)}`,
    vendorName: state.bespokeVendor?.name ?? 'Trạm Hỷ Atelier',
    vendorId: state.bespokeVendor?.id,
    price,
    customPrice: price,
    type: notes ? 'bespoke_prompt' : 'bespoke_manual',
    details: {
      body: state.body,
      design: {
        ...Object.fromEntries(Object.keys(BESPOKE_OPTIONS).map((g) => [g, bespokeLabel(g, state.bespoke[g])])),
        train_m: state.bespoke.train,
        extras: BESPOKE_EXTRAS.filter((x) => state.bespoke.extras.includes(x.key)).map((x) => x.label),
        notes,
      },
    },
  };
}

function book() {
  const selection = currentSelection();
  if (!selection?.vendorId) {
    toastError(new Error('Vui lòng chọn một mẫu váy'));
    return;
  }
  const returnTo = state.dress ? `tryon.html?dress=${state.dress.slug}` : 'tryon.html';
  openBookingDialog(selection, returnTo).catch(toastError);
}

// ---------- VẼ GIAO DIỆN ----------
function renderAll() {
  renderModels();
  renderBody();
  renderThemeFilter();
  renderDressList();
  renderBespoke();
  renderMirror();
  renderSummary();
}

function renderMirror() {
  const theme = currentTheme();
  const isCustom = state.model.key === 'custom';
  const img = $('#mirror-img');

  const aiImage = currentAiImage();

  if (state.showOriginal || !theme) {
    img.src = state.model.photo;
    $('#mirror-label').textContent = 'Ảnh gốc';
  } else if (aiImage) {
    img.src = aiImage;
    $('#mirror-label').textContent = '✨ Ảnh AI ghép váy thật';
  } else {
    img.src = renderImageFor(isCustom ? 'user' : state.model.key, theme);
    $('#mirror-label').textContent = `Minh họa: ${DRESS_THEME[theme]}`;
  }
  $('#download-img').href = img.src;
  $('#toggle-original').textContent = state.showOriginal ? 'Xem ảnh đã thử váy' : 'Xem ảnh gốc';

  const note = $('#mirror-note');
  note.hidden = !(isCustom && !state.showOriginal && !aiImage);
  note.textContent = 'Đây là ảnh minh họa cùng kiểu váy. Bấm "Ướm thử bằng AI thật" để ghép váy lên chính ảnh của bạn.';
  renderFit();
  renderAiButton();
}

function renderFit() {
  const theme = currentTheme();
  if (!theme) return;
  const { score, tip } = fitScore(state.body, theme);
  $('#fit-score').textContent = `${score}%`;
  $('#fit-tip').textContent = tip;
}

function renderModels() {
  const models = state.customPhotoUrl
    ? [...MODELS, { key: 'custom', name: 'Ảnh của bạn', photo: state.customPhotoUrl }]
    : MODELS;
  render($('#models'), models.map((m) => html`
    <button class="model ${m.key === state.model.key ? 'active' : ''}" type="button" data-model="${m.key}">
      <img src="${m.photo}" alt="">${m.name}
    </button>`));
  for (const btn of $$('[data-model]')) {
    btn.addEventListener('click', () => {
      state.model = models.find((m) => m.key === btn.dataset.model);
      tryOn({ reveal: true });
    });
  }
}

function renderBody() {
  $('#height').value = state.body.height;
  $('#weight').value = state.body.weight;
  $('#heel').value = String(state.body.heel);
  $('#height-value').textContent = state.body.height;
  $('#weight-value').textContent = state.body.weight;

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

function renderThemeFilter() {
  const themes = [['all', 'Tất cả'], ...Object.entries(DRESS_THEME)];
  render($('#theme-filter'), themes.map(([key, label]) => html`
    <button class="chip ${key === state.themeFilter ? 'active' : ''}" type="button" data-theme="${key}">${label}</button>`));
  for (const chip of $$('[data-theme]')) {
    chip.addEventListener('click', () => {
      state.themeFilter = chip.dataset.theme;
      renderThemeFilter();
      renderDressList();
    });
  }
}

function renderDressList() {
  const list = state.dresses.filter((d) => state.themeFilter === 'all' || d.theme === state.themeFilter);
  if (!list.length) {
    render($('#dress-list'), html`<div class="muted">Chưa có mẫu váy phù hợp.</div>`);
    return;
  }
  render($('#dress-list'), list.map((d) => html`
    <button class="dress-option ${d.id === state.dress?.id ? 'active' : ''}" type="button" data-dress="${d.id}">
      <img src="${dressThumb(d)}" alt="">
      <span class="info">
        <span class="name">${d.name}</span><br>
        <span class="small muted">${d.vendor.name}</span>
      </span>
      <span class="stack" style="gap:4px;align-items:flex-end">
        <span class="price small">${money(d.price)}</span>
        ${d.type === 'bespoke' ? badge('May đo', 'purple') : badge('Thuê')}
      </span>
    </button>`));
  for (const btn of $$('[data-dress]')) {
    btn.addEventListener('click', () => {
      state.dress = state.dresses.find((d) => d.id === btn.dataset.dress);
      history.replaceState(null, '', `?dress=${state.dress.slug}`);
      tryOn({ reveal: true });
    });
  }
}

function renderBespoke() {
  render($('#bespoke-options'), Object.entries(BESPOKE_OPTIONS).map(([group, { label, choices }]) => html`
    <div class="field"><span>${label}</span>
      <div class="chips">
        ${choices.map((c) => html`
          <button class="chip ${state.bespoke[group] === c.key ? 'active' : ''}" type="button"
                  data-group="${group}" data-choice="${c.key}">
            ${c.label}${c.price ? ` +${(c.price / 1e6).toLocaleString('vi-VN')}tr` : ''}
          </button>`)}
      </div>
    </div>`));
  for (const chip of $$('[data-group]')) {
    chip.addEventListener('click', () => {
      state.bespoke[chip.dataset.group] = chip.dataset.choice;
      if (chip.dataset.group === 'silhouette') tryOn({ reveal: true });
      else { renderBespoke(); renderSummary(); }
    });
  }

  $('#train').value = state.bespoke.train;
  $('#train-value').textContent = state.bespoke.train;

  render($('#bespoke-extras'), BESPOKE_EXTRAS.map((x) => html`
    <label class="row small">
      <input type="checkbox" data-extra="${x.key}" ${state.bespoke.extras.includes(x.key) ? 'checked' : ''}>
      ${x.label} (+${money(x.price)})
    </label>`));
  for (const box of $$('[data-extra]')) {
    box.addEventListener('change', () => {
      const key = box.dataset.extra;
      state.bespoke.extras = box.checked
        ? [...state.bespoke.extras, key]
        : state.bespoke.extras.filter((k) => k !== key);
      renderSummary();
    });
  }
}

function renderSummary() {
  const selection = currentSelection();
  // Khóa nút đặt lịch cho tới khi đã tải xong và có mẫu được chọn
  $('#book-btn').disabled = !selection?.vendorId;
  $('#cta-book').disabled = !selection?.vendorId;
  if (!selection) {
    render($('#summary'), html`<p class="muted">Chọn một mẫu váy để đặt lịch.</p>`);
    return;
  }
  const isBespoke = selection.type.startsWith('bespoke');
  const split = isBespoke ? [30, 40, 30] : [30, 50, 20];
  const steps = isBespoke
    ? ['Duyệt thiết kế & vải', 'Thử rập mộc', 'Nhận váy hoàn thiện']
    : ['Giữ lịch', 'Sau buổi thử', 'Trả váy / hoàn tất'];

  const realPhotos = state.mode === 'catalog' && state.dress ? realPhotoCount(state.dress) : 0;

  render($('#summary'), html`
    <div class="stack" style="gap:6px">
      <strong>${selection.title}</strong>
      ${realPhotos ? html`<button class="btn btn-outline btn-sm" type="button" data-view-photos style="width:fit-content">
        Xem ${realPhotos} ảnh thật của tiệm</button>` : ''}
      <span class="muted small">${selection.vendorName}</span>
      <span class="price" style="font-size:20px">${money(selection.price)}</span>
      <div class="milestones">
        ${split.map((p, i) => html`
          <div class="milestone">
            <span class="small muted">Đợt ${i + 1}: ${steps[i]}</span>
            <span class="amount">${money(Math.round(selection.price * p / 100))}</span>
            <span class="small">${p}%</span>
          </div>`)}
      </div>
      <p class="small muted">Tiền được Trạm Hỷ giữ, chỉ chuyển cho tiệm khi bạn nghiệm thu từng đợt. Tiệm sai cam kết → hoàn 100%.</p>
    </div>`);
  $('#summary [data-view-photos]')?.addEventListener('click', () => openDressGallery(state.dress));
  $('#cta-name').textContent = selection.title;
  $('#cta-price').textContent = money(selection.price);
}

// ---------- KHỞI CHẠY TRANG ----------
initControls();
// Hiện ngay ảnh người mẫu & số đo trong lúc chờ tải dữ liệu
renderModels();
renderBody();
renderMirror();
state.profile = await initLayout('tryon');
await Promise.all([loadDresses(), loadBodyProfile(), loadAiRemaining()]);
renderAll();
