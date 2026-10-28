// Tính toán minh bạch dòng tiền Escrow – Hoa hồng sàn (10%) – Thực nhận đối tác (90%),
// Xuất báo cáo đối soát Excel (.xlsx) và Quản lý File Excel Cố định trên Đám mây (Cloud Auto-Sync) cho từng tài khoản.
import { html, render, money } from '../core/utils.js';
import { BOOKING_STATUS, BOOKING_TYPE, VENDOR_CATEGORY, MILESTONE_STATUS } from '../core/labels.js';
import { openDialog, toast, toastError, withBusy } from '../core/ui.js';
import { PLATFORM_FEE_RATE } from '../config.js';
import {
  getAccountExcelLinks, uploadAccountCloudXlsx, rotateAccountExcelLinks,
} from '../services/excel-sync.js';

const XLSX_SRC = new URL('../vendor/xlsx-0.20.3.mini.min.js', import.meta.url).href;
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MONEY = '#,##0"đ"';
const DATE_TIME = 'dd/mm/yyyy hh:mm';

let loading = null;
function loadXlsx() {
  if (window.XLSX?.utils) return Promise.resolve(window.XLSX);
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = XLSX_SRC;
    script.async = true;
    script.onload = () => (window.XLSX?.utils ? resolve(window.XLSX) : reject(new Error('Không mở được công cụ xuất Excel')));
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error('Không tải được công cụ xuất Excel – kiểm tra kết nối mạng rồi thử lại'));
    };
    document.head.append(script);
  });
  return loading;
}

const serial = (y, m, d, hh = 0, mm = 0) => (Date.UTC(y, m - 1, d, hh, mm) - Date.UTC(1899, 11, 30)) / 86_400_000;
const moneyCell = (n) => ({ t: 'n', v: Math.round(Number(n) || 0), z: MONEY });
const formulaCell = (f, value) => ({ t: 'n', f, v: Math.round(Number(value) || 0), z: MONEY });
const subtotal = (col, from, to, value) => formulaCell(`SUBTOTAL(9,${col}${from}:${col}${to})`, value);
const dateCell = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return {
    t: 'n',
    v: serial(d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()),
    z: DATE_TIME,
  };
};

/**
 * Tính toán đầy đủ các con số tài chính của 1 đơn hàng:
 * - total (100%): Tổng giá trị đơn khách đặt
 * - expectedFee (10%): Hoa hồng sàn Trạm Hỷ trên tổng đơn
 * - expectedPartnerNet (90%): Số tiền đối tác thực nhận trên tổng đơn
 * - paidEscrow: Tiền khách đã đóng đang giữ trong ví Escrow
 * - releasedGross: Tổng tiền các đợt đã giải ngân (100%)
 * - earnedFee (10%): Hoa hồng sàn thực thu từ các đợt đã giải ngân
 * - partnerPaidNet (90%): Tiền thực tế đã chuyển về đối tác sau khi trừ 10%
 * - partnerEscrowNet (90%): Tiền sẽ chuyển về đối tác từ khoản đang giữ trong Escrow
 */
export function bookingFinance(booking) {
  const isCancelled = ['cancelled', 'refunded'].includes(booking.status);
  const total = Math.round(Number(booking.total_price) || 0);
  const expectedFee = isCancelled ? 0 : Math.round(total * PLATFORM_FEE_RATE);
  const expectedPartnerNet = isCancelled ? 0 : total - expectedFee;

  const milestones = booking.milestones || [];
  const paidEscrow = milestones.filter((m) => m.status === 'paid').reduce((s, m) => s + (m.amount || 0), 0);
  const releasedGross = milestones.filter((m) => m.status === 'released').reduce((s, m) => s + (m.amount || 0), 0);
  const collected = paidEscrow + releasedGross;

  const earnedFee = Math.round(releasedGross * PLATFORM_FEE_RATE);
  const partnerPaidNet = releasedGross - earnedFee;
  const escrowFee = Math.round(paidEscrow * PLATFORM_FEE_RATE);
  const partnerEscrowNet = paidEscrow - escrowFee;
  const unpaid = isCancelled ? 0 : Math.max(0, total - collected);

  return {
    isCancelled,
    feePercent: Math.round(PLATFORM_FEE_RATE * 100),
    partnerPercent: Math.round((1 - PLATFORM_FEE_RATE) * 100),
    total,
    expectedFee,
    expectedPartnerNet,
    collected,
    paidEscrow,
    releasedGross,
    earnedFee,
    partnerPaidNet,
    escrowFee,
    partnerEscrowNet,
    unpaid,
  };
}

/** Tổng hợp tài chính của một danh sách đơn hàng */
export function summarizeBookingsFinance(bookings) {
  const res = {
    totalCount: bookings.length,
    activeCount: 0,
    completedCount: 0,
    cancelledCount: 0,
    gmv: 0,
    expectedFee: 0,
    expectedPartnerNet: 0,
    collected: 0,
    paidEscrow: 0,
    releasedGross: 0,
    earnedFee: 0,
    partnerPaidNet: 0,
    partnerEscrowNet: 0,
  };
  for (const b of bookings) {
    const f = bookingFinance(b);
    if (f.isCancelled) {
      res.cancelledCount += 1;
    } else {
      res.activeCount += 1;
      res.gmv += f.total;
      res.expectedFee += f.expectedFee;
      res.expectedPartnerNet += f.expectedPartnerNet;
    }
    if (b.status === 'completed') res.completedCount += 1;
    res.collected += f.collected;
    res.paidEscrow += f.paidEscrow;
    res.releasedGross += f.releasedGross;
    res.earnedFee += f.earnedFee;
    res.partnerPaidNet += f.partnerPaidNet;
    res.partnerEscrowNet += f.partnerEscrowNet;
  }
  return res;
}

export function serviceTitle(b) {
  const base = b.dress?.name || b.details?.package?.name || BOOKING_TYPE[b.type] || 'Dịch vụ cưới';
  return b.details?.tables ? `${base} (${b.details.tables} bàn)` : base;
}

/** Khung hiển thị minh bạch 4 chỉ số (Tổng đơn 100% – Hoa hồng sàn 10% – Tiệm thực nhận 90% – Ví Escrow) trên thẻ đơn */
export function bookingFinanceBreakdownView(booking) {
  const f = bookingFinance(booking);
  return html`
    <div class="booking-finance-strip">
      <div class="bf-cell">
        <span class="bf-label">Giá trị đơn (100%)</span>
        <strong class="bf-val">${money(f.total)}</strong>
      </div>
      <div class="bf-cell is-fee">
        <span class="bf-label">Hoa hồng sàn (${f.feePercent}%)</span>
        <strong class="bf-val">−${money(f.expectedFee)}</strong>
      </div>
      <div class="bf-cell is-net">
        <span class="bf-label">Tiệm thực nhận (${f.partnerPercent}%)</span>
        <strong class="bf-val">${money(f.expectedPartnerNet)}</strong>
      </div>
      <div class="bf-cell is-escrow">
        <span class="bf-label">Tiến độ ví Escrow</span>
        <span class="bf-sub">
          Giữ hộ: <b>${money(f.paidEscrow)}</b> (nhận ${money(f.partnerEscrowNet)}) · Đã về: <b class="text-green">${money(f.partnerPaidNet)}</b>
        </span>
      </div>
    </div>`;
}

function downloadBytes(bytes, filename) {
  const url = URL.createObjectURL(new Blob([bytes], { type: XLSX_MIME }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// ---------- 1. DỰNG WORKBOOK & XUẤT EXCEL ĐỐI SOÁT SÀN (ADMIN) ----------
export async function buildAdminFinanceBytes(bookings, vendors = [], aiOrders = []) {
  const XLSX = await loadXlsx();
  const wb = XLSX.utils.book_new();
  wb.Props = { Title: 'Đối soát Doanh thu & Hoa hồng – Trạm Hỷ', Author: 'Trạm Hỷ', CreatedDate: new Date() };

  const s = summarizeBookingsFinance(bookings);
  const feePct = Math.round(PLATFORM_FEE_RATE * 100);
  const netPct = 100 - feePct;

  const aiPaidOrders = (aiOrders || []).filter((o) => o.status === 'paid');
  const aiTotalPaidRevenue = aiPaidOrders.reduce((sum, o) => sum + (Number(o.amount) || 0), 0);

  const overviewRows = [
    ['BÁO CÁO ĐỐI SOÁT DOANH THU & HOA HỒNG NỀN TẢNG – TRẠM HỶ'],
    ['Xuất báo cáo lúc', dateCell(new Date().toISOString())],
    ['Tỷ lệ hoa hồng sàn áp dụng', `${feePct}% / đơn thành công (Miễn phí 0đ cho Cô dâu Chú rể)`],
    [],
    ['1. THỐNG KÊ ĐƠN HÀNG DỊCH VỤ CƯỚI', 'Số lượng'],
    ['Tổng số đơn trên hệ thống', s.totalCount],
    ['Đơn đang hiệu lực (tính doanh số)', s.activeCount],
    ['Đơn đã hoàn tất trọn vẹn', s.completedCount],
    ['Đơn đã hủy / hoàn cọc', s.cancelledCount],
    [],
    ['2. DÒNG TIỀN TỔNG QUAN (THEO TỔNG ĐƠN HIỆU LỰC)', 'Số tiền'],
    ['Tổng giá trị giao dịch toàn sàn (GMV – 100%)', moneyCell(s.gmv)],
    [`Tổng Hoa hồng Sàn dự kiến (${feePct}% GMV)`, moneyCell(s.expectedFee)],
    [`Tổng Doanh thu Đối tác được hưởng (${netPct}% GMV)`, moneyCell(s.expectedPartnerNet)],
    [],
    ['3. DÒNG TIỀN THỰC TẾ (ESCROW & GIẢI NGÂN)', 'Số tiền'],
    ['Tổng tiền khách đã nộp vào hệ thống', moneyCell(s.collected)],
    ['Đang giữ hộ trong ví Escrow (chưa giải ngân)', moneyCell(s.paidEscrow)],
    [`→ Phần sẽ trả cho Đối tác từ Escrow (${netPct}%)`, moneyCell(s.partnerEscrowNet)],
    [`→ Phần Hoa hồng Sàn nằm trong Escrow (${feePct}%)`, moneyCell(s.paidEscrow - s.partnerEscrowNet)],
    ['Tổng tiền các đợt đã giải ngân (Gộp 100%)', moneyCell(s.releasedGross)],
    [`→ HOA HỒNG SÀN ĐÃ THU THỰC TẾ (${feePct}% đã giải ngân)`, moneyCell(s.earnedFee)],
    [`→ ĐÃ CHUYỂN TRẢ ĐỐI TÁC (${netPct}% đã giải ngân)`, moneyCell(s.partnerPaidNet)],
    [],
    ['4. DOANH THU GÓI CƯỚC AI STUDIO (100% VỀ SÀN TRẠM HỶ)', 'Số tiền / Số lượng'],
    ['Tổng đơn đăng ký gói AI', (aiOrders || []).length],
    ['Đơn gói AI đã kích hoạt / thanh toán', aiPaidOrders.length],
    ['TỔNG DOANH THU GÓI AI THỰC THU', moneyCell(aiTotalPaidRevenue)],
  ];
  const wsOverview = XLSX.utils.aoa_to_sheet(overviewRows);
  wsOverview['!cols'] = [{ wch: 48 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, wsOverview, 'Tổng hợp Sàn');

  const orderHeader = [
    'Mã đơn', 'Ngày tạo', 'Khách hàng', 'Số điện thoại', 'Tiệm đối tác', 'Ngành dịch vụ',
    'Chi tiết dịch vụ / Mẫu váy', 'Trạng thái đơn',
    'Tổng giá trị đơn (100%)', `Hoa hồng Sàn (${feePct}%)`, `Đối tác hưởng (${netPct}%)`,
    'Khách đã đóng', 'Đang giữ Escrow', 'Đã giải ngân (100%)',
    `Hoa hồng Thực thu (${feePct}%)`, `Đã trả Đối tác (${netPct}%)`,
  ];
  const orderRows = [orderHeader];
  bookings.forEach((b, idx) => {
    const r = idx + 2;
    const f = bookingFinance(b);
    orderRows.push([
      b.code,
      dateCell(b.created_at),
      b.contact_name || '',
      b.contact_phone || '',
      b.vendor?.name || '',
      VENDOR_CATEGORY[b.vendor?.category] || '',
      serviceTitle(b),
      BOOKING_STATUS[b.status]?.label || b.status,
      moneyCell(f.total),
      f.isCancelled ? moneyCell(0) : formulaCell(`ROUND(I${r}*${PLATFORM_FEE_RATE},0)`, f.expectedFee),
      f.isCancelled ? moneyCell(0) : formulaCell(`I${r}-J${r}`, f.expectedPartnerNet),
      moneyCell(f.collected),
      moneyCell(f.paidEscrow),
      moneyCell(f.releasedGross),
      formulaCell(`ROUND(N${r}*${PLATFORM_FEE_RATE},0)`, f.earnedFee),
      formulaCell(`N${r}-O${r}`, f.partnerPaidNet),
    ]);
  });
  const endRow = orderRows.length;
  if (bookings.length) {
    orderRows.push([
      'TỔNG CỘNG (TỰ ĐỘNG THEO BỘ LỌC)', '', '', '', '', '', '', '',
      subtotal('I', 2, endRow, s.gmv),
      subtotal('J', 2, endRow, s.expectedFee),
      subtotal('K', 2, endRow, s.expectedPartnerNet),
      subtotal('L', 2, endRow, s.collected),
      subtotal('M', 2, endRow, s.paidEscrow),
      subtotal('N', 2, endRow, s.releasedGross),
      subtotal('O', 2, endRow, s.earnedFee),
      subtotal('P', 2, endRow, s.partnerPaidNet),
    ]);
  }
  const wsOrders = XLSX.utils.aoa_to_sheet(orderRows);
  wsOrders['!cols'] = [
    { wch: 16 }, { wch: 17 }, { wch: 22 }, { wch: 14 }, { wch: 26 }, { wch: 16 },
    { wch: 30 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 16 },
    { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 18 },
  ];
  if (bookings.length) wsOrders['!autofilter'] = { ref: `A1:P${endRow}` };
  XLSX.utils.book_append_sheet(wb, wsOrders, 'Hoa hồng từng Đơn');

  const byVendor = new Map();
  for (const v of vendors) {
    byVendor.set(v.id, {
      name: v.name,
      category: VENDOR_CATEGORY[v.category] || '',
      owner: v.owner?.full_name || '',
      phone: v.phone || v.owner?.phone || '',
      orders: [],
    });
  }
  for (const b of bookings) {
    const vid = b.vendor_id || b.vendor?.id || b.vendor?.name;
    if (!byVendor.has(vid)) {
      byVendor.set(vid, {
        name: b.vendor?.name || 'Đối tác',
        category: VENDOR_CATEGORY[b.vendor?.category] || '',
        owner: '',
        phone: '',
        orders: [],
      });
    }
    byVendor.get(vid).orders.push(b);
  }
  const vendorRows = [[
    'Tiệm đối tác', 'Ngành dịch vụ', 'Chủ tiệm', 'Điện thoại', 'Số đơn hiệu lực',
    'Tổng doanh số (100%)', `Hoa hồng Sàn (${feePct}%)`, `Tiệm được hưởng (${netPct}%)`,
    'Đang giữ trong Escrow', `Sẽ trả Tiệm từ Escrow (${netPct}%)`, `Đã giải ngân cho Tiệm (${netPct}%)`,
  ]];
  for (const v of byVendor.values()) {
    if (!v.orders.length) continue;
    const vs = summarizeBookingsFinance(v.orders);
    vendorRows.push([
      v.name, v.category, v.owner, v.phone, vs.activeCount,
      moneyCell(vs.gmv), moneyCell(vs.expectedFee), moneyCell(vs.expectedPartnerNet),
      moneyCell(vs.paidEscrow), moneyCell(vs.partnerEscrowNet), moneyCell(vs.partnerPaidNet),
    ]);
  }
  const wsVendors = XLSX.utils.aoa_to_sheet(vendorRows);
  wsVendors['!cols'] = [
    { wch: 28 }, { wch: 16 }, { wch: 20 }, { wch: 14 }, { wch: 15 },
    { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 22 }, { wch: 22 },
  ];
  if (vendorRows.length > 1) wsVendors['!autofilter'] = { ref: `A1:K${vendorRows.length}` };
  XLSX.utils.book_append_sheet(wb, wsVendors, 'Công nợ theo Đối tác');

  const msRows = [[
    'Mã đơn', 'Tiệm đối tác', 'Khách hàng', 'Đợt', 'Tỷ lệ %', 'Nội dung đợt',
    'Số tiền đợt (100%)', `Hoa hồng Sàn (${feePct}%)`, `Tiệm thực nhận (${netPct}%)`, 'Trạng thái đợt',
  ]];
  for (const b of bookings) {
    const msList = [...(b.milestones || [])].sort((a, m) => (a.stage ?? 0) - (m.stage ?? 0));
    for (const m of msList) {
      const amt = Math.round(Number(m.amount) || 0);
      const fee = Math.round(amt * PLATFORM_FEE_RATE);
      msRows.push([
        b.code,
        b.vendor?.name || '',
        b.contact_name || '',
        `Đợt ${m.stage}`,
        `${m.percent}%`,
        m.title || '',
        moneyCell(amt),
        moneyCell(fee),
        moneyCell(amt - fee),
        MILESTONE_STATUS[m.status]?.label || m.status,
      ]);
    }
  }
  const wsMs = XLSX.utils.aoa_to_sheet(msRows);
  wsMs['!cols'] = [
    { wch: 16 }, { wch: 26 }, { wch: 22 }, { wch: 10 }, { wch: 10 },
    { wch: 24 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 },
  ];
  if (msRows.length > 1) wsMs['!autofilter'] = { ref: `A1:J${msRows.length}` };
  XLSX.utils.book_append_sheet(wb, wsMs, 'Đợt thanh toán 30-50-20');

  // Sheet 5: Đơn mua gói cước AI Studio (100% doanh thu về sàn Trạm Hỷ)
  const aiHeader = [
    'Mã đơn', 'Ngày tạo', 'Khách hàng', 'Số điện thoại', 'Email',
    'Gói cước AI', 'Thời hạn (ngày)', 'Hạn mức (credit/ngày)', 'Giá gói (100% sàn)',
    'Trạng thái', 'Ngày kích hoạt',
  ];
  const aiRows = [aiHeader];
  for (const o of (aiOrders || [])) {
    const isPaid = o.status === 'paid';
    const amt = Number(o.amount) || 0;
    aiRows.push([
      o.code,
      dateCell(o.created_at),
      o.user?.full_name || 'Khách vãng lai',
      o.user?.phone || '',
      o.user?.email || '',
      o.plan?.name || o.plan_id || '',
      o.plan?.duration_days ?? 30,
      o.plan?.daily_credits ?? 60,
      moneyCell(amt),
      isPaid ? 'Đã kích hoạt' : (o.status === 'pending' ? 'Chờ thanh toán' : 'Đã hủy'),
      dateCell(o.paid_at),
    ]);
  }
  const endAiRow = aiRows.length;
  if ((aiOrders || []).length) {
    aiRows.push([
      `TỔNG DOANH THU ĐÃ THU (${aiPaidOrders.length} đơn)`, '', '', '', '', '', '', '',
      subtotal('I', 2, endAiRow, aiTotalPaidRevenue),
      '', '',
    ]);
  }
  const wsAiOrders = XLSX.utils.aoa_to_sheet(aiRows);
  wsAiOrders['!cols'] = [
    { wch: 18 }, { wch: 17 }, { wch: 22 }, { wch: 14 }, { wch: 26 },
    { wch: 22 }, { wch: 15 }, { wch: 22 }, { wch: 20 }, { wch: 18 }, { wch: 17 },
  ];
  if ((aiOrders || []).length) wsAiOrders['!autofilter'] = { ref: `A1:K${endAiRow}` };
  XLSX.utils.book_append_sheet(wb, wsAiOrders, 'Đơn gói cước AI');

  return new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true }));
}

export async function exportAdminFinanceExcel(bookings, vendors = [], filename = 'doi-soat-doanh-thu-tram-hy.xlsx', aiOrders = []) {
  const bytes = await buildAdminFinanceBytes(bookings, vendors, aiOrders);
  downloadBytes(bytes, filename);
}

/** Xuất file Excel riêng cho danh sách Đơn gói cước AI */
export async function exportAiOrdersExcel(aiOrders = [], filename = 'don-hang-goi-cuoc-ai-tram-hy.xlsx') {
  const XLSX = await loadXlsx();
  const wb = XLSX.utils.book_new();
  wb.Props = { Title: 'Danh sách Đơn mua Gói Cước AI – Trạm Hỷ', Author: 'Trạm Hỷ', CreatedDate: new Date() };

  const aiPaidOrders = (aiOrders || []).filter((o) => o.status === 'paid');
  const aiTotalPaidRevenue = aiPaidOrders.reduce((sum, o) => sum + (Number(o.amount) || 0), 0);

  const aiHeader = [
    'Mã đơn', 'Ngày tạo', 'Khách hàng', 'Số điện thoại', 'Email',
    'Gói cước AI', 'Thời hạn (ngày)', 'Hạn mức (credit/ngày)', 'Giá gói (100% sàn)',
    'Trạng thái', 'Ngày kích hoạt',
  ];
  const aiRows = [aiHeader];
  for (const o of (aiOrders || [])) {
    const isPaid = o.status === 'paid';
    const amt = Number(o.amount) || 0;
    aiRows.push([
      o.code,
      dateCell(o.created_at),
      o.user?.full_name || 'Khách vãng lai',
      o.user?.phone || '',
      o.user?.email || '',
      o.plan?.name || o.plan_id || '',
      o.plan?.duration_days ?? 30,
      o.plan?.daily_credits ?? 60,
      moneyCell(amt),
      isPaid ? 'Đã kích hoạt' : (o.status === 'pending' ? 'Chờ thanh toán' : 'Đã hủy'),
      dateCell(o.paid_at),
    ]);
  }
  const endAiRow = aiRows.length;
  if ((aiOrders || []).length) {
    aiRows.push([
      `TỔNG DOANH THU ĐÃ THU (${aiPaidOrders.length} đơn)`, '', '', '', '', '', '', '',
      subtotal('I', 2, endAiRow, aiTotalPaidRevenue),
      '', '',
    ]);
  }
  const wsAiOrders = XLSX.utils.aoa_to_sheet(aiRows);
  wsAiOrders['!cols'] = [
    { wch: 18 }, { wch: 17 }, { wch: 22 }, { wch: 14 }, { wch: 26 },
    { wch: 22 }, { wch: 15 }, { wch: 22 }, { wch: 20 }, { wch: 18 }, { wch: 17 },
  ];
  if ((aiOrders || []).length) wsAiOrders['!autofilter'] = { ref: `A1:K${endAiRow}` };
  XLSX.utils.book_append_sheet(wb, wsAiOrders, 'Đơn gói cước AI');

  const bytes = new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true }));
  downloadBytes(bytes, filename);
}

// ---------- 2. DỰNG WORKBOOK & XUẤT EXCEL DOANH THU CHO CHỦ TIỆM ĐỐI TÁC ----------
export async function buildPartnerFinanceBytes(bookings, shopName = 'Đối tác Trạm Hỷ') {
  const XLSX = await loadXlsx();
  const wb = XLSX.utils.book_new();
  wb.Props = { Title: `Báo cáo Doanh thu – ${shopName}`, Author: 'Trạm Hỷ', CreatedDate: new Date() };

  const s = summarizeBookingsFinance(bookings);
  const feePct = Math.round(PLATFORM_FEE_RATE * 100);
  const netPct = 100 - feePct;

  const summaryRows = [
    [`BẢNG KÊ DOANH THU & ĐỐI SOÁT HOA HỒNG – ${shopName.toUpperCase()}`],
    ['Xuất lúc', dateCell(new Date().toISOString())],
    ['Chính sách phí nền tảng Trạm Hỷ', `Hoa hồng ${feePct}% khấu trừ khi giải ngân · Tiệm thực nhận ${netPct}% giá trị đơn`],
    [],
    ['CHỈ SỐ TÀI CHÍNH', 'Giá trị'],
    ['Tổng số đơn hàng', s.totalCount],
    ['Số đơn đang hiệu lực', s.activeCount],
    ['Tổng doanh số đặt hàng (100% giá khách đặt)', moneyCell(s.gmv)],
    [`Tổng phí hoa hồng nền tảng Trạm Hỷ (${feePct}%)`, moneyCell(s.expectedFee)],
    [`Tổng doanh thu Tiệm được hưởng (${netPct}%)`, moneyCell(s.expectedPartnerNet)],
    ['Tiền Trạm Hỷ đang giữ hộ trong Escrow (100%)', moneyCell(s.paidEscrow)],
    [`→ Số tiền sẽ về tài khoản Tiệm sau nghiệm thu (${netPct}%)`, moneyCell(s.partnerEscrowNet)],
    [`Số tiền đã giải ngân thực nhận về Tiệm (${netPct}%)`, moneyCell(s.partnerPaidNet)],
  ];
  const wsSum = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSum['!cols'] = [{ wch: 46 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, wsSum, 'Tổng quan Doanh thu');

  const rows = [[
    'Mã đơn', 'Ngày đặt', 'Ngày hẹn', 'Khách hàng', 'Số điện thoại', 'Dịch vụ / Mẫu váy', 'Trạng thái',
    'Tổng giá trị đơn (100%)', `Phí sàn Trạm Hỷ (${feePct}%)`, `Tiệm thực nhận (${netPct}%)`,
    'Đang giữ hộ Escrow', `Chờ nhận từ Escrow (${netPct}%)`, `Đã nhận về tài khoản (${netPct}%)`,
  ]];
  bookings.forEach((b, idx) => {
    const r = idx + 2;
    const f = bookingFinance(b);
    rows.push([
      b.code,
      dateCell(b.created_at),
      dateCell(b.appointment_at),
      b.contact_name || '',
      b.contact_phone || '',
      serviceTitle(b),
      BOOKING_STATUS[b.status]?.label || b.status,
      moneyCell(f.total),
      f.isCancelled ? moneyCell(0) : formulaCell(`ROUND(H${r}*${PLATFORM_FEE_RATE},0)`, f.expectedFee),
      f.isCancelled ? moneyCell(0) : formulaCell(`H${r}-I${r}`, f.expectedPartnerNet),
      moneyCell(f.paidEscrow),
      moneyCell(f.partnerEscrowNet),
      moneyCell(f.partnerPaidNet),
    ]);
  });
  const end = rows.length;
  if (bookings.length) {
    rows.push([
      'TỔNG CỘNG', '', '', '', '', '', '',
      subtotal('H', 2, end, s.gmv),
      subtotal('I', 2, end, s.expectedFee),
      subtotal('J', 2, end, s.expectedPartnerNet),
      subtotal('K', 2, end, s.paidEscrow),
      subtotal('L', 2, end, s.partnerEscrowNet),
      subtotal('M', 2, end, s.partnerPaidNet),
    ]);
  }
  const wsOrders = XLSX.utils.aoa_to_sheet(rows);
  wsOrders['!cols'] = [
    { wch: 16 }, { wch: 17 }, { wch: 17 }, { wch: 22 }, { wch: 14 }, { wch: 30 }, { wch: 18 },
    { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 20 }, { wch: 20 },
  ];
  if (bookings.length) wsOrders['!autofilter'] = { ref: `A1:M${end}` };
  XLSX.utils.book_append_sheet(wb, wsOrders, 'Chi tiết Đơn & Hoa hồng');

  return new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true }));
}

export async function exportPartnerFinanceExcel(bookings, shopName = 'Đối tác Trạm Hỷ') {
  const bytes = await buildPartnerFinanceBytes(bookings, shopName);
  downloadBytes(bytes, 'doanh-thu-doi-tac-tram-hy.xlsx');
}

// ---------- 3. TỰ ĐỘNG ĐỒNG BỘ FILE EXCEL CỐ ĐỊNH TRÊN ĐÁM MÂY CHO TỪNG TÀI KHOẢN ----------
export async function autoSyncCloudExcel(scope, getBytesFn) {
  try {
    const bytes = await getBytesFn();
    return await uploadAccountCloudXlsx(scope, bytes);
  } catch (err) {
    console.warn('Tự động đồng bộ Cloud Excel:', err);
    return null;
  }
}

export function openCloudExcelSyncDialog({ scope = 'plan', title = '☁️ File Excel Cố định & Tự động Đồng bộ', getBytes, onDownloadLocal }) {
  openDialog({
    title,
    confirmText: 'Đóng',
    cancelText: '',
    content: html`<div class="stack" data-cloud-excel-body><div class="empty">Đang tạo &amp; đồng bộ File Excel cố định của tài khoản…</div></div>`,
    onOpen: async (dialogEl) => {
      const box = dialogEl.querySelector('[data-cloud-excel-body]');
      let state = null;

      const draw = () => {
        render(box, html`
          <div class="stack" style="gap:14px">
            <div class="notice small" style="background:var(--green-soft);color:var(--green);border:1px solid #b7e1c9">
              ✓ <strong>Đã đồng bộ tự động!</strong> Tài khoản của bạn có riêng <strong>1 File Excel (.xlsx) cố định trên đám mây</strong> và <strong>1 Link dữ liệu trực tiếp (Live Sync)</strong>. Mỗi khi có đơn mới hoặc thay đổi số liệu, hệ thống tự động cập nhật vào đúng đường dẫn này (không cần tải đi tải lại hay copy-paste).
            </div>

            <div class="card stack" style="padding:14px;gap:8px;background:var(--gold-soft);border-color:var(--gold-line)">
              <div class="row" style="justify-content:space-between">
                <strong>1. File Excel (.xlsx) Cố định của Tài khoản trên Đám mây</strong>
                <span class="badge badge-green">Đủ các Sheet &amp; Công thức</span>
              </div>
              <p class="small muted" style="margin:0">
                Đây là đường dẫn file <code>.xlsx</code> cố định của riêng tài khoản bạn. Bạn có thể bấm mở trực tiếp trên <b>Microsoft Excel Online</b> hoặc gắn thẳng link này vào <b>Excel trên máy tính (Data → From Web)</b>:
              </p>
              <div class="row">
                <input class="input" value="${state.xlsxUrl}" readonly aria-label="Link File Excel .xlsx cố định" style="flex:1;font-size:12.5px">
                <button type="button" class="btn btn-dark btn-sm" data-copy-val="${state.xlsxUrl}">Sao chép Link .xlsx</button>
              </div>
              <div class="row" style="gap:8px">
                <a class="btn btn-primary btn-sm" href="${state.officeOnlineUrl}" target="_blank" rel="noopener">
                  🌐 Mở trực tiếp trên Microsoft Excel Online ↗
                </a>
                ${onDownloadLocal ? html`<button type="button" class="btn btn-outline btn-sm" data-dl-local>⬇ Tải bản .xlsx về máy</button>` : ''}
              </div>
            </div>

            <div class="card stack" style="padding:14px;gap:8px">
              <div class="row" style="justify-content:space-between">
                <strong>2. Link Tự động nhảy đơn mới 24/7 (Live Database Feed)</strong>
                <span class="badge badge-blue">Realtime 24/7</span>
              </div>
              <p class="small muted" style="margin:0">
                Link này truy vấn trực tiếp cơ sở dữ liệu ngay lúc Excel hoặc Google Sheets gọi tới (tự cập nhật cả khi bạn tắt trình duyệt web):
              </p>
              <label class="field"><span class="small">Dán vào Microsoft Excel (<b>Data → From Web → Dán URL</b>):</span>
                <div class="row">
                  <input class="input" value="${state.liveUrl}" readonly style="flex:1;font-size:12.5px">
                  <button type="button" class="btn btn-outline btn-sm" data-copy-val="${state.liveUrl}">Sao chép URL</button>
                </div>
              </label>
              <label class="field"><span class="small">Hoặc dán công thức này vào ô <code>A1</code> của <b>Google Sheets</b>:</span>
                <div class="row">
                  <input class="input" value="${state.googleSheetsFormula}" readonly style="flex:1;font-size:12.5px">
                  <button type="button" class="btn btn-outline btn-sm" data-copy-val="${state.googleSheetsFormula}">Sao chép công thức</button>
                </div>
              </label>
            </div>

            <div class="row" style="justify-content:space-between;padding-top:6px;border-top:1px dashed var(--line)">
              <span class="small muted">Lỡ lộ link cho người lạ? Đổi link mới sẽ vô hiệu hóa link cũ ngay.</span>
              <button type="button" class="btn btn-outline btn-sm" data-rotate-link>🔄 Tạo Link cố định mới</button>
            </div>
          </div>`);

        box.querySelectorAll('[data-copy-val]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            await navigator.clipboard.writeText(btn.dataset.copyVal);
            toast('Đã sao chép đường dẫn đồng bộ!', 'success');
          });
        });
        box.querySelector('[data-dl-local]')?.addEventListener('click', (e) => withBusy(e.currentTarget, onDownloadLocal));
        box.querySelector('[data-rotate-link]')?.addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
          state = await rotateAccountExcelLinks(scope);
          if (getBytes) {
            const bytes = await getBytes();
            state = await uploadAccountCloudXlsx(scope, bytes);
          }
          toast('Đã cấp Link Excel cố định mới – link cũ đã hủy hiệu lực.', 'success');
          draw();
        }));
      };

      try {
        if (getBytes) {
          const bytes = await getBytes();
          state = await uploadAccountCloudXlsx(scope, bytes);
        } else {
          state = await getAccountExcelLinks(scope);
        }
        draw();
      } catch (error) {
        render(box, html`<div class="empty">Chưa đồng bộ được Cloud Excel: ${error.message}</div>`);
        toastError(error);
      }
    },
  });
}
