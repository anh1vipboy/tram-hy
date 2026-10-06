import { initLayout } from '../core/layout.js';
import { $, $$, html, render, money, param, debounce, sleep } from '../core/utils.js';
import { badge, DRESS_THEME } from '../core/labels.js';
import { toast, toastError, openDialog } from '../core/ui.js';
import { BESPOKE_VENDOR_SLUG } from '../config.js';
import { listDresses, getVendorBySlug } from '../services/catalog.js';
import {
  getBodyProfile, saveBodyProfile, uploadBridePhoto, listBridePhotos, deleteBridePhoto,
  MAX_BRIDE_PHOTOS, MAX_GARMENT_PHOTOS,
} from '../services/profile.js';
import { openBookingDialog } from '../components/booking-dialog.js';
import { openDressGallery, realPhotoCount } from '../components/dress-gallery.js';
import { aiTryOn, remainingAiTries, listAiResults, AI_DAILY_LIMIT } from '../services/tryon-ai.js';
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
  mode: 'catalog',              // 'catalog' (mẫu của tiệm) | 'own' (ảnh váy tự tải) | 'bespoke'
  themeFilter: 'all',
  dress: null,                  // mẫu đang chọn (mode catalog)
  model: MODELS[0],
  myPhotos: [],                 // ảnh toàn thân đã lưu trong tài khoản: [{ path, url }] (mới nhất trước)
  localPhoto: null,             // ảnh vừa chọn nhưng chưa lưu (chưa đăng nhập / đang tải lên)
  garments: [],                 // ảnh váy mẫu tự tải đã lưu: [{ path, url }]
  garment: null,                // ảnh váy đang chọn ở chế độ 'own': { path, url } (path null = chưa lưu)
  aiHistory: [],                // ảnh đã thử bằng AI: [{ id, url, createdAt }]
  historyView: null,            // đang xem lại ảnh AI cũ nào trên gương (url)
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

async function loadMyPhotos() {
  if (!state.profile) return;
  try {
    [state.myPhotos, state.garments] = await Promise.all([
      listBridePhotos(state.profile.id, 'body'),
      listBridePhotos(state.profile.id, 'garment'),
    ]);
  } catch (error) {
    toastError(error);
  }
}

async function loadAiHistory() {
  if (!state.profile) return;
  try {
    state.aiHistory = await listAiResults();
  } catch {
    state.aiHistory = [];          // chưa chạy SQL 11 → bỏ qua
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
    tab.addEventListener('click', () => switchMode(tab.dataset.mode));
  }
  $('#garment-input').addEventListener('change', onGarmentSelected);

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

function switchMode(mode) {
  state.mode = mode;
  for (const t of $$('[data-mode]')) t.classList.toggle('active', t.dataset.mode === mode);
  $('#catalog-panel').hidden = mode !== 'catalog';
  $('#own-panel').hidden = mode !== 'own';
  $('#bespoke-panel').hidden = mode !== 'bespoke';
  tryOn();
}

// Ảnh của người dùng: { key, name, photo, custom: true, path } – path = null khi chưa lưu lên server
const photoModel = ({ path, url }) => ({ key: `photo:${path}`, name: 'Ảnh của bạn', photo: url, custom: true, path });

async function onPhotoSelected(e) {
  const file = e.target.files[0];
  e.target.value = '';                    // chọn lại đúng file đó vẫn nhận
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    toastError(new Error('Ảnh tối đa 10MB'));
    return;
  }
  if (state.profile && state.myPhotos.length >= MAX_BRIDE_PHOTOS) {
    toastError(new Error(`Bạn đã lưu đủ ${MAX_BRIDE_PHOTOS} ảnh – bấm × trên ảnh cũ để xóa bớt rồi tải lại`));
    return;
  }
  if (state.localPhoto) URL.revokeObjectURL(state.localPhoto.photo);
  const local = { key: 'local', name: 'Ảnh của bạn', photo: URL.createObjectURL(file), custom: true, path: null };
  state.localPhoto = local;
  state.model = local;
  renderModels();
  tryOn({ reveal: true });

  if (!state.profile) return;
  try {
    const path = await uploadBridePhoto(state.profile.id, file);   // AI thật cần ảnh nằm trên server
    const saved = photoModel({ path, url: local.photo });          // vẫn hiện bằng ảnh trong máy, khỏi tải lại
    state.myPhotos.unshift({ path, url: local.photo });
    state.localPhoto = null;
    if (state.model === local) state.model = saved;
    toast('Đã lưu ảnh riêng tư vào tài khoản – lần sau vào vẫn chọn lại được.', 'success');
    renderModels();
    renderAiButton();
  } catch (error) {
    toastError(error);
  }
}

// Ảnh váy mẫu (chế độ "Váy bạn chọn"): giống ảnh của bạn – lưu riêng tư để AI ướm thử
async function onGarmentSelected(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    toastError(new Error('Ảnh tối đa 10MB'));
    return;
  }
  if (state.profile && state.garments.length >= MAX_GARMENT_PHOTOS) {
    toastError(new Error(`Bạn đã lưu đủ ${MAX_GARMENT_PHOTOS} ảnh váy – bấm × trên ảnh cũ để xóa bớt`));
    return;
  }
  if (state.garment && !state.garment.path) URL.revokeObjectURL(state.garment.url);
  const local = { path: null, url: URL.createObjectURL(file) };
  state.garment = local;
  tryOn({ reveal: true });

  if (!state.profile) return;
  try {
    const path = await uploadBridePhoto(state.profile.id, file, 'garment');
    const saved = { path, url: local.url };
    state.garments.unshift(saved);
    if (state.garment === local) state.garment = saved;
    toast('Đã lưu ảnh váy – bấm "Ướm thử bằng AI thật" để ghép lên ảnh của bạn.', 'success');
    renderGarments();
    renderAiButton();
  } catch (error) {
    toastError(error);
  }
}

function confirmDeletePhoto(path) {
  openDialog({
    title: 'Xóa ảnh này?',
    content: html`<p>Ảnh sẽ bị xóa hẳn khỏi tài khoản của bạn và không khôi phục được.</p>`,
    confirmText: 'Xóa ảnh',
    danger: true,
    onConfirm: async () => {
      await deleteBridePhoto(path);
      state.myPhotos = state.myPhotos.filter((p) => p.path !== path);
      state.garments = state.garments.filter((g) => g.path !== path);
      for (const key of state.aiResults.keys()) if (key.split('|').includes(path)) state.aiResults.delete(key);
      if (state.model.path === path) state.model = MODELS[0];
      if (state.garment?.path === path) state.garment = null;
      toast('Đã xóa ảnh.', 'success');
      renderModels();
      tryOn({ reveal: true });
    },
  });
}

// ---------- THỬ VÁY BẰNG AI THẬT ----------
// Chọn váy chỉ hiện ảnh minh họa (miễn phí, tức thì). AI thật chỉ chạy khi bấm nút vì mỗi lần tốn phí.
// AI chưa bật (key Free tier / chưa cấu hình) → server trả fallback → giữ ảnh minh họa, báo lý do.

const AI_FALLBACK_MESSAGES = {
  'not-configured': 'AI thử váy thật chưa được bật – đang hiển thị ảnh minh họa cùng kiểu váy.',
  'free-tier': 'AI thử váy thật chưa được bật – đang hiển thị ảnh minh họa cùng kiểu váy.',
  'no-credits': 'Dịch vụ AI tạm hết lượt (cần nạp thêm credit) – đang hiển thị ảnh minh họa.',
  'bad-photo': 'AI chưa nhận ra người hoặc chiếc váy trong ảnh. Hãy dùng ảnh toàn thân rõ nét và ảnh thấy trọn chiếc váy.',
  'no-dress-photo': 'Mẫu này chưa có ảnh thật từ tiệm nên chưa thử bằng AI được.',
  'provider-error': 'Dịch vụ AI đang bận, vui lòng thử lại sau ít phút.',
};

// Khóa ảnh AI theo đúng người mẫu/ảnh + đúng váy đang chọn (mẫu của tiệm hoặc ảnh váy tự tải)
const garmentKey = () => (state.mode === 'own' ? state.garment?.path : state.dress?.id);
const aiKey = () => `${state.model.custom ? state.model.path : state.model.key}|${garmentKey()}`;
const currentAiImage = () => (state.mode === 'bespoke' ? null : state.aiResults.get(aiKey()));

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
  const own = state.mode === 'own';
  box.hidden = state.mode === 'bespoke' || (!own && !state.dress);
  if (box.hidden) return;

  let reason = '';
  if (!state.profile) reason = 'Đăng nhập để ghép váy lên ảnh bằng AI thật';
  else if (own && !state.garment) reason = 'Tải ảnh váy mẫu ở bước 2 trước nhé';
  else if (own && !state.garment.path) reason = 'Đang lưu ảnh váy…';
  else if (!own && !state.dress.image_url) reason = 'Mẫu này chưa có ảnh thật từ tiệm';
  else if (state.model.custom && !state.model.path) reason = 'Đang lưu ảnh của bạn…';
  else if (state.aiRemaining === 0) reason = `Đã dùng hết ${AI_DAILY_LIMIT} lượt AI hôm nay`;
  else if (currentAiImage()) reason = 'Đang xem ảnh AI đã ghép';
  else if (state.aiRemaining !== null) reason = `Còn ${state.aiRemaining}/${AI_DAILY_LIMIT} lượt hôm nay`;

  const garmentReady = own ? Boolean(state.garment?.path) : Boolean(state.dress.image_url);
  // Chưa đăng nhập vẫn bấm được → đưa tới trang đăng nhập
  button.disabled = state.aiBusy || (Boolean(state.profile) && (!garmentReady
    || (state.model.custom && !state.model.path) || state.aiRemaining === 0 || Boolean(currentAiImage())));
  hint.textContent = reason;
}

async function runAiTryOn() {
  if (!state.profile) {
    location.href = loginUrl(state.mode === 'own' ? 'tryon.html?mode=own' : `tryon.html?dress=${state.dress.slug}`);
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
    const result = await aiTryOn({
      ...(state.mode === 'own' ? { garmentPath: state.garment.path } : { dressId: state.dress.id }),
      ...(state.model.custom ? { photoPath: state.model.path } : { sampleModel: state.model.key }),
      body: { height: state.body.height, weight: state.body.weight, heel: state.body.heel },
    });

    if (result.fallback) {
      toast(AI_FALLBACK_MESSAGES[result.reason] ?? AI_FALLBACK_MESSAGES['provider-error']);
    } else {
      state.aiResults.set(key, result.imageUrl);
      state.aiHistory.unshift({ id: crypto.randomUUID(), url: result.imageUrl, createdAt: new Date().toISOString() });
      state.aiRemaining = result.remaining;
      state.showOriginal = false;
      state.historyView = null;
      renderAiHistory();
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
  state.historyView = null;
  renderAll();
  if (reveal && isPhoneLayout()) $('.mirror').scrollIntoView({ behavior: 'smooth', block: 'start' });
  const scan = $('#mirror-scan');
  scan.hidden = false;
  await sleep(900);
  scan.hidden = true;
}

// ---------- GIÁ TRỊ SUY RA ----------
function currentTheme() {
  if (state.mode === 'own') return null;          // váy tự chọn: không có ảnh minh họa, chỉ AI ghép
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
  if (state.mode === 'own') {
    // Váy tự chọn chưa có tiệm cho thuê → gợi ý may đo theo mẫu ở Trạm Hỷ Atelier
    const notes = $('#bespoke-notes');
    if (!notes.value.trim()) notes.value = 'May theo ảnh váy mẫu tôi đã ướm thử bằng AI trên Trạm Hỷ (sẽ gửi ảnh khi tư vấn).';
    switchMode('bespoke');
    toast('Chọn phom, chất liệu gần giống mẫu rồi đặt lịch – thợ may sẽ xem ảnh mẫu khi tư vấn.');
    return;
  }
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
  renderGarments();
  renderAiHistory();
  renderBody();
  renderThemeFilter();
  renderDressList();
  renderBespoke();
  renderMirror();
  renderSummary();
}

function renderMirror() {
  const theme = currentTheme();
  const isCustom = Boolean(state.model.custom);
  const img = $('#mirror-img');

  const aiImage = currentAiImage();

  if (state.historyView) {
    img.src = state.historyView;
    $('#mirror-label').textContent = '✨ Ảnh AI đã thử trước đây';
  } else if (state.showOriginal) {
    img.src = state.model.photo;
    $('#mirror-label').textContent = 'Ảnh gốc';
  } else if (aiImage) {
    img.src = aiImage;
    $('#mirror-label').textContent = '✨ Ảnh AI ghép váy thật';
  } else if (!theme) {
    img.src = state.model.photo;     // váy tự chọn: chưa có ảnh minh họa → hiện ảnh người, chờ AI ghép
    $('#mirror-label').textContent = state.mode === 'own' && state.garment ? 'Chưa ghép váy' : 'Ảnh gốc';
  } else {
    img.src = renderImageFor(isCustom ? 'user' : state.model.key, theme);
    $('#mirror-label').textContent = `Minh họa: ${DRESS_THEME[theme]}`;
  }
  $('#download-img').href = img.src;
  $('#toggle-original').textContent = state.showOriginal ? 'Xem ảnh đã thử váy' : 'Xem ảnh gốc';

  const note = $('#mirror-note');
  const showNote = !state.historyView && !state.showOriginal && !aiImage
    && (state.mode === 'own' ? Boolean(state.garment) : isCustom && Boolean(theme));
  note.hidden = !showNote;
  note.textContent = state.mode === 'own'
    ? 'Bấm "Ướm thử bằng AI thật" để AI ghép chiếc váy bạn chọn lên ảnh này.'
    : 'Đây là ảnh minh họa cùng kiểu váy. Bấm "Ướm thử bằng AI thật" để ghép váy lên chính ảnh của bạn.';
  renderFit();
  renderAiButton();
  for (const btn of $$('#ai-history-list [data-history]')) {
    btn.classList.toggle('active', btn.dataset.history === state.historyView);
  }
}

function renderFit() {
  const theme = currentTheme();
  if (!theme) {
    $('#fit-score').textContent = '–';
    $('#fit-tip').textContent = 'Điểm tôn dáng tính cho mẫu có sẵn và váy tự thiết kế. Với váy bạn chọn, hãy xem ảnh AI ghép.';
    return;
  }
  const { score, tip } = fitScore(state.body, theme);
  $('#fit-score').textContent = `${score}%`;
  $('#fit-tip').textContent = tip;
}

function renderModels() {
  const models = [
    ...MODELS,
    ...(state.localPhoto ? [state.localPhoto] : []),
    ...state.myPhotos.map(photoModel),
  ];
  render($('#models'), models.map((m) => html`
    <div class="model-wrap">
      <button class="model ${m.key === state.model.key ? 'active' : ''}" type="button" data-model="${m.key}">
        <img src="${m.photo}" alt="">${m.name}
      </button>
      ${m.path ? html`<button class="model-remove" type="button" data-remove="${m.path}" title="Xóa ảnh" aria-label="Xóa ảnh">×</button>` : ''}
    </div>`));
  for (const btn of $$('[data-model]')) {
    btn.addEventListener('click', () => {
      state.model = models.find((m) => m.key === btn.dataset.model);
      tryOn({ reveal: true });
    });
  }
  for (const btn of $$('#models [data-remove]')) {
    btn.addEventListener('click', () => confirmDeletePhoto(btn.dataset.remove));
  }
  $('#photo-note').textContent = !state.profile
    ? 'Đăng nhập để lưu ảnh và chọn lại ở lần sau.'
    : `Ảnh được lưu riêng tư – chỉ bạn xem được (${state.myPhotos.length}/${MAX_BRIDE_PHOTOS} ảnh).`;
}

function renderGarments() {
  const list = [
    ...(state.garment && !state.garment.path ? [state.garment] : []),
    ...state.garments,
  ];
  render($('#garments'), list.map((g, i) => html`
    <div class="model-wrap">
      <button class="model ${g === state.garment || (g.path && g.path === state.garment?.path) ? 'active' : ''}"
              type="button" data-garment="${i}">
        <img src="${g.url}" alt="">Váy ${i + 1}
      </button>
      ${g.path ? html`<button class="model-remove" type="button" data-remove="${g.path}" title="Xóa ảnh váy" aria-label="Xóa ảnh váy">×</button>` : ''}
    </div>`));
  for (const btn of $$('[data-garment]')) {
    btn.addEventListener('click', () => {
      state.garment = list[Number(btn.dataset.garment)];
      tryOn({ reveal: true });
    });
  }
  for (const btn of $$('#garments [data-remove]')) {
    btn.addEventListener('click', () => confirmDeletePhoto(btn.dataset.remove));
  }
  $('#garment-note').textContent = !state.profile
    ? 'Đăng nhập để lưu ảnh váy và ướm thử bằng AI.'
    : list.length ? `Đã lưu ${state.garments.length}/${MAX_GARMENT_PHOTOS} ảnh váy – riêng tư, chỉ bạn xem được.` : '';
}

function renderAiHistory() {
  $('#ai-history').hidden = !state.aiHistory.length;
  render($('#ai-history-list'), state.aiHistory.map((r) => html`
    <button type="button" data-history="${r.url}" class="${r.url === state.historyView ? 'active' : ''}"
            title="${new Date(r.createdAt).toLocaleString('vi-VN')}">
      <img src="${r.url}" alt="Ảnh đã thử bằng AI">
    </button>`));
  for (const btn of $$('#ai-history-list [data-history]')) {
    btn.addEventListener('click', () => {
      state.historyView = btn.dataset.history;
      state.showOriginal = false;
      renderMirror();
      if (isPhoneLayout()) $('.mirror').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  if (state.mode === 'own') {
    $('#book-btn').disabled = false;
    $('#cta-book').disabled = false;
    $('#book-btn').textContent = 'Đặt may theo mẫu này';
    render($('#summary'), html`
      <p class="small muted" style="margin:0">Ưng chiếc váy bạn chọn? <strong>Trạm Hỷ Atelier</strong> may đo theo mẫu và đúng số đo của bạn,
        tiền cọc vẫn được giữ an toàn 3 đợt.</p>`);
    $('#cta-name').textContent = 'Váy bạn chọn';
    $('#cta-price').textContent = 'May đo theo mẫu';
    return;
  }
  $('#book-btn').textContent = 'Đặt lịch thử váy';
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
await Promise.all([loadDresses(), loadBodyProfile(), loadAiRemaining(), loadMyPhotos(), loadAiHistory()]);
if (param('mode') === 'own') switchMode('own');      // quay lại sau khi đăng nhập từ "Váy bạn chọn"
renderAll();
