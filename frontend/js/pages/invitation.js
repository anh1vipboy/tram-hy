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
import { invitationPages, invitationEnvelope, invitationTemplateKey, weddingEvents, mainParty, whenText } from '../components/invitation-card.js';
import { mountEventsEditor, mountQuestionsEditor, cleanLists, newEvent } from '../components/invitation-lists.js';
import { EFFECTS, startEffect } from '../components/wedding-effects.js';
import { lunarText } from '../core/lunar.js';
import { MUSIC_TRACKS, createWeddingMusic, youtubeIdFrom } from '../components/wedding-music.js';
import { openPhotoGallery } from '../components/dress-gallery.js';
import { makeSortable } from '../components/sortable.js';
import { qrCanvas, downloadCanvas, shareLink, facebookShareUrl } from '../components/qr-share.js';
import {
  getMyInvitation, openInvitation, saveInvitation, listRsvps, submitRsvp, subscribeRsvps,
  uploadInvitationPhoto, removeInvitationPhoto, listWishes, listApprovedWishes, submitWish, setWishStatus, deleteWish, subscribeWishes,
  replyWish, setInvitationPassword, invitationStats,
} from '../services/invitations.js';

const page = $('#invitation-page');

// Font viết tay của các mẫu thiệp – chỉ tải ở trang này
const fonts = document.createElement('link');
fonts.rel = 'stylesheet';
fonts.href = INVITATION_FONTS_URL;
document.head.append(fonts);

// ---------- MỪNG CƯỚI 2 BÊN · CHỈ ĐƯỜNG · LƯU LỊCH ----------
// Thiệp cũ chỉ có 1 tài khoản (cột bank_code / bank_account) → coi là nhà trai
function giftsOf(inv) {
  const d = inv.details || {};
  const groom = d.gift_groom || (!d.gift_bride && inv.bank_account ? { bank: inv.bank_code, account: inv.bank_account } : null);
  return [
    groom?.account && { side: 'groom', title: 'Mừng nhà trai', who: inv.groom_name, ...groom },
    d.gift_bride?.account && { side: 'bride', title: 'Mừng nhà gái', who: inv.bride_name, ...d.gift_bride },
  ].filter(Boolean);
}
const giftQr = (gift, inv) => `https://img.vietqr.io/image/${gift.bank}-${gift.account}-compact2.png`
  + `?addInfo=${encodeURIComponent(`Mung cuoi ${inv.groom_name} ${inv.bride_name}`)}${gift.holder ? `&accountName=${encodeURIComponent(gift.holder)}` : ''}`;
const bankName = (code) => BANKS.find(([c]) => c === code)?.[1] ?? code;

const placeText = (e) => [e.place, e.address].filter(Boolean).join(', ');
const mapsUrl = (e) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeText(e))}`;
function calendarUrl(e, inv) {
  const start = new Date(e.at);
  const end = new Date(start.getTime() + 3 * 3600e3);
  const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const text = `${e.name} – ${inv.groom_name} & ${inv.bride_name}`;
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(text)}`
    + `&dates=${stamp(start)}/${stamp(end)}&location=${encodeURIComponent(placeText(e))}`;
}
const clock = (iso) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
const dayMonth = (iso) => new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });

// ---------- KHÁCH MỜI ----------
// Thiệp mở bằng link (hàm open_invitation ở server). Thiệp khóa → hỏi mật khẩu 1 lần, nhớ trong phiên trình duyệt.
let guestWantsForm = false;   // khách bấm "Gửi phản hồi cho người khác" → luôn hiện form
let guestPassword = null;
let effectStarted = false;
const passwordKey = (slug) => `tramhy-inv-pw-${slug}`;
const readSaved = (slug) => { try { return sessionStorage.getItem(passwordKey(slug)); } catch { return null; } };

// Xem thử (invitation.html?xem-thu=1): trang soạn lưu tạm bản đang soạn vào localStorage rồi mở tab này.
// Hiện y như khách thấy, nhưng không gửi phản hồi / lời chúc. Bấm "Xem thử" lần nữa → tab này tự tải lại bản mới.
let previewMode = false;

function renderPreviewMode() {
  let inv = null;
  try { inv = JSON.parse(localStorage.getItem(PREVIEW_KEY) || 'null'); } catch { /* bỏ qua */ }
  if (!inv) {
    render(page, html`<div class="container"><div class="empty">Chưa có bản xem thử – hãy bấm “Xem thử” trong trang soạn thiệp.</div></div>`);
    return;
  }
  previewMode = true;
  document.body.classList.add('invite-mode', 'is-preview');
  const banner = document.createElement('div');
  banner.className = 'preview-banner';
  banner.setAttribute('role', 'status');
  banner.textContent = '👁 Bản xem thử – thiệp hiện y như khách thấy (kể cả thay đổi chưa lưu). Phản hồi & lời chúc không được gửi.';
  document.body.prepend(banner);
  startGuest(inv.slug, inv);
  // Trang soạn bấm "Xem thử" lần nữa → nạp bản mới
  window.addEventListener('storage', (e) => { if (e.key === PREVIEW_KEY) location.reload(); });
}

async function renderGuestView(slug) {
  document.body.classList.add('invite-mode');
  const saved = readSaved(slug);
  let result;
  try {
    result = await openInvitation(slug, saved);
  } catch (error) {
    render(page, html`<div class="container"><div class="empty">${error.message}</div></div>`);
    return;
  }
  if (result.status === 'not_found') {
    document.body.classList.remove('invite-mode');
    render(page, html`<div class="container"><div class="empty">Thiệp không tồn tại hoặc đã bị xóa.</div></div>`);
    return;
  }
  if (result.status !== 'ok') { renderLock(slug, result.invitation); return; }
  guestPassword = saved;
  startGuest(slug, result.invitation);
}

// Thiệp khóa: màn nhập mật khẩu (chỉ lộ tên cô dâu chú rể)
function renderLock(slug, basic) {
  const tpl = templateOf(invitationTemplateKey(basic || {}));
  document.title = `Thiệp cưới ${basic?.groom_name ?? ''} & ${basic?.bride_name ?? ''}`;
  render(page, html`
    <div class="inv-stage" style="--stage:${tpl.colors.backdrop}">
      <div class="inv-stage-inner">
        <form class="inv-section inv-lock stack" novalidate>
          <div class="center"><span class="inv-lock-icon" aria-hidden="true">🔒</span>
            <h2 style="margin:6px 0 4px">Thiệp cưới ${basic?.groom_name ?? ''} & ${basic?.bride_name ?? ''}</h2>
            <p class="muted" style="margin:0">Thiệp được bảo vệ. Nhập mật khẩu cô dâu chú rể gửi kèm lời mời nhé.</p></div>
          <label class="field"><span>Mật khẩu thiệp</span>
            <input class="input" name="password" type="password" autocomplete="off" maxlength="40" required autofocus></label>
          <p class="small text-red" data-lock-error hidden></p>
          <button class="btn btn-primary btn-lg" type="submit">Mở thiệp</button>
        </form>
      </div>
    </div>`);
  const form = $('.inv-lock');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const password = form.elements.password.value.trim();
    const error = form.querySelector('[data-lock-error]');
    if (!password) { form.elements.password.focus(); return; }
    withBusy(e.submitter, async () => {
      try {
        const result = await openInvitation(slug, password);
        if (result.status === 'ok') {
          try { sessionStorage.setItem(passwordKey(slug), password); } catch { /* chế độ riêng tư */ }
          guestPassword = password;
          startGuest(slug, result.invitation);
          return;
        }
        error.textContent = 'Mật khẩu chưa đúng – bạn kiểm tra lại tin nhắn mời nhé.';
        error.hidden = false;
        form.elements.password.select();
      } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
      }
    });
  });
}

function startGuest(slug, inv) {
  const guestName = (param('to') || '').trim().slice(0, 60);
  const tpl = templateOf(invitationTemplateKey(inv));
  document.title = `Thiệp cưới ${inv.groom_name} & ${inv.bride_name}`;

  render(page, html`
    <div class="inv-stage" style="--stage:${tpl.colors.backdrop}">
      <div class="inv-stage-inner" id="inv-stage-inner">
        <div class="inv-intro">
          ${invitationEnvelope(inv, guestName)}
          <p class="inv-intro-hint">Chạm vào con dấu để mở thiệp</p>
        </div>
      </div>
    </div>`);

  // Tải sẵn trình phát nhạc ngay khi khách mở link (YouTube cần vài giây để sẵn sàng)
  guestMusic = createWeddingMusic(inv.details?.music, { onState: showMusicState });
  guestMusic?.prepare();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const open = () => {
    $('.envelope').classList.add('is-open');
    $('.inv-intro').classList.add('is-leaving');
    // Điện thoại chỉ cho phát tiếng NGAY trong lúc khách chạm → gọi play() đồng bộ ở đây (không await trước)
    musicPlaying = Boolean(guestMusic);
    guestMusic?.play().catch(() => showMusicState(false));
    setTimeout(() => showInvitation(inv, guestName, slug), reduced ? 50 : 2000);
  };
  $('[data-open-envelope]').addEventListener('click', open, { once: true });
  $('[data-open-envelope]').focus({ preventScroll: true });
}

let guestMusic = null;
let musicPlaying = false;   // trạng thái THẬT do trình phát báo về (điện thoại có thể chặn tự phát)

function showMusicState(playing) {
  musicPlaying = playing;
  const btn = $('[data-music]');
  if (!btn) return;
  btn.classList.toggle('is-playing', playing);
  btn.setAttribute('aria-pressed', String(playing));
  btn.setAttribute('aria-label', playing ? 'Tắt nhạc nền' : 'Bật nhạc nền');
  btn.title = playing ? 'Tắt nhạc' : 'Bấm để nghe nhạc';
}

function showInvitation(inv, guestName, slug) {
  const d = inv.details || {};
  const story = Array.isArray(d.story) ? d.story : [];
  const album = Array.isArray(d.album) ? d.album : [];
  const events = weddingEvents(inv).filter((e) => e.at);
  const party = mainParty(events);
  const gifts = giftsOf(inv);
  const crew = d.wedding_party || {};
  const questions = Array.isArray(d.rsvp_questions) ? d.rsvp_questions : [];
  const tpl = templateOf(invitationTemplateKey(inv));
  $('.inv-stage').style.setProperty('--inv-accent', tpl.colors.accent);
  $('.inv-stage').style.setProperty('--inv-script', `'${tpl.script}', cursive`);
  if (!effectStarted) { effectStarted = true; startEffect(d.effect, tpl.colors.accent); }

  const question = (q) => html`
    <div class="rsvp-q" data-q="${q.id}" data-q-event="${q.event_id || ''}">
      ${q.type === 'choice' ? html`
        <fieldset><legend>${q.text}${q.required ? html`<span class="text-red"> *</span>` : ''}</legend>
          <div class="chips">${q.options.map((o) => html`
            <label class="chip rsvp-choice"><input type="radio" name="q_${q.id}" value="${o}">${o}</label>`)}</div></fieldset>`
      : html`
        <label class="field"><span>${q.text}${q.required ? html`<span class="text-red"> *</span>` : ''}</span>
          <input class="input" name="q_${q.id}" maxlength="300"></label>`}
    </div>`;

  render($('#inv-stage-inner'), html`
    <div class="inv-guest-pages">${invitationPages(inv, { guestName, uid: 'guest' })}</div>
    ${party ? html`
      <section class="inv-countdown">
        <p class="inv-countdown-title">Cùng đếm ngược tới ngày vui</p>
        <div class="countdown" id="countdown"></div>
      </section>
      <div class="inv-info-row">
        ${placeText(party) ? html`<a class="btn" href="${mapsUrl(party)}" target="_blank" rel="noopener">📍 Chỉ đường đến tiệc</a>` : ''}
        <a class="btn" href="${calendarUrl(party, inv)}" target="_blank" rel="noopener">📅 Lưu vào lịch</a>
      </div>` : ''}
    ${events.length > 1 ? html`
      <section class="inv-section inv-events" aria-labelledby="events-title">
        <h2 id="events-title" class="center">Lịch cưới</h2>
        <ol class="event-list">${events.map((e) => html`
          <li class="event-card ${e.main ? 'is-main' : ''}">
            <div class="event-date"><strong>${clock(e.at)}</strong><span>${dayMonth(e.at)}</span></div>
            <div class="event-body">
              <span class="event-kind">${e.kind === 'le' ? 'Lễ' : 'Tiệc'}${e.main ? ' · tiệc chính' : ''}</span>
              <strong class="event-name">${e.name}</strong>
              <span class="small">${whenText(e.at)}</span>
              <span class="small muted">(${lunarText(e.at)})</span>
              ${placeText(e) ? html`<span class="small">📍 ${placeText(e)}</span>` : ''}
              <div class="event-links">
                ${placeText(e) ? html`<a href="${mapsUrl(e)}" target="_blank" rel="noopener">Chỉ đường</a>` : ''}
                <a href="${calendarUrl(e, inv)}" target="_blank" rel="noopener">Lưu vào lịch</a>
              </div>
            </div>
          </li>`)}
        </ol>
      </section>` : ''}
    ${story.length ? html`
      <section class="inv-section inv-story" aria-labelledby="story-title">
        <h2 id="story-title" class="center">Chuyện tình yêu</h2>
        <ol class="story-timeline">${story.map((s) => html`
          <li><span class="story-dot" aria-hidden="true">♥</span>
            <div class="story-card">${s.when ? html`<span class="story-when">${s.when}</span>` : ''}
              ${s.title ? html`<strong>${s.title}</strong>` : ''}${s.text ? html`<p>${s.text}</p>` : ''}</div></li>`)}
        </ol>
      </section>` : ''}
    ${crew.groomsmen?.length || crew.bridesmaids?.length ? html`
      <section class="inv-section inv-crew" aria-labelledby="crew-title">
        <h2 id="crew-title" class="center">Phù dâu & phù rể</h2>
        <div class="crew-grid">
          ${[['Phù rể', crew.groomsmen], ['Phù dâu', crew.bridesmaids]].filter(([, list]) => list?.length).map(([title, list]) => html`
            <div class="crew-col"><span class="story-when">${title}</span>
              <ul>${list.map((n) => html`<li>${n}</li>`)}</ul></div>`)}
        </div>
      </section>` : ''}
    ${d.video ? html`
      <section class="inv-section inv-video" aria-labelledby="video-title">
        <h2 id="video-title" class="center">Video cưới</h2>
        <div class="video-box" id="video-box">
          <button type="button" class="video-poster" data-video="${d.video}" style="background-image:url(https://i.ytimg.com/vi/${d.video}/hqdefault.jpg)"
                  aria-label="Phát video cưới"><span class="video-play" aria-hidden="true">▶</span></button>
        </div>
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
      <form class="stack" id="rsvp-form" novalidate>
        <div><h2>Bạn sẽ đến chung vui chứ?</h2><p class="muted" style="margin:0">Phản hồi giúp gia đình chuẩn bị chu đáo hơn.</p></div>
        <label class="field"><span>Tên của bạn</span><input class="input" name="guestName" required maxlength="100" value="${guestName}"></label>
        <div class="row">
          <label class="row"><input type="radio" name="attending" value="yes" checked> Sẽ tham dự</label>
          <label class="row"><input type="radio" name="attending" value="no"> Rất tiếc không thể đến</label>
        </div>
        <div class="stack rsvp-yes" style="gap:12px">
          ${events.length > 1 ? html`
            <fieldset class="rsvp-events"><legend>Bạn sẽ dự <span class="text-red">*</span></legend>
              ${events.map((e) => html`
                <label class="rsvp-event"><input type="checkbox" name="event" value="${e.id}" checked>
                  <span><strong>${e.name}</strong><span class="small muted">${clock(e.at)} · ${dayMonth(e.at)}${e.place ? ` · ${e.place}` : ''}</span></span></label>`)}
            </fieldset>` : ''}
          <label class="field"><span>Số người đi cùng (tính cả bạn)</span>
            <input class="input" type="number" name="guestCount" min="1" max="10" value="1"></label>
          ${questions.map(question)}
        </div>
        <label class="field"><span>Lời nhắn riêng cho cô dâu chú rể (không bắt buộc)</span><textarea class="input" name="message" maxlength="500" placeholder="VD: Mình đi cùng bé nhỏ, nhờ để giúp ghế em bé nhé"></textarea></label>
        <!-- Bẫy bot: người thật không thấy ô này, bot tự điền mọi ô sẽ điền vào → bỏ qua -->
        <label class="hp-field" aria-hidden="true">Website <input name="website" tabindex="-1" autocomplete="off"></label>
        <button class="btn btn-primary" type="submit">Gửi phản hồi</button>
      </form>
    </section>
    ${gifts.length ? html`
      <section class="inv-section center" id="gift-section">
        <h2>Hộp mừng cưới</h2>
        <p class="muted" style="margin:0">Quét mã bằng ứng dụng ngân hàng để gửi quà mừng tới cô dâu chú rể.</p>
        <div class="gift-grid">${gifts.map((g) => html`
          <div class="gift-card">
            <strong>${g.title}</strong>
            <img class="gift-qr" src="${giftQr(g, inv)}" alt="Mã QR ${g.title.toLowerCase()}" loading="lazy">
            <span class="small">${bankName(g.bank)}</span>
            <span class="gift-account">${g.account}</span>
            ${g.holder ? html`<span class="small muted">${g.holder}</span>` : ''}
            <button type="button" class="btn btn-light btn-sm" data-copy-account="${g.account}">Sao chép số tài khoản</button>
          </div>`)}</div>
      </section>` : ''}
    <nav class="inv-actions" aria-label="Phản hồi thiệp">
      <button type="button" class="btn" data-go="rsvp">💌 Xác nhận tham dự</button>
      <button type="button" class="btn" data-go="wish">💬 Gửi lời chúc</button>
    </nav>
    ${guestMusic ? html`<button type="button" class="music-toggle" data-music>♪</button>` : ''}`);
  showMusicState(musicPlaying);

  $$('[data-go]').forEach((btn) => btn.addEventListener('click', () => {
    const wish = btn.dataset.go === 'wish';
    $(wish ? '#wish-form' : '#rsvp-section').scrollIntoView({ behavior: 'smooth', block: 'center' });
    const target = wish ? ($('#wish-form [name=message]') ?? $('#wish-form')) : $('#rsvp-form [name=guestName]');
    setTimeout(() => target?.focus({ preventScroll: true }), 500);
  }));
  // 1 lần bấm: đang phát → tắt; đang tắt (hoặc bị điện thoại chặn) → phát
  $('[data-music]')?.addEventListener('click', () => {
    if (musicPlaying) {
      guestMusic.pause();
    } else {
      showMusicState(true);
      guestMusic.play().catch(() => showMusicState(false));
    }
  });
  // Video chỉ tải khi bấm xem; nhạc nền tạm dừng để không chồng tiếng
  $('[data-video]')?.addEventListener('click', (e) => {
    const id = e.currentTarget.dataset.video;
    if (musicPlaying) guestMusic.pause();
    render($('#video-box'), html`<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1"
      title="Video cưới" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`);
  });
  $$('[data-copy-account]').forEach((btn) => btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(btn.dataset.copyAccount);
      toast('Đã sao chép số tài khoản.', 'success');
    } catch {
      toast(`Số tài khoản: ${btn.dataset.copyAccount}`);
    }
  }));
  $$('[data-photo]').forEach((btn) => btn.addEventListener('click', () => openPhotoGallery({
    title: 'Album ảnh cưới', subtitle: `${inv.groom_name} & ${inv.bride_name}`, images: album, start: Number(btn.dataset.photo),
  })));
  if (party) startCountdown(new Date(party.at));
  loadWishWall(slug);
  bindWishForm(slug);
  bindRsvp(inv, slug, events, questions);
}

// Sổ lời chúc phía khách: các lời chúc đã duyệt (mới nhất trước) + lời đáp của cô dâu chú rể
async function loadWishWall(slug) {
  const wishes = previewMode ? [] : await listApprovedWishes(slug, guestPassword).catch(() => []);
  const box = $('#wish-list');
  if (!box) return;
  render(box, wishes.length ? html`${wishes.slice(0, 60).map((w) => html`
    <figure class="wish-card"><blockquote>${w.message}</blockquote><figcaption>— ${w.guest_name}</figcaption>
      ${w.reply ? html`<div class="wish-reply"><strong>💌 Cô dâu chú rể:</strong> ${w.reply}</div>` : ''}</figure>`)}`
    : html`<p class="muted center small" style="margin:0">Hãy là người đầu tiên gửi lời chúc tới cô dâu chú rể 💐</p>`);
}

function bindWishForm(slug) {
  const form = $('#wish-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const done = () => render(form, html`<div class="center stack" style="gap:6px"><h3 style="margin:0">Cảm ơn lời chúc của bạn! 💐</h3>
      <p class="muted" style="margin:0">Lời chúc sẽ hiện trên sổ sau khi cô dâu chú rể xem.</p></div>`);
    if (data.get('website')) { done(); return; }                // bot điền ô bẫy
    if (previewMode) { toast('Đây là bản xem thử – lời chúc không được gửi.'); return; }
    const guestName = data.get('guestName').trim();
    const message = data.get('message').trim();
    if (guestName.length < 2) { form.elements.guestName.focus(); toastError(new Error('Vui lòng nhập tên của bạn')); return; }
    if (message.length < 2) { form.elements.message.focus(); toastError(new Error('Bạn chưa viết lời chúc')); return; }
    await withBusy(e.submitter, async () => {
      try {
        await submitWish(slug, guestPassword, { guestName, message });
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

function bindRsvp(inv, slug, events, questions) {
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
  const alreadySent = previewMode ? null : (() => { try { return localStorage.getItem(sentKey); } catch { return null; } })();
  if (alreadySent && !guestWantsForm) {
    thanks($('#rsvp-form'), alreadySent);
    return;
  }

  const form = $('#rsvp-form');
  // Không đến → ẩn số người, sự kiện, câu hỏi; câu hỏi gắn 1 sự kiện chỉ hiện khi khách chọn dự sự kiện đó
  const sync = () => {
    const attending = form.elements.attending.value === 'yes';
    form.querySelector('.rsvp-yes').hidden = !attending;
    const chosen = new Set([...form.querySelectorAll('[name=event]:checked')].map((c) => c.value));
    form.querySelectorAll('[data-q-event]').forEach((q) => {
      q.hidden = Boolean(q.dataset.qEvent) && events.length > 1 && !chosen.has(q.dataset.qEvent);
    });
    form.querySelectorAll('.rsvp-choice').forEach((c) => c.classList.toggle('active', c.querySelector('input').checked));
  };
  form.addEventListener('change', sync);
  sync();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    if (previewMode) { toast('Đây là bản xem thử – phản hồi không được gửi.'); return; }
    if (data.get('website')) {                       // bot điền ô bẫy → giả vờ thành công, không gửi
      thanks(form, '');
      return;
    }
    const guestName = data.get('guestName').trim();
    const attending = data.get('attending') === 'yes';
    if (guestName.length < 2) { form.elements.guestName.focus(); toastError(new Error('Vui lòng nhập tên của bạn')); return; }
    const eventIds = attending ? data.getAll('event') : [];
    if (attending && events.length > 1 && !eventIds.length) { toastError(new Error('Bạn chọn giúp sự kiện sẽ tham dự nhé')); return; }
    const answers = {};
    if (attending) {
      for (const q of questions) {
        const box = form.querySelector(`[data-q="${q.id}"]`);
        if (box.hidden) continue;
        const value = String(data.get(`q_${q.id}`) || '').trim();
        if (!value && q.required) {
          box.querySelector('input')?.focus();
          toastError(new Error(`Vui lòng trả lời: ${q.text}`));
          return;
        }
        if (value) answers[q.id] = value;
      }
    }
    await withBusy(e.submitter, async () => {
      try {
        await submitRsvp(slug, guestPassword, {
          guestName, attending, eventIds, answers,
          guestCount: Number(data.get('guestCount')) || 1,
          message: data.get('message').trim() || null,
        });
        try { localStorage.setItem(sentKey, guestName); } catch { /* chế độ riêng tư: bỏ qua */ }
        thanks(form, guestName);
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
// Tên ngắn trên thanh mục (đúng thứ tự data-section 1…12)
const EDITOR_SECTIONS = ['Mẫu thiệp', 'Cô dâu chú rể', 'Gia đình', 'Lễ & tiệc', 'Phù dâu rể', 'Mừng cưới', 'Album', 'Video',
  'Chuyện tình', 'Nhạc & hiệu ứng', 'Xác nhận', 'Bảo mật'];
const PREVIEW_KEY = 'tramhy-inv-preview';
const PHOTO_SLOTS = [['photo_url', 'Ảnh trang bìa (trang 1)'], ['photo2_url', 'Ảnh trang tiệc cưới (trang 3)']];
const STORY_MAX = 6;
const DETAIL_FIELDS = ['groom_father', 'groom_mother', 'groom_address', 'bride_father', 'bride_mother', 'bride_address'];

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
    // Thiệp cũ chưa có danh sách sự kiện → dựng từ giờ lễ / giờ tiệc cũ; thiệp mới → Lễ thành hôn + Tiệc cưới
    events: invitation ? weddingEvents(invitation).map((e) => ({ ...e })) : [],
    questions: Array.isArray(d.rsvp_questions) ? d.rsvp_questions.map((q) => ({ ...q, options: [...(q.options || [])] })) : [],
  };
  if (!draft.events.length) draft.events = [newEvent({ name: 'Lễ thành hôn', kind: 'le' }), { ...newEvent({ name: 'Tiệc cưới', kind: 'tiec' }), main: true }];
  const music = d.music ?? null;
  // Mừng cưới 2 bên; thiệp cũ chỉ có 1 tài khoản (cột bank_code / bank_account) → coi là nhà trai
  const GIFT_SIDES = [
    ['gift_groom', '🤵 Nhà trai', { bank: invitation?.bank_code, account: d.gift_groom || d.gift_bride ? '' : invitation?.bank_account }],
    ['gift_bride', '👰 Nhà gái', {}],
  ];
  const gifts = { gift_groom: d.gift_groom, gift_bride: d.gift_bride };
  const field =(name, label, value, attrs = {}) => html`
    <label class="field ${attrs.full ? 'full' : ''}"><span>${label}</span>
      <input class="input" name="${name}" value="${value ?? ''}" maxlength="${attrs.max ?? 80}" placeholder="${attrs.placeholder ?? ''}" ${attrs.required ? 'required' : ''}></label>`;

  render(page, html`
    <div class="section-head">
      <div><div class="eyebrow">Thiệp cưới online</div><h1>Soạn thiệp & nhận phản hồi khách mời</h1></div>
      <a class="btn btn-outline btn-sm" href="invitation.html?mau=1">Xem thư viện mẫu</a>
    </div>
    <div class="inv-editor">
      <div class="inv-editor-main">
      <form class="card stack" id="editor" novalidate>
        <div class="inv-toolbar">
          <span class="inv-toolbar-title">Chọn mục để soạn</span>
          <nav class="inv-steps" aria-label="Các mục của thiệp">
            ${EDITOR_SECTIONS.map((label, i) => html`<button type="button" class="inv-step" data-step="${i + 1}" aria-current="false">
              <span class="step-num">${i + 1}</span><span>${label}</span><span class="step-check" aria-hidden="true">✓</span></button>`)}
          </nav>
          <div class="inv-toolbar-actions">
            <button type="button" class="btn btn-outline btn-sm" data-preview-guest>👁 Xem thử</button>
            <button type="submit" class="btn btn-primary btn-sm inv-save-top">💾 ${invitation ? 'Lưu thiệp' : 'Tạo thiệp'}</button>
          </div>
        </div>
        <details class="inv-form-section" data-section="1" open>
          <summary><span class="step-num">1</span><span class="step-title">Chọn mẫu thiệp</span><span class="step-done" aria-hidden="true">✓</span></summary>
          <div class="inv-form-body">
          <div class="tpl-strip" role="radiogroup" aria-label="Mẫu thiệp">
            ${INVITATION_TEMPLATES.map((t) => html`
              <button type="button" class="tpl-pick ${t.key === draft.template ? 'active' : ''}" style="--stage:${t.colors.backdrop}"
                      role="radio" aria-checked="${t.key === draft.template ? 'true' : 'false'}" data-template="${t.key}">
                ${invitationPages({ ...SAMPLE_INVITATION, template: t.key }, { pages: [1], uid: `p-${t.key}` })}
                <span>${t.name}</span>
              </button>`)}
          </div>
          </div>
        </details>
        <details class="inv-form-section" data-section="2" open>
          <summary><span class="step-num">2</span><span class="step-title">Cô dâu & chú rể</span><span class="step-done" aria-hidden="true">✓</span></summary>
          <div class="inv-form-body">
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
          </div>
        </details>
        <details class="inv-form-section" data-section="3" open>
          <summary><span class="step-num">3</span><span class="step-title">Gia đình hai bên</span><span class="step-done" aria-hidden="true">✓</span></summary>
          <div class="inv-form-body">
          <div class="host-picker" role="radiogroup" aria-label="Thiệp của nhà nào">
            <label><input type="radio" name="host" value="trai" ${d.host !== 'gai' ? 'checked' : ''}> Thiệp nhà trai – Lễ thành hôn</label>
            <label><input type="radio" name="host" value="gai" ${d.host === 'gai' ? 'checked' : ''}> Thiệp nhà gái – Lễ vu quy</label>
          </div>
          <div class="form-grid">
            ${field('groom_father', 'Bố chú rể', d.groom_father)}
            ${field('groom_mother', 'Mẹ chú rể', d.groom_mother)}
            ${field('groom_address', 'Địa chỉ nhà trai', d.groom_address, { full: true, max: 160 })}
            ${field('bride_father', 'Bố cô dâu', d.bride_father)}
            ${field('bride_mother', 'Mẹ cô dâu', d.bride_mother)}
            ${field('bride_address', 'Địa chỉ nhà gái', d.bride_address, { full: true, max: 160 })}
          </div>
          </div>
        </details>
        <details class="inv-form-section" data-section="4" open>
          <summary><span class="step-num">4</span><span class="step-title">Lễ & tiệc <span class="small muted">(ăn hỏi, vu quy, tiệc nhà gái, nhà trai…)</span></span><span class="step-done" aria-hidden="true">✓</span></summary>
          <div class="inv-form-body">
          <p class="small muted" style="margin:0">Trang 2 của thiệp in lễ đầu tiên, trang 3 in tiệc chính. Khách xem đủ lịch và chọn dự sự kiện nào khi xác nhận.</p>
          <div id="events-edit"></div>
          </div>
        </details>
        <details class="inv-form-section" data-section="5" open>
          <summary><span class="step-num">5</span><span class="step-title">Phù dâu & phù rể <span class="small muted">(không bắt buộc)</span></span><span class="step-done" aria-hidden="true">✓</span></summary>
          <div class="inv-form-body">
          <div class="form-grid">
            <label class="field"><span>Phù rể (mỗi dòng 1 người)</span>
              <textarea class="input" name="groomsmen" rows="4" maxlength="400" placeholder="Nguyễn Văn A&#10;Trần Văn B">${(d.wedding_party?.groomsmen || []).join('\n')}</textarea></label>
            <label class="field"><span>Phù dâu (mỗi dòng 1 người)</span>
              <textarea class="input" name="bridesmaids" rows="4" maxlength="400" placeholder="Lê Thị C&#10;Phạm Thị D">${(d.wedding_party?.bridesmaids || []).join('\n')}</textarea></label>
          </div>
          </div>
        </details>
        <details class="inv-form-section" data-section="6" open>
          <summary><span class="step-num">6</span><span class="step-title">Mừng cưới qua chuyển khoản <span class="small muted">(không bắt buộc)</span></span><span class="step-done" aria-hidden="true">✓</span></summary>
          <div class="inv-form-body">
          <p class="small muted" style="margin:0">Khách quét mã QR của bên mình quen. Để trống số tài khoản thì bên đó không hiện.</p>
          ${GIFT_SIDES.map(([side, label, fallback]) => html`
            <fieldset class="gift-edit">
              <legend>${label}</legend>
              <div class="form-grid">
                <label class="field"><span>Ngân hàng</span>
                  <select class="input" name="${side}_bank">${BANKS.map(([code, name]) => html`
                    <option value="${code}" ${code === (gifts[side]?.bank ?? fallback.bank ?? 'MB') ? 'selected' : ''}>${name}</option>`)}</select></label>
                <label class="field"><span>Số tài khoản</span>
                  <input class="input" name="${side}_account" value="${gifts[side]?.account ?? fallback.account ?? ''}" inputmode="numeric" maxlength="20"></label>
                <label class="field full"><span>Tên chủ tài khoản</span>
                  <input class="input" name="${side}_holder" value="${gifts[side]?.holder ?? ''}" maxlength="60" placeholder="VD: NGUYEN MINH KHANG"></label>
              </div>
            </fieldset>`)}
          </div>
        </details>
        <details class="inv-form-section" data-section="7" open>
          <summary><span class="step-num">7</span><span class="step-title">Album ảnh cưới <span class="small muted">(tối đa ${ALBUM_MAX} ảnh – kéo để đổi thứ tự)</span></span><span class="step-done" aria-hidden="true">✓</span></summary>
          <div class="inv-form-body">
          <div class="album-edit" id="album-edit"></div>
          <label class="btn btn-outline btn-sm" style="align-self:flex-start;cursor:pointer" id="album-add">＋ Thêm ảnh
            <input type="file" accept="image/*" multiple hidden id="album-input"></label>
          </div>
        </details>
        <details class="inv-form-section" data-section="8" open>
          <summary><span class="step-num">8</span><span class="step-title">Video cưới <span class="small muted">(không bắt buộc)</span></span><span class="step-done" aria-hidden="true">✓</span></summary>
          <div class="inv-form-body">
          <label class="field"><span>Link YouTube (pre-wedding, phóng sự…)</span>
            <input class="input" name="video" maxlength="200" value="${d.video ? `https://youtu.be/${d.video}` : ''}" placeholder="VD: https://youtu.be/…"></label>
          <p class="small muted" style="margin:0">Video chỉ tải khi khách bấm xem (thiệp vẫn mở nhanh); nhạc nền tự tạm dừng khi video phát.</p>
          </div>
        </details>
        <details class="inv-form-section" data-section="9" open>
          <summary><span class="step-num">9</span><span class="step-title">Chuyện tình yêu <span class="small muted">(tối đa ${STORY_MAX} cột mốc)</span></span><span class="step-done" aria-hidden="true">✓</span></summary>
          <div class="inv-form-body">
          <div class="stack" id="story-edit"></div>
          <button type="button" class="btn btn-outline btn-sm" style="align-self:flex-start" id="story-add">＋ Thêm cột mốc</button>
          </div>
        </details>
        <details class="inv-form-section" data-section="10" open>
          <summary><span class="step-num">10</span><span class="step-title">Nhạc & hiệu ứng</span><span class="step-done" aria-hidden="true">✓</span></summary>
          <div class="inv-form-body">
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
            Bài từ YouTube phát qua trình phát của YouTube – video cần cho phép nhúng; bản quyền bài hát do bạn chọn.</p>
          <div class="field"><span>Hiệu ứng rơi trên thiệp</span>
            <div class="chips effect-picker" role="radiogroup" aria-label="Hiệu ứng">
              ${EFFECTS.map(([key, label]) => html`
                <label class="chip ${(d.effect || 'none') === key ? 'active' : ''}"><input type="radio" name="effect" value="${key}" ${(d.effect || 'none') === key ? 'checked' : ''} hidden>${label}</label>`)}
            </div></div>
          </div>
        </details>
        <details class="inv-form-section" data-section="11" open>
          <summary><span class="step-num">11</span><span class="step-title">Xác nhận tham dự <span class="small muted">(câu hỏi thêm cho khách)</span></span><span class="step-done" aria-hidden="true">✓</span></summary>
          <div class="inv-form-body">
          <p class="small muted" style="margin:0">Khách luôn được hỏi tên, có đến không, đi mấy người và – nếu có nhiều sự kiện – dự sự kiện nào. Thêm câu hỏi riêng nếu cần (tối đa 5).</p>
          <div id="questions-edit"></div>
          </div>
        </details>
        <details class="inv-form-section" data-section="12" open>
          <summary><span class="step-num">12</span><span class="step-title">Bảo mật thiệp <span class="small muted">(không bắt buộc)</span></span><span class="step-done" aria-hidden="true">✓</span></summary>
          <div class="inv-form-body">
          <p class="small muted" style="margin:0">Mặc định: ai có link mới mở được thiệp (không liệt kê, không tìm kiếm được). Muốn kín hơn thì đặt mật khẩu –
            khách nhập 1 lần khi mở link, bạn gửi kèm mật khẩu trong tin nhắn mời.</p>
          <label class="same-photo"><input type="checkbox" id="lock-toggle" ${invitation?.locked ? 'checked' : ''}> Khóa thiệp bằng mật khẩu</label>
          <label class="field" id="lock-field" ${invitation?.locked ? '' : 'hidden'}><span>${invitation?.locked ? 'Mật khẩu mới (để trống = giữ mật khẩu cũ)' : 'Mật khẩu (4–40 ký tự)'}</span>
            <input class="input" type="text" id="lock-password" maxlength="40" autocomplete="off" placeholder="VD: quanlinh2027"></label>
          </div>
        </details>
        <button class="btn btn-primary btn-lg inv-save-main" type="submit">${invitation ? 'Lưu thiệp' : 'Tạo thiệp'}</button>
        <div id="share"></div>
      </form>
      <!-- Điện thoại: thanh cố định – xem thiệp toàn màn hình + lưu, không phải kéo xuống cuối form -->
      <div class="inv-mobile-bar">
        <button type="button" class="btn btn-outline" data-preview-guest>👁 Xem thử</button>
        <button type="submit" form="editor" class="btn btn-primary">💾 ${invitation ? 'Lưu thiệp' : 'Tạo thiệp'}</button>
      </div>
      <!-- Phản hồi & sổ lời chúc ngay dưới form (cùng cột) → không còn khoảng trống khi form ngắn -->
      <div class="inv-owner-panels">
        <div class="card" id="rsvps"></div>
        <div class="card" id="guestbook"></div>
      </div>
      </div>
      <div class="inv-editor-side">
        <div class="inv-editor-preview" id="preview" aria-label="Xem trước thiệp"></div>
      </div>
    </div>`);

  const form = $('#editor');
  // strict = true khi bấm Lưu (kiểm tra & báo lỗi); khi vẽ xem trước thì bỏ qua dòng chưa điền xong
  const readForm = (strict = false) => {
    const data = Object.fromEntries(new FormData(form));
    const details = Object.fromEntries(DETAIL_FIELDS.map((k) => [k, (data[k] || '').trim()]).filter(([, v]) => v));
    details.host = data.host === 'gai' ? 'gai' : 'trai';
    let lists;
    try {
      lists = cleanLists(draft.events, draft.questions);
    } catch (error) {
      if (strict) throw error;
      lists = { events: draft.events.filter((e) => e.name && e.at), questions: [] };
    }
    if (lists.events.length) details.events = lists.events;
    if (lists.questions.length) details.rsvp_questions = lists.questions;
    const party = mainParty(lists.events);
    const names = (text) => String(text || '').split('\n').map((n) => n.trim()).filter(Boolean).slice(0, 8);
    const wedding = { groomsmen: names(data.groomsmen), bridesmaids: names(data.bridesmaids) };
    if (wedding.groomsmen.length || wedding.bridesmaids.length) details.wedding_party = wedding;
    for (const [side] of GIFT_SIDES) {
      const account = (data[`${side}_account`] || '').replace(/\s/g, '');
      if (account) details[side] = { bank: data[`${side}_bank`], account, holder: (data[`${side}_holder`] || '').trim().toUpperCase() };
    }
    if (data.video?.trim()) details.video = youtubeIdFrom(data.video);
    if (data.effect && data.effect !== 'none') details.effect = data.effect;
    if (draft.photo2_url && !$('#same-photo')?.checked) details.photo2_url = draft.photo2_url;
    if (draft.album.length) details.album = draft.album;
    const story = draft.story.map((s) => ({ when: (s.when || '').trim(), title: (s.title || '').trim(), text: (s.text || '').trim() }))
      .filter((s) => s.title || s.text);
    if (story.length) details.story = story;
    if (data.music?.startsWith('box:')) details.music = { kind: 'box', track: data.music.slice(4) };
    if (data.music === 'youtube') details.music = { kind: 'youtube', id: youtubeIdFrom(data.music_youtube) };
    const firstGift = details.gift_groom || details.gift_bride;
    return {
      groom_name: data.groom_name.trim(),
      bride_name: data.bride_name.trim(),
      // Cột cũ = tiệc chính / tài khoản đầu tiên (đếm ngược, chỉ đường, thông báo dùng các cột này)
      event_at: party?.at || null,
      venue: party?.place || null,
      bank_code: firstGift?.bank || null,
      bank_account: firstGift?.account || null,
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

  // ----- Lễ & tiệc, câu hỏi xác nhận: danh sách sửa tại chỗ -----
  const onListsChange = () => { refreshPreview(); sectionDone(); };
  const questionsEditor = mountQuestionsEditor($('#questions-edit'), draft.questions, () => draft.events, onListsChange);
  mountEventsEditor($('#events-edit'), draft.events, () => { onListsChange(); questionsEditor.refresh(); });
  $('#lock-toggle').addEventListener('change', (e) => {
    $('#lock-field').hidden = !e.target.checked;
    if (e.target.checked && !invitation?.locked) $('#lock-password').focus();
  });
  $$('.effect-picker input').forEach((r) => r.addEventListener('change', () => {
    $$('.effect-picker .chip').forEach((c) => c.classList.toggle('active', c.querySelector('input').checked));
  }));

  // ----- Thanh mục: mỗi lần chỉ hiện 1 mục (form ngắn gọn), ✓ ở mục đã điền, nút Trước / Tiếp -----
  const showSection = (n, { scroll = true } = {}) => {
    $$('[data-section]').forEach((sec) => {
      const on = sec.dataset.section === String(n);
      sec.hidden = !on;
      sec.open = on;
    });
    $$('.inv-step').forEach((b) => {
      const on = b.dataset.step === String(n);
      b.classList.toggle('active', on);
      b.setAttribute('aria-current', on ? 'step' : 'false');
      if (on) b.parentElement.scrollTo({ left: b.offsetLeft - b.parentElement.clientWidth / 2 + b.offsetWidth / 2, behavior: 'smooth' });
    });
    try { sessionStorage.setItem('tramhy-inv-step', String(n)); } catch { /* chế độ riêng tư */ }
    // Không cuộn trượt (gây giật). Chỉ khi đã cuộn quá đầu form → đặt đầu mục mới ngay dưới thanh mục, tức thì.
    const sec = $(`[data-section="${n}"]`);
    sec.classList.remove('is-entering'); void sec.offsetWidth; sec.classList.add('is-entering');
    if (scroll) {
      const toolbar = $('.inv-toolbar');
      const stuckBottom = toolbar.getBoundingClientRect().bottom;
      const secTop = sec.getBoundingClientRect().top;
      if (secTop < stuckBottom || secTop > window.innerHeight * 0.6) {
        window.scrollTo({ top: window.scrollY + secTop - stuckBottom - 8, behavior: 'auto' });
      }
    }
  };
  $$('[data-section]').forEach((sec) => {
    const n = Number(sec.dataset.section);
    const prev = EDITOR_SECTIONS[n - 2];
    const next = EDITOR_SECTIONS[n];
    sec.querySelector('.inv-form-body').insertAdjacentHTML('beforeend', html`
      <div class="inv-step-nav">
        ${prev ? html`<button type="button" class="btn btn-light btn-sm" data-go-step="${n - 1}">← ${prev}</button>` : html`<span></span>`}
        ${next ? html`<button type="button" class="btn btn-outline btn-sm" data-go-step="${n + 1}">Tiếp: ${next} →</button>` : ''}
      </div>`.value);
    // Tiêu đề mục chỉ là tiêu đề (không gập / mở nữa)
    sec.querySelector('summary').addEventListener('click', (e) => e.preventDefault());
  });
  form.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go-step], .inv-step');
    if (go) showSection(go.dataset.goStep ?? go.dataset.step);
  });
  const savedStep = (() => { try { return Number(sessionStorage.getItem('tramhy-inv-step')); } catch { return 0; } })();
  showSection(savedStep >= 1 && savedStep <= EDITOR_SECTIONS.length ? savedStep : 1, { scroll: false });

  const sectionDone = () => {
    const v = readForm();
    const dd = v.details;
    const done = {
      1: true, 2: v.groom_name && v.bride_name, 3: dd.groom_father || dd.groom_mother || dd.bride_father || dd.bride_mother,
      4: v.event_at && v.venue, 5: dd.wedding_party, 6: dd.gift_groom || dd.gift_bride, 7: draft.album.length, 8: dd.video,
      9: dd.story, 10: dd.music || dd.effect, 11: dd.rsvp_questions, 12: $('#lock-toggle')?.checked,
    };
    $$('[data-section]').forEach((sec) => sec.classList.toggle('is-done', Boolean(done[sec.dataset.section])));
    $$('.inv-step').forEach((b) => b.classList.toggle('is-done', Boolean(done[b.dataset.step])));
  };
  form.addEventListener('input', sectionDone);
  form.addEventListener('change', sectionDone);

  // ----- Xem thử: mở thiệp y như khách thấy (kể cả thay đổi chưa lưu) ở 1 tab riêng – bấm lại thì tab đó cập nhật -----
  const openGuestPreview = () => {
    const values = readForm();
    try {
      localStorage.setItem(PREVIEW_KEY, JSON.stringify({
        ...values, id: invitation?.id ?? 'xem-thu', slug: invitation?.slug ?? 'xem-thu', savedAt: Date.now(),
      }));
    } catch {
      toastError(new Error('Trình duyệt chặn lưu tạm – hãy bấm Lưu thiệp rồi mở link khách mời để xem.'));
      return;
    }
    window.open('invitation.html?xem-thu=1', 'tramhy-xem-thu');
  };
  $$('[data-preview-guest]').forEach((btn) => btn.addEventListener('click', openGuestPreview));
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

  // Báo lỗi: mở đúng mục (điện thoại đang gập), đưa con trỏ vào ô cần sửa
  const fail = (section, message, input = null) => {
    showSection(section);
    const sec = $(`[data-section="${section}"]`);
    setTimeout(() => (input ?? sec.querySelector('input, select, textarea'))?.focus({ preventScroll: true }), 300);
    toastError(new Error(message));
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    let values;
    try {
      values = readForm(true);
    } catch (error) {
      fail(error.message.startsWith('Câu hỏi') ? 11 : 4, error.message);
      return;
    }
    if (!values.groom_name) { fail(2, 'Vui lòng điền họ tên chú rể', form.elements.groom_name); return; }
    if (!values.bride_name) { fail(2, 'Vui lòng điền họ tên cô dâu', form.elements.bride_name); return; }
    const party = mainParty(values.details.events || []);
    if (!party?.at || !party.place) { fail(4, 'Thêm ít nhất 1 tiệc có thời gian và nơi tổ chức (tiệc chính in trên thiệp)'); return; }
    if (values.details.music?.kind === 'youtube' && !values.details.music.id) {
      fail(10, 'Link nhạc YouTube chưa đúng – hãy dán link dạng https://youtu.be/… hoặc https://www.youtube.com/watch?v=…', form.elements.music_youtube);
      return;
    }
    if (form.elements.video.value.trim() && !values.details.video) {
      fail(8, 'Link video YouTube chưa đúng – hãy dán link dạng https://youtu.be/…', form.elements.video);
      return;
    }
    for (const [side, label] of GIFT_SIDES) {
      const gift = values.details[side];
      if (gift && !/^[0-9]{6,20}$/.test(gift.account)) {
        fail(6, `Số tài khoản ${label.replace(/^\S+\s/, '').toLowerCase()} chỉ gồm 6–20 chữ số`, form.elements[`${side}_account`]);
        return;
      }
    }
    const wantLock = $('#lock-toggle').checked;
    const newPassword = $('#lock-password').value.trim();
    if (wantLock && !invitation?.locked && newPassword.length < 4) {
      fail(12, 'Mật khẩu thiệp cần ít nhất 4 ký tự', $('#lock-password'));
      return;
    }
    // Đã tải ảnh 2 nhưng lại chọn dùng chung ảnh bìa → bỏ file ảnh 2 chưa lưu
    if ($('#same-photo').checked) { dropUnsaved('photo2_url'); draft.photo2_url = savedPhotos.photo2_url; }
    await withBusy(e.submitter, async () => {
      try {
        const isNew = !invitation;
        const wasLocked = Boolean(invitation?.locked);
        invitation = await saveInvitation(profile.id, invitation, values);
        // Mật khẩu: đặt mới / đổi / bỏ khóa (lưu dạng băm ở server, ô nhập xóa ngay sau khi lưu)
        if (wantLock && newPassword) {
          await setInvitationPassword(invitation.id, newPassword);
          invitation.locked = true;
          toast('Đã khóa thiệp – nhớ gửi kèm mật khẩu cho khách.', 'success');
        } else if (!wantLock && wasLocked) {
          await setInvitationPassword(invitation.id, '');
          invitation.locked = false;
        }
        $('#lock-password').value = '';
        $('#lock-field span').textContent = invitation.locked ? 'Mật khẩu mới (để trống = giữ mật khẩu cũ)' : 'Mật khẩu (4–40 ký tự)';
        // Ảnh cũ không còn dùng (đổi ảnh / bỏ ảnh / chuyển sang dùng chung ảnh bìa) → xóa file
        const now = { photo_url: invitation.photo_url ?? null, photo2_url: invitation.details?.photo2_url ?? null };
        for (const slot of ['photo_url', 'photo2_url']) {
          if (savedPhotos[slot] && savedPhotos[slot] !== now[slot]) removeInvitationPhoto(savedPhotos[slot]);
          savedPhotos[slot] = now[slot];
        }
        if (!now.photo2_url) draft.photo2_url = null;
        saved.album.filter((url) => !draft.album.includes(url)).forEach(removeInvitationPhoto);   // ảnh đã bỏ khỏi album
        saved.album = [...draft.album];
        $('.inv-save-main').textContent = 'Lưu thiệp';
        $('.inv-save-top').textContent = '💾 Lưu thiệp';
        $('.inv-mobile-bar [type=submit]').textContent = '💾 Lưu thiệp';
        toast('Đã lưu thiệp.', 'success');
        renderShare(invitation);
        ownerInvitation = invitation;
        redrawRsvps?.();                              // sự kiện / câu hỏi vừa sửa → tổng hợp lại ngay
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
    sectionDone();
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
  sectionDone();
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
          <details class="wish-reply-box" ${w.reply ? 'open' : ''}>
            <summary class="small">${w.reply ? '💌 Đã trả lời – sửa' : '💌 Trả lời lời chúc'}</summary>
            <textarea class="input" data-reply-text rows="2" maxlength="300" placeholder="VD: Cảm ơn bạn nhiều, nhất định phải đến sớm nhé!">${w.reply || ''}</textarea>
            <div class="row" style="gap:6px">
              <button type="button" class="btn btn-primary btn-sm" data-wish-reply>Lưu trả lời</button>
              <span class="small muted">${w.status === 'approved' ? 'Hiện ngay dưới lời chúc trên thiệp.' : 'Hiện trên thiệp khi bạn duyệt lời chúc này.'}</span>
            </div>
          </details>
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
      } else if (e.target.closest('[data-wish-reply]')) {
        const text = row.querySelector('[data-reply-text]').value.trim();
        await replyWish(wish.id, text);
        wish.reply = text || null;
        toast(text ? 'Đã lưu lời trả lời.' : 'Đã bỏ lời trả lời.', 'success');
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

// Ô chia sẻ cho chủ thiệp: link, mã QR (in lên thiệp giấy), chia sẻ Zalo / Messenger / Facebook, link mời riêng, lượt xem
function renderShare(invitation) {
  const link = new URL(`invitation.html?i=${invitation.slug}`, location.href).href;
  const title = `Thiệp cưới ${invitation.groom_name} & ${invitation.bride_name}`;
  const message = `Trân trọng kính mời bạn đến dự đám cưới của ${invitation.groom_name} & ${invitation.bride_name} 💌`;
  const qr = qrCanvas(link, { caption: title });
  render($('#share'), html`
    <div class="card stack share-box">
      <div class="row"><strong>Gửi thiệp cho khách</strong><span class="spacer"></span>
        <span class="small muted" id="inv-stats" aria-live="polite"></span></div>
      ${invitation.locked ? html`<p class="notice small" style="margin:0">🔒 Thiệp đang khóa bằng mật khẩu – nhớ gửi kèm mật khẩu cho khách.</p>` : ''}
      <div class="row"><input class="input" value="${link}" readonly style="flex:1;min-width:0" aria-label="Link thiệp">
        <button class="btn btn-dark btn-sm" type="button" data-copy="${link}">Sao chép</button></div>
      <div class="share-actions">
        <button class="btn btn-primary btn-sm" type="button" data-share>📤 Chia sẻ qua Zalo, Messenger…</button>
        <a class="btn btn-outline btn-sm" href="${facebookShareUrl(link)}" target="_blank" rel="noopener">Facebook</a>
        <a class="btn btn-outline btn-sm" href="${link}" target="_blank" rel="noopener">Mở thử như khách mời</a>
      </div>
      <div class="share-qr">
        <img src="${qr.toDataURL('image/png')}" alt="Mã QR mở thiệp cưới" width="132" height="132">
        <div class="stack" style="gap:6px">
          <strong class="small">Mã QR của thiệp</strong>
          <span class="small muted">In lên thiệp giấy, bảng chào hay gửi qua tin nhắn – khách quét là mở thiệp.</span>
          <button class="btn btn-outline btn-sm" type="button" data-download-qr style="align-self:flex-start">⬇ Tải mã QR</button>
        </div>
      </div>
      <div class="stack" style="gap:6px">
        <span class="small"><strong>Mời riêng từng người</strong> – tên khách hiện trên phong bì và thiệp:</span>
        <div class="row"><input class="input" id="guest-link-name" maxlength="60" placeholder="VD: Anh Tuấn & chị Linh" style="flex:1;min-width:0" aria-label="Tên khách mời">
          <button class="btn btn-outline btn-sm" type="button" id="guest-link-share">Gửi link riêng</button></div>
      </div>
    </div>`);
  const notify = (how) => {
    if (how === 'copied') toast('Đã sao chép link – dán vào Zalo / Messenger để gửi.', 'success');
  };
  $('[data-copy]').addEventListener('click', async (e) => {
    try {
      await navigator.clipboard.writeText(e.currentTarget.dataset.copy);
      toast('Đã sao chép link.', 'success');
    } catch {
      toast('Không sao chép được – hãy chọn và copy thủ công.');
    }
  });
  $('[data-share]').addEventListener('click', () => shareLink({ title, text: message, url: link }).then(notify).catch(() => {}));
  $('[data-download-qr]').addEventListener('click', () => downloadCanvas(qr, `ma-qr-thiep-cuoi-${invitation.slug}.png`));
  $('#guest-link-share').addEventListener('click', () => {
    const name = $('#guest-link-name').value.trim();
    if (!name) { $('#guest-link-name').focus(); return; }
    shareLink({ title, text: `Kính gửi ${name}: ${message}`, url: `${link}&to=${encodeURIComponent(name)}` }).then(notify).catch(() => {});
  });
  invitationStats(invitation.id).then((s) => {
    $('#inv-stats').textContent = `👁 ${s.views} lượt mở · ${s.visitors} người xem · ${s.today} hôm nay`;
  }).catch(() => {});
}

// Danh sách phản hồi + tự cập nhật khi khách vừa gửi (realtime)
// ownerInvitation luôn là bản thiệp mới nhất (sau mỗi lần Lưu) → tổng hợp theo đúng danh sách sự kiện / câu hỏi hiện tại
let ownerInvitation = null;
const RSVP_PREVIEW = 8;        // danh sách dài → chỉ hiện 8 phản hồi mới nhất, bấm "Xem thêm"
let rsvpShowAll = false;
let redrawRsvps = null;

async function showRsvps(invitation) {
  ownerInvitation = invitation;
  let rsvps = await listRsvps(invitation.id);
  redrawRsvps = () => renderRsvps(ownerInvitation, rsvps);
  redrawRsvps();
  const announce = (rsvp) => toast(
    `${rsvp.guest_name} vừa phản hồi: ${rsvp.attending ? `sẽ đến (${rsvp.guest_count} người)` : 'không thể đến'}`, 'success');

  subscribeRsvps(invitation.id, (rsvp) => {
    if (rsvps.some((r) => r.id === rsvp.id)) return;
    rsvps = [rsvp, ...rsvps];
    renderRsvps(ownerInvitation, rsvps, rsvp.id);
    announce(rsvp);
  }, async () => {
    // Vừa kết nối (lại): phản hồi gửi trong lúc đang kết nối sẽ không có sự kiện → tải lại cho chắc
    const latest = await listRsvps(invitation.id).catch(() => null);
    const missed = latest?.filter((r) => !rsvps.some((old) => old.id === r.id)) ?? [];
    if (!missed.length) return;
    rsvps = latest;
    renderRsvps(ownerInvitation, rsvps, missed[0].id);
    missed.forEach(announce);
  });
}

// Tổng hợp phản hồi: số khách theo từng sự kiện, thống kê câu trả lời, danh sách chi tiết
function renderRsvps(invitation, rsvps, newId = null) {
  const events = weddingEvents(invitation).filter((e) => e.at);
  const eventName = Object.fromEntries(events.map((e) => [e.id, e.name]));
  const questions = invitation.details?.rsvp_questions || [];
  const attending = rsvps.filter((r) => r.attending);
  const guestsOf = (list) => list.reduce((t, r) => t + r.guest_count, 0);
  const perEvent = events.length > 1 ? events.map((e) => {
    const list = attending.filter((r) => (r.event_ids || []).includes(e.id));
    return { name: e.name, replies: list.length, guests: guestsOf(list) };
  }) : [];
  const perQuestion = questions.map((q) => {
    const answered = attending.map((r) => [r, r.answers?.[q.id]]).filter(([, a]) => a);
    const tally = q.type === 'choice' ? q.options.map((o) => [o, answered.filter(([, a]) => a === o).length]) : null;
    return { q, answered, tally };
  });
  render($('#rsvps'), html`
    <h3>Phản hồi khách mời</h3>
    <div class="rsvp-stats">
      <div><strong>${guestsOf(attending)}</strong><span>khách sẽ đến</span></div>
      <div><strong>${attending.length}</strong><span>phản hồi sẽ đến</span></div>
      <div><strong>${rsvps.length - attending.length}</strong><span>không thể đến</span></div>
    </div>
    ${perEvent.length ? html`<ul class="rsvp-breakdown">${perEvent.map((e) => html`
      <li><span>${e.name}</span><strong>${e.guests} khách</strong><span class="small muted">${e.replies} phản hồi</span></li>`)}</ul>` : ''}
    ${perQuestion.map(({ q, answered, tally }) => html`
      <div class="rsvp-question">
        <strong class="small">${q.text}</strong>
        ${tally ? html`<div class="chips">${tally.map(([o, n]) => html`<span class="chip">${o}: <b>${n}</b></span>`)}</div>`
          : answered.length ? html`<details><summary class="small">${answered.length} câu trả lời</summary>
              <ul class="small">${answered.map(([r, a]) => html`<li><strong>${r.guest_name}:</strong> ${a}</li>`)}</ul></details>`
          : html`<span class="small muted">Chưa có câu trả lời.</span>`}
      </div>`)}
    <p class="small muted" style="margin:8px 0 0">● Tự cập nhật khi khách gửi phản hồi</p>
    ${rsvps.length ? html`<div class="stack">${(rsvpShowAll ? rsvps : rsvps.slice(0, RSVP_PREVIEW)).map((r) => html`
      <div class="small rsvp-item ${r.id === newId ? 'is-new' : ''}"><strong>${r.guest_name}</strong> –
        ${r.attending ? `đến (${r.guest_count} người)` : 'không đến'}
        ${r.attending && (r.event_ids || []).length && events.length > 1
          ? html`<span class="muted"> · ${(r.event_ids || []).map((id) => eventName[id]).filter(Boolean).join(', ')}</span>` : ''}
        ${Object.entries(r.answers || {}).map(([id, a]) => {
          const q = questions.find((x) => x.id === id);
          return q ? html`<div class="muted">${q.text} <strong>${a}</strong></div>` : '';
        })}
        ${r.message ? html`<div class="muted">“${r.message}”</div>` : ''}</div>`)}</div>`
      : html`<p class="muted small">Chưa có phản hồi nào.</p>`}
    ${rsvps.length > RSVP_PREVIEW ? html`<button type="button" class="btn btn-light btn-sm" data-rsvp-more style="margin-top:10px">
      ${rsvpShowAll ? 'Thu gọn' : `Xem thêm ${rsvps.length - RSVP_PREVIEW} phản hồi`}</button>` : ''}`);
  $('[data-rsvp-more]')?.addEventListener('click', () => { rsvpShowAll = !rsvpShowAll; redrawRsvps?.(); });
}

// ---------- KHỞI CHẠY TRANG ----------
try {
  const slug = param('i');
  const preview = param('xem-thu') !== null;
  const profile = await initLayout(slug || preview ? null : 'invitation');
  if (preview) renderPreviewMode();
  else if (slug) await renderGuestView(slug);
  else if (!profile || param('mau') !== null) renderGallery(profile);
  else await renderEditor(profile);
} catch (error) {
  toastError(error);
}
