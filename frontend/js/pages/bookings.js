import { initLayout } from '../core/layout.js';
import { requireAuth } from '../core/auth.js';
import { $, html, render, money, param, dateTime, debounce } from '../core/utils.js';
import { BOOKING_STATUS, BOOKING_TYPE, statusBadge } from '../core/labels.js';
import { openDialog, toast, toastError, focusFromUrl } from '../core/ui.js';
import { ESCROW_BANK } from '../config.js';
import {
  listMyBookings, payMilestone, releaseMilestone, openDispute, addReview, subscribeBookingChanges,
} from '../services/bookings.js';
import { milestonesView, detailsView, openDisputeView } from '../components/booking-card.js';

const CLOSED = ['disputed', 'cancelled', 'refunded', 'completed'];
const DISPUTABLE = ['confirmed', 'in_progress', 'ready_for_review'];

let profile = null;
let bookings = [];

async function load() {
  try {
    bookings = await listMyBookings(profile.id);
    renderList();
  } catch (error) {
    toastError(error);
  }
}

function renderList() {
  const container = $('#booking-list');
  if (!bookings.length) {
    render(container, html`<div class="empty">Bạn chưa có đơn nào. <a href="tryon.html">Thử váy và đặt lịch ngay</a></div>`);
    return;
  }
  const highlight = param('new');
  render(container, bookings.map((b) => html`
    <article class="card stack" data-booking="${b.id}" data-code="${b.code}" ${b.code === highlight ? html`style="border-color:var(--brand);box-shadow:0 0 0 3px var(--brand-soft)"` : ''}>
      <div class="row">
        <strong>${b.dress?.name || BOOKING_TYPE[b.type]}</strong>
        ${statusBadge(BOOKING_STATUS, b.status)}
        <span class="spacer"></span>
        <span class="muted small">Mã ${b.code}</span>
      </div>
      <div class="muted small">
        ${b.vendor.name} · ${BOOKING_TYPE[b.type]} · Hẹn ${dateTime(b.appointment_at)} · Tổng <span class="price">${money(b.total_price)}</span>
      </div>
      ${openDisputeView(b)}
      ${milestonesView(b, (m) => milestoneAction(b, m))}
      ${detailsView(b.details)}
      <div class="row">
        ${DISPUTABLE.includes(b.status) ? html`<button class="btn btn-danger btn-sm" data-action="dispute">Yêu cầu hoàn cọc</button>` : ''}
        ${b.status === 'completed' && !b.review ? html`<button class="btn btn-primary btn-sm" data-action="review">Đánh giá đối tác</button>` : ''}
        ${b.review ? html`<span class="small muted">Bạn đã đánh giá ${b.review.rating}★</span>` : ''}
      </div>
    </article>`));

  container.querySelectorAll('[data-action]').forEach((btn) => {
    const booking = bookings.find((b) => b.id === btn.closest('[data-booking]').dataset.booking);
    btn.addEventListener('click', () => ACTIONS[btn.dataset.action](booking, Number(btn.dataset.stage)));
  });
  focusFromUrl(container);                     // đến từ chuông thông báo → cuộn tới đúng đơn
}

// Nút cho từng đợt: đợt "chưa trả" đầu tiên → Thanh toán; đợt đang giữ → Nghiệm thu
function milestoneAction(booking, milestone) {
  if (CLOSED.includes(booking.status)) return '';
  const nextToPay = booking.milestones.find((m) => m.status === 'locked');
  if (milestone.status === 'locked' && milestone.id === nextToPay?.id) {
    return html`<button class="btn btn-primary btn-sm" data-action="pay" data-stage="${milestone.stage}">Thanh toán</button>`;
  }
  if (milestone.status === 'paid') {
    return html`<button class="btn btn-outline btn-sm" data-action="release" data-stage="${milestone.stage}">Nghiệm thu</button>`;
  }
  return '';
}

const ACTIONS = {
  async pay(booking, stage) {
    const milestone = booking.milestones.find((m) => m.stage === stage);
    const transferNote = `${booking.code} D${stage}`;
    const qr = `https://img.vietqr.io/image/${ESCROW_BANK.bankId}-${ESCROW_BANK.accountNo}-compact2.png`
      + `?amount=${milestone.amount}&addInfo=${encodeURIComponent(transferNote)}&accountName=${encodeURIComponent(ESCROW_BANK.accountName)}`;
    const done = await openDialog({
      title: `Thanh toán đợt ${stage} – ${money(milestone.amount)}`,
      confirmText: 'Tôi đã chuyển khoản',
      content: html`
        <div class="stack center">
          <img src="${qr}" alt="Mã VietQR" style="width:220px;margin:0 auto;border-radius:12px">
          <div>Nội dung chuyển khoản: <strong>${transferNote}</strong></div>
          <p class="small muted">Tiền chuyển vào tài khoản bảo chứng của Trạm Hỷ, chưa chuyển cho đối tác.
            (Bản demo: bấm xác nhận để ghi nhận thanh toán. Khi tích hợp cổng thanh toán, hệ thống tự xác nhận.)</p>
        </div>`,
      onConfirm: () => payMilestone(booking.id, stage),
    });
    if (done) { toast(`Đã ghi nhận thanh toán đợt ${stage}. Trạm Hỷ đang giữ tiền.`, 'success'); load(); }
  },

  async release(booking, stage) {
    const milestone = booking.milestones.find((m) => m.stage === stage);
    const done = await openDialog({
      title: `Nghiệm thu đợt ${stage}?`,
      confirmText: 'Đồng ý giải ngân',
      content: html`<p>Trạm Hỷ sẽ chuyển <strong>${money(milestone.amount)}</strong> cho ${booking.vendor.name}.
        Chỉ xác nhận khi bạn đã hài lòng với phần việc của đợt này.</p>`,
      onConfirm: () => releaseMilestone(booking.id, stage),
    });
    if (done) { toast('Đã nghiệm thu và giải ngân cho đối tác.', 'success'); load(); }
  },

  async dispute(booking) {
    const done = await openDialog({
      title: 'Yêu cầu hoàn cọc',
      confirmText: 'Gửi yêu cầu',
      danger: true,
      content: html`
        <p class="small muted">Tiền đang giữ sẽ bị khóa cho đến khi Trạm Hỷ xử lý (trong 2 giờ làm việc).</p>
        <label class="field"><span>Lý do (váy sai mẫu, trễ hẹn, hư hỏng…)</span>
          <textarea class="input" name="reason" required minlength="10" maxlength="1000"></textarea></label>`,
      onConfirm: (form) => openDispute(booking.id, 'refund_request', form.get('reason').trim()),
    });
    if (done) { toast('Đã gửi yêu cầu. Trạm Hỷ sẽ liên hệ bạn sớm.', 'success'); load(); }
  },

  async review(booking) {
    const done = await openDialog({
      title: `Đánh giá ${booking.vendor.name}`,
      confirmText: 'Gửi đánh giá',
      content: html`
        <div class="stack">
          <label class="field"><span>Số sao</span>
            <select class="input" name="rating">
              ${[5, 4, 3, 2, 1].map((n) => html`<option value="${n}">${'★'.repeat(n)} (${n})</option>`)}
            </select></label>
          <label class="field"><span>Nhận xét</span>
            <textarea class="input" name="content" maxlength="1000"></textarea></label>
        </div>`,
      onConfirm: (form) => addReview({ booking, rating: Number(form.get('rating')), content: form.get('content').trim() || null }),
    });
    if (done) { toast('Cảm ơn bạn đã đánh giá!', 'success'); load(); }
  },
};

// ---------- KHỞI CHẠY TRANG ----------
await initLayout('bookings');
profile = await requireAuth();
await load();
subscribeBookingChanges('my-bookings', debounce(load, 300));
