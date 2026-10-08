// Hai chế độ:
//  - invitation.html?i=<slug> : khách mời xem thiệp + gửi phản hồi (không cần đăng nhập)
//  - invitation.html          : cô dâu chú rể soạn thiệp, lấy link chia sẻ, xem danh sách phản hồi
import { initLayout } from '../core/layout.js';
import { requireAuth } from '../core/auth.js';
import { $, $$, html, render, param, dateTime } from '../core/utils.js';
import { toast, toastError, withBusy } from '../core/ui.js';
import { getMyInvitation, getInvitationBySlug, saveInvitation, listRsvps, submitRsvp, subscribeRsvps } from '../services/invitations.js';

const THEMES = [
  { key: 'gold', label: 'Champagne', color: '#f3e3c3' },
  { key: 'red', label: 'Đỏ hỷ', color: '#8f1d1d' },
  { key: 'green', label: 'Xanh lục bảo', color: '#1f4d3a' },
  { key: 'pink', label: 'Hồng phấn', color: '#f6d5dc' },
];
const BANKS = [['MB', 'MB Bank'], ['VCB', 'Vietcombank'], ['TCB', 'Techcombank'], ['ACB', 'ACB'], ['BIDV', 'BIDV'], ['VPB', 'VPBank'], ['ICB', 'VietinBank']];

const page = $('#invitation-page');

// ---------- THIỆP (dùng chung cho xem trước và khách mời) ----------
function giftQrUrl(inv) {
  if (!inv.bank_code || !inv.bank_account) return null;
  const note = `Mung cuoi ${inv.groom_name} ${inv.bride_name}`;
  return `https://img.vietqr.io/image/${inv.bank_code}-${inv.bank_account}-compact.png?addInfo=${encodeURIComponent(note)}`;
}

function invitationCard(inv) {
  const qr = giftQrUrl(inv);
  return html`
    <div class="invite-card theme-${inv.theme || 'gold'}">
      <div class="small" style="letter-spacing:.2em;text-transform:uppercase">Trân trọng kính mời</div>
      <div class="names">${inv.groom_name || 'Chú rể'} & ${inv.bride_name || 'Cô dâu'}</div>
      <div>Đến dự lễ thành hôn vào lúc</div>
      <div style="font-size:20px;font-weight:700;margin:6px 0">${inv.event_at ? dateTime(inv.event_at) : 'Ngày giờ…'}</div>
      <div>${inv.venue || 'Địa điểm tổ chức'}</div>
      ${qr ? html`<img class="qr" src="${qr}" alt="Mã QR mừng cưới"><div class="small">Quét mã để gửi lời chúc & quà mừng</div>` : ''}
    </div>`;
}

// ---------- KHÁCH MỜI ----------
async function renderGuestView(slug) {
  const inv = await getInvitationBySlug(slug);
  if (!inv) {
    render(page, html`<div class="empty">Thiệp không tồn tại hoặc đã bị xóa.</div>`);
    return;
  }
  document.title = `Thiệp cưới ${inv.groom_name} & ${inv.bride_name}`;
  render(page, html`
    <div style="max-width:520px;margin:0 auto" class="stack">
      ${invitationCard(inv)}
      <form class="card stack" id="rsvp-form">
        <h3>Bạn sẽ đến chung vui chứ?</h3>
        <label class="field"><span>Tên của bạn</span><input class="input" name="guestName" required maxlength="100"></label>
        <div class="row">
          <label class="row"><input type="radio" name="attending" value="yes" checked> Sẽ tham dự</label>
          <label class="row"><input type="radio" name="attending" value="no"> Rất tiếc không thể đến</label>
        </div>
        <label class="field"><span>Số người đi cùng (tính cả bạn)</span>
          <input class="input" type="number" name="guestCount" min="1" max="10" value="1"></label>
        <label class="field"><span>Lời chúc</span><textarea class="input" name="message" maxlength="500"></textarea></label>
        <button class="btn btn-primary" type="submit">Gửi phản hồi</button>
      </form>
    </div>`);

  $('#rsvp-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    await withBusy(e.submitter, async () => {
      try {
        await submitRsvp(inv.id, {
          guestName: form.get('guestName').trim(),
          attending: form.get('attending') === 'yes',
          guestCount: Number(form.get('guestCount')),
          message: form.get('message').trim() || null,
        });
        render(e.target, html`<div class="center"><h3>Cảm ơn bạn!</h3><p class="muted">Phản hồi đã được gửi tới cô dâu chú rể.</p></div>`);
      } catch (error) {
        toastError(error);
      }
    });
  });
}

// ---------- CHỦ THIỆP ----------
async function renderEditor(profile) {
  let invitation = await getMyInvitation(profile.id);
  const draft = invitation ?? { groom_name: '', bride_name: '', event_at: null, venue: '', theme: 'gold', bank_code: 'MB', bank_account: '' };

  render(page, html`
    <div class="section-head"><div><div class="eyebrow">Thiệp cưới online</div><h1>Tạo thiệp & nhận phản hồi khách mời</h1></div></div>
    <div class="grid-2" style="align-items:start">
      <form class="card stack" id="editor">
        <div class="field"><span>Màu thiệp</span>
          <div class="row" id="themes">${THEMES.map((t) => html`
            <button type="button" class="swatch ${t.key === draft.theme ? 'active' : ''}" data-theme="${t.key}"
                    title="${t.label}" style="background:${t.color}"></button>`)}</div></div>
        <div class="form-grid">
          <label class="field"><span>Tên chú rể</span><input class="input" name="groom_name" value="${draft.groom_name}" required maxlength="60"></label>
          <label class="field"><span>Tên cô dâu</span><input class="input" name="bride_name" value="${draft.bride_name}" required maxlength="60"></label>
          <label class="field full"><span>Thời gian</span>
            <input class="input" type="datetime-local" name="event_at" value="${toLocalInput(draft.event_at)}" required></label>
          <label class="field full"><span>Địa điểm</span><input class="input" name="venue" value="${draft.venue || ''}" required maxlength="200"></label>
          <label class="field"><span>Ngân hàng nhận mừng cưới</span>
            <select class="input" name="bank_code">${BANKS.map(([code, name]) => html`
              <option value="${code}" ${code === draft.bank_code ? 'selected' : ''}>${name}</option>`)}</select></label>
          <label class="field"><span>Số tài khoản</span><input class="input" name="bank_account" value="${draft.bank_account || ''}" pattern="[0-9]{6,20}" inputmode="numeric"></label>
        </div>
        <button class="btn btn-primary" type="submit">${invitation ? 'Lưu thay đổi' : 'Tạo thiệp'}</button>
        <div id="share"></div>
      </form>
      <div class="stack">
        <div id="preview"></div>
        <div class="card" id="rsvps"></div>
      </div>
    </div>`);

  const form = $('#editor');
  const readForm = () => {
    const data = Object.fromEntries(new FormData(form));
    return { ...data, theme: draft.theme, event_at: data.event_at ? new Date(data.event_at).toISOString() : null };
  };
  const refreshPreview = () => render($('#preview'), invitationCard(readForm()));

  form.addEventListener('input', refreshPreview);
  $$('[data-theme]').forEach((btn) => btn.addEventListener('click', () => {
    draft.theme = btn.dataset.theme;
    $$('[data-theme]').forEach((b) => b.classList.toggle('active', b === btn));
    refreshPreview();
  }));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await withBusy(e.submitter, async () => {
      try {
        const isNew = !invitation;
        invitation = await saveInvitation(profile.id, invitation, readForm());
        e.submitter.textContent = 'Lưu thay đổi';
        toast('Đã lưu thiệp.', 'success');
        renderShare(invitation);
        if (isNew) await showRsvps(invitation);       // thiệp vừa tạo → bắt đầu nhận phản hồi
      } catch (error) {
        toastError(error);
      }
    });
  });

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
    <div class="card stack" style="background:var(--brand-soft);padding:12px">
      <strong>Link gửi khách mời</strong>
      <div class="row"><input class="input" value="${link}" readonly style="flex:1">
        <button class="btn btn-dark btn-sm" type="button" id="copy-link">Sao chép</button></div>
      <a class="small" href="${link}" target="_blank" rel="noopener">Mở thử như khách mời →</a>
    </div>`);
  $('#copy-link').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast('Đã sao chép link.', 'success');
    } catch {
      toast('Không sao chép được – hãy chọn và copy thủ công.');
    }
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
  await initLayout(slug ? null : 'invitation');
  if (slug) await renderGuestView(slug);
  else await renderEditor(await requireAuth());
} catch (error) {
  toastError(error);
}
