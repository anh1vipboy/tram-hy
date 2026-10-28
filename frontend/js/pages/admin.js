import { initLayout } from '../core/layout.js';
import { requireAuth } from '../core/auth.js';
import { $, $$, html, render, money, dateTime, debounce } from '../core/utils.js';
import { BOOKING_STATUS, BOOKING_TYPE, VENDOR_CATEGORY, VENDOR_STATUS, badge, statusBadge } from '../core/labels.js';
import { openDialog, toast, toastError, withBusy } from '../core/ui.js';
import { PLATFORM_FEE_RATE } from '../config.js';
import {
  bookingFinance, summarizeBookingsFinance, serviceTitle, exportAdminFinanceExcel,
  buildAdminFinanceBytes, exportAiOrdersExcel, autoSyncCloudExcel, openCloudExcelSyncDialog,
} from '../components/finance-export.js';
import { disputeSlaInfo, bindDisputeActions } from '../components/booking-card.js';
import { paginate, paginationView, bindPaginationEvents } from '../components/pagination.js';
import { listAllBookings, subscribeBookingChanges } from '../services/bookings.js';
import { subscribeVendorChanges } from '../services/catalog.js';
import {
  listOpenDisputes, resolveDispute, listVendorsWithOwners, setVendorVerified, linkVendorOwner, reviewVendor,
  listAllSubscriptionOrders, adminConfirmSubscriptionOrder, adminDeleteSubscriptionOrder, adminClearPendingSubscriptionOrders,
  subscribeSubscriptionOrderChanges,
} from '../services/admin.js';
import { getTryonSettings, saveTryonSettings } from '../services/tryon-ai.js';

const data = { bookings: [], disputes: [], vendors: [], aiOrders: [] };
const bookingFilter = { state: 'all', vendorId: 'all', category: 'all', datePreset: 'all', dateFrom: '', dateTo: '' };
const bookingPagination = { page: 1, pageSize: 10 };
const vendorPagination = { page: 1, pageSize: 10 };
const aiOrderFilter = { state: 'all', planId: 'all', datePreset: 'all', dateFrom: '', dateTo: '' };
const aiOrderPagination = { page: 1, pageSize: 10 };

function getDateRangeFromPreset(preset) {
  const now = new Date();
  const formatYMD = (dt) => {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  if (preset === 'today') {
    const todayStr = formatYMD(now);
    return { dateFrom: todayStr, dateTo: todayStr };
  }
  if (preset === 'yesterday') {
    const yest = new Date(now);
    yest.setDate(yest.getDate() - 1);
    const yestStr = formatYMD(yest);
    return { dateFrom: yestStr, dateTo: yestStr };
  }
  if (preset === 'last7') {
    const past = new Date(now);
    past.setDate(past.getDate() - 6);
    return { dateFrom: formatYMD(past), dateTo: formatYMD(now) };
  }
  if (preset === 'last30') {
    const past = new Date(now);
    past.setDate(past.getDate() - 29);
    return { dateFrom: formatYMD(past), dateTo: formatYMD(now) };
  }
  if (preset === 'this_month') {
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    return { dateFrom: formatYMD(firstDay), dateTo: formatYMD(now) };
  }
  return { dateFrom: '', dateTo: '' };
}

function matchDateFilter(dateStr, { dateFrom, dateTo }) {
  if (!dateFrom && !dateTo) return true;
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return true;

  if (dateFrom) {
    const [y, m, day] = dateFrom.split('-').map(Number);
    const from = new Date(y, m - 1, day, 0, 0, 0, 0);
    if (d < from) return false;
  }

  if (dateTo) {
    const [y, m, day] = dateTo.split('-').map(Number);
    const to = new Date(y, m - 1, day, 23, 59, 59, 999);
    if (d > to) return false;
  }

  return true;
}

async function load() {
  try {
    [data.bookings, data.disputes, data.vendors, data.aiOrders] = await Promise.all([
      listAllBookings(), listOpenDisputes(), listVendorsWithOwners(), listAllSubscriptionOrders(),
    ]);
    renderStats();
    renderApprovals();
    renderDisputes();
    renderVendors();
    renderBookings();
    renderAiOrders();
    autoSyncCloudExcel('admin', () => buildAdminFinanceBytes(data.bookings, data.vendors, data.aiOrders));
  } catch (error) {
    toastError(error);
  }
}

function renderStats() {
  const s = summarizeBookingsFinance(data.bookings);
  const feePct = Math.round(PLATFORM_FEE_RATE * 100);
  const netPct = 100 - feePct;
  const pendingVendors = data.vendors.filter((v) => v.status === 'pending').length;
  const aiPaid = (data.aiOrders || []).filter((o) => o.status === 'paid');
  const aiRevenue = aiPaid.reduce((t, o) => t + (o.amount || 0), 0);
  const stats = [
    ['Tổng giao dịch (GMV 100%)', money(s.gmv), `${s.activeCount}/${s.totalCount} đơn hiệu lực`],
    [`Hoa hồng Sàn dự kiến (${feePct}%)`, money(s.expectedFee), `Tính trên ${s.activeCount} đơn hiệu lực`],
    [`Hoa hồng Sàn thực thu (${feePct}%)`, money(s.earnedFee), `Từ ${money(s.releasedGross)} đã giải ngân`],
    ['Đang giữ hộ trong Escrow', money(s.paidEscrow), `Sẽ trả tiệm ${money(s.partnerEscrowNet)} (${netPct}%)`],
    [`Đã trả Đối tác (${netPct}%)`, money(s.partnerPaidNet), `${s.completedCount} đơn hoàn tất trọn vẹn`],
    ['Doanh thu Gói cước AI', money(aiRevenue), `${aiPaid.length} khách đã mua gói AI`],
    ['Cần xử lý ngay', `${pendingVendors} tiệm · ${data.disputes.length} đơn`, 'Đối tác chờ duyệt & khiếu nại'],
  ];
  render($('#stats'), stats.map(([label, value, sub]) => html`
    <div class="card stat">
      <div class="stat-label">${label}</div>
      <div class="stat-value">${value}</div>
      <div class="small muted" style="margin-top:4px">${sub}</div>
    </div>`));
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
          <div><strong>${v.category === 'venue' ? 'Giá mỗi bàn từ' : 'Giá khởi điểm'}:</strong> <span class="price">${money(v.base_price)}${v.category === 'venue' ? '/bàn' : ''}</span></div>
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
    const b = d.booking;
    const held = (b.milestones || []).filter((m) => m.status === 'paid').reduce((t, m) => t + m.amount, 0);
    const partnerNet = Math.round(held * (1 - PLATFORM_FEE_RATE));
    const platformFee = held - partnerNet;
    const isNoShow = d.kind === 'no_show';
    const sla = disputeSlaInfo(d, b.details);
    const brideResp = sla?.brideResponse;
    const vendorReply = sla?.vendorReply;
    const catLabel = VENDOR_CATEGORY[b.vendor?.category] || 'Dịch vụ cưới';
    const cleanCustomerPhone = String(b.contact_phone || '').replace(/[^0-9+]/g, '');
    const cleanVendorPhone = String(b.vendor?.phone || '').replace(/[^0-9+]/g, '');

    return html`
      <article class="card stack" data-dispute="${d.id}" data-booking="${b.id}">
        <div class="row" style="justify-content:space-between;align-items:flex-start">
          <div class="row" style="gap:8px">
            ${badge(isNoShow ? '🚫 Đối tác báo khách không đến' : '⚠️ Cô dâu yêu cầu hoàn cọc', 'red')}
            <strong>${b.code}</strong>
            <span class="badge badge-gold">${catLabel}</span>
          </div>
          <div class="row" style="gap:8px">
            ${sla ? html`<span class="sla-pill is-${sla.badgeTone}">${sla.badgeText}</span>` : ''}
            <span class="small muted">Mở lúc ${dateTime(d.created_at)}</span>
          </div>
        </div>

        <div class="small">
          <strong>${b.vendor?.name}</strong> · ${BOOKING_TYPE[b.type]}
          ${b.appointment_at ? html` · Lịch hẹn gốc: <strong>${dateTime(b.appointment_at)}</strong>` : ''}
          · Khách: <strong>${b.contact_name}</strong> (${b.contact_phone})
        </div>

        <div class="small" style="background:var(--bg-soft);padding:10px 12px;border-radius:10px;border:1px solid var(--line)">
          <div><strong>Lý do báo cáo (${isNoShow ? 'từ Đối tác' : 'từ Khách hàng'}):</strong> ${d.reason}</div>
          <div class="muted" style="margin-top:4px">
            Tiền đang giữ trong Escrow: <strong class="price">${money(held)}</strong>
            (Nếu giải ngân: Đối tác nhận <strong>${money(partnerNet)}</strong> · Hoa hồng sàn 10%: <strong>${money(platformFee)}</strong>)
          </div>
        </div>

        ${brideResp ? html`
          <div class="dispute-response-card is-bride">
            <div class="row" style="justify-content:space-between">
              <strong>${brideResp.type === 'reschedule' ? '📅 Khách hàng xin dời sang lịch hẹn mới' : '💬 Giải trình từ Khách hàng'}</strong>
              <span class="small muted">${dateTime(brideResp.responded_at)}</span>
            </div>
            ${brideResp.proposed_appointment_at ? html`
              <div class="small" style="margin-top:4px">
                Giờ hẹn mới khách đề xuất: <strong style="color:var(--brand)">${dateTime(brideResp.proposed_appointment_at)}</strong>
              </div>` : ''}
            <div class="small" style="margin-top:4px">"${brideResp.message}"</div>
          </div>` : html`
          <div class="small muted">
            ⏳ <em>Khách hàng chưa gửi phản hồi trên web. Nếu khách bận quên, Admin có thể bấm Gọi/Zalo nhắc khách hoặc chờ hết 48h để giải ngân đền bù cho đối tác.</em>
          </div>`}

        ${vendorReply ? html`
          <div class="dispute-response-card is-vendor">
            <div class="row" style="justify-content:space-between">
              <strong>🏪 Phản hồi từ Đối tác (${vendorReply.by_name})</strong>
              <span class="small muted">${dateTime(vendorReply.responded_at)}</span>
            </div>
            <div class="small" style="margin-top:4px">"${vendorReply.message}"</div>
          </div>` : ''}

        <div class="row" style="justify-content:space-between;padding-top:4px">
          <div class="row" style="gap:8px">
            <button type="button" class="btn ${brideResp?.type === 'reschedule' ? 'btn-primary' : 'btn-outline'} btn-sm"
                    data-dispute-act="restore-booking" data-booking-id="${b.id}">
              ✅ Cho dời lịch &amp; Khôi phục đơn
            </button>
            <button type="button" class="btn btn-outline btn-sm" data-resolve="vendor">
              ⚖️ ${isNoShow ? `Giải ngân đền bù cho đối tác (${money(partnerNet)})` : 'Bác yêu cầu, tiếp tục đơn'}
            </button>
            <button type="button" class="btn btn-danger btn-sm" data-resolve="refund">
              ↩️ Hoàn tiền cho cô dâu (${money(held)})
            </button>
          </div>
          <div class="row" style="gap:6px">
            ${cleanCustomerPhone ? html`
              <a class="btn btn-outline btn-sm" href="tel:${cleanCustomerPhone}">📞 Gọi khách</a>
              <a class="btn btn-outline btn-sm" href="https://zalo.me/${cleanCustomerPhone}" target="_blank" rel="noopener">💬 Zalo khách</a>
            ` : ''}
            ${cleanVendorPhone ? html`<a class="btn btn-outline btn-sm" href="tel:${cleanVendorPhone}">📞 Gọi tiệm</a>` : ''}
          </div>
        </div>
      </article>`;
  })}</div>`);

  container.querySelectorAll('[data-resolve]').forEach((btn) => {
    btn.addEventListener('click', () => resolve(btn.closest('[data-dispute]').dataset.dispute, btn.dataset.resolve === 'refund'));
  });
  bindDisputeActions(
    container,
    (bookingId) => data.disputes.find((d) => d.booking?.id === bookingId)?.booking || data.bookings.find((b) => b.id === bookingId),
    load,
  );
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
  const container = $('#tab-vendors');
  if (!data.vendors.length) {
    render(container, html`<div class="empty">Chưa có đối tác nào.</div>`);
    return;
  }
  const paged = paginate(data.vendors, vendorPagination.page, vendorPagination.pageSize);

  render(container, html`
    <div class="stack" style="gap:14px">
      <div class="card table-wrap">
        <table>
          <thead><tr><th>Đối tác</th><th>Loại</th><th>Chủ tiệm</th><th>Trạng thái</th><th>Tích Xanh</th><th></th></tr></thead>
          <tbody>
            ${paged.items.map((v) => html`
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
      </div>
      ${paginationView({ ...paged, itemLabel: 'đối tác' })}
    </div>`);

  bindPaginationEvents(container, {
    onPageChange: (p) => { vendorPagination.page = p; renderVendors(); },
    onPageSizeChange: (sz) => { vendorPagination.pageSize = sz; vendorPagination.page = 1; renderVendors(); },
  });

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

// ---------- TẤT CẢ ĐƠN & ĐỐI SOÁT HOA HỒNG ----------
function getBookingCategory(b) {
  if (b.vendor?.category) return b.vendor.category;
  if (b.type === 'rental' || (typeof b.type === 'string' && b.type.startsWith('bespoke'))) return 'bridal';
  return 'other';
}

function filterBookingsList() {
  return data.bookings.filter((b) => {
    const f = bookingFinance(b);
    if (bookingFilter.vendorId !== 'all' && String(b.vendor_id || b.vendor?.id) !== bookingFilter.vendorId) return false;
    if (bookingFilter.category !== 'all' && getBookingCategory(b) !== bookingFilter.category) return false;
    if (bookingFilter.state === 'escrow') return f.paidEscrow > 0;
    if (bookingFilter.state === 'released') return f.releasedGross > 0;
    if (bookingFilter.state === 'pending') return b.status === 'pending';
    if (bookingFilter.state === 'cancelled') return f.isCancelled;
    if (!matchDateFilter(b.created_at, bookingFilter)) return false;
    return true;
  });
}

function renderBookings() {
  const container = $('#tab-bookings');
  if (!data.bookings.length) {
    render(container, html`<div class="empty">Chưa có đơn nào.</div>`);
    return;
  }
  const filtered = filterBookingsList();
  const paged = paginate(filtered, bookingPagination.page, bookingPagination.pageSize);
  const s = summarizeBookingsFinance(filtered);
  const feePct = Math.round(PLATFORM_FEE_RATE * 100);
  const netPct = 100 - feePct;

  const categoryCounts = {};
  for (const b of data.bookings) {
    const cat = getBookingCategory(b);
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  }

  const vendorBookings = bookingFilter.category === 'all'
    ? data.bookings
    : data.bookings.filter((b) => getBookingCategory(b) === bookingFilter.category);

  const vendorOptions = [...new Map(
    vendorBookings.filter((b) => b.vendor).map((b) => [String(b.vendor_id || b.vendor.id), b.vendor.name]),
  ).entries()];

  if (bookingFilter.vendorId !== 'all' && !vendorOptions.some(([id]) => id === bookingFilter.vendorId)) {
    bookingFilter.vendorId = 'all';
  }

  render(container, html`
    <div class="stack" style="gap:14px">
      <div class="card stack" style="padding:14px;gap:12px">
        <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:10px">
          <div class="chips">
            ${[
              ['all',       `Tất cả (${data.bookings.length})`],
              ['escrow',    'Đang giữ tiền Escrow'],
              ['released',  'Đã giải ngân & thu hoa hồng'],
              ['pending',   'Chờ khách đặt cọc'],
              ['cancelled', 'Đã hủy / Hoàn cọc'],
            ].map(([k, lbl]) => html`
              <button type="button" class="chip ${bookingFilter.state === k ? 'active' : ''}" data-bfilter="${k}">${lbl}</button>`)}
          </div>
          <div class="row admin-toolbar-actions" style="gap:8px;flex-wrap:wrap;align-items:center">
            <select class="input" style="width:auto;padding:7px 12px;font-size:13px" data-category-filter aria-label="Lọc theo loại dịch vụ">
              <option value="all">Tất cả dịch vụ</option>
              ${Object.entries(VENDOR_CATEGORY).map(([k, lbl]) => html`
                <option value="${k}" ${bookingFilter.category === k ? 'selected' : ''}>${lbl} (${categoryCounts[k] || 0})</option>
              `)}
            </select>
            <select class="input" style="width:auto;padding:7px 12px;font-size:13px" data-vendor-filter aria-label="Lọc theo tiệm đối tác">
              <option value="all">Tất cả đối tác (${vendorOptions.length})</option>
              ${vendorOptions.map(([id, name]) => html`<option value="${id}" ${bookingFilter.vendorId === id ? 'selected' : ''}>${name}</option>`)}
            </select>
            <div class="date-filter-group">
              <div class="date-preset-row">
                <span class="small muted" style="white-space:nowrap;font-size:12px">📅 Ngày:</span>
                <select class="date-preset-select" data-booking-date-preset aria-label="Khoảng thời gian">
                  <option value="all" ${bookingFilter.datePreset === 'all' ? 'selected' : ''}>Tất cả ngày</option>
                  <option value="today" ${bookingFilter.datePreset === 'today' ? 'selected' : ''}>Hôm nay</option>
                  <option value="yesterday" ${bookingFilter.datePreset === 'yesterday' ? 'selected' : ''}>Hôm qua</option>
                  <option value="last7" ${bookingFilter.datePreset === 'last7' ? 'selected' : ''}>7 ngày qua</option>
                  <option value="last30" ${bookingFilter.datePreset === 'last30' ? 'selected' : ''}>30 ngày qua</option>
                  <option value="this_month" ${bookingFilter.datePreset === 'this_month' ? 'selected' : ''}>Tháng này</option>
                  <option value="custom" ${bookingFilter.datePreset === 'custom' ? 'selected' : ''}>Tùy chọn...</option>
                </select>
              </div>
              <div class="date-inputs-wrap">
                <input type="date" data-booking-date-from value="${bookingFilter.dateFrom}" title="Từ ngày" aria-label="Từ ngày">
                <span class="small muted" style="font-size:12px">–</span>
                <input type="date" data-booking-date-to value="${bookingFilter.dateTo}" title="Đến ngày" aria-label="Đến ngày">
                ${(bookingFilter.dateFrom || bookingFilter.dateTo || bookingFilter.datePreset !== 'all') ? html`
                  <button type="button" class="btn btn-outline btn-sm btn-clear-date" data-booking-clear-date title="Xóa bộ lọc ngày">✕</button>
                ` : ''}
              </div>
            </div>
            <button type="button" class="btn btn-outline btn-sm" data-sync-filtered>☁️ File Excel Cloud & Link Tự Đồng Bộ</button>
            <button type="button" class="btn btn-primary btn-sm" data-export-filtered>⬇ Tải Excel (${filtered.length} đơn)</button>
          </div>
        </div>
        <div class="small muted">
          💡 Công thức minh bạch trên mỗi đơn: <b>Tổng giá trị đơn (100%) = Hoa hồng nền tảng Trạm Hỷ (${feePct}%) + Đối tác thực nhận (${netPct}%)</b>. Cô dâu chú rể được miễn phí 0đ phí bảo chứng.
        </div>
      </div>

      ${filtered.length ? html`
        <div class="card table-wrap">
          <table class="finance-table">
            <thead>
              <tr>
                <th>Mã đơn</th>
                <th>Khách hàng</th>
                <th>Đối tác</th>
                <th>Dịch vụ</th>
                <th>Tổng đơn (100%)</th>
                <th>Hoa hồng (${feePct}%)</th>
                <th>Trả Tiệm (${netPct}%)</th>
                <th>Giữ Escrow</th>
                <th>Hoa hồng Thực thu</th>
                <th>Trạng thái</th>
                <th>Tạo lúc</th>
              </tr>
            </thead>
            <tbody>
              ${paged.items.map((b) => {
                const f = bookingFinance(b);
                return html`
                  <tr>
                    <td><strong>${b.code}</strong></td>
                    <td>${b.contact_name}<div class="small muted">${b.contact_phone}</div></td>
                    <td><strong>${b.vendor?.name ?? '—'}</strong><div class="small muted">${VENDOR_CATEGORY[b.vendor?.category] ?? ''}</div></td>
                    <td>${serviceTitle(b)}</td>
                    <td class="price">${money(f.total)}</td>
                    <td class="fee-cell">${f.isCancelled ? '0đ' : money(f.expectedFee)}</td>
                    <td class="net-cell">${f.isCancelled ? '0đ' : money(f.expectedPartnerNet)}</td>
                    <td>${f.paidEscrow ? html`<strong>${money(f.paidEscrow)}</strong>` : html`<span class="muted">0đ</span>`}</td>
                    <td>${f.earnedFee ? html`<strong class="text-green">${money(f.earnedFee)}</strong><div class="small muted">Đã trả tiệm ${money(f.partnerPaidNet)}</div>` : html`<span class="muted">Chưa giải ngân</span>`}</td>
                    <td>${statusBadge(BOOKING_STATUS, b.status)}</td>
                    <td class="small">${dateTime(b.created_at)}</td>
                  </tr>`;
              })}
            </tbody>
            <tfoot>
              <tr class="finance-total-row">
                <td colspan="4"><strong>TỔNG CỘNG (${filtered.length} đơn đang lọc · Trang ${paged.page}/${paged.totalPages})</strong></td>
                <td class="price"><strong>${money(s.gmv)}</strong></td>
                <td class="fee-cell"><strong>${money(s.expectedFee)}</strong></td>
                <td class="net-cell"><strong>${money(s.expectedPartnerNet)}</strong></td>
                <td><strong>${money(s.paidEscrow)}</strong></td>
                <td><strong class="text-green">${money(s.earnedFee)}</strong></td>
                <td colspan="2"><span class="small muted">Đã trả tiệm: ${money(s.partnerPaidNet)}</span></td>
              </tr>
            </tfoot>
          </table>
        </div>
        ${paginationView({ ...paged, itemLabel: 'đơn' })}` : html`<div class="empty">Không có đơn hàng nào khớp bộ lọc đang chọn.</div>`}
    </div>`);

  bindPaginationEvents(container, {
    onPageChange: (p) => { bookingPagination.page = p; renderBookings(); },
    onPageSizeChange: (sz) => { bookingPagination.pageSize = sz; bookingPagination.page = 1; renderBookings(); },
  });

  container.querySelectorAll('[data-bfilter]').forEach((chip) => chip.addEventListener('click', () => {
    bookingFilter.state = chip.dataset.bfilter;
    bookingPagination.page = 1;
    renderBookings();
  }));
  container.querySelector('[data-category-filter]')?.addEventListener('change', (e) => {
    bookingFilter.category = e.target.value;
    bookingPagination.page = 1;
    renderBookings();
  });
  container.querySelector('[data-vendor-filter]')?.addEventListener('change', (e) => {
    bookingFilter.vendorId = e.target.value;
    bookingPagination.page = 1;
    renderBookings();
  });
  container.querySelector('[data-booking-date-preset]')?.addEventListener('change', (e) => {
    bookingFilter.datePreset = e.target.value;
    const { dateFrom, dateTo } = getDateRangeFromPreset(bookingFilter.datePreset);
    bookingFilter.dateFrom = dateFrom;
    bookingFilter.dateTo = dateTo;
    bookingPagination.page = 1;
    renderBookings();
  });
  container.querySelector('[data-booking-date-from]')?.addEventListener('change', (e) => {
    bookingFilter.dateFrom = e.target.value;
    bookingFilter.datePreset = 'custom';
    bookingPagination.page = 1;
    renderBookings();
  });
  container.querySelector('[data-booking-date-to]')?.addEventListener('change', (e) => {
    bookingFilter.dateTo = e.target.value;
    bookingFilter.datePreset = 'custom';
    bookingPagination.page = 1;
    renderBookings();
  });
  container.querySelector('[data-booking-clear-date]')?.addEventListener('click', () => {
    bookingFilter.datePreset = 'all';
    bookingFilter.dateFrom = '';
    bookingFilter.dateTo = '';
    bookingPagination.page = 1;
    renderBookings();
  });
  container.querySelector('[data-export-filtered]')?.addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
    await exportAdminFinanceExcel(filtered, data.vendors, 'doi-soat-doanh-thu-tram-hy.xlsx', data.aiOrders);
    toast(`Đã xuất file Excel đối soát (${filtered.length} đơn).`, 'success');
  }));
  container.querySelector('[data-sync-filtered]')?.addEventListener('click', () => openAdminCloudSync());
}

function openAdminCloudSync() {
  return openCloudExcelSyncDialog({
    scope: 'admin',
    title: '☁️ File Excel Cloud Cố Định – Đối Soát Toàn Sàn (Admin)',
    getBytes: () => buildAdminFinanceBytes(data.bookings, data.vendors, data.aiOrders),
    onDownloadLocal: () => exportAdminFinanceExcel(data.bookings, data.vendors, 'doi-soat-doanh-thu-tram-hy.xlsx', data.aiOrders),
  });
}

// ---------- ĐƠN GÓI CƯỚC AI (QUẢN LÝ KHÁCH MUA GÓI) ----------
function filterAiOrdersList() {
  return (data.aiOrders || []).filter((o) => {
    if (aiOrderFilter.state !== 'all' && o.status !== aiOrderFilter.state) return false;
    if (aiOrderFilter.planId !== 'all' && o.plan?.id !== aiOrderFilter.planId) return false;
    if (!matchDateFilter(o.created_at, aiOrderFilter)) return false;
    return true;
  });
}

function renderAiOrders() {
  const container = $('#tab-ai-orders');
  if (!container) return;
  const orders = data.aiOrders || [];
  $('#ai-orders-count').textContent = orders.length;

  const filtered = filterAiOrdersList();
  const paged = paginate(filtered, aiOrderPagination.page, aiOrderPagination.pageSize);
  const totalRevenue = orders.filter((o) => o.status === 'paid').reduce((t, o) => t + (o.amount || 0), 0);
  const paidCount = orders.filter((o) => o.status === 'paid').length;
  const pendingCount = orders.filter((o) => o.status === 'pending').length;

  render(container, html`
    <div class="stack" style="gap:14px">
      <div class="card stack" style="padding:14px;gap:12px">
        <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:12px">
          <div class="chips">
            ${[
              ['all', `Tất cả (${orders.length})`],
              ['paid', `Đã kích hoạt (${paidCount})`],
              ['pending', `Chờ thanh toán (${pendingCount})`],
            ].map(([k, lbl]) => html`
              <button type="button" class="chip ${aiOrderFilter.state === k ? 'active' : ''}" data-aifilter="${k}">${lbl}</button>`)}
          </div>
          <div class="row admin-toolbar-actions" style="gap:8px;flex-wrap:wrap;align-items:center">
            <select class="input" style="width:auto;padding:7px 12px;font-size:13px" data-ai-plan-filter aria-label="Lọc theo gói cước">
              <option value="all">Tất cả gói cước</option>
              <option value="pro_bride" ${aiOrderFilter.planId === 'pro_bride' ? 'selected' : ''}>Nàng Thơ Rạng Rỡ (149k)</option>
              <option value="studio_duo" ${aiOrderFilter.planId === 'studio_duo' ? 'selected' : ''}>Cẩm Tú Trọn Đôi (299k)</option>
            </select>
            <div class="date-filter-group">
              <div class="date-preset-row">
                <span class="small muted" style="white-space:nowrap;font-size:12px">📅 Ngày:</span>
                <select class="date-preset-select" data-ai-date-preset aria-label="Khoảng thời gian gói AI">
                  <option value="all" ${aiOrderFilter.datePreset === 'all' ? 'selected' : ''}>Tất cả ngày</option>
                  <option value="today" ${aiOrderFilter.datePreset === 'today' ? 'selected' : ''}>Hôm nay</option>
                  <option value="yesterday" ${aiOrderFilter.datePreset === 'yesterday' ? 'selected' : ''}>Hôm qua</option>
                  <option value="last7" ${aiOrderFilter.datePreset === 'last7' ? 'selected' : ''}>7 ngày qua</option>
                  <option value="last30" ${aiOrderFilter.datePreset === 'last30' ? 'selected' : ''}>30 ngày qua</option>
                  <option value="this_month" ${aiOrderFilter.datePreset === 'this_month' ? 'selected' : ''}>Tháng này</option>
                  <option value="custom" ${aiOrderFilter.datePreset === 'custom' ? 'selected' : ''}>Tùy chọn...</option>
                </select>
              </div>
              <div class="date-inputs-wrap">
                <input type="date" data-ai-date-from value="${aiOrderFilter.dateFrom}" title="Từ ngày" aria-label="Từ ngày">
                <span class="small muted" style="font-size:12px">–</span>
                <input type="date" data-ai-date-to value="${aiOrderFilter.dateTo}" title="Đến ngày" aria-label="Đến ngày">
                ${(aiOrderFilter.dateFrom || aiOrderFilter.dateTo || aiOrderFilter.datePreset !== 'all') ? html`
                  <button type="button" class="btn btn-outline btn-sm btn-clear-date" data-ai-clear-date title="Xóa bộ lọc ngày">✕</button>
                ` : ''}
              </div>
            </div>
            <button type="button" class="btn btn-primary btn-sm" data-export-ai-excel>⬇ Tải Excel (${filtered.length} đơn)</button>
            ${pendingCount > 0 ? html`
              <button type="button" class="btn btn-outline btn-sm" style="color:var(--danger, #c62828); border-color:#f0b2b2" data-clear-pending-orders title="Xóa toàn bộ các đơn đang chờ thanh toán">
                🗑 Dọn sạch ${pendingCount} đơn chờ
              </button>` : ''}
          </div>
        </div>
        <div class="small muted">
          💡 Doanh thu các gói AI Studio nhận trực tiếp vào tài khoản <strong>TPBank 0355521617 (PHUNG DUC ANH)</strong>. Với các đơn chuyển khoản chưa quét tự động, Admin có thể bấm <b>Kích hoạt ngay</b> để duyệt thủ công cho khách.
        </div>
      </div>

      ${filtered.length ? html`
        <div class="card table-wrap">
          <table class="finance-table">
            <thead>
              <tr>
                <th>Mã đơn</th>
                <th>Khách hàng</th>
                <th>Gói cước</th>
                <th>Hạn mức AI</th>
                <th>Tổng đơn</th>
                <th>Thời hạn</th>
                <th>Trạng thái</th>
                <th>Tạo lúc</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              ${paged.items.map((o) => {
                const isPaid = o.status === 'paid';
                return html`
                  <tr data-order-code="${o.code}">
                    <td><strong>${o.code}</strong></td>
                    <td>
                      <strong>${o.user?.full_name || 'Khách vãng lai'}</strong>
                      <div class="small muted">${o.user?.phone || o.user?.email || '—'}</div>
                    </td>
                    <td>
                      <strong>${o.plan?.name || o.plan_id}</strong>
                      ${o.plan?.badge ? html`<div class="small" style="color:var(--brand)">${o.plan.badge}</div>` : ''}
                    </td>
                    <td>
                      <strong style="color:var(--brand)">⚡ ${o.plan?.daily_credits ?? 60} credit/ngày</strong>
                      ${o.plan?.bonus_credits ? html`<div class="small muted">+${o.plan.bonus_credits} credit thưởng</div>` : ''}
                    </td>
                    <td class="price">${money(o.amount)}</td>
                    <td>${o.plan?.duration_days ?? 30} ngày</td>
                    <td>
                      ${isPaid
                        ? html`<span class="badge badge-green">✓ Đã kích hoạt</span>`
                        : o.status === 'pending'
                        ? html`<span class="badge badge-gold">⏳ Chờ thanh toán</span>`
                        : html`<span class="badge badge-gray">Đã hủy</span>`}
                    </td>
                    <td class="small">
                      ${dateTime(o.created_at)}
                      ${o.paid_at ? html`<div class="small muted">Duyệt: ${dateTime(o.paid_at)}</div>` : ''}
                    </td>
                    <td>
                      ${!isPaid && o.status === 'pending' ? html`
                        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
                          <button type="button" class="btn btn-primary btn-sm" data-confirm-order="${o.code}">
                            ✨ Kích hoạt
                          </button>
                          <button type="button" class="btn btn-outline btn-sm" style="color:var(--danger, #c62828);border-color:#f0b2b2;padding:4px 8px" data-delete-order="${o.code}" title="Xóa đơn này">
                            🗑 Xóa
                          </button>
                        </div>` : html`
                        <span class="small muted" style="color:#2e7d32">Hoàn tất</span>`}
                    </td>
                  </tr>`;
              })}
            </tbody>
            <tfoot>
              <tr class="finance-total-row">
                <td colspan="4"><strong>TỔNG CỘNG DOANH THU GÓI AI (${paidCount} đơn đã thanh toán)</strong></td>
                <td class="price"><strong>${money(totalRevenue)}</strong></td>
                <td colspan="4"></td>
              </tr>
            </tfoot>
          </table>
        </div>
        ${paginationView({ ...paged, itemLabel: 'đơn gói AI' })}` : html`<div class="empty">Không có đơn gói AI nào khớp bộ lọc.</div>`}
    </div>`);

  bindPaginationEvents(container, {
    onPageChange: (p) => { aiOrderPagination.page = p; renderAiOrders(); },
    onPageSizeChange: (sz) => { aiOrderPagination.pageSize = sz; aiOrderPagination.page = 1; renderAiOrders(); },
  });

  container.querySelectorAll('[data-aifilter]').forEach((chip) => chip.addEventListener('click', () => {
    aiOrderFilter.state = chip.dataset.aifilter;
    aiOrderPagination.page = 1;
    renderAiOrders();
  }));

  container.querySelector('[data-ai-plan-filter]')?.addEventListener('change', (e) => {
    aiOrderFilter.planId = e.target.value;
    aiOrderPagination.page = 1;
    renderAiOrders();
  });

  container.querySelector('[data-ai-date-preset]')?.addEventListener('change', (e) => {
    aiOrderFilter.datePreset = e.target.value;
    const { dateFrom, dateTo } = getDateRangeFromPreset(aiOrderFilter.datePreset);
    aiOrderFilter.dateFrom = dateFrom;
    aiOrderFilter.dateTo = dateTo;
    aiOrderPagination.page = 1;
    renderAiOrders();
  });
  container.querySelector('[data-ai-date-from]')?.addEventListener('change', (e) => {
    aiOrderFilter.dateFrom = e.target.value;
    aiOrderFilter.datePreset = 'custom';
    aiOrderPagination.page = 1;
    renderAiOrders();
  });
  container.querySelector('[data-ai-date-to]')?.addEventListener('change', (e) => {
    aiOrderFilter.dateTo = e.target.value;
    aiOrderFilter.datePreset = 'custom';
    aiOrderPagination.page = 1;
    renderAiOrders();
  });
  container.querySelector('[data-ai-clear-date]')?.addEventListener('click', () => {
    aiOrderFilter.datePreset = 'all';
    aiOrderFilter.dateFrom = '';
    aiOrderFilter.dateTo = '';
    aiOrderPagination.page = 1;
    renderAiOrders();
  });

  container.querySelector('[data-export-ai-excel]')?.addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
    await exportAiOrdersExcel(filtered);
    toast(`Đã xuất file Excel đơn gói AI (${filtered.length} đơn).`, 'success');
  }));

  container.querySelectorAll('[data-confirm-order]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const code = btn.dataset.confirmOrder;
      const done = await openDialog({
        title: `Kích hoạt gói cước cho đơn ${code}?`,
        confirmText: 'Kích hoạt ngay',
        content: html`<p>Xác nhận bạn đã nhận đủ tiền chuyển khoản qua TPBank (0355521617) cho đơn này. Hạn mức credit của khách hàng sẽ được mở khóa ngay lập tức.</p>`,
      });
      if (!done) return;
      withBusy(btn, async () => {
        try {
          await adminConfirmSubscriptionOrder(code);
          toast(`Đã kích hoạt thành công đơn ${code}!`, 'success');
          load();
        } catch (err) {
          toastError(err);
        }
      });
    });
  });

  container.querySelectorAll('[data-delete-order]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const code = btn.dataset.deleteOrder;
      const done = await openDialog({
        title: `Xóa đơn hàng ${code}?`,
        confirmText: 'Xác nhận xóa',
        content: html`<p>Đơn hàng này chưa thanh toán. Bạn có chắc chắn muốn xóa bản ghi này khỏi cơ sở dữ liệu không?</p>`,
      });
      if (!done) return;
      withBusy(btn, async () => {
        try {
          await adminDeleteSubscriptionOrder(code);
          toast(`Đã xóa đơn ${code}!`, 'success');
          load();
        } catch (err) {
          toastError(err);
        }
      });
    });
  });

  container.querySelector('[data-clear-pending-orders]')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const done = await openDialog({
      title: `Dọn sạch ${pendingCount} đơn chờ thanh toán?`,
      confirmText: 'Xóa toàn bộ',
      content: html`<p>Tất cả các đơn hàng chưa thanh toán sẽ được xóa sạch khỏi cơ sở dữ liệu. Thao tác này không thể hoàn tác.</p>`,
    });
    if (!done) return;
    withBusy(btn, async () => {
      try {
        await adminClearPendingSubscriptionOrders();
        toast(`Đã dọn sạch ${pendingCount} đơn chờ thanh toán!`, 'success');
        load();
      } catch (err) {
        toastError(err);
      }
    });
  });
}

// ---------- THỬ VÁY AI ----------
// Công tắc Bật/Tắt toàn bộ thử váy AI + Mô hình Siêu nét (bật lúc review/demo) + hạn mức credit. Edge Function đọc lại ngay.
async function renderAiSettings() {
  const container = $('#tab-ai');
  const settings = await getTryonSettings();
  const isEnabled = settings.enabled !== false;

  render(container, html`
    <form class="card stack" style="max-width:640px" id="ai-settings">
      <div class="row" style="justify-content:space-between;align-items:center">
        <h3 style="margin:0">Thử váy bằng AI (FASHN)</h3>
        <span class="badge ${isEnabled ? 'badge-green' : 'badge-red'}">
          ${isEnabled ? '🟢 Đang hoạt động' : '🔴 Đang tạm dừng'}
        </span>
      </div>

      ${settings.ready ? '' : html`
        <div class="notice notice-error" role="alert">
          <strong>Database chưa có phần cài đặt này</strong>
          Mở Supabase → SQL Editor, chạy file <code>backend/supabase/28_tryon_settings.sql</code> rồi tải lại trang.
          Trong lúc chờ, web dùng mô hình Tiêu chuẩn và 6 credit/người/ngày.
        </div>`}

      <div class="card stack" style="background:${isEnabled ? 'rgba(46, 125, 50, 0.05)' : 'rgba(211, 47, 47, 0.06)'};padding:14px;border:1px solid ${isEnabled ? 'rgba(46, 125, 50, 0.25)' : 'rgba(211, 47, 47, 0.3)'};border-radius:10px;gap:8px">
        <label class="row" style="cursor:pointer;gap:12px;align-items:flex-start">
          <input type="checkbox" name="enabled" ${isEnabled ? 'checked' : ''} ${settings.ready ? '' : 'disabled'} style="width:20px;height:20px;margin-top:2px;accent-color:var(--brand)">
          <div>
            <strong style="font-size:15px;color:${isEnabled ? '#2e7d32' : '#c62828'}">
              ${isEnabled ? 'Bật tính năng Thử Váy AI cho toàn bộ người dùng' : 'ĐÃ TẮT: Tạm ngưng tính năng Thử Váy AI (Chống ngốn token)'}
            </strong>
            <p class="small muted" style="margin:4px 0 0">
              ${isEnabled
                ? 'Tính năng đang mở cho khách thử nghiệm bình thường. Bỏ tích ô này nếu bạn muốn tạm dừng để bảo vệ token API khi lượng truy cập tăng đột biến.'
                : 'Hệ thống đang chặn toàn bộ lượt gọi AI (FASHN & Gemini) đối với người dùng thường. Bạn có thể bật lại bất cứ lúc nào.'}
            </p>
          </div>
        </label>
      </div>

      <label class="row" style="cursor:pointer">
        <input type="checkbox" name="maxEnabled" ${settings.maxEnabled ? 'checked' : ''} ${settings.ready ? '' : 'disabled'}>
        <strong>Bật mô hình Siêu nét (Max) cho người dùng</strong>
      </label>
      <p class="small muted" style="margin:0">Siêu nét là mô hình FASHN dùng trên chính web của họ: ảnh đẹp, giống thật, ướm được cả
        ảnh selfie và váy xòe phồng – tốn 1–3 credit mỗi ảnh (Tiêu chuẩn luôn 1 credit). Bật lên thì Phòng thử tự dùng Siêu nét;
        nên chỉ bật lúc review / demo rồi tắt.</p>

      <label class="field"><span>Hạn mức mỗi người mỗi ngày (credit)</span>
        <input class="input" type="number" name="dailyCredits" min="1" max="50" required value="${settings.dailyCredits}"
               style="max-width:160px"></label>
      <p class="small muted" style="margin:0">VD 6 credit = 6 ảnh Tiêu chuẩn, hoặc 2 ảnh Siêu nét "Đẹp nhất".
        Người dùng chọn chất lượng / số ảnh, web tự trừ đúng số credit.</p>

      <div class="row">
        <button class="btn btn-primary btn-sm" type="submit" ${settings.ready ? '' : 'disabled'}>Lưu cài đặt</button>
      </div>
    </form>`);

  const form = $('#ai-settings');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    withBusy(form.querySelector('[type=submit]'), async () => {
      try {
        const formData = new FormData(form);
        const enabled = formData.has('enabled');
        const maxEnabled = formData.has('maxEnabled');
        const dailyCredits = Number(formData.get('dailyCredits'));
        await saveTryonSettings({ enabled, maxEnabled, dailyCredits });
        toast(enabled
          ? (maxEnabled ? 'Đã lưu – Thử AI đang BẬT (kèm Siêu nét).' : 'Đã lưu – Thử AI đang BẬT.')
          : 'Đã lưu – ĐÃ TẮT tính năng Thử AI để bảo vệ token.', 'success');
        renderAiSettings();
      } catch (error) {
        toastError(error);
      }
    });
  });
}

function initTabs() {
  for (const tab of $$('[data-tab]')) {
    tab.addEventListener('click', () => {
      for (const t of $$('[data-tab]')) t.classList.toggle('active', t === tab);
      for (const name of ['approvals', 'disputes', 'vendors', 'bookings', 'ai-orders', 'ai']) $(`#tab-${name}`).hidden = name !== tab.dataset.tab;
    });
  }
}

// ---------- KHỞI CHẠY TRANG ----------
initTabs();                    // gắn sự kiện tab ngay, không chờ kiểm tra đăng nhập (bấm sớm vẫn ăn)
$('#btn-export-admin')?.addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
  await exportAdminFinanceExcel(data.bookings, data.vendors, 'doi-soat-doanh-thu-tram-hy.xlsx', data.aiOrders);
  toast('Đã tải file Excel đối soát doanh thu & hoa hồng toàn sàn (kèm Sheet Đơn gói AI).', 'success');
}));
$('#btn-live-sync')?.addEventListener('click', () => openAdminCloudSync());
// Đến từ chuông thông báo (admin.html?tab=disputes) → mở đúng tab
document.querySelector(`[data-tab="${new URLSearchParams(location.search).get('tab')}"]`)?.click();
await initLayout('admin');
await requireAuth(['admin']);
await Promise.all([load(), renderAiSettings().catch(toastError)]);
const reload = debounce(load, 500);
subscribeBookingChanges('admin-bookings', reload);
subscribeVendorChanges('admin-vendors', reload);
subscribeSubscriptionOrderChanges('admin-ai-orders', reload);
