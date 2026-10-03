import { initLayout } from '../core/layout.js';
import { requireAuth } from '../core/auth.js';
import { $, $$, html, render, money, dateTime, debounce } from '../core/utils.js';
import { BOOKING_STATUS, BOOKING_TYPE, VENDOR_CATEGORY, badge, statusBadge } from '../core/labels.js';
import { openDialog, toast, toastError, withBusy } from '../core/ui.js';
import { PLATFORM_FEE_RATE } from '../config.js';
import { listAllBookings, subscribeBookingChanges } from '../services/bookings.js';
import {
  listOpenDisputes, resolveDispute, listVendorsWithOwners, setVendorVerified, linkVendorOwner,
} from '../services/admin.js';

const data = { bookings: [], disputes: [], vendors: [] };

async function load() {
  try {
    [data.bookings, data.disputes, data.vendors] = await Promise.all([
      listAllBookings(), listOpenDisputes(), listVendorsWithOwners(),
    ]);
    renderStats();
    renderDisputes();
    renderVendors();
    renderBookings();
  } catch (error) {
    toastError(error);
  }
}

function renderStats() {
  const milestones = data.bookings.flatMap((b) => b.milestones);
  const sum = (status) => milestones.filter((m) => m.status === status).reduce((t, m) => t + m.amount, 0);
  const released = sum('released');
  const stats = [
    ['Tổng số đơn', data.bookings.length],
    ['Đang giữ trong Escrow', money(sum('paid'))],
    ['Đã giải ngân cho đối tác', money(released)],
    ['Doanh thu phí sàn (10%)', money(Math.round(released * PLATFORM_FEE_RATE))],
    ['Khiếu nại chờ xử lý', data.disputes.length],
  ];
  render($('#stats'), stats.map(([label, value]) => html`
    <div class="card stat"><div class="stat-label">${label}</div><div class="stat-value">${value}</div></div>`));
}

// ---------- KHIẾU NẠI ----------
function renderDisputes() {
  const container = $('#tab-disputes');
  if (!data.disputes.length) {
    render(container, html`<div class="empty">Không có khiếu nại nào đang chờ.</div>`);
    return;
  }
  render(container, html`<div class="stack">${data.disputes.map((d) => {
    const held = d.booking.milestones.filter((m) => m.status === 'paid').reduce((t, m) => t + m.amount, 0);
    const isNoShow = d.kind === 'no_show';
    return html`
      <article class="card stack" data-dispute="${d.id}">
        <div class="row">
          ${badge(isNoShow ? 'Đối tác báo khách không đến' : 'Cô dâu yêu cầu hoàn cọc', 'red')}
          <strong>${d.booking.code}</strong><span class="spacer"></span>
          <span class="small muted">${dateTime(d.created_at)}</span>
        </div>
        <div class="small">${d.booking.vendor.name} · ${BOOKING_TYPE[d.booking.type]} · Khách: ${d.booking.contact_name} (${d.booking.contact_phone})</div>
        <div><strong>Lý do:</strong> ${d.reason}</div>
        <div>Tiền đang giữ: <span class="price">${money(held)}</span></div>
        <div class="row">
          <button class="btn btn-danger btn-sm" data-resolve="refund">Hoàn tiền cho cô dâu</button>
          <button class="btn btn-outline btn-sm" data-resolve="vendor">
            ${isNoShow ? 'Giải ngân đền bù cho đối tác' : 'Bác yêu cầu, tiếp tục đơn'}</button>
        </div>
      </article>`;
  })}</div>`);

  container.querySelectorAll('[data-resolve]').forEach((btn) => {
    btn.addEventListener('click', () => resolve(btn.closest('[data-dispute]').dataset.dispute, btn.dataset.resolve === 'refund'));
  });
}

async function resolve(disputeId, refund) {
  const done = await openDialog({
    title: refund ? 'Hoàn toàn bộ tiền đang giữ cho cô dâu?' : 'Xử lý theo hướng có lợi cho đối tác?',
    confirmText: 'Xác nhận phân xử',
    danger: refund,
    content: html`<label class="field"><span>Ghi chú kết luận (gửi cho hai bên)</span>
      <textarea class="input" name="note" required maxlength="1000"></textarea></label>`,
    onConfirm: (form) => resolveDispute(disputeId, refund, form.get('note').trim()),
  });
  if (done) { toast('Đã phân xử khiếu nại.', 'success'); load(); }
}

// ---------- ĐỐI TÁC ----------
function renderVendors() {
  render($('#tab-vendors'), html`
    <div class="card table-wrap">
      <table>
        <thead><tr><th>Đối tác</th><th>Loại</th><th>Chủ tiệm</th><th>Tích Xanh</th><th></th></tr></thead>
        <tbody>
          ${data.vendors.map((v) => html`
            <tr data-vendor="${v.id}">
              <td><a href="vendor.html?slug=${v.slug}">${v.name}</a><div class="small muted">${v.district}</div></td>
              <td>${VENDOR_CATEGORY[v.category]}</td>
              <td>${v.owner?.full_name || html`<span class="muted">Chưa gắn</span>`}</td>
              <td>${v.is_verified ? badge('✓ Đã cấp', 'blue') : badge('Chưa')}</td>
              <td><div class="row">
                <button class="btn btn-outline btn-sm" data-verify="${v.is_verified ? 'off' : 'on'}">
                  ${v.is_verified ? 'Thu hồi' : 'Cấp Tích Xanh'}</button>
                <button class="btn btn-outline btn-sm" data-link-owner>Gắn chủ tiệm</button>
              </div></td>
            </tr>`)}
        </tbody>
      </table>
    </div>`);

  $$('[data-verify]').forEach((btn) => {
    btn.addEventListener('click', () => withBusy(btn, async () => {
      try {
        await setVendorVerified(btn.closest('[data-vendor]').dataset.vendor, btn.dataset.verify === 'on');
        toast('Đã cập nhật Tích Xanh.', 'success');
        load();
      } catch (error) {
        toastError(error);
      }
    }));
  });

  $$('[data-link-owner]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const vendorId = btn.closest('[data-vendor]').dataset.vendor;
      const done = await openDialog({
        title: 'Gắn tài khoản quản lý tiệm',
        confirmText: 'Gắn tài khoản',
        content: html`<p class="small muted">Đối tác cần tự đăng ký tài khoản trước. Tài khoản sẽ được chuyển sang vai trò đối tác.</p>
          <label class="field"><span>Email tài khoản đối tác</span><input class="input" type="email" name="email" required></label>`,
        onConfirm: (form) => linkVendorOwner(vendorId, form.get('email').trim()),
      });
      if (done) { toast('Đã gắn chủ tiệm.', 'success'); load(); }
    });
  });
}

// ---------- TẤT CẢ ĐƠN ----------
function renderBookings() {
  if (!data.bookings.length) {
    render($('#tab-bookings'), html`<div class="empty">Chưa có đơn nào.</div>`);
    return;
  }
  render($('#tab-bookings'), html`
    <div class="card table-wrap">
      <table>
        <thead><tr><th>Mã</th><th>Khách</th><th>Đối tác</th><th>Loại</th><th>Tổng</th><th>Trạng thái</th><th>Tạo lúc</th></tr></thead>
        <tbody>
          ${data.bookings.map((b) => html`
            <tr>
              <td>${b.code}</td>
              <td>${b.contact_name}<div class="small muted">${b.contact_phone}</div></td>
              <td>${b.vendor.name}</td>
              <td>${BOOKING_TYPE[b.type]}</td>
              <td class="price">${money(b.total_price)}</td>
              <td>${statusBadge(BOOKING_STATUS, b.status)}</td>
              <td class="small">${dateTime(b.created_at)}</td>
            </tr>`)}
        </tbody>
      </table>
    </div>`);
}

function initTabs() {
  for (const tab of $$('[data-tab]')) {
    tab.addEventListener('click', () => {
      for (const t of $$('[data-tab]')) t.classList.toggle('active', t === tab);
      for (const name of ['disputes', 'vendors', 'bookings']) $(`#tab-${name}`).hidden = name !== tab.dataset.tab;
    });
  }
}

// ---------- KHỞI CHẠY TRANG ----------
await initLayout('admin');
await requireAuth(['admin']);
initTabs();
await load();
subscribeBookingChanges('admin-bookings', debounce(load, 500));
