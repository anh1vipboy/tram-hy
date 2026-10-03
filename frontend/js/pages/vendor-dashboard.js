import { initLayout } from '../core/layout.js';
import { requireAuth } from '../core/auth.js';
import { $, html, render, money, dateTime, debounce } from '../core/utils.js';
import { BOOKING_STATUS, BOOKING_TYPE, statusBadge } from '../core/labels.js';
import { openDialog, toast, toastError } from '../core/ui.js';
import { PLATFORM_FEE_RATE } from '../config.js';
import { listMyShops } from '../services/catalog.js';
import { listVendorBookings, vendorSetStatus, openDispute, subscribeBookingChanges } from '../services/bookings.js';
import { milestonesView, detailsView, openDisputeView } from '../components/booking-card.js';

const COLUMNS = [
  { title: 'Chờ khách đặt cọc', statuses: ['pending'] },
  { title: 'Đã nhận cọc', statuses: ['confirmed'] },
  { title: 'Đang thực hiện', statuses: ['in_progress', 'ready_for_review'] },
  { title: 'Đã đóng', statuses: ['completed', 'disputed', 'cancelled', 'refunded'] },
];

let profile = null;
let shops = [];
let bookings = [];

async function load() {
  try {
    bookings = await listVendorBookings(shops.map((s) => s.id));
    renderStats();
    renderBoard();
  } catch (error) {
    toastError(error);
  }
}

function renderStats() {
  const sumMilestones = (status) => bookings
    .flatMap((b) => b.milestones).filter((m) => m.status === status)
    .reduce((total, m) => total + m.amount, 0);
  const released = sumMilestones('released');
  const stats = [
    ['Đơn đang xử lý', bookings.filter((b) => ['pending', 'confirmed', 'in_progress', 'ready_for_review'].includes(b.status)).length],
    ['Trạm Hỷ đang giữ hộ', money(sumMilestones('paid'))],
    ['Đã giải ngân (sau phí 10%)', money(Math.round(released * (1 - PLATFORM_FEE_RATE)))],
    ['Đơn hoàn tất', bookings.filter((b) => b.status === 'completed').length],
  ];
  render($('#stats'), stats.map(([label, value]) => html`
    <div class="card stat"><div class="stat-label">${label}</div><div class="stat-value">${value}</div></div>`));
}

function renderBoard() {
  render($('#board'), html`
    <div class="kanban">
      ${COLUMNS.map((col) => {
        const items = bookings.filter((b) => col.statuses.includes(b.status));
        return html`
          <section class="kanban-col">
            <h3>${col.title} <span class="badge">${items.length}</span></h3>
            ${items.length ? items.map(card) : html`<p class="small muted">Chưa có đơn</p>`}
          </section>`;
      })}
    </div>`);

  $('#board').querySelectorAll('[data-action]').forEach((btn) => {
    const booking = bookings.find((b) => b.id === btn.closest('[data-booking]').dataset.booking);
    btn.addEventListener('click', () => ACTIONS[btn.dataset.action](booking));
  });
}

function card(b) {
  return html`
    <article class="kanban-card" data-booking="${b.id}">
      <div class="row"><strong>${b.contact_name || 'Khách hàng'}</strong><span class="spacer"></span>${statusBadge(BOOKING_STATUS, b.status)}</div>
      <div class="small muted">${b.code} · ${b.contact_phone || ''}</div>
      <div class="small">${b.dress?.name || BOOKING_TYPE[b.type]}</div>
      <div class="small">Hẹn: <strong>${dateTime(b.appointment_at)}</strong></div>
      <div class="small">Tổng: <span class="price">${money(b.total_price)}</span></div>
      ${b.note ? html`<div class="small muted">Ghi chú: ${b.note}</div>` : ''}
      ${openDisputeView(b)}
      <details><summary class="small" style="cursor:pointer">Tiến độ thanh toán</summary>${milestonesView(b)}</details>
      ${detailsView(b.details)}
      <div class="row">${actionButtons(b)}</div>
    </article>`;
}

function actionButtons(b) {
  switch (b.status) {
    case 'pending':
      return html`<button class="btn btn-danger btn-sm" data-action="reject">Từ chối</button>`;
    case 'confirmed':
      return html`<button class="btn btn-primary btn-sm" data-action="start">Bắt đầu thực hiện</button>
                  <button class="btn btn-danger btn-sm" data-action="noShow">Khách không đến</button>`;
    case 'in_progress':
      return html`<button class="btn btn-primary btn-sm" data-action="finish">Báo đã xong</button>
                  <button class="btn btn-danger btn-sm" data-action="noShow">Khách không đến</button>`;
    case 'ready_for_review':
      return html`<span class="small muted">Chờ khách nghiệm thu & giải ngân</span>`;
    default:
      return '';
  }
}

async function changeStatus(booking, status, message) {
  try {
    await vendorSetStatus(booking.id, status);
    toast(message, 'success');
    load();
  } catch (error) {
    toastError(error);
  }
}

const ACTIONS = {
  async reject(booking) {
    const ok = await openDialog({
      title: 'Từ chối đơn này?', danger: true, confirmText: 'Từ chối',
      content: html`<p>Khách chưa đặt cọc nên không phát sinh tiền. Đơn sẽ chuyển sang "Đã hủy".</p>`,
    });
    if (ok) changeStatus(booking, 'cancelled', 'Đã từ chối đơn.');
  },
  start: (booking) => changeStatus(booking, 'in_progress', 'Đã chuyển sang Đang thực hiện.'),
  finish: (booking) => changeStatus(booking, 'ready_for_review', 'Đã báo hoàn thành – chờ khách nghiệm thu.'),
  async noShow(booking) {
    const done = await openDialog({
      title: 'Báo khách không đến (no-show)', danger: true, confirmText: 'Gửi báo cáo',
      content: html`
        <p class="small muted">Trạm Hỷ xác minh và giải ngân tiền cọc đang giữ để đền bù cho tiệm.</p>
        <label class="field"><span>Mô tả (giờ hẹn, đã liên hệ khách thế nào…)</span>
          <textarea class="input" name="reason" required minlength="10" maxlength="1000"></textarea></label>`,
      onConfirm: (form) => openDispute(booking.id, 'no_show', form.get('reason').trim()),
    });
    if (done) { toast('Đã gửi báo cáo cho Trạm Hỷ.', 'success'); load(); }
  },
};

// ---------- KHỞI CHẠY TRANG ----------
await initLayout('vendor');
profile = await requireAuth(['vendor']);
shops = await listMyShops(profile.id);

if (!shops.length) {
  render($('#board'), html`<div class="empty">Tài khoản của bạn chưa được gắn với tiệm nào.
    Liên hệ Trạm Hỷ để xác minh và kích hoạt tiệm (cung cấp email: <strong>${profile.email}</strong>).</div>`);
} else {
  $('#shop-name').textContent = shops.map((s) => s.name).join(', ');
  await load();
  subscribeBookingChanges('vendor-bookings', debounce(load, 300));
}
