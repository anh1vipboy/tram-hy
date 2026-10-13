// Ba chế độ:
//  - invitation.html?i=<slug>[&to=Tên khách] : khách mời mở phong bì → xem thiệp 3 trang → xác nhận tham dự (không cần đăng nhập)
//  - invitation.html (chưa đăng nhập) / ?mau  : thư viện mẫu thiệp
//  - invitation.html (đã đăng nhập)           : cô dâu chú rể soạn thiệp, lấy link, xem phản hồi
import { initLayout } from '../core/layout.js';
import { loginUrl } from '../core/auth.js';
import { $, $$, html, render, param } from '../core/utils.js';
import { openDialog, toast, toastError, withBusy } from '../core/ui.js';
import { compressImage } from '../core/image.js';
import { BANKS } from '../data/banks.js';
import { INVITATION_TEMPLATES, INVITATION_FONTS_URL, SAMPLE_INVITATION, templateOf } from '../data/invitation-templates.js';
import { invitationPages, invitationEnvelope, invitationTemplateKey } from '../components/invitation-card.js';
import { MUSIC_TRACKS, createWeddingMusic, youtubeIdFrom } from '../components/wedding-music.js';
import { openPhotoGallery } from '../components/dress-gallery.js';
import { makeSortable } from '../components/sortable.js';
import {
  getMyInvitation, getInvitationBySlug, saveInvitation, listRsvps, submitRsvp, subscribeRsvps,
  uploadInvitationPhoto, removeInvitationPhoto, listWishes, submitWish, setWishStatus, deleteWish, subscribeWishes,
} from '../services/invitations.js';

const page = $('#invitation-page');

// Font viết tay của các mẫu thiệp – chỉ tải ở trang này
const fonts = document.createElement('link');
fonts.rel = 'stylesheet';
fonts.href = INVITATION_FONTS_URL;
document.head.append(fonts);

function giftQrUrl(inv) {
  if (!inv.bank_code || !inv.bank_account) return null;
  const note = `Mung cuoi ${inv.groom_name} ${inv.bride_name}`;
  return `https://img.vietqr.io/image/${inv.bank_code}-${inv.bank_account}-compact.png?addInfo=${encodeURIComponent(note)}`;
}

const mapsUrl = (inv) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([inv.venue, inv.details?.venue_address].filter(Boolean).join(', '))}`;

function calendarUrl(inv) {
  const start = new Date(inv.event_at);
  const end = new Date(start.getTime() + 3 * 3600e3);
  const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const text = `Đám cưới ${inv.groom_name} & ${inv.bride_name}`;
  const location = [inv.venue, inv.details?.venue_address].filter(Boolean).join(', ');
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(text)}&dates=${stamp(start)}/${stamp(end)}&location=${encodeURIComponent(location)}`;
}

// ---------- KHÁCH MỜI ----------
let guestWantsForm = false;   // khách bấm "Gửi phản hồi cho người khác" → luôn hiện form

async function renderGuestView(slug) {
  const inv = await getInvitationBySlug(slug);
  if (!inv) {
    render(page, html`<div class="container"><div class="empty">Thiệp không tồn tại hoặc đã bị xóa.</div></div>`);
    return;
  }
  const guestName = (param('to') || '').trim().slice(0, 60);
  const tpl = templateOf(invitationTemplateKey(inv));
  document.title = `Thiệp cưới ${inv.groom_name} & ${inv.bride_name}`;
  document.body.classList.add('invite-mode');

  render(page, html`
    <div class="inv-stage" style="--stage:${tpl.colors.backdrop}">
      <div class="inv-stage-inner" id="inv-stage-inner">
        <div class="inv-intro">
          ${invitationEnvelope(inv, guestName)}
          <p class="inv-intro-hint">Chạm vào con dấu để mở thiệp</p>
        </div>
      </div>
    </div>`);

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const open = () => {
    $('.envelope').classList.add('is-open');
    $('.inv-intro').classList.add('is-leaving');
    // Trình duyệt chỉ cho phát tiếng ngay trong lúc khách chạm → bật nhạc ở đây
    guestMusic = createWeddingMusic(inv.details?.music);
    guestMusic?.play().catch(() => {});
    setTimeout(() => showInvitation(inv, guestName, slug), reduced ? 50 : 2000);
  };
  $('[data-open-envelope]').addEventListener('click', open, { once: true });
  $('[data-open-envelope]').focus({ preventScroll: true });
}

let guestMusic = null;
let musicOn = true;

function showInvitation(inv, guestName, slug) {
  const qr = giftQrUrl(inv);
  const d = inv.details || {};
  const story = Array.isArray(d.story) ? d.story : [];
  const album = Array.isArray(d.album) ? d.album : [];
  const tpl = templateOf(invitationTemplateKey(inv));
  $('.inv-stage').style.setProperty('--inv-accent', tpl.colors.accent);
  $('.inv-stage').style.setProperty('--inv-script', `'${tpl.script}', cursive`);
  render($('#inv-stage-inner'), html`
    <div class="inv-guest-pages">${invitationPages(inv, { guestName, uid: 'guest' })}</div>
    ${inv.event_at ? html`
      <section class="inv-countdown">
        <p class="inv-countdown-title">Cùng đếm ngược tới ngày vui</p>
        <div class="countdown" id="countdown"></div>
      </section>` : ''}
    <div class="inv-info-row">
      ${inv.venue ? html`<a class="btn" href="${mapsUrl(inv)}" target="_blank" rel="noopener">📍 Chỉ đường đến tiệc</a>` : ''}
      ${inv.event_at ? html`<a class="btn" href="${calendarUrl(inv)}" target="_blank" rel="noopener">📅 Lưu vào lịch</a>` : ''}
    </div>
    ${story.length ? html`
      <section class="inv-section inv-story" aria-labelledby="story-title">
        <h2 id="story-title" class="center">Chuyện tình yêu</h2>
        <ol class="story-timeline">${story.map((s) => html`
          <li><span class="story-dot" aria-hidden="true">♥</span>
            <div class="story-card">${s.when ? html`<span class="story-when">${s.when}</span>` : ''}
              ${s.title ? html`<strong>${s.title}</strong>` : ''}${s.text ? html`<p>${s.text}</p>` : ''}</div></li>`)}
        </ol>
      </section>` : ''}
    ${album.length ? html`
      <section class="inv-section inv-album" aria-labelledby="album-title">
        <h2 id="album-title" class="center">Album ảnh cưới</h2>
        <div class="album-grid">${album.map((url, i) => html`
          <button type="button" class="album-cell" data-photo="${i}" aria-label="Xem ảnh ${i + 1}"><img src="${url}" alt="" loading="lazy"></button>`)}</div>
      </section>` : ''}
    <section class="inv-section" id="guestbook-section" aria-labelledby="guestbook-title">
      <h2 id="guestbook-title" class="center">Sổ lời chúc</h2>
      <div id="wish-list" class="wish-wall"></div>
      <form class="stack" id="wish-form" novalidate>
        <label class="field"><span>Tên của bạn</span><input class="input" name="guestName" required maxlength="80" value="${guestName}"></label>
        <label class="field"><span>Lời chúc</span><textarea class="input" name="message" required maxlength="500" rows="3" placeholder="Chúc hai bạn trăm năm hạnh phúc…"></textarea></label>
        <label class="hp-field" aria-hidden="true">Website <input name="website" tabindex="-1" autocomplete="off"></label>
        <button class="btn btn-primary" type="submit">Gửi lời chúc</button>
        <p class="small muted" style="margin:0">Lời chúc hiện lên sổ sau khi cô dâu chú rể xem.</p>
      </form>
    </section>
    <section class="inv-section" id="rsvp-section">
      <form class="stack" id="rsvp-form">
        <div><h2>Bạn sẽ đến chung vui chứ?</h2><p class="muted" style="margin:0">Phản hồi giúp gia đình chuẩn bị chu đáo hơn.</p></div>
        <label class="field"><span>Tên của bạn</span><input class="input" name="guestName" required maxlength="100" value="${guestName}"></label>
        <div class="row">
          <label class="row"><input type="radio" name="attending" value="yes" checked> Sẽ tham dự</label>
          <label class="row"><input type="radio" name="attending" value="no"> Rất tiếc không thể đến</label>
        </div>
        <label class="field"><span>Số người đi cùng (tính cả bạn)</span>
          <input class="input" type="number" name="guestCount" min="1" max="10" value="1"></label>
        <label class="field"><span>Lời nhắn riêng cho cô dâu chú rể (không bắt buộc)</span><textarea class="input" name="message" maxlength="500" placeholder="VD: Mình đi cùng bé nhỏ, nhờ để giúp ghế em bé nhé"></textarea></label>
        <!-- Bẫy bot: người thật không thấy ô này, bot tự điền mọi ô sẽ điền vào → bỏ qua -->
        <label class="hp-field" aria-hidden="true">Website <input name="website" tabindex="-1" autocomplete="off"></label>
        <button class="btn btn-primary" type="submit">Gửi phản hồi</button>
      </form>
    </section>
    ${qr ? html`
      <section class="inv-section center" id="gift-section">
        <h2>Hộp mừng cưới</h2>
        <p class="muted" style="margin:0">Quét mã bằng ứng dụng ngân hàng để gửi quà mừng tới cô dâu chú rể.</p>
        <img class="gift-qr" src="${qr}" alt="Mã QR mừng cưới" loading="lazy">
      </section>` : ''}
    <nav class="inv-actions" aria-label="Phản hồi thiệp">
      <button type="button" class="btn" data-go="rsvp">💌 Xác nhận tham dự</button>
      <button type="button" class="btn" data-go="wish">💬 Gửi lời chúc</button>
    </nav>
    ${guestMusic ? html`<button type="button" class="music-toggle ${musicOn ? 'is-playing' : ''}" data-music
        aria-pressed="${musicOn ? 'true' : 'false'}" aria-label="${musicOn ? 'Tắt nhạc nền' : 'Bật nhạc nền'}">♪</button>` : ''}`);

  $$('[data-go]').forEach((btn) => btn.addEventListener('click', () => {
    const wish = btn.dataset.go === 'wish';
    $(wish ? '#wish-form' : '#rsvp-section').scrollIntoView({ behavior: 'smooth', block: 'center' });
    const target = wish ? ($('#wish-form [name=message]') ?? $('#wish-form')) : $('#rsvp-form [name=guestName]');
    setTimeout(() => target?.focus({ preventScroll: true }), 500);
  }));
  $('[data-music]')?.addEventListener('click', (e) => {
    musicOn = !musicOn;
    if (musicOn) guestMusic.play().catch(() => {}); else guestMusic.pause();
    e.currentTarget.classList.toggle('is-playing', musicOn);
    e.currentTarget.setAttribute('aria-pressed', String(musicOn));
    e.currentTarget.setAttribute('aria-label', musicOn ? 'Tắt nhạc nền' : 'Bật nhạc nền');
  });
  $$('[data-photo]').forEach((btn) => btn.addEventListener('click', () => openPhotoGallery({
    title: 'Album ảnh cưới', subtitle: `${inv.groom_name} & ${inv.bride_name}`, images: album, start: Number(btn.dataset.photo),
  })));
  if (inv.event_at) startCountdown(new Date(inv.event_at));
  loadWishWall(inv);
  bindWishForm(inv);
  bindRsvp(inv, slug);
}

// Sổ lời chúc phía khách: các lời chúc đã duyệt (mới nhất trước)
async function loadWishWall(inv) {
  const wishes = await listWishes(inv.id).catch(() => []);
  const box = $('#wish-list');
  if (!box) return;
  const shown = wishes.filter((w) => w.status === 'approved');
  render(box, shown.length ? html`${shown.slice(0, 40).map((w) => html`
    <figure class="wish-card"><blockquote>${w.message}</blockquote><figcaption>— ${w.guest_name}</figcaption></figure>`)}`
    : html`<p class="muted center small" style="margin:0">Hãy là người đầu tiên gửi lời chúc tới cô dâu chú rể 💐</p>`);
}

function bindWishForm(inv) {
  const form = $('#wish-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const done = () => render(form, html`<div class="center stack" style="gap:6px"><h3 style="margin:0">Cảm ơn lời chúc của bạn! 💐</h3>
      <p class="muted" style="margin:0">Lời chúc sẽ hiện trên sổ sau khi cô dâu chú rể xem.</p></div>`);
    if (data.get('website')) { done(); return; }                // bot điền ô bẫy
    const guestName = data.get('guestName').trim();
    const message = data.get('message').trim();
    if (guestName.length < 2) { form.elements.guestName.focus(); toastError(new Error('Vui lòng nhập tên của bạn')); return; }
    if (message.length < 2) { form.elements.message.focus(); toastError(new Error('Bạn chưa viết lời chúc')); return; }
    await withBusy(e.submitter, async () => {
      try {
        await submitWish(inv.id, { guestName, message });
        done();
      } catch (error) {
        toastError(error);
      }
    });
  });
}

function startCountdown(target) {
  const box = $('#countdown');
  const tick = () => {
    const ms = target - Date.now();
    if (ms <= 0) {
      render(box, html`<p style="grid-column:1/-1;margin:0">Đám cưới đã diễn ra – cảm ơn bạn đã ghé thăm 💕</p>`);
      return false;
    }
    const parts = [[Math.floor(ms / 864e5), 'Ngày'], [Math.floor(ms / 36e5) % 24, 'Giờ'], [Math.floor(ms / 6e4) % 60, 'Phút'], [Math.floor(ms / 1e3) % 60, 'Giây']];
    render(box, html`${parts.map(([n, label]) => html`<div><strong>${n}</strong><span>${label}</span></div>`)}`);
    return true;
  };
  if (tick()) {
    const timer = setInterval(() => { if (!document.body.contains(box) || !tick()) clearInterval(timer); }, 1000);
  }
}

function bindRsvp(inv, slug) {
  // Máy này đã gửi phản hồi cho thiệp này → hiện lời cảm ơn, vẫn cho gửi thêm cho người khác (vd người nhà)
  const sentKey = `tramhy-rsvp-${inv.id}`;
  const thanks = (form, name) => {
    render(form, html`<div class="center stack" style="gap:6px"><h2>Cảm ơn ${name || 'bạn'}!</h2>
      <p class="muted" style="margin:0">Phản hồi đã được gửi tới cô dâu chú rể.</p>
      <button class="btn btn-link" type="button" data-again>Gửi phản hồi cho người khác</button></div>`);
    form.querySelector('[data-again]').addEventListener('click', () => {
      guestWantsForm = true;
      showInvitation(inv, '', slug);
      $('#rsvp-section').scrollIntoView({ block: 'center' });
    });
  };
  const alreadySent = (() => { try { return localStorage.getItem(sentKey); } catch { return null; } })();
  if (alreadySent && !guestWantsForm) {
    thanks($('#rsvp-form'), alreadySent);
    return;
  }

  $('#rsvp-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    if (form.get('website')) {                       // bot điền ô bẫy → giả vờ thành công, không gửi
      thanks(e.target, '');
      return;
    }
    await withBusy(e.submitter, async () => {
      try {
        await submitRsvp(inv.id, {
          guestName: form.get('guestName').trim(),
          attending: form.get('attending') === 'yes',
          guestCount: Number(form.get('guestCount')),
          message: form.get('message').trim() || null,
        });
        const name = form.get('guestName').trim();
        try { localStorage.setItem(sentKey, name); } catch { /* chế độ riêng tư: bỏ qua */ }
        thanks(e.target, name);
      } catch (error) {
        toastError(error);
      }
    });
  });
}

// ---------- THƯ VIỆN MẪU ----------
function useTemplateUrl(key, profile) {
  const target = `invitation.html?template=${key}`;
  return profile ? target : loginUrl(target);
}

function previewTemplate(key, profile) {
  const tpl = templateOf(key);
  openDialog({
    title: `Mẫu “${tpl.name}”`,
    confirmText: 'Dùng mẫu này',
    cancelText: 'Đóng',
    content: html`<div class="tpl-preview-stage" style="--stage:${tpl.colors.backdrop}">
      ${invitationPages({ ...SAMPLE_INVITATION, template: key }, { guestName: 'Gia đình bạn Lan', uid: 'dlg' })}</div>`,
    onConfirm: () => { location.href = useTemplateUrl(key, profile); return true; },
  });
}

function renderGallery(profile) {
  render(page, html`
    <div class="tpl-hero">
      <div class="eyebrow">Thiệp cưới online · miễn phí</div>
      <h1>Mẫu thiệp cưới “chuẩn gu” 2026</h1>
      <p class="muted">Chọn mẫu, điền tên hai bạn và gia đình, gửi link qua Zalo / Messenger. Khách mở phong bì, xem thiệp,
        xác nhận tham dự và gửi lời chúc – bạn nhận ngay trên Trạm Hỷ.</p>
    </div>
    <div class="tpl-grid">
      ${INVITATION_TEMPLATES.map((t) => html`
        <article class="tpl-card" data-template="${t.key}">
          <button type="button" class="tpl-thumb" style="--stage:${t.colors.backdrop}" data-preview="${t.key}" aria-label="Xem trước mẫu ${t.name}">
            ${invitationPages({ ...SAMPLE_INVITATION, template: t.key }, { pages: [1], uid: `g-${t.key}` })}
          </button>
          <div class="tpl-meta"><strong>${t.name}</strong><span class="badge">${t.tag}</span></div>
          <div class="tpl-actions">
            <button type="button" class="btn btn-outline btn-sm" data-preview="${t.key}">Xem thiệp</button>
            <a class="btn btn-primary btn-sm" href="${useTemplateUrl(t.key, profile)}">Dùng mẫu này</a>
          </div>
        </article>`)}
    </div>
    ${profile ? html`<p class="center" style="margin-top:20px"><a href="invitation.html">← Quay lại soạn thiệp của bạn</a></p>` : ''}`);
  $$('[data-preview]').forEach((btn) => btn.addEventListener('click', () => previewTemplate(btn.dataset.preview, profile)));
}

// ---------- CHỦ THIỆP ----------
const ALBUM_MAX = 12;
const PHOTO_SLOTS = [['photo_url', 'Ảnh trang bìa (trang 1)'], ['photo2_url', 'Ảnh trang tiệc cưới (trang 3)']];
const STORY_MAX = 6;
const DETAIL_FIELDS = ['groom_father', 'groom_mother', 'groom_address', 'bride_father', 'bride_mother', 'bride_address', 'venue_address'];

async function renderEditor(profile) {
  let invitation = await getMyInvitation(profile.id);
  const d = invitation?.details ?? {};
  const draft = {
    template: param('template') && INVITATION_TEMPLATES.some((t) => t.key === param('template'))
      ? param('template') : invitation ? invitationTemplateKey(invitation) : 'la-tim',
    photo_url: invitation?.photo_url ?? null,
    photo2_url: d.photo2_url ?? null,
    album: Array.isArray(d.album) ? [...d.album] : [],
    story: Array.isArray(d.story) ? d.story.map((s) => ({ ...s })) : [],
  };
  const music = d.music ?? null;
  const field =(name, label, value, attrs = {}) => html`
    <label class="field ${attrs.full ? 'full' : ''}"><span>${label}</span>
      <input class="input" name="${name}" value="${value ?? ''}" maxlength="${attrs.max ?? 80}" placeholder="${attrs.placeholder ?? ''}" ${attrs.required ? 'required' : ''}></label>`;

  render(page, html`
    <div class="section-head">
      <div><div class="eyebrow">Thiệp cưới online</div><h1>Soạn thiệp & nhận phản hồi khách mời</h1></div>
      <a class="btn btn-outline btn-sm" href="invitation.html?mau=1">Xem thư viện mẫu</a>
    </div>
    <div class="inv-editor">
      <form class="card stack" id="editor" novalidate>
        <section class="inv-form-section">
          <h3>1. Chọn mẫu thiệp</h3>
          <div class="tpl-strip" role="radiogroup" aria-label="Mẫu thiệp">
            ${INVITATION_TEMPLATES.map((t) => html`
              <button type="button" class="tpl-pick ${t.key === draft.template ? 'active' : ''}" style="--stage:${t.colors.backdrop}"
                      role="radio" aria-checked="${t.key === draft.template ? 'true' : 'false'}" data-template="${t.key}">
                ${invitationPages({ ...SAMPLE_INVITATION, template: t.key }, { pages: [1], uid: `p-${t.key}` })}
                <span>${t.name}</span>
              </button>`)}
          </div>
        </section>
        <section class="inv-form-section">
          <h3>2. Cô dâu & chú rể</h3>
          <div class="form-grid">
            ${field('groom_name', 'Họ tên chú rể', invitation?.groom_name, { required: true, max: 60, placeholder: 'VD: Nguyễn Minh Khang' })}
            ${field('bride_name', 'Họ tên cô dâu', invitation?.bride_name, { required: true, max: 60, placeholder: 'VD: Trần Thu Hà' })}
          </div>
          ${PHOTO_SLOTS.map(([slot, label]) => html`
            <div class="photo-picker" data-slot="${slot}" ${slot === 'photo2_url' && !d.photo2_url ? 'hidden' : ''}>
              <span class="photo-thumb"></span>
              <div class="stack" style="gap:6px">
                <strong class="small">${label}</strong>
                <label class="btn btn-outline btn-sm" style="cursor:pointer">📷 Chọn ảnh
                  <input type="file" accept="image/*" data-photo-input hidden aria-label="Chọn ${label.toLowerCase()}"></label>
                <button type="button" class="btn btn-link btn-sm" data-photo-remove>Bỏ ảnh</button>
              </div>
            </div>
            ${slot === 'photo_url' ? html`
              <label class="same-photo"><input type="checkbox" id="same-photo" ${d.photo2_url ? '' : 'checked'}>
                Dùng ảnh bìa cho cả trang tiệc cưới (trang 3)</label>` : ''}`)}
          <span class="small muted">Ảnh hiện trong khung tròn trên thiệp. Không có ảnh thì thiệp dùng chữ lồng tên hai bạn.</span>
        </section>
        <section class="inv-form-section">
          <h3>3. Gia đình hai bên</h3>
          <div class="form-grid">
            ${field('groom_father', 'Bố chú rể', d.groom_father)}
            ${field('groom_mother', 'Mẹ chú rể', d.groom_mother)}
            ${field('groom_address', 'Địa chỉ nhà trai', d.groom_address, { full: true, max: 160 })}
            ${field('bride_father', 'Bố cô dâu', d.bride_father)}
            ${field('bride_mother', 'Mẹ cô dâu', d.bride_mother)}
            ${field('bride_address', 'Địa chỉ nhà gái', d.bride_address, { full: true, max: 160 })}
          </div>
        </section>
        <section class="inv-form-section">
          <h3>4. Lễ thành hôn</h3>
          <div class="host-picker" role="radiogroup" aria-label="Thiệp của nhà nào">
            <label><input type="radio" name="host" value="trai" ${d.host !== 'gai' ? 'checked' : ''}> Thiệp nhà trai – Lễ thành hôn</label>
            <label><input type="radio" name="host" value="gai" ${d.host === 'gai' ? 'checked' : ''}> Thiệp nhà gái – Lễ vu quy</label>
          </div>
          <label class="field"><span>Giờ làm lễ tại tư gia</span>
            <input class="input" type="datetime-local" name="ceremony_at" value="${toLocalInput(d.ceremony_at)}"></label>
        </section>
        <section class="inv-form-section">
          <h3>5. Tiệc cưới</h3>
          <div class="form-grid">
            <label class="field full"><span>Giờ đãi tiệc</span>
              <input class="input" type="datetime-local" name="event_at" value="${toLocalInput(invitation?.event_at)}" required></label>
            ${field('venue', 'Nhà hàng / nơi đãi tiệc', invitation?.venue, { required: true, max: 120, full: true, placeholder: 'VD: Trung tâm tiệc cưới Hoa Sen' })}
            ${field('venue_address', 'Địa chỉ nhà hàng', d.venue_address, { full: true, max: 160, placeholder: 'Số nhà, đường, quận, thành phố' })}
          </div>
        </section>
        <section class="inv-form-section">
          <h3>6. Mừng cưới qua chuyển khoản <span class="small muted">(không bắt buộc)</span></h3>
          <div class="form-grid">
            <label class="field"><span>Ngân hàng</span>
              <select class="input" name="bank_code">${BANKS.map(([code, name]) => html`
                <option value="${code}" ${code === (invitation?.bank_code ?? 'MB') ? 'selected' : ''}>${name}</option>`)}</select></label>
            <label class="field"><span>Số tài khoản</span><input class="input" name="bank_account" value="${invitation?.bank_account || ''}" pattern="[0-9]{6,20}" inputmode="numeric"></label>
          </div>
        </section>
        <section class="inv-form-section">
          <h3>7. Album ảnh cưới <span class="small muted">(tối đa ${ALBUM_MAX} ảnh – kéo để đổi thứ tự)</span></h3>
          <div class="album-edit" id="album-edit"></div>
          <label class="btn btn-outline btn-sm" style="align-self:flex-start;cursor:pointer" id="album-add">＋ Thêm ảnh
            <input type="file" accept="image/*" multiple hidden id="album-input"></label>
        </section>
        <section class="inv-form-section">
          <h3>8. Chuyện tình yêu <span class="small muted">(tối đa ${STORY_MAX} cột mốc)</span></h3>
          <div class="stack" id="story-edit"></div>
          <button type="button" class="btn btn-outline btn-sm" style="align-self:flex-start" id="story-add">＋ Thêm cột mốc</button>
        </section>
        <section class="inv-form-section">
          <h3>9. Nhạc nền</h3>
          <div class="music-picker" role="radiogroup" aria-label="Nhạc nền">
            <label class="music-option"><input type="radio" name="music" value="" ${!music ? 'checked' : ''}> <span>🔇 Không phát nhạc</span></label>
            ${MUSIC_TRACKS.map((t) => html`
              <div class="music-option">
                <label><input type="radio" name="music" value="box:${t.key}" ${music?.kind === 'box' && music.track === t.key ? 'checked' : ''}> <span>🎼 ${t.name}</span></label>
                <button type="button" class="btn btn-light btn-sm" data-listen="${t.key}" aria-pressed="false">▶ Nghe thử</button>
              </div>`)}
            <label class="music-option"><input type="radio" name="music" value="youtube" ${music?.kind === 'youtube' ? 'checked' : ''}> <span>▶️ Bài hát từ YouTube</span></label>
            <input class="input" name="music_youtube" maxlength="200" value="${music?.kind === 'youtube' ? `https://youtu.be/${music.id}` : ''}"
                   placeholder="Dán link YouTube, VD: https://youtu.be/…" aria-label="Link YouTube">
          </div>
          <p class="small muted" style="margin:0">Nhạc cổ điển do Trạm Hỷ chơi bằng tiếng hộp nhạc (giai điệu đã hết bản quyền).
            Bài từ YouTube phát qua trình phát của YouTube – video cần cho phép nhúng; bản quyền bài hát do bạn chọn.
            Nhạc bắt đầu khi khách mở phong bì, khách có nút bật / tắt.</p>
        </section>
        <button class="btn btn-primary btn-lg" type="submit">${invitation ? 'Lưu thiệp' : 'Tạo thiệp'}</button>
        <div id="share"></div>
      </form>
      <div class="inv-editor-side">
        <div class="inv-editor-preview" id="preview" aria-label="Xem trước thiệp"></div>
      </div>
    </div>
    <div class="inv-owner-panels">
      <div class="card" id="rsvps"></div>
      <div class="card" id="guestbook"></div>
    </div>`);

  const form = $('#editor');
  const readForm = () => {
    const data = Object.fromEntries(new FormData(form));
    const details = Object.fromEntries(DETAIL_FIELDS.map((k) => [k, (data[k] || '').trim()]).filter(([, v]) => v));
    details.host = data.host === 'gai' ? 'gai' : 'trai';
    if (data.ceremony_at) details.ceremony_at = new Date(data.ceremony_at).toISOString();
    if (draft.photo2_url && !$('#same-photo')?.checked) details.photo2_url = draft.photo2_url;
    if (draft.album.length) details.album = draft.album;
    const story = draft.story.map((s) => ({ when: (s.when || '').trim(), title: (s.title || '').trim(), text: (s.text || '').trim() }))
      .filter((s) => s.title || s.text);
    if (story.length) details.story = story;
    if (data.music?.startsWith('box:')) details.music = { kind: 'box', track: data.music.slice(4) };
    if (data.music === 'youtube') details.music = { kind: 'youtube', id: youtubeIdFrom(data.music_youtube) };
    return {
      groom_name: data.groom_name.trim(),
      bride_name: data.bride_name.trim(),
      event_at: data.event_at ? new Date(data.event_at).toISOString() : null,
      venue: data.venue.trim(),
      bank_code: data.bank_code,
      bank_account: data.bank_account.trim() || null,
      template: draft.template,
      photo_url: draft.photo_url,
      details,
    };
  };
  const stage = () => $('#preview').style.setProperty('--stage', templateOf(draft.template).colors.backdrop);
  const refreshPreview = () => { stage(); render($('#preview'), invitationPages(readForm(), { uid: 'pv', guestName: 'Tên khách mời' })); };
  const refreshPhoto = () => {
    $$('.photo-picker').forEach((picker) => {
      const url = draft[picker.dataset.slot];
      render(picker.querySelector('.photo-thumb'), url ? html`<img src="${url}" alt="Ảnh đã chọn">` : html`<span class="photo-empty">💑</span>`);
    });
    $('[data-slot="photo2_url"]').hidden = $('#same-photo').checked;
  };

  form.addEventListener('input', refreshPreview);
  $$('[data-template]').forEach((btn) => btn.addEventListener('click', () => {
    draft.template = btn.dataset.template;
    $$('[data-template]').forEach((b) => { b.classList.toggle('active', b === btn); b.setAttribute('aria-checked', String(b === btn)); });
    refreshPreview();
  }));

  // Ảnh bìa (photo_url) và ảnh trang tiệc (details.photo2_url). Ảnh đã lưu chỉ bị xóa file sau khi bấm Lưu.
  const savedPhotos = { photo_url: invitation?.photo_url ?? null, photo2_url: d.photo2_url ?? null };
  const dropUnsaved = (slot) => { if (draft[slot] && draft[slot] !== savedPhotos[slot]) removeInvitationPhoto(draft[slot]); };
  $$('.photo-picker').forEach((picker) => {
    const slot = picker.dataset.slot;
    picker.querySelector('[data-photo-input]').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      const label = e.target.closest('label');
      label.setAttribute('aria-busy', 'true');
      try {
        const url = await uploadInvitationPhoto(profile.id, await compressImage(file, { maxSize: 1400 }));
        dropUnsaved(slot);                                   // ảnh chọn trước đó chưa lưu
        draft[slot] = url;
        refreshPhoto();
        refreshPreview();
        toast('Đã tải ảnh lên – bấm Lưu thiệp để cập nhật cho khách mời.', 'success');
      } catch (error) {
        toastError(error);
      } finally {
        label.removeAttribute('aria-busy');
      }
    });
    picker.querySelector('[data-photo-remove]').addEventListener('click', () => {
      dropUnsaved(slot);
      draft[slot] = null;
      refreshPhoto();
      refreshPreview();
    });
  });
  $('#same-photo').addEventListener('change', () => { refreshPhoto(); refreshPreview(); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const values = readForm();
    const missing = [['groom_name', values.groom_name], ['bride_name', values.bride_name], ['event_at', values.event_at], ['venue', values.venue]]
      .find(([, v]) => !v);
    if (missing) {
      const input = form.elements[missing[0]];
      input.focus();
      toastError(new Error(`Vui lòng điền “${input.closest('label').querySelector('span').textContent}”`));
      return;
    }
    if (values.details.music?.kind === 'youtube' && !values.details.music.id) {
      form.elements.music_youtube.focus();
      toastError(new Error('Link YouTube chưa đúng – hãy dán link dạng https://youtu.be/… hoặc https://www.youtube.com/watch?v=…'));
      return;
    }
    if (values.bank_account && !/^[0-9]{6,20}$/.test(values.bank_account)) {
      form.elements.bank_account.focus();
      toastError(new Error('Số tài khoản chỉ gồm 6–20 chữ số'));
      return;
    }
    // Đã tải ảnh 2 nhưng lại chọn dùng chung ảnh bìa → bỏ file ảnh 2 chưa lưu
    if ($('#same-photo').checked) { dropUnsaved('photo2_url'); draft.photo2_url = savedPhotos.photo2_url; }
    await withBusy(e.submitter, async () => {
      try {
        const isNew = !invitation;
        invitation = await saveInvitation(profile.id, invitation, values);
        // Ảnh cũ không còn dùng (đổi ảnh / bỏ ảnh / chuyển sang dùng chung ảnh bìa) → xóa file
        const now = { photo_url: invitation.photo_url ?? null, photo2_url: invitation.details?.photo2_url ?? null };
        for (const slot of ['photo_url', 'photo2_url']) {
          if (savedPhotos[slot] && savedPhotos[slot] !== now[slot]) removeInvitationPhoto(savedPhotos[slot]);
          savedPhotos[slot] = now[slot];
        }
        if (!now.photo2_url) draft.photo2_url = null;
        saved.album.filter((url) => !draft.album.includes(url)).forEach(removeInvitationPhoto);   // ảnh đã bỏ khỏi album
        saved.album = [...draft.album];
        e.submitter.textContent = 'Lưu thiệp';
        toast('Đã lưu thiệp.', 'success');
        renderShare(invitation);
        if (isNew) {                                  // thiệp vừa tạo → bắt đầu nhận phản hồi & lời chúc
          await showRsvps(invitation);
          await showWishes(invitation);
        }
      } catch (error) {
        toastError(error);
      }
    });
  });

  // ----- Album: thêm nhiều ảnh, xóa, kéo đổi thứ tự -----
  const saved = { album: [...draft.album] };   // ảnh đã lưu trong thiệp – bỏ khỏi album thì chỉ xóa file sau khi bấm Lưu
  const drawAlbum = () => {
    render($('#album-edit'), html`${draft.album.map((url, i) => html`
      <div class="album-thumb" data-id="${i}">
        <img src="${url}" alt="Ảnh album ${i + 1}">
        <button type="button" class="album-remove" data-remove-photo="${i}" aria-label="Xóa ảnh ${i + 1}">✕</button>
      </div>`)}${draft.album.length ? '' : html`<p class="small muted" style="margin:0">Chưa có ảnh – khách sẽ không thấy mục Album.</p>`}`);
    $('#album-add').hidden = draft.album.length >= ALBUM_MAX;
  };
  $('#album-edit').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-photo]');
    if (!btn) return;
    const [url] = draft.album.splice(Number(btn.dataset.removePhoto), 1);
    if (!saved.album.includes(url)) removeInvitationPhoto(url);       // ảnh vừa tải, chưa lưu → xóa luôn file
    drawAlbum();
  });
  makeSortable($('#album-edit'), {
    item: '.album-thumb', handle: '.album-thumb img',
    onEnd: (order) => { draft.album = order.map((i) => draft.album[Number(i)]); drawAlbum(); },
  });
  $('#album-input').addEventListener('change', async (e) => {
    const files = [...e.target.files].slice(0, ALBUM_MAX - draft.album.length);
    e.target.value = '';
    if (!files.length) return;
    const label = $('#album-add');
    label.setAttribute('aria-busy', 'true');
    // Tải lần lượt; ảnh nào lỗi (mạng chập chờn, file hỏng) thì bỏ qua, các ảnh khác vẫn lên
    let added = 0;
    let lastError = null;
    for (const file of files) {
      try {
        draft.album.push(await uploadInvitationPhoto(profile.id, await compressImage(file, { maxSize: 1400 })));
        added += 1;
        drawAlbum();
      } catch (error) {
        lastError = error;
      }
    }
    label.removeAttribute('aria-busy');
    if (added) toast(`Đã thêm ${added}/${files.length} ảnh – bấm Lưu thiệp để khách mời thấy.`, 'success');
    if (lastError) toastError(new Error(`${files.length - added} ảnh chưa tải lên được (${lastError.message}). Bạn thử chọn lại ảnh đó nhé.`));
  });

  // ----- Chuyện tình yêu: danh sách cột mốc -----
  const drawStory = () => {
    render($('#story-edit'), html`${draft.story.map((s, i) => html`
      <div class="story-edit-item" data-story="${i}">
        <div class="form-grid">
          <label class="field"><span>Thời gian</span><input class="input" data-field="when" maxlength="40" value="${s.when || ''}" placeholder="VD: Mùa thu 2020"></label>
          <label class="field"><span>Tiêu đề</span><input class="input" data-field="title" maxlength="60" value="${s.title || ''}" placeholder="VD: Lần đầu gặp nhau"></label>
          <label class="field full"><span>Kể ngắn</span><textarea class="input" data-field="text" maxlength="300" rows="2" placeholder="Một vài câu về kỷ niệm này…">${s.text || ''}</textarea></label>
        </div>
        <button type="button" class="btn btn-link btn-sm text-red" data-remove-story="${i}">Xóa cột mốc</button>
      </div>`)}`);
    $('#story-add').hidden = draft.story.length >= STORY_MAX;
  };
  $('#story-edit').addEventListener('input', (e) => {
    const item = e.target.closest('[data-story]');
    if (item && e.target.dataset.field) draft.story[Number(item.dataset.story)][e.target.dataset.field] = e.target.value;
  });
  $('#story-edit').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-story]');
    if (!btn) return;
    draft.story.splice(Number(btn.dataset.removeStory), 1);
    drawStory();
  });
  $('#story-add').addEventListener('click', () => {
    draft.story.push({ when: '', title: '', text: '' });
    drawStory();
    $('#story-edit .story-edit-item:last-child input')?.focus();
  });

  // ----- Nhạc: nghe thử hộp nhạc, chọn YouTube khi bắt đầu dán link -----
  let listening = null;
  $$('[data-listen]').forEach((btn) => btn.addEventListener('click', () => {
    const playing = btn.getAttribute('aria-pressed') === 'true';
    listening?.player.pause();
    $$('[data-listen]').forEach((b) => { b.setAttribute('aria-pressed', 'false'); b.textContent = '▶ Nghe thử'; });
    if (playing) { listening = null; return; }
    listening = { player: createWeddingMusic({ kind: 'box', track: btn.dataset.listen }) };
    listening.player.play();
    btn.setAttribute('aria-pressed', 'true');
    btn.textContent = '⏸ Dừng';
  }));
  form.elements.music_youtube.addEventListener('input', () => {
    form.querySelector('input[name=music][value=youtube]').checked = true;
  });

  refreshPhoto();
  refreshPreview();
  drawAlbum();
  drawStory();
  if (invitation) {
    renderShare(invitation);
    await showRsvps(invitation);
    await showWishes(invitation);
    if (location.hash === '#guestbook') $('#guestbook').scrollIntoView({ behavior: 'smooth' });
  } else {
    render($('#rsvps'), html`<p class="muted">Tạo thiệp để nhận phản hồi từ khách mời.</p>`);
    render($('#guestbook'), html`<h3>Sổ lời chúc</h3><p class="muted">Tạo thiệp để nhận lời chúc từ khách mời.</p>`);
  }
}

// ----- Sổ lời chúc: duyệt / ẩn / xóa, lời chúc mới tự hiện -----
let wishFilter = 'pending';
async function showWishes(invitation) {
  let wishes = await listWishes(invitation.id).catch(() => null);
  if (!wishes) {
    render($('#guestbook'), html`<h3>Sổ lời chúc</h3><p class="muted small">Sổ lời chúc đang được cập nhật, bạn quay lại sau nhé.</p>`);
    return;
  }
  const draw = (newId = null) => {
    const count = (s) => wishes.filter((w) => w.status === s).length;
    const list = wishes.filter((w) => w.status === wishFilter);
    render($('#guestbook'), html`
      <div class="row"><h3 style="margin:0">Sổ lời chúc</h3><span class="spacer"></span>
        <span class="small muted">Chỉ lời chúc bạn duyệt mới hiện trên thiệp</span></div>
      <div class="chips" role="tablist" style="margin:10px 0">
        ${[['pending', 'Chờ duyệt'], ['approved', 'Đã duyệt'], ['hidden', 'Đã ẩn']].map(([key, label]) => html`
          <button type="button" class="chip ${wishFilter === key ? 'active' : ''}" data-wish-filter="${key}">${label} (${count(key)})</button>`)}
      </div>
      ${list.length ? html`<div class="stack">${list.map((w) => html`
        <div class="wish-item ${w.id === newId ? 'is-new' : ''}" data-wish="${w.id}">
          <div><strong>${w.guest_name}</strong> <span class="small muted">· ${new Date(w.created_at).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}</span></div>
          <p style="margin:4px 0 8px;white-space:pre-line">${w.message}</p>
          <div class="row" style="gap:6px">
            ${w.status !== 'approved' ? html`<button type="button" class="btn btn-primary btn-sm" data-wish-set="approved">✓ Duyệt</button>` : ''}
            ${w.status !== 'hidden' ? html`<button type="button" class="btn btn-light btn-sm" data-wish-set="hidden">Ẩn</button>` : ''}
            <button type="button" class="btn btn-link btn-sm text-red" data-wish-delete>Xóa</button>
          </div>
        </div>`)}</div>`
      : html`<p class="muted small">${wishFilter === 'pending' ? 'Không có lời chúc nào đang chờ duyệt.' : 'Chưa có lời chúc nào ở đây.'}</p>`}`);
  };
  $('#guestbook').onclick = async (e) => {
    const filter = e.target.closest('[data-wish-filter]');
    if (filter) { wishFilter = filter.dataset.wishFilter; draw(); return; }
    const row = e.target.closest('[data-wish]');
    const wish = row && wishes.find((w) => w.id === row.dataset.wish);
    if (!wish) return;
    const set = e.target.closest('[data-wish-set]');
    try {
      if (set) {
        await setWishStatus(wish.id, set.dataset.wishSet);
        wish.status = set.dataset.wishSet;
        toast(wish.status === 'approved' ? 'Đã duyệt – lời chúc hiện trên thiệp.' : 'Đã ẩn lời chúc.', 'success');
      } else if (e.target.closest('[data-wish-delete]')) {
        await deleteWish(wish.id);
        wishes = wishes.filter((w) => w.id !== wish.id);
      } else return;
      draw();
    } catch (error) {
      toastError(error);
    }
  };
  subscribeWishes(invitation.id, (wish) => {
    if (wishes.some((w) => w.id === wish.id)) return;
    wishes = [wish, ...wishes];
    wishFilter = 'pending';
    draw(wish.id);
    toast(`${wish.guest_name} vừa gửi lời chúc – chờ bạn duyệt`, 'success');
  });
  draw();
}

function renderShare(invitation) {
  const link = new URL(`invitation.html?i=${invitation.slug}`, location.href).href;
  render($('#share'), html`
    <div class="card stack" style="background:var(--brand-soft);padding:14px">
      <strong>Link gửi khách mời</strong>
      <div class="row"><input class="input" value="${link}" readonly style="flex:1" aria-label="Link thiệp">
        <button class="btn btn-dark btn-sm" type="button" data-copy="${link}">Sao chép</button></div>
      <a class="small" href="${link}" target="_blank" rel="noopener">Mở thử như khách mời →</a>
      <div class="stack" style="gap:6px">
        <span class="small"><strong>Mời riêng từng người</strong> – tên khách hiện trên phong bì và thiệp:</span>
        <div class="row"><input class="input" id="guest-link-name" maxlength="60" placeholder="VD: Anh Tuấn & chị Linh" style="flex:1" aria-label="Tên khách mời">
          <button class="btn btn-outline btn-sm" type="button" id="guest-link-copy">Sao chép link riêng</button></div>
      </div>
    </div>`);
  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast('Đã sao chép link.', 'success');
    } catch {
      toast('Không sao chép được – hãy chọn và copy thủ công.');
    }
  };
  $('[data-copy]').addEventListener('click', (e) => copy(e.currentTarget.dataset.copy));
  $('#guest-link-copy').addEventListener('click', () => {
    const name = $('#guest-link-name').value.trim();
    if (!name) { $('#guest-link-name').focus(); return; }
    copy(`${link}&to=${encodeURIComponent(name)}`);
  });
}

// Danh sách phản hồi + tự cập nhật khi khách vừa gửi (realtime)
async function showRsvps(invitation) {
  let rsvps = await listRsvps(invitation.id);
  renderRsvps(rsvps);
  const announce = (rsvp) => toast(
    `${rsvp.guest_name} vừa phản hồi: ${rsvp.attending ? `sẽ đến (${rsvp.guest_count} người)` : 'không thể đến'}`, 'success');

  subscribeRsvps(invitation.id, (rsvp) => {
    if (rsvps.some((r) => r.id === rsvp.id)) return;
    rsvps = [rsvp, ...rsvps];
    renderRsvps(rsvps, rsvp.id);
    announce(rsvp);
  }, async () => {
    // Vừa kết nối (lại): phản hồi gửi trong lúc đang kết nối sẽ không có sự kiện → tải lại cho chắc
    const latest = await listRsvps(invitation.id).catch(() => null);
    const missed = latest?.filter((r) => !rsvps.some((old) => old.id === r.id)) ?? [];
    if (!missed.length) return;
    rsvps = latest;
    renderRsvps(rsvps, missed[0].id);
    missed.forEach(announce);
  });
}

function renderRsvps(rsvps, newId = null) {
  const attending = rsvps.filter((r) => r.attending);
  const totalGuests = attending.reduce((t, r) => t + r.guest_count, 0);
  render($('#rsvps'), html`
    <h3>Phản hồi khách mời</h3>
    <p><strong>${totalGuests}</strong> khách sẽ đến · ${rsvps.length - attending.length} không thể đến</p>
    <p class="small muted" style="margin-top:-6px">● Tự cập nhật khi khách gửi phản hồi</p>
    ${rsvps.length ? html`<div class="stack">${rsvps.map((r) => html`
      <div class="small rsvp-item ${r.id === newId ? 'is-new' : ''}"><strong>${r.guest_name}</strong> –
        ${r.attending ? `đến (${r.guest_count} người)` : 'không đến'}
        ${r.message ? html`<div class="muted">“${r.message}”</div>` : ''}</div>`)}</div>`
      : html`<p class="muted small">Chưa có phản hồi nào.</p>`}`);
}

// datetime-local cần dạng YYYY-MM-DDTHH:mm theo giờ địa phương
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

// ---------- KHỞI CHẠY TRANG ----------
try {
  const slug = param('i');
  const profile = await initLayout(slug ? null : 'invitation');
  if (slug) await renderGuestView(slug);
  else if (!profile || param('mau') !== null) renderGallery(profile);
  else await renderEditor(profile);
} catch (error) {
  toastError(error);
}
