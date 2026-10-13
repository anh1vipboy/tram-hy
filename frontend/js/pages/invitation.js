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
import {
  getMyInvitation, getInvitationBySlug, saveInvitation, listRsvps, submitRsvp, subscribeRsvps,
  uploadInvitationPhoto, removeInvitationPhoto,
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
    setTimeout(() => showInvitation(inv, guestName, slug), reduced ? 50 : 2000);
  };
  $('[data-open-envelope]').addEventListener('click', open, { once: true });
  $('[data-open-envelope]').focus({ preventScroll: true });
}

function showInvitation(inv, guestName, slug) {
  const qr = giftQrUrl(inv);
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
        <label class="field"><span>Lời chúc gửi cô dâu chú rể</span><textarea class="input" name="message" maxlength="500" placeholder="Chúc hai bạn trăm năm hạnh phúc…"></textarea></label>
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
    </nav>`);

  $$('[data-go]').forEach((btn) => btn.addEventListener('click', () => {
    $('#rsvp-section').scrollIntoView({ behavior: 'smooth', block: 'center' });
    const target = btn.dataset.go === 'wish' ? $('#rsvp-form [name=message]') : $('#rsvp-form [name=guestName]');
    setTimeout(() => target?.focus({ preventScroll: true }), 500);
  }));
  if (inv.event_at) startCountdown(new Date(inv.event_at));
  bindRsvp(inv, slug);
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
const DETAIL_FIELDS = ['groom_father', 'groom_mother', 'groom_address', 'bride_father', 'bride_mother', 'bride_address', 'venue_address'];

async function renderEditor(profile) {
  let invitation = await getMyInvitation(profile.id);
  const d = invitation?.details ?? {};
  const draft = {
    template: param('template') && INVITATION_TEMPLATES.some((t) => t.key === param('template'))
      ? param('template') : invitation ? invitationTemplateKey(invitation) : 'la-tim',
    photo_url: invitation?.photo_url ?? null,
  };
  const field = (name, label, value, attrs = {}) => html`
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
          <div class="photo-picker">
            <span id="photo-thumb"></span>
            <div class="stack" style="gap:6px">
              <label class="btn btn-outline btn-sm" style="cursor:pointer">📷 Chọn ảnh cưới
                <input type="file" accept="image/*" id="photo-input" hidden></label>
              <button type="button" class="btn btn-link btn-sm" id="photo-remove">Bỏ ảnh</button>
              <span class="small muted">Ảnh hiện trong khung tròn trên thiệp. Không có ảnh thì thiệp dùng chữ lồng tên hai bạn.</span>
            </div>
          </div>
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
        <button class="btn btn-primary btn-lg" type="submit">${invitation ? 'Lưu thiệp' : 'Tạo thiệp'}</button>
        <div id="share"></div>
      </form>
      <div class="stack">
        <div class="inv-editor-preview" id="preview" aria-label="Xem trước thiệp"></div>
        <div class="card" id="rsvps"></div>
      </div>
    </div>`);

  const form = $('#editor');
  const readForm = () => {
    const data = Object.fromEntries(new FormData(form));
    const details = Object.fromEntries(DETAIL_FIELDS.map((k) => [k, (data[k] || '').trim()]).filter(([, v]) => v));
    details.host = data.host === 'gai' ? 'gai' : 'trai';
    if (data.ceremony_at) details.ceremony_at = new Date(data.ceremony_at).toISOString();
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
  const refreshPhoto = () => render($('#photo-thumb'), draft.photo_url
    ? html`<img src="${draft.photo_url}" alt="Ảnh cưới đã chọn">` : html`<span class="photo-empty">💑</span>`);

  form.addEventListener('input', refreshPreview);
  $$('[data-template]').forEach((btn) => btn.addEventListener('click', () => {
    draft.template = btn.dataset.template;
    $$('[data-template]').forEach((b) => { b.classList.toggle('active', b === btn); b.setAttribute('aria-checked', String(b === btn)); });
    refreshPreview();
  }));

  $('#photo-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const label = e.target.closest('label');
    label.setAttribute('aria-busy', 'true');
    try {
      const url = await uploadInvitationPhoto(profile.id, await compressImage(file, { maxSize: 1400 }));
      if (draft.photo_url && draft.photo_url !== invitation?.photo_url) removeInvitationPhoto(draft.photo_url);   // ảnh chọn trước đó chưa lưu
      draft.photo_url = url;
      refreshPhoto();
      refreshPreview();
      toast('Đã tải ảnh lên – bấm Lưu thiệp để cập nhật cho khách mời.', 'success');
    } catch (error) {
      toastError(error);
    } finally {
      label.removeAttribute('aria-busy');
    }
  });
  $('#photo-remove').addEventListener('click', () => {
    if (draft.photo_url && draft.photo_url !== invitation?.photo_url) removeInvitationPhoto(draft.photo_url);
    draft.photo_url = null;
    refreshPhoto();
    refreshPreview();
  });

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
    if (values.bank_account && !/^[0-9]{6,20}$/.test(values.bank_account)) {
      form.elements.bank_account.focus();
      toastError(new Error('Số tài khoản chỉ gồm 6–20 chữ số'));
      return;
    }
    await withBusy(e.submitter, async () => {
      try {
        const isNew = !invitation;
        const oldPhoto = invitation?.photo_url;
        invitation = await saveInvitation(profile.id, invitation, values);
        if (oldPhoto && oldPhoto !== invitation.photo_url) removeInvitationPhoto(oldPhoto);
        e.submitter.textContent = 'Lưu thiệp';
        toast('Đã lưu thiệp.', 'success');
        renderShare(invitation);
        if (isNew) await showRsvps(invitation);       // thiệp vừa tạo → bắt đầu nhận phản hồi
      } catch (error) {
        toastError(error);
      }
    });
  });

  refreshPhoto();
  refreshPreview();
  if (invitation) {
    renderShare(invitation);
    await showRsvps(invitation);
  } else {
    render($('#rsvps'), html`<p class="muted">Tạo thiệp để nhận phản hồi từ khách mời.</p>`);
  }
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
