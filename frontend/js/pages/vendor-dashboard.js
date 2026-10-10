import { initLayout } from '../core/layout.js';
import { requireAuth } from '../core/auth.js';
import { $, $$, html, render, money, date, dateTime, debounce } from '../core/utils.js';
import { BOOKING_STATUS, BOOKING_TYPE, VENDOR_STATUS, statusBadge } from '../core/labels.js';
import { openDialog, toast, toastError, withBusy, focusFromUrl } from '../core/ui.js';
import { PLATFORM_FEE_RATE } from '../config.js';
import { subscribeVendorChanges } from '../services/catalog.js';
import { listMyShops, updateMyShop, resubmitVendor } from '../services/shop.js';
import { listVendorBookings, vendorSetStatus, openDispute, subscribeBookingChanges } from '../services/bookings.js';
import { milestonesView, detailsView, openDisputeView } from '../components/booking-card.js';
import { shopFields, readShopForm } from '../components/shop-form.js';
import { mountDressManager } from '../components/dress-manager.js';
import { mountShopMedia } from '../components/shop-media.js';
import { mountShopWizard } from '../components/shop-wizard.js';
import { mountPartnerChecklist } from '../components/partner-checklist.js';

const COLUMNS = [
  { title: 'Chờ khách đặt cọc', statuses: ['pending'] },
  { title: 'Đã nhận cọc', statuses: ['confirmed'] },
  { title: 'Đang thực hiện', statuses: ['in_progress', 'ready_for_review'] },
  { title: 'Đã đóng', statuses: ['completed', 'disputed', 'cancelled', 'refunded'] },
];

let profile = null;
let shops = [];
let bookings = [];
let unsubscribeBookings = null;
let activePanel = 'orders';
let managedShopId = null;    // tiệm đang quản lý mẫu váy / ảnh (khi tài khoản có nhiều tiệm)
let mountedPanels = {};     // { dresses: shopId, media: shopId } – tab đã vẽ cho tiệm nào

async function load() {
  try {
    bookings = await listVendorBookings(shops.filter((s) => s.status === 'approved').map((s) => s.id));
    renderStats();
    renderBoard();
    focusFromUrl($('#board'));                    // đến từ chuông thông báo → cuộn tới đúng đơn
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
    <article class="kanban-card" data-booking="${b.id}" data-code="${b.code}">
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

// ---------- HỒ SƠ TIỆM ----------
// Chưa có tiệm → form đăng ký; chờ duyệt → thông báo; bị từ chối → lý do + sửa & gửi lại;
// đã duyệt → bảng đơn hàng.
async function refreshShops() {
  try {
    shops = await listMyShops(profile.id);
  } catch (error) {
    toastError(error);
    return;
  }
  const approved = approvedShops();
  $('#shop-name').textContent = approved.length ? approved.map((s) => s.name).join(', ') : 'Mở tiệm trên Trạm Hỷ';
  renderShopStatus();
  renderWorkspace();

  if (approved.length) {
    await load();
    unsubscribeBookings ??= subscribeBookingChanges('vendor-bookings', debounce(load, 300));
  }
}

// ---------- KHU LÀM VIỆC: Đơn hàng | Mẫu váy | Ảnh tiệm ----------
// Tab Mẫu váy / Ảnh tiệm chỉ vẽ khi mở lần đầu (hoặc khi đổi tiệm), để realtime cập nhật đơn
// không làm mất thao tác đang dở ở các tab đó.
const approvedShops = () => shops.filter((s) => s.status === 'approved');
const managedShop = () => approvedShops().find((s) => s.id === managedShopId);

function initWorkspace() {
  $$('[data-panel]').forEach((tab) => tab.addEventListener('click', () => showPanel(tab.dataset.panel)));
  $('#shop-select').addEventListener('change', (e) => {
    managedShopId = e.target.value;
    mountedPanels = {};
    renderWorkspace();
  });
}

function renderWorkspace() {
  const approved = approvedShops();
  $('#workspace').hidden = !approved.length;
  if (!approved.length) return;

  if (!managedShop()) {
    managedShopId = approved[0].id;
    mountedPanels = {};
  }
  const select = $('#shop-select');
  select.hidden = approved.length < 2;
  render(select, approved.map((s) => html`<option value="${s.id}" ${s.id === managedShopId ? 'selected' : ''}>${s.name}</option>`));

  // Chỉ tiệm váy cưới mới đăng mẫu váy
  $('#tab-dresses').hidden = managedShop().category !== 'bridal';
  if (activePanel === 'dresses' && $('#tab-dresses').hidden) activePanel = 'orders';
  showPanel(activePanel);
  checklist = null;
  mountPartnerChecklist($('#checklist'), managedShop(), { goTo: showPanel })
    .then((c) => { checklist = c; }).catch(toastError);
}

let checklist = null;   // "Hoàn thiện hồ sơ" của tiệm đang quản lý – cập nhật khi quay về tab Đơn hàng

function showPanel(name) {
  if (name === 'orders' && activePanel !== 'orders') checklist?.refresh();   // vừa thêm ảnh / mẫu váy xong
  activePanel = name;
  $$('[data-panel]').forEach((t) => t.classList.toggle('active', t.dataset.panel === name));
  for (const panel of ['orders', 'dresses', 'media']) $(`#panel-${panel}`).hidden = panel !== name;

  const shop = managedShop();
  if (name === 'dresses' && mountedPanels.dresses !== shop.id) {
    mountedPanels.dresses = shop.id;
    mountDressManager($('#panel-dresses'), shop);
  }
  if (name === 'media' && mountedPanels.media !== shop.id) {
    mountedPanels.media = shop.id;
    mountShopMedia($('#panel-media'), shop);
  }
}

function renderShopStatus() {
  const container = $('#shop-status');
  if (!shops.length) {
    // Cô dâu / đối tác chưa có tiệm → đăng ký từng bước. Gửi xong tải lại để header đổi sang vai trò đối tác.
    mountShopWizard(container, {
      userId: profile.id,
      onSubmitted: async () => {
        sessionStorage.setItem('tramhy-flash', 'Đã gửi hồ sơ! Trạm Hỷ sẽ duyệt trong 1–2 ngày làm việc.');
        location.reload();
      },
    });
    return;
  }

  render(container, shops.map((shop) => {
    if (shop.status === 'pending') {
      return html`<section class="card stack">
        <h3 style="margin:0">Hồ sơ "${shop.name}" đang chờ Trạm Hỷ duyệt</h3>
        ${reviewTimeline(shop)}
        <p class="small muted" style="margin:0">Kết quả hiện ngay tại đây khi có – không cần tải lại trang.</p>
      </section>`;
    }
    if (shop.status === 'rejected') {
      return html`
        <form class="card stack" data-resubmit="${shop.id}">
          <h3 style="margin:0">Hồ sơ "${shop.name}" chưa được duyệt</h3>
          ${reviewTimeline(shop)}
          <div class="notice notice-error">Lý do: ${shop.review_note || 'Không ghi rõ'}. Hãy sửa thông tin bên dưới rồi gửi lại.</div>
          ${shopFields(shop, { withCategory: false })}
          <button class="btn btn-primary" type="submit">Sửa & gửi duyệt lại</button>
        </form>`;
    }
    return html`<div class="row small">${statusBadge(VENDOR_STATUS, shop.status)}
      <strong>${shop.name}</strong>
      <a href="vendor.html?slug=${shop.slug}">Xem trang tiệm</a>
      <button class="btn btn-outline btn-sm" type="button" data-edit-shop="${shop.id}">Sửa thông tin tiệm</button></div>`;
  }));

  container.querySelectorAll('[data-resubmit]').forEach((form) => {
    form.addEventListener('submit', (e) => submitShop(e, async (shop) => {
      await updateMyShop(form.dataset.resubmit, shop);
      await resubmitVendor(form.dataset.resubmit);
    }, 'Đã gửi lại hồ sơ cho Trạm Hỷ.'));
  });
  container.querySelectorAll('[data-edit-shop]').forEach((btn) => {
    btn.addEventListener('click', () => editShop(shops.find((s) => s.id === btn.dataset.editShop)));
  });
}

// Dòng thời gian duyệt hồ sơ: Đã gửi → Đang xét duyệt → Kết quả
function reviewTimeline(shop) {
  const rejected = shop.status === 'rejected';
  const steps = [
    { state: 'done', title: 'Đã gửi hồ sơ', note: date(shop.created_at) },
    { state: rejected ? 'done' : 'active', title: 'Trạm Hỷ đang xét duyệt', note: 'Thường trong 1–2 ngày làm việc' },
    { state: rejected ? 'failed' : '', title: rejected ? 'Chưa được duyệt' : 'Kết quả',
      note: rejected ? 'Sửa thông tin và gửi lại bên dưới' : 'Được duyệt là tiệm lên sàn ngay' },
  ];
  return html`<ol class="timeline">
    ${steps.map((s) => html`<li class="${s.state}"><strong>${s.title}</strong><span class="small muted">${s.note}</span></li>`)}
  </ol>`;
}

async function submitShop(e, save, successMessage) {
  e.preventDefault();
  await withBusy(e.submitter, async () => {
    try {
      await save(readShopForm(new FormData(e.target)));
      toast(successMessage, 'success');
      await refreshShops();
    } catch (error) {
      toastError(error);
    }
  });
}

async function editShop(shop) {
  const done = await openDialog({
    title: 'Sửa thông tin tiệm',
    confirmText: 'Lưu',
    content: shopFields(shop, { withCategory: false }),
    onConfirm: (form) => updateMyShop(shop.id, readShopForm(form)),
  });
  if (done) { toast('Đã cập nhật thông tin tiệm.', 'success'); refreshShops(); }
}

// ---------- KHỞI CHẠY TRANG ----------
await initLayout('vendor');
profile = await requireAuth(['bride', 'vendor']);     // cô dâu vào đây để mở tiệm (Trở thành đối tác)
const flash = sessionStorage.getItem('tramhy-flash');
if (flash) { sessionStorage.removeItem('tramhy-flash'); toast(flash, 'success'); }
initWorkspace();
await refreshShops();
subscribeVendorChanges('vendor-shops', debounce(refreshShops, 300));
