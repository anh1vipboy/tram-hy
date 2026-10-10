import { initLayout } from '../core/layout.js';
import { requireAuth } from '../core/auth.js';
import { $, $$, html, render, money, dateTime, debounce } from '../core/utils.js';
import { BOOKING_STATUS, BOOKING_TYPE, VENDOR_CATEGORY, VENDOR_STATUS, badge, statusBadge } from '../core/labels.js';
import { openDialog, toast, toastError, withBusy } from '../core/ui.js';
import { PLATFORM_FEE_RATE } from '../config.js';
import { listAllBookings, subscribeBookingChanges } from '../services/bookings.js';
import { subscribeVendorChanges } from '../services/catalog.js';
import {
  listOpenDisputes, resolveDispute, listVendorsWithOwners, setVendorVerified, linkVendorOwner, reviewVendor,
} from '../services/admin.js';

const data = { bookings: [], disputes: [], vendors: [] };

async function load() {
  try {
    [data.bookings, data.disputes, data.vendors] = await Promise.all([
      listAllBookings(), listOpenDisputes(), listVendorsWithOwners(),
    ]);
    renderStats();
    renderApprovals();
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
    ['Đối tác chờ duyệt', data.vendors.filter((v) => v.status === 'pending').length],
    ['Khiếu nại chờ xử lý', data.disputes.length],
  ];
  render($('#stats'), stats.map(([label, value]) => html`
    <div class="card stat"><div class="stat-label">${label}</div><div class="stat-value">${value}</div></div>`));
}

// ---------- DUYỆT ĐỐI TÁC ----------
function renderApprovals() {
  const pending = data.vendors.filter((v) => v.status === 'pending')
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  $('#pending-count').textContent = pending.length;

  const container = $('#tab-approvals');
  if (!pending.length) {
    render(container, html`<div class="empty">Không có hồ sơ đối tác nào đang chờ duyệt.</div>`);
    return;
  }
  render(container, html`<div class="stack">${pending.map((v) => html`
    <article class="card stack" data-vendor="${v.id}">
      <div class="row">
        ${badge(VENDOR_CATEGORY[v.category], 'gold')}
        <strong style="font-size:17px">${v.name}</strong>
        <span class="spacer"></span>
        <span class="small muted">Gửi lúc ${dateTime(v.created_at)}</span>
      </div>
      <div class="grid-2 small">
        <div>
          <div><strong>Chủ tiệm:</strong> ${v.owner?.full_name || '—'}</div>
          <div><strong>Điện thoại:</strong> ${v.phone || v.owner?.phone || '—'}</div>
          <div><strong>Địa chỉ:</strong> ${[v.address, v.district].filter(Boolean).join(', ') || '—'}</div>
          <div><strong>Giá khởi điểm:</strong> <span class="price">${money(v.base_price)}</span></div>
        </div>
        <div><strong>Giới thiệu:</strong> ${v.description || html`<span class="muted">Không có</span>`}</div>
      </div>
      <div class="row">
        <button class="btn btn-primary btn-sm" data-review="approve">Duyệt – cho lên sàn</button>
        <button class="btn btn-danger btn-sm" data-review="reject">Từ chối</button>
        <a class="small" href="vendor.html?slug=${v.slug}" target="_blank" rel="noopener">Xem trang tiệm →</a>
      </div>
    </article>`)}</div>`);

  container.querySelectorAll('[data-review]').forEach((btn) => {
    const vendor = data.vendors.find((v) => v.id === btn.closest('[data-vendor]').dataset.vendor);
    btn.addEventListener('click', () => review(vendor, btn.dataset.review === 'approve'));
  });
}

async function review(vendor, approve) {
  const done = await openDialog({
    title: approve ? `Duyệt "${vendor.name}"?` : `Từ chối "${vendor.name}"?`,
    confirmText: approve ? 'Duyệt' : 'Từ chối',
    danger: !approve,
    content: approve
      ? html`<p>Tiệm sẽ hiện trên trang Dịch vụ cưới và nhận được đơn đặt lịch.</p>
          <label class="field"><span>Ghi chú cho đối tác (không bắt buộc)</span>
            <textarea class="input" name="note" maxlength="500"></textarea></label>`
      : html`<label class="field"><span>Lý do từ chối (đối tác sẽ thấy để sửa hồ sơ)</span>
          <textarea class="input" name="note" required minlength="5" maxlength="500"
            placeholder="VD: Thiếu địa chỉ cụ thể, giá khởi điểm chưa hợp lý…"></textarea></label>`,
    onConfirm: (form) => reviewVendor(vendor.id, approve, form.get('note').trim()),
  });
  if (done) { toast(approve ? 'Đã duyệt đối tác.' : 'Đã từ chối hồ sơ.', 'success'); load(); }
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
        <thead><tr><th>Đối tác</th><th>Loại</th><th>Chủ tiệm</th><th>Trạng thái</th><th>Tích Xanh</th><th></th></tr></thead>
        <tbody>
          ${data.vendors.map((v) => html`
            <tr data-vendor="${v.id}">
              <td><a href="vendor.html?slug=${v.slug}">${v.name}</a><div class="small muted">${v.district}</div></td>
              <td>${VENDOR_CATEGORY[v.category]}</td>
              <td>${v.owner?.full_name || html`<span class="muted">Chưa gắn</span>`}</td>
              <td>${statusBadge(VENDOR_STATUS, v.status)}</td>
              <td>${v.is_verified ? badge('✓ Đã cấp', 'blue') : badge('Chưa')}</td>
              <td><div class="row">
                ${v.status === 'approved' ? html`
                  <button class="btn btn-outline btn-sm" data-verify="${v.is_verified ? 'off' : 'on'}">
                    ${v.is_verified ? 'Thu hồi' : 'Cấp Tích Xanh'}</button>` : ''}
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
      for (const name of ['approvals', 'disputes', 'vendors', 'bookings']) $(`#tab-${name}`).hidden = name !== tab.dataset.tab;
    });
  }
}

// ---------- KHỞI CHẠY TRANG ----------
initTabs();                    // gắn sự kiện tab ngay, không chờ kiểm tra đăng nhập (bấm sớm vẫn ăn)
// Đến từ chuông thông báo (admin.html?tab=disputes) → mở đúng tab
document.querySelector(`[data-tab="${new URLSearchParams(location.search).get('tab')}"]`)?.click();
await initLayout('admin');
await requireAuth(['admin']);
await load();
const reload = debounce(load, 500);
subscribeBookingChanges('admin-bookings', reload);
subscribeVendorChanges('admin-vendors', reload);
