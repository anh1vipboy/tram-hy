// Phòng thử váy AI dạng trò chuyện: chọn "Ảnh của bạn" + "Váy cưới" ở khung soạn tin, bấm gửi (kèm tin nhắn
// nếu muốn) → AI ướm váy, ảnh hiện ngay trong khung chat. Chỉ ướm váy lên ảnh: không đổi nền, khung, không video.
//   - Tin nhắn chữ → Edge Function tro-ly-thu-vay (Gemini): ướm hay hỏi đáp, ghi chú cách mặc, gợi ý kiểu váy
//   - Ướm váy → Edge Function thu-vay-ai (FASHN). Lịch sử dựng lại từ bảng tryon_jobs (SQL 28).
// Tự thiết kế váy may đo nằm ở trang riêng: thiet-ke-vay.html.
import { initLayout } from '../core/layout.js';
import { $, $$, html, render, money, param, debounce, sizedImage } from '../core/utils.js';
import { priceTag } from '../core/labels.js';
import { toast, toastError, openDialog } from '../core/ui.js';
import { loginUrl } from '../core/auth.js';
import { listDresses } from '../services/catalog.js';
import {
  getBodyProfile, saveBodyProfile, uploadBridePhoto, listBridePhotos, deleteBridePhoto,
  MAX_BRIDE_PHOTOS, MAX_GARMENT_PHOTOS,
} from '../services/profile.js';
import {
  aiTryOn, askTryonAssistant, creditsUsedToday, getTryonSettings, listTryonHistory, tryonCost,
} from '../services/tryon-ai.js';
import { openBookingDialog } from '../components/booking-dialog.js';
import { openDressGallery, realPhotoCount } from '../components/dress-gallery.js';
import { resultViewer } from '../components/tryon-result.js';
import { openPersonSheet, openDressSheet, openSettingsSheet, QUALITY_SECONDS } from '../components/tryon-sheets.js';
import { MODELS, dressThumb, fitScore } from '../data/tryon-data.js';

// ---------- TÙY CHỈNH (nhớ trên máy) ----------
// Giá trị phải khớp readOptions() của Edge Function thu-vay-ai
const OPTIONS_KEY = 'tramhy.tryon-chat-options';
const OPTION_DEFAULTS = {
  model: 'max',                                        // Siêu nét khi admin bật, không thì tự dùng Tiêu chuẩn
  quality: { max: 'balanced', standard: 'quality' },   // Tiêu chuẩn: chất lượng không đổi giá → mặc định đẹp nhất
  samples: 1,
  category: 'one-pieces',
  photoType: 'auto',
  cleanOriginal: false,
};

function loadOptions() {
  try {
    const saved = JSON.parse(localStorage.getItem(OPTIONS_KEY) ?? '{}');
    const options = { ...OPTION_DEFAULTS, ...saved, quality: { ...OPTION_DEFAULTS.quality, ...saved.quality } };
    // Giá trị lạ (bản cũ, sửa tay) → về mặc định, tránh tính sai credit
    for (const model of ['max', 'standard']) {
      if (!['fast', 'balanced', 'quality'].includes(options.quality[model])) options.quality[model] = OPTION_DEFAULTS.quality[model];
    }
    if (![1, 2, 3, 4].includes(options.samples)) options.samples = 1;
    return options;
  } catch {
    return structuredClone(OPTION_DEFAULTS);
  }
}

function saveOptions() {
  try {
    localStorage.setItem(OPTIONS_KEY, JSON.stringify(state.options));
  } catch { /* trình duyệt chặn lưu → lần sau dùng mặc định */ }
}

// ---------- TRẠNG THÁI TRANG ----------
const state = {
  profile: null,
  dresses: [],              // mẫu váy của các tiệm (chỉ mẫu có ảnh thật mới ướm bằng AI được)
  myPhotos: [],             // ảnh của bạn đã lưu: [{ path, url }] (mới nhất trước)
  garments: [],             // ảnh váy tự tải đã lưu: [{ path, url }]
  person: null,             // ảnh người đang chọn: { key, name, photo, path? | sample?, uploading? }
  garment: null,            // váy đang chọn: { kind: 'dress', dress, … } | { kind: 'own', path, … }
  settings: { maxEnabled: false, dailyCredits: 6 },   // admin chỉnh ở trang Quản trị (SQL 28)
  remaining: null,          // credit AI còn lại hôm nay (null = chưa biết)
  options: loadOptions(),
  body: { height: 160, weight: 49, heel: 7, shape: 'hourglass' },
  busy: false,
  chat: [],                 // tin nhắn chữ gần đây, gửi kèm cho trợ lý hiểu ngữ cảnh: [{ role, text }]
  history: { batches: [], cursor: null },
};
const runs = new Map();     // các lần ướm trong phiên → "Thử kiểu khác" dùng lại đúng ảnh + váy của lần đó

const INTRO = 'Mình sẽ ướm chiếc váy lên ảnh của bạn, giữ nguyên khuôn mặt, dáng người và khung cảnh nhé!';
const FALLBACK_MESSAGES = {
  'not-configured': 'AI ướm váy chưa được bật trên web – bạn quay lại sau nhé.',
  'free-tier': 'AI ướm váy chưa được bật trên web – bạn quay lại sau nhé.',
  'no-credits': 'Dịch vụ AI tạm hết lượt (cần nạp thêm credit) – bạn quay lại sau ít phút nhé.',
  'bad-photo': 'Mình chưa nhận ra người hoặc chiếc váy trong ảnh. Bạn thử ảnh rõ mặt, đứng thẳng và ảnh thấy trọn chiếc váy nhé.',
  'no-dress-photo': 'Mẫu này chưa có ảnh thật từ tiệm nên mình chưa ướm được – bạn chọn mẫu khác nhé.',
  'provider-error': 'Dịch vụ AI đang bận, bạn thử lại sau ít phút nhé.',
};
const MAX_SECONDS = { fast: 25, balanced: 45, quality: 60 };   // Siêu nét: thời gian chờ ước tính 1 ảnh

// ---------- NGƯỜI & VÁY ----------
function samplePerson(key) {
  const model = MODELS.find((m) => m.key === key);
  return model && { key: `sample:${model.key}`, sample: model.key, name: model.name, photo: model.photo };
}
const photoPerson = ({ path, url }) => ({ key: path, path, name: 'Ảnh của bạn', photo: url });
const dressGarment = (dress) => ({ kind: 'dress', key: `dress:${dress.id}`, dress, name: dress.name, photo: sizedImage(dress.image_url, 480) });
const ownGarment = ({ path, url }) => ({ kind: 'own', key: path, path, name: 'Váy bạn tải lên', photo: url });
const findDress = (id) => state.dresses.find((d) => d.id === id);

const personParams = (p) => (p.path ? { photoPath: p.path } : { sampleModel: p.sample });
const garmentParams = (g) => (g.kind === 'dress' ? { dressId: g.dress.id } : { garmentPath: g.path });
const garmentInfo = (g) => (!g ? null : g.kind === 'own'
  ? { kind: 'own' }
  : { kind: 'dress', name: g.dress.name, theme: g.dress.theme, vendor: g.dress.vendor.name });

// Tùy chọn thật sự gửi đi: admin tắt Siêu nét → Tiêu chuẩn; mẫu của tiệm luôn là váy liền
function effectiveOptions(garment = state.garment) {
  const o = state.options;
  const model = o.model === 'max' && state.settings.maxEnabled ? 'max' : 'standard';
  return {
    model,
    quality: o.quality[model],
    samples: o.samples,
    category: garment?.kind === 'own' ? o.category : 'one-pieces',
    photoType: o.photoType,
    cleanOriginal: o.cleanOriginal,
  };
}

function setOption(key, value) {
  if (key === 'quality') state.options.quality[effectiveOptions().model] = value;
  else state.options[key] = value;
  saveOptions();
  renderComposer();
}

const isAdmin = () => state.profile?.role === 'admin';
const modelName = (model) => ({ max: 'Siêu nét', gemini: 'Gemini' }[model] ?? 'Tiêu chuẩn');
const estimateSeconds = (o) => (o.model === 'max'
  ? MAX_SECONDS[o.quality] + (o.samples - 1) * 10
  : QUALITY_SECONDS[o.quality] + (o.samples - 1) * 4);
const returnPath = () => (state.garment?.kind === 'dress' ? `tryon.html?dress=${state.garment.dress.slug}` : 'tryon.html');

// ---------- TẢI DỮ LIỆU ----------
async function loadDresses() {
  try {
    state.dresses = await listDresses();
  } catch (error) {
    toastError(error);
  }
}

async function loadAccountData() {
  if (!state.profile) return;
  const id = state.profile.id;
  const [body, photos, garments, used, history] = await Promise.allSettled([
    getBodyProfile(id), listBridePhotos(id, 'body'), listBridePhotos(id, 'garment'), creditsUsedToday(), listTryonHistory(),
  ]);
  if (body.value) {
    const b = body.value;
    state.body = { height: b.height_cm, weight: b.weight_kg, heel: b.heel_cm, shape: b.body_shape || 'hourglass' };
  }
  state.myPhotos = photos.value ?? [];
  state.garments = garments.value ?? [];
  if (used.status === 'fulfilled' && !isAdmin()) state.remaining = Math.max(0, state.settings.dailyCredits - used.value);
  if (history.value) state.history = history.value;
  for (const failed of [body, photos, garments].filter((r) => r.status === 'rejected')) toastError(failed.reason);
}

const persistBody = debounce(async () => {
  if (!state.profile) return;
  try {
    await saveBodyProfile(state.profile.id, state.body);
  } catch (error) {
    toastError(error);
  }
}, 800);

// ---------- KHUNG CHAT ----------
const thread = () => $('#chat-thread');

// Bám đáy khung chat: ảnh trong tin nhắn tải xong làm khung cao thêm → cuộn tiếp xuống, trừ khi người dùng
// đang cuộn lên xem tin cũ. pinUntil: vừa tự cuộn (đang trượt mượt) thì vẫn coi như đang ở đáy.
let followBottom = true;
let pinUntil = 0;

function scrollToEnd(behavior = 'smooth') {
  pinUntil = Date.now() + 1500;
  requestAnimationFrame(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior }));
}

// Thanh tiêu đề "Phòng thử váy AI" dính ngay dưới header – header cao khác nhau giữa máy tính và điện thoại → đo thật
function trackHeaderHeight() {
  const header = $('#app-header');
  const update = () => document.documentElement.style.setProperty('--header-h', `${header.offsetHeight}px`);
  new ResizeObserver(update).observe(header);
  update();
}

function initAutoScroll() {
  window.addEventListener('scroll', () => {
    followBottom = document.documentElement.scrollHeight - (window.scrollY + window.innerHeight) < 160;
  }, { passive: true });
  thread().addEventListener('load', () => {
    if (!followBottom && Date.now() > pinUntil) return;
    requestAnimationFrame(() => window.scrollTo({ top: document.documentElement.scrollHeight }));
  }, true);                                    // sự kiện load của ảnh không nổi bọt → bắt ở pha capture
}

// Một dòng tin nhắn; role 'ai' có ảnh đại diện. Trả về phần thân để vẽ nội dung vào.
function addRow(role, container = thread()) {
  const row = document.createElement('div');
  row.className = `msg-row ${role}`;
  render(row, html`${role === 'ai' ? html`<img class="msg-avatar" src="assets/images/logo.webp" alt="">` : ''}
    <div class="msg-body"></div>`);
  container.append(row);
  return $('.msg-body', row);
}

// Nút gợi ý dưới tin nhắn: { act, label, arg?, primary? } – xử lý ở onThreadClick
const chipRow = (chips) => (chips.length ? html`
  <div class="suggest-row">
    ${chips.map((c) => html`
      <button type="button" class="suggest ${c.primary ? 'primary' : ''}" data-act="${c.act}" data-arg="${c.arg ?? ''}">${c.label}</button>`)}
  </div>` : '');

function postAi(text, chips = []) {
  const body = addRow('ai');
  render(body, html`${text ? html`<p class="msg-text">${text}</p>` : ''}${chipRow(chips)}`);
  scrollToEnd();
  return body;
}

function postUser({ person, garment, text, time }, container) {
  const body = addRow('user', container);
  const attachments = [person, garment].filter(Boolean);
  render(body, html`
    ${attachments.length ? html`
      <div class="msg-attachments">
        ${attachments.map((a) => html`
          <figure>
            ${a.photo ? html`<img src="${a.photo}" alt="">` : html`<span class="ph" aria-hidden="true">🖼️</span>`}
            <figcaption>${a.photo ? a.name : a.gone ?? 'Ảnh đã xóa'}</figcaption>
          </figure>`)}
      </div>` : ''}
    ${text ? html`<p class="msg-bubble">${text}</p>` : ''}
    ${time ? html`<span class="msg-time">${time}</span>` : ''}`);
  if (!container) scrollToEnd();
}

function postTyping() {
  const body = addRow('ai');
  render(body, html`<span class="typing" role="status" aria-label="Trợ lý đang trả lời"><i></i><i></i><i></i></span>`);
  scrollToEnd();
  return () => body.parentElement.remove();
}

const postLoginPrompt = () => postAi('Bạn đăng nhập để mình ướm váy lên ảnh nhé – ảnh được lưu riêng tư, chỉ bạn xem được.',
  [{ act: 'login', label: '🔑 Đăng nhập', primary: true }]);

const fitText = ({ score, tip }) => html`Độ tôn dáng với số đo của bạn: <strong>${score}%</strong> – ${tip}`;

// Độ tôn dáng trong các tin nhắn cập nhật theo số đo (sửa ở Tùy chỉnh)
function updateFitLines() {
  for (const el of $$('[data-fit]')) render(el, fitText(fitScore(state.body, el.dataset.fit)));
}

function dressCard(dress) {
  const photos = realPhotoCount(dress);
  return html`
    <article class="dress-card">
      <div class="dress-card-photo">
        <img src="${dress.image_url ? sizedImage(dress.image_url, 360) : dressThumb(dress)}" alt="${dress.name}">
        ${dress.image_url ? '' : html`<span class="dress-card-tag">Ảnh minh họa</span>`}
      </div>
      <div class="dress-card-info">
        <strong class="dress-card-name">${dress.name}</strong>
        <span class="small muted">${dress.vendor.name}${dress.vendor.district ? ` · ${dress.vendor.district}` : ''}</span>
        ${priceTag(dress)}
        <span class="fit-line small" data-fit="${dress.theme}">${fitText(fitScore(state.body, dress.theme))}</span>
        <div class="dress-card-actions">
          <button type="button" class="btn btn-primary btn-sm" data-act="book" data-arg="${dress.id}">📅 Đặt lịch thử váy</button>
          ${photos ? html`<button type="button" class="btn btn-outline btn-sm" data-act="photos" data-arg="${dress.id}">Xem ${photos} ảnh thật</button>` : ''}
        </div>
      </div>
    </article>`;
}

function postWelcome() {
  const returning = state.history.batches.length > 0;
  const body = addRow('ai');
  render(body, html`
    ${returning
      ? html`<p class="msg-text">Chào bạn quay lại! Chọn ảnh và váy ở khung bên dưới rồi bấm gửi để ướm tiếp nhé.</p>`
      : html`
        <p class="msg-text">Chào bạn 👋 Mình là trợ lý thử váy của Trạm Hỷ.</p>
        <p class="msg-text">Gửi mình <strong>1 ảnh của bạn</strong> và <strong>1 chiếc váy cưới</strong> bạn thích – mình sẽ ướm váy
          lên ảnh, giữ nguyên khuôn mặt, dáng người và khung cảnh.</p>
        <ol class="chat-steps">
          <li><span aria-hidden="true">👤</span><strong>Ảnh của bạn</strong><small>hoặc người mẫu có sẵn</small></li>
          <li><span aria-hidden="true">👗</span><strong>Váy cưới</strong><small>mẫu của tiệm hoặc ảnh bạn tải lên</small></li>
          <li><span aria-hidden="true">✨</span><strong>Bấm gửi</strong><small>ảnh ướm thử hiện ngay đây</small></li>
        </ol>`}
    ${chipRow([
      { act: 'person', label: '📷 Chọn ảnh của bạn' },
      { act: 'dress', label: '👗 Chọn váy có sẵn' },
      { act: 'ask', arg: 'Váy cưới kiểu nào hợp với dáng của mình?', label: '💡 Váy nào hợp dáng mình?' },
    ])}`);
}

// Mở từ "Thử váy này" (?dress=…): giới thiệu mẫu + đặt lịch + độ tôn dáng
function postDressIntro(dress) {
  const canTry = Boolean(dress.image_url);
  const body = addRow('ai');
  render(body, html`
    <p class="msg-text">Bạn đang xem mẫu <strong>${dress.name}</strong> của ${dress.vendor.name}.
      ${canTry ? 'Chọn 1 ảnh của bạn rồi bấm gửi – mình ướm chiếc váy này lên cho bạn xem nhé!'
        : 'Mẫu này chưa có ảnh thật từ tiệm nên mình chưa ướm bằng AI được – bạn vẫn đặt lịch thử tại tiệm được nhé.'}</p>
    ${dressCard(dress)}
    ${canTry && !state.person ? chipRow([{ act: 'person', label: '📷 Chọn ảnh của bạn', primary: true }]) : ''}`);
}

// Vài mẫu của tiệm đúng kiểu trợ lý gợi ý – bấm để chọn vào ô "Váy cưới"
function appendSuggestions(body, theme) {
  const list = state.dresses.filter((d) => d.theme === theme && d.image_url).slice(0, 6);
  if (!list.length) return;
  const wrap = document.createElement('div');
  wrap.className = 'suggest-dresses';
  render(wrap, list.map((d) => html`
    <button type="button" class="mini-dress" data-act="pick-dress" data-arg="${d.id}">
      <img src="${sizedImage(d.image_url, 240)}" alt="" loading="lazy">
      <span class="mini-name">${d.name}</span>
      <span class="mini-price">${money(d.price)}</span>
    </button>`));
  body.append(wrap);
  scrollToEnd();
}

// Các lần ướm đã lưu (mới nhất trước) → khối tin nhắn để chèn lên đầu khung chat
function historyBlock(batches) {
  const block = document.createElement('div');
  block.className = 'chat-history';
  for (const b of [...batches].reverse()) {
    const dress = b.dressId ? findDress(b.dressId) : null;
    // Ảnh người: người mẫu có sẵn | ảnh đã lưu | đã xóa; lần ướm trước SQL 28 không ghi ảnh người → bỏ qua
    const person = b.personSample ? samplePerson(b.personSample)
      : b.personUrl || b.personDeleted ? { name: 'Ảnh của bạn', photo: b.personUrl } : null;
    const garment = dress ? { name: dress.name, photo: dress.image_url ? sizedImage(dress.image_url, 480) : dressThumb(dress) }
      : b.dressId ? { name: 'Mẫu váy', photo: null, gone: 'Mẫu đã gỡ' }
      : { name: 'Váy bạn tải lên', photo: b.garmentUrl };
    const time = new Date(b.createdAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
    postUser({ person, garment, text: b.message, time }, block);
    const meta = [b.model && modelName(b.model), b.images.length > 1 && `${b.images.length} ảnh`].filter(Boolean).join(' · ');
    addRow('ai', block).append(resultViewer({ images: b.images, original: person?.photo ?? null, meta }));
  }
  return block;
}

function renderHistoryMore() {
  $('#history-more')?.remove();
  if (!state.history.cursor) return;
  thread().insertAdjacentHTML('afterbegin',
    '<button type="button" class="history-more" id="history-more" data-act="more-history">Xem các lần ướm trước</button>');
}

async function loadMoreHistory(button) {
  button.disabled = true;
  try {
    const page = await listTryonHistory({ before: state.history.cursor });
    state.history.cursor = page.cursor;
    // Chèn lên trên mà không làm khung nhìn nhảy
    const before = document.documentElement.scrollHeight;
    button.after(historyBlock(page.batches));
    window.scrollBy(0, document.documentElement.scrollHeight - before);
    renderHistoryMore();
  } catch (error) {
    toastError(error);
    button.disabled = false;
  }
}

function buildThread() {
  render(thread(), '');
  if (state.history.batches.length) thread().append(historyBlock(state.history.batches));
  renderHistoryMore();
  postWelcome();
  const linked = param('dress') && state.dresses.find((d) => d.slug === param('dress'));
  if (linked) postDressIntro(linked);
}

// ---------- GỬI TIN ----------
function nudgeMissing() {
  const missing = !state.person ? 'person' : 'dress';
  const slot = $(`[data-slot="${missing}"]`);
  slot?.classList.remove('nudge');
  void slot?.offsetWidth;              // chạy lại hiệu ứng rung
  slot?.classList.add('nudge');
  toast(missing === 'person' ? 'Chọn ảnh của bạn trước nhé.' : 'Chọn chiếc váy muốn thử nhé.');
}

// preset: câu gửi từ nút gợi ý; không có → lấy chữ trong khung soạn tin
async function send(preset) {
  if (state.busy) return;
  const fromComposer = preset === undefined;
  const text = (fromComposer ? $('#composer-text').value : preset).trim();
  const { person, garment } = state;
  if (person?.uploading || garment?.uploading) {
    toast('Đợi ảnh tải lên xong nhé…');
    return;
  }
  if (!text && !(person && garment)) {
    nudgeMissing();
    return;
  }
  if (fromComposer) {
    $('#composer-text').value = '';
    autosize();
  }
  postUser({ person, garment, text });
  if (!state.profile) {
    postLoginPrompt();
    return;
  }

  let plan = { action: 'tryon', prompt: '', samples: 0 };
  if (text) {
    plan = await consultAssistant(text, person, garment);
    if (plan.action !== 'tryon') return;
  } else {
    postAi(INTRO);
  }
  if (!person || !garment) return;                 // trợ lý đã nhắc chọn ảnh / váy
  await runTryOn({ person, garment, prompt: plan.prompt, samples: plan.samples, message: text });
}

async function consultAssistant(text, person, garment) {
  const ready = Boolean(person && garment);
  state.busy = true;
  renderComposer();
  const stopTyping = postTyping();
  let plan;
  try {
    plan = await askTryonAssistant({
      message: text,
      hasPerson: Boolean(person),
      garment: garmentInfo(garment),
      model: effectiveOptions(garment).model,
      body: state.body,
      history: state.chat.slice(-6),
    });
  } catch (error) {
    // Trợ lý lỗi → vẫn ướm được nếu đã đủ ảnh và váy
    plan = { action: ready ? 'tryon' : 'chat', reply: ready ? INTRO : error.message, prompt: '', samples: 0, theme: '' };
  } finally {
    stopTyping();
    state.busy = false;
    renderComposer();
  }
  state.chat.push({ role: 'user', text }, { role: 'ai', text: plan.reply });

  const chips = [];
  if (plan.action === 'tryon' && !person) chips.push({ act: 'person', label: '📷 Chọn ảnh của bạn', primary: true });
  if (plan.action === 'tryon' && !garment) chips.push({ act: 'dress', label: '👗 Chọn váy', primary: !chips.length });
  if (plan.action === 'chat' && ready && !plan.theme) chips.push({ act: 'tryon', label: '✨ Ướm thử ngay', primary: true });
  const body = postAi(plan.reply, chips);
  if (plan.theme) appendSuggestions(body, plan.theme);
  return plan;
}

// Một lần ướm: { person, garment, prompt, samples, message } – prompt/samples do trợ lý đọc từ tin nhắn
async function runTryOn(run) {
  const { person, garment } = run;
  const options = { ...effectiveOptions(garment), ...(run.samples ? { samples: run.samples } : {}) };
  const cost = tryonCost(options);
  if (state.remaining !== null && cost > state.remaining) {
    postAi(state.remaining
      ? `Lần ướm này cần ${cost} credit nhưng hôm nay bạn còn ${state.remaining} credit – bạn giảm số ảnh hoặc chất lượng trong Tùy chỉnh nhé.`
      : `Bạn đã dùng hết ${state.settings.dailyCredits} credit thử váy hôm nay. Mai quay lại ướm tiếp nhé!`,
    state.remaining ? [{ act: 'settings', label: '⚙️ Mở Tùy chỉnh' }] : []);
    return;
  }

  const runId = String(runs.size + 1);
  runs.set(runId, run);
  state.busy = true;
  renderComposer();
  const body = addRow('ai');
  const seconds = estimateSeconds(options);
  render(body, html`
    <div class="gen gen-pending">
      <div class="gen-head">
        <span class="gen-tag">✨ Đang ướm váy</span>
        <span class="gen-meta">${modelName(options.model)} · khoảng ${seconds}–${seconds * 2} giây</span>
      </div>
      <div class="gen-frame">
        <img class="gen-ghost" src="${person.photo}" alt="">
        <div class="gen-wait"><span class="spinner" aria-hidden="true"></span>AI đang ướm váy lên ảnh của bạn…</div>
        <div class="gen-progress"><span></span></div>
      </div>
    </div>`);
  $('.gen-pending', body).style.setProperty('--eta', `${seconds * 1.6}s`);
  scrollToEnd();

  try {
    const result = await aiTryOn({
      ...garmentParams(garment),
      ...personParams(person),
      body: { height: state.body.height, weight: state.body.weight, heel: state.body.heel },
      options: { ...options, seed: Math.floor(Math.random() * 2 ** 31) },     // seed mới → mỗi lần một kiểu
      prompt: run.prompt,
      message: run.message,
    });
    if (result.fallback) {
      body.parentElement.remove();
      postAi(FALLBACK_MESSAGES[result.reason] ?? FALLBACK_MESSAGES['provider-error'],
        result.reason === 'no-dress-photo' ? [{ act: 'dress', label: '👗 Chọn váy khác' }] : [{ act: 'again', arg: runId, label: '↻ Thử lại' }]);
      return;
    }
    const images = result.images?.length ? result.images : [result.imageUrl];
    if (typeof result.remaining === 'number') state.remaining = result.remaining;
    if (result.limit) state.settings.dailyCredits = result.limit;
    const meta = [modelName(result.provider === 'gemini' ? 'gemini' : options.model), images.length > 1 && `${images.length} ảnh`]
      .filter(Boolean).join(' · ');
    body.replaceChildren(resultViewer({ images, original: person.photo, meta }));
    const fit = garment.kind === 'dress' ? garment.dress.theme : null;
    body.insertAdjacentHTML('beforeend', html`
      <p class="msg-text">${images.length > 1
        ? `Xong rồi! Mình ướm ${images.length} kiểu – bấm từng ảnh nhỏ để xem kiểu bạn ưng nhất.`
        : 'Xong rồi! Bạn thấy chiếc váy này thế nào?'}</p>
      ${fit ? html`<p class="fit-line small" data-fit="${fit}">${fitText(fitScore(state.body, fit))}</p>` : ''}
      ${chipRow([
        { act: 'again', arg: runId, label: '🎲 Thử kiểu khác' },
        { act: 'dress', label: '👗 Đổi váy khác' },
        garment.kind === 'dress'
          ? { act: 'book', arg: garment.dress.id, label: '📅 Đặt lịch thử váy này', primary: true }
          : { act: 'bespoke', label: '✂️ Đặt may theo mẫu này', primary: true },
      ])}`.value);
    scrollToEnd();
  } catch (error) {
    body.parentElement.remove();
    if (typeof error.remaining === 'number') state.remaining = error.remaining;
    if (/Siêu nét đang tắt/.test(error.message)) state.settings.maxEnabled = false;
    postAi(error.message, state.remaining === 0 ? [] : [{ act: 'again', arg: runId, label: '↻ Thử lại' }]);
  } finally {
    state.busy = false;
    renderComposer();
  }
}

function runAgain(runId) {
  const run = runs.get(runId);
  if (!run || state.busy) return;
  postUser({ text: '🎲 Thử kiểu khác' });
  runTryOn({ ...run, message: '' });
}

function bookDress(id) {
  const dress = findDress(id);
  if (!dress) return;
  openBookingDialog({
    vendorId: dress.vendor.id,
    vendorName: dress.vendor.name,
    dressId: dress.id,
    title: dress.name,
    price: dress.price,
    type: dress.type === 'bespoke' ? 'bespoke_manual' : 'rental',
    details: { body: state.body },
  }, `tryon.html?dress=${dress.slug}`).catch(toastError);
}

function onThreadClick(e) {
  const button = e.target.closest('[data-act]');
  if (!button || button.disabled) return;
  const { act, arg } = button.dataset;
  if (act === 'person') openPersonPicker();
  else if (act === 'dress') openDressPicker('catalog');
  else if (act === 'ask') send(arg);
  else if (act === 'tryon') send('');
  else if (act === 'again') runAgain(arg);
  else if (act === 'settings') openSettings();
  else if (act === 'login') location.href = loginUrl(returnPath());
  else if (act === 'book') bookDress(arg);
  else if (act === 'photos') openDressGallery(findDress(arg)).catch(toastError);
  else if (act === 'pick-dress') pickDress(arg, { announce: true });
  else if (act === 'bespoke') location.href = 'thiet-ke-vay.html?tu=anh-vay';
  else if (act === 'more-history') loadMoreHistory(button);
}

// ---------- CHỌN ẢNH & VÁY ----------
function focusComposer() {
  if (matchMedia('(pointer: fine)').matches) $('#composer-text').focus();   // điện thoại: không bật bàn phím
}

// Mẫu của tiệm thì ghi lên đường dẫn → đăng nhập xong / chia sẻ link quay lại đúng mẫu
function syncUrl() {
  const dress = state.garment?.kind === 'dress' ? state.garment.dress : null;
  history.replaceState(null, '', dress ? `?dress=${dress.slug}` : location.pathname);
}

function pickDress(id, { announce = false } = {}) {
  const dress = findDress(id);
  if (!dress) return;
  state.garment = dressGarment(dress);
  syncUrl();
  renderComposer();
  if (announce) toast(`Đã chọn “${dress.name}” – bấm gửi để ướm thử nhé.`, 'success');
  focusComposer();
}

function checkFile(file, count, max, what) {
  if (file.size > 10 * 1024 * 1024) {
    toastError(new Error('Ảnh tối đa 10MB'));
    return false;
  }
  if (count >= max) {
    toastError(new Error(`Bạn đã lưu đủ ${max} ${what} – bấm × trên ảnh cũ để xóa bớt rồi tải lại`));
    return false;
  }
  return true;
}

// Ảnh mới tải hiện ngay bằng ảnh trong máy, lưu riêng tư lên server ở nền (AI cần ảnh nằm trên server)
async function uploadPhoto(file, kind) {
  const isPerson = kind === 'body';
  if (!checkFile(file, isPerson ? state.myPhotos.length : state.garments.length,
    isPerson ? MAX_BRIDE_PHOTOS : MAX_GARMENT_PHOTOS, isPerson ? 'ảnh' : 'ảnh váy')) return;
  const local = { key: 'uploading', name: isPerson ? 'Ảnh của bạn' : 'Váy bạn tải lên', photo: URL.createObjectURL(file), uploading: true };
  if (isPerson) state.person = local;
  else state.garment = { ...local, kind: 'own' };
  const current = isPerson ? () => state.person : () => state.garment;
  const placeholder = current();
  if (!isPerson) syncUrl();
  renderComposer();
  try {
    const path = await uploadBridePhoto(state.profile.id, file, kind);
    const saved = { path, url: local.photo };
    (isPerson ? state.myPhotos : state.garments).unshift(saved);
    if (current() === placeholder) {
      if (isPerson) state.person = photoPerson(saved);
      else state.garment = ownGarment(saved);
    }
    toast(isPerson ? 'Đã lưu ảnh riêng tư vào tài khoản – lần sau vào vẫn chọn lại được.'
      : 'Đã lưu ảnh váy – bấm gửi để AI ướm lên ảnh của bạn.', 'success');
  } catch (error) {
    if (current() === placeholder) {
      if (isPerson) state.person = null;
      else state.garment = null;
    }
    toastError(error);
  }
  renderComposer();
}

// Xóa ảnh đã lưu (từ tấm chọn) – trả về true nếu đã xóa để tấm chọn vẽ lại
async function confirmDelete(path) {
  const done = await openDialog({
    title: 'Xóa ảnh này?',
    content: html`<p>Ảnh sẽ bị xóa hẳn khỏi tài khoản của bạn và không khôi phục được.</p>`,
    confirmText: 'Xóa ảnh',
    danger: true,
    onConfirm: () => deleteBridePhoto(path),
  });
  if (!done) return false;
  state.myPhotos = state.myPhotos.filter((p) => p.path !== path);
  state.garments = state.garments.filter((g) => g.path !== path);
  if (state.person?.path === path) state.person = null;
  if (state.garment?.path === path) state.garment = null;
  toast('Đã xóa ảnh.', 'success');
  renderComposer();
  return true;
}

function openPersonPicker() {
  openPersonSheet({
    loggedIn: Boolean(state.profile),
    loginHref: loginUrl(returnPath()),
    getPhotos: () => state.myPhotos,
    max: MAX_BRIDE_PHOTOS,
    selectedKey: state.person?.key,
    onPick: (key) => {
      state.person = key.startsWith('sample:') ? samplePerson(key.slice(7)) : photoPerson(state.myPhotos.find((p) => p.path === key));
      renderComposer();
      focusComposer();
    },
    onDelete: confirmDelete,
    onUpload: (file) => uploadPhoto(file, 'body'),
  });
}

function openDressPicker(tab = 'catalog') {
  openDressSheet({
    tab,
    loggedIn: Boolean(state.profile),
    loginHref: loginUrl('tryon.html?mode=own'),
    dresses: state.dresses.filter((d) => d.image_url),
    body: state.body,
    getGarments: () => state.garments,
    max: MAX_GARMENT_PHOTOS,
    selectedKey: state.garment?.key,
    onPickDress: (id) => pickDress(id),
    onPickGarment: (path) => {
      state.garment = ownGarment(state.garments.find((g) => g.path === path));
      syncUrl();
      renderComposer();
      focusComposer();
    },
    onDelete: confirmDelete,
    onUpload: (file) => uploadPhoto(file, 'garment'),
  });
}

function openSettings() {
  openSettingsSheet({
    maxEnabled: state.settings.maxEnabled,
    ownGarment: state.garment?.kind === 'own',
    getOptions: () => effectiveOptions(),
    setOption,
    cost: tryonCost,
    remaining: state.remaining,
    body: state.body,
    loggedIn: Boolean(state.profile),
    onBodyChange: () => {
      persistBody();
      updateFitLines();
    },
  });
}

// ---------- KHUNG SOẠN TIN ----------
function slot(kind) {
  const item = kind === 'person' ? state.person : state.garment;
  const label = kind === 'person' ? 'Ảnh của bạn' : 'Váy cưới';
  if (!item) {
    return html`
      <div class="slot-wrap">
        <button type="button" class="slot empty" data-slot="${kind}">
          <span class="slot-plus" aria-hidden="true">＋</span>
          <span class="slot-text"><strong>${label}</strong><small>${kind === 'person' ? 'Chọn ảnh' : 'Chọn váy'}</small></span>
        </button>
      </div>`;
  }
  return html`
    <div class="slot-wrap">
      <button type="button" class="slot ${item.uploading ? 'uploading' : ''}" data-slot="${kind}" aria-label="${label}: ${item.name} – bấm để đổi">
        <img src="${item.photo}" alt="">
        <span class="slot-text"><small>${label}</small><strong>${item.uploading ? 'Đang lưu…' : item.name}</strong></span>
      </button>
      <button type="button" class="slot-clear" data-clear="${kind}" aria-label="Bỏ ${label.toLowerCase()}">×</button>
    </div>`;
}

function renderComposer() {
  render($('#composer-slots'), [slot('person'), slot('dress')]);
  const o = effectiveOptions();
  const cost = tryonCost(o);
  $('#settings-sum').textContent = `${modelName(o.model)} · ${o.samples} ảnh`;
  const costLabel = $('#composer-cost');
  costLabel.textContent = isAdmin() ? `${cost} credit · admin không giới hạn`
    : state.remaining === null ? `${cost} credit` : `${cost} credit · còn ${state.remaining}/${state.settings.dailyCredits}`;
  costLabel.classList.toggle('short', state.remaining !== null && cost > state.remaining);
  $('#send-btn').disabled = state.busy || Boolean(state.person?.uploading || state.garment?.uploading);
}

function autosize() {
  const box = $('#composer-text');
  box.style.height = 'auto';
  box.style.height = `${Math.min(box.scrollHeight, 140)}px`;
}

function initComposer() {
  $('#composer').addEventListener('submit', (e) => {
    e.preventDefault();
    send();
  });
  const box = $('#composer-text');
  if (matchMedia('(max-width: 560px)').matches) box.placeholder = 'Nhắn cho trợ lý thử váy…';   // câu dài bị cắt dòng
  box.addEventListener('input', autosize);
  // Máy tính: Enter để gửi, Shift+Enter xuống dòng. Điện thoại: Enter xuống dòng, gửi bằng nút.
  // isComposing: đang gõ dấu tiếng Việt (bộ gõ Telex/VNI) thì Enter chưa phải là gửi
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(pointer: fine)').matches) {
      e.preventDefault();
      send();
    }
  });
  $('#composer-slots').addEventListener('click', (e) => {
    const clear = e.target.closest('[data-clear]');
    if (clear) {
      if (clear.dataset.clear === 'person') state.person = null;
      else {
        state.garment = null;
        syncUrl();
      }
      renderComposer();
      return;
    }
    const target = e.target.closest('[data-slot]');
    if (target?.dataset.slot === 'person') openPersonPicker();
    else if (target) openDressPicker(state.garment?.kind === 'own' ? 'own' : 'catalog');
  });
  $('#open-settings').addEventListener('click', openSettings);
  thread().addEventListener('click', onThreadClick);
  // Đang ướm mà rời trang thì mất kết quả (AI vẫn chạy và trừ credit) → hỏi lại
  window.addEventListener('beforeunload', (e) => {
    if (state.busy) e.preventDefault();
  });
}

// ---------- KHỞI CHẠY TRANG ----------
initComposer();
initAutoScroll();
trackHeaderHeight();
renderComposer();
const [profile, settings] = await Promise.all([
  initLayout('tryon'),
  getTryonSettings(),
  loadDresses(),
]);
state.profile = profile;
state.settings = settings;
// Admin dùng thoải mái: không giới hạn credit, luôn có Siêu nét để thử trước khi bật cho mọi người (server cũng kiểm tra)
if (isAdmin()) state.settings.maxEnabled = true;
await loadAccountData();

const linked = state.dresses.find((d) => d.slug === param('dress'));
if (linked?.image_url) state.garment = dressGarment(linked);
buildThread();
renderComposer();
scrollToEnd('auto');
if (param('chon-vay')) openDressPicker('catalog');
else if (param('mode') === 'own') openDressPicker('own');
