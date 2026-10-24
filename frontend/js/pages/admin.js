import { initLayout } from '../core/layout.js';
import { requireAuth } from '../core/auth.js';
import { $, $$, html, render, money, dateTime, debounce } from '../core/utils.js';
import { BOOKING_STATUS, BOOKING_TYPE, VENDOR_CATEGORY, VENDOR_STATUS, badge, statusBadge } from '../core/labels.js';
import { openDialog, toast, toastError, withBusy } from '../core/ui.js';
import { PLATFORM_FEE_RATE } from '../config.js';
import {
  bookingFinance, summarizeBookingsFinance, serviceTitle, exportAdminFinanceExcel, openLiveSpreadsheetSyncDialog,
} from '../components/finance-export.js';
import { listAllBookings, subscribeBookingChanges } from '../services/bookings.js';
import { subscribeVendorChanges } from '../services/catalog.js';
import {
  listOpenDisputes, resolveDispute, listVendorsWithOwners, setVendorVerified, linkVendorOwner, reviewVendor,
} from '../services/admin.js';
import { getTryonSettings, saveTryonSettings } from '../services/tryon-ai.js';

const data = { bookings: [], disputes: [], vendors: [] };
const bookingFilter = { state: 'all', vendorId: 'all' };

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
  const s = summarizeBookingsFinance(data.bookings);
  const feePct = Math.round(PLATFORM_FEE_RATE * 100);
  const netPct = 100 - feePct;
  const pendingVendors = data.vendors.filter((v) => v.status === 'pending').length;
  const stats = [
    ['Tổng giao dịch (GMV 100%)', money(s.gmv), `${s.activeCount}/${s.totalCount} đơn hiệu lực`],
    [`Hoa hồng Sàn dự kiến (${feePct}%)`, money(s.expectedFee), `Tính trên ${s.activeCount} đơn hiệu lực`],
    [`Hoa hồng Sàn thực thu (${feePct}%)`, money(s.earnedFee), `Từ ${money(s.releasedGross)} đã giải ngân`],
    ['Đang giữ hộ trong Escrow', money(s.paidEscrow), `Sẽ trả tiệm ${money(s.partnerEscrowNet)} (${netPct}%)`],
    [`Đã trả Đối tác (${netPct}%)`, money(s.partnerPaidNet), `${s.completedCount} đơn hoàn tất trọn vẹn`],
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

// ---------- TẤT CẢ ĐƠN & ĐỐI SOÁT HOA HỒNG ----------
function filterBookingsList() {
  return data.bookings.filter((b) => {
    const f = bookingFinance(b);
    if (bookingFilter.vendorId !== 'all' && String(b.vendor_id || b.vendor?.id) !== bookingFilter.vendorId) return false;
    if (bookingFilter.state === 'escrow') return f.paidEscrow > 0;
    if (bookingFilter.state === 'released') return f.releasedGross > 0;
    if (bookingFilter.state === 'pending') return b.status === 'pending';
    if (bookingFilter.state === 'cancelled') return f.isCancelled;
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
  const s = summarizeBookingsFinance(filtered);
  const feePct = Math.round(PLATFORM_FEE_RATE * 100);
  const netPct = 100 - feePct;

  const vendorOptions = [...new Map(
    data.bookings.filter((b) => b.vendor).map((b) => [String(b.vendor_id || b.vendor.id), b.vendor.name]),
  ).entries()];

  render(container, html`
    <div class="stack" style="gap:14px">
      <div class="card stack" style="padding:14px;gap:12px">
        <div class="row" style="justify-content:space-between">
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
          <div class="row" style="gap:8px">
            <select class="input" style="width:auto;padding:7px 12px;font-size:13px" data-vendor-filter aria-label="Lọc theo tiệm đối tác">
              <option value="all">Tất cả đối tác (${vendorOptions.length})</option>
              ${vendorOptions.map(([id, name]) => html`<option value="${id}" ${bookingFilter.vendorId === id ? 'selected' : ''}>${name}</option>`)}
            </select>
            <button type="button" class="btn btn-outline btn-sm" data-sync-filtered>🔄 Đồng bộ Sheets</button>
            <button type="button" class="btn btn-primary btn-sm" data-export-filtered>⬇ Xuất Excel (${filtered.length} đơn)</button>
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
              ${filtered.map((b) => {
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
                <td colspan="4"><strong>TỔNG CỘNG (${filtered.length} đơn đang lọc)</strong></td>
                <td class="price"><strong>${money(s.gmv)}</strong></td>
                <td class="fee-cell"><strong>${money(s.expectedFee)}</strong></td>
                <td class="net-cell"><strong>${money(s.expectedPartnerNet)}</strong></td>
                <td><strong>${money(s.paidEscrow)}</strong></td>
                <td><strong class="text-green">${money(s.earnedFee)}</strong></td>
                <td colspan="2"><span class="small muted">Đã trả tiệm: ${money(s.partnerPaidNet)}</span></td>
              </tr>
            </tfoot>
          </table>
        </div>` : html`<div class="empty">Không có đơn hàng nào khớp bộ lọc đang chọn.</div>`}
    </div>`);

  container.querySelectorAll('[data-bfilter]').forEach((chip) => chip.addEventListener('click', () => {
    bookingFilter.state = chip.dataset.bfilter;
    renderBookings();
  }));
  container.querySelector('[data-vendor-filter]')?.addEventListener('change', (e) => {
    bookingFilter.vendorId = e.target.value;
    renderBookings();
  });
  container.querySelector('[data-export-filtered]')?.addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
    await exportAdminFinanceExcel(filtered, data.vendors);
    toast(`Đã xuất file Excel đối soát (${filtered.length} đơn).`, 'success');
  }));
  container.querySelector('[data-sync-filtered]')?.addEventListener('click', () => openLiveSpreadsheetSyncDialog(filtered));
}

// ---------- THỬ VÁY AI ----------
// Công tắc mô hình Siêu nét (bật lúc review/demo) + hạn mức credit mỗi người mỗi ngày. Edge Function đọc lại ngay.
async function renderAiSettings() {
  const container = $('#tab-ai');
  const settings = await getTryonSettings();
  render(container, html`
    <form class="card stack" style="max-width:640px" id="ai-settings">
      <h3>Thử váy bằng AI (FASHN)</h3>
      ${settings.ready ? '' : html`
        <div class="notice notice-error" role="alert">
          <strong>Database chưa có phần cài đặt này</strong>
          Mở Supabase → SQL Editor, chạy file <code>backend/supabase/28_tryon_settings.sql</code> rồi tải lại trang.
          Trong lúc chờ, web dùng mô hình Tiêu chuẩn và 6 credit/người/ngày.
        </div>`}
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
      <div class="row"><button class="btn btn-primary btn-sm" type="submit" ${settings.ready ? '' : 'disabled'}>Lưu cài đặt</button></div>
    </form>`);
  const form = $('#ai-settings');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    withBusy(form.querySelector('[type=submit]'), async () => {
      try {
        const formData = new FormData(form);
        await saveTryonSettings({ maxEnabled: formData.has('maxEnabled'), dailyCredits: Number(formData.get('dailyCredits')) });
        toast(formData.has('maxEnabled') ? 'Đã lưu – Siêu nét đang BẬT.' : 'Đã lưu – Siêu nét đang tắt.', 'success');
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
      for (const name of ['approvals', 'disputes', 'vendors', 'bookings', 'ai']) $(`#tab-${name}`).hidden = name !== tab.dataset.tab;
    });
  }
}

// ---------- KHỞI CHẠY TRANG ----------
initTabs();                    // gắn sự kiện tab ngay, không chờ kiểm tra đăng nhập (bấm sớm vẫn ăn)
$('#btn-export-admin')?.addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
  await exportAdminFinanceExcel(data.bookings, data.vendors);
  toast('Đã tải file Excel đối soát doanh thu & hoa hồng toàn sàn.', 'success');
}));
$('#btn-live-sync')?.addEventListener('click', () => openLiveSpreadsheetSyncDialog(data.bookings));
// Đến từ chuông thông báo (admin.html?tab=disputes) → mở đúng tab
document.querySelector(`[data-tab="${new URLSearchParams(location.search).get('tab')}"]`)?.click();
await initLayout('admin');
await requireAuth(['admin']);
await Promise.all([load(), renderAiSettings().catch(toastError)]);
const reload = debounce(load, 500);
subscribeBookingChanges('admin-bookings', reload);
subscribeVendorChanges('admin-vendors', reload);
