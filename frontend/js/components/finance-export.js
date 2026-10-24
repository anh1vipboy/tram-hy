// Tính toán minh bạch dòng tiền Escrow – Hoa hồng sàn (10%) – Thực nhận đối tác (90%)
// và Xuất báo cáo đối soát Excel (.xlsx) / Đồng bộ trực tiếp sang Google Sheets & Microsoft Excel.
import { html, money, dateTime } from '../core/utils.js';
import { BOOKING_STATUS, BOOKING_TYPE, VENDOR_CATEGORY, MILESTONE_STATUS } from '../core/labels.js';
import { openDialog, toast } from '../core/ui.js';
import { PLATFORM_FEE_RATE } from '../config.js';

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

/** Khung hiển thị minh bạch 3 con số (Tổng đơn 100% – Hoa hồng sàn 10% – Tiệm thực nhận 90%) trên thẻ đơn */
export function bookingFinanceBreakdownView(booking) {
  const f = bookingFinance(booking);
  return html`
    <div class="booking-finance-box">
      <div class="finance-line">
        <span class="muted">Giá trị đơn (Khách trả 100%)</span>
        <strong>${money(f.total)}</strong>
      </div>
      <div class="finance-line fee">
        <span>Hoa hồng nền tảng Trạm Hỷ (${f.feePercent}%)</span>
        <strong>−${money(f.expectedFee)}</strong>
      </div>
      <div class="finance-line net">
        <span>Tiệm thực nhận (${f.partnerPercent}%)</span>
        <strong>${money(f.expectedPartnerNet)}</strong>
      </div>
      ${f.paidEscrow > 0 || f.releasedGross > 0 ? html`
        <div class="finance-sub">
          <span>Đang giữ hộ: <b>${money(f.paidEscrow)}</b> (nhận về ${money(f.partnerEscrowNet)})</span>
          <span>Đã giải ngân: <b class="text-green">${money(f.partnerPaidNet)}</b></span>
        </div>` : ''}
    </div>`;
}

function downloadWorkbook(XLSX, wb, filename) {
  const bytes = XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true });
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

// ---------- 1. XUẤT EXCEL ĐỐI SOÁT SÀN (ADMIN) ----------
export async function exportAdminFinanceExcel(bookings, vendors = [], filename = 'doi-soat-doanh-thu-tram-hy.xlsx') {
  const XLSX = await loadXlsx();
  const wb = XLSX.utils.book_new();
  wb.Props = { Title: 'Đối soát Doanh thu & Hoa hồng – Trạm Hỷ', Author: 'Trạm Hỷ', CreatedDate: new Date() };

  const s = summarizeBookingsFinance(bookings);
  const feePct = Math.round(PLATFORM_FEE_RATE * 100);
  const netPct = 100 - feePct;

  // Sheet 1: Tổng hợp Sàn
  const overviewRows = [
    ['BÁO CÁO ĐỐI SOÁT DOANH THU & HOA HỒNG NỀN TẢNG – TRẠM HỶ'],
    ['Xuất báo cáo lúc', dateCell(new Date().toISOString())],
    ['Tỷ lệ hoa hồng sàn áp dụng', `${feePct}% / đơn thành công (Miễn phí 0đ cho Cô dâu Chú rể)`],
    [],
    ['1. THỐNG KÊ ĐƠN HÀNG', 'Số lượng'],
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
  ];
  const wsOverview = XLSX.utils.aoa_to_sheet(overviewRows);
  wsOverview['!cols'] = [{ wch: 48 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, wsOverview, 'Tổng hợp Sàn');

  // Sheet 2: Chi tiết Hoa hồng từng Đơn
  const orderHeader = [
    'Mã đơn', 'Ngày tạo', 'Khách hàng', 'Số điện thoại', 'Tiệm đối tác', 'Ngành dịch vụ',
    'Chi tiết dịch vụ / Mẫu váy', 'Trạng thái đơn',
    'Tổng giá trị đơn (100%)', `Hoa hồng Sàn (${feePct}%)`, `Đối tác hưởng (${netPct}%)`,
    'Khách đã đóng', 'Đang giữ Escrow', 'Đã giải ngân (100%)',
    `Hoa hồng Thực thu (${feePct}%)`, `Đã trả Đối tác (${netPct}%)`,
  ];
  const orderRows = [orderHeader];
  bookings.forEach((b, idx) => {
    const r = idx + 2; // Dòng Excel bắt đầu từ 2
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

  // Sheet 3: Công nợ theo Tiệm Đối tác
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

  // Sheet 4: Chi tiết các Đợt thanh toán (Milestones 30-50-20)
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

  downloadWorkbook(XLSX, wb, filename);
}

// ---------- 2. XUẤT EXCEL DOANH THU CHO CHỦ TIỆM ĐỐI TÁC ----------
export async function exportPartnerFinanceExcel(bookings, shopName = 'Đối tác Trạm Hỷ') {
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

  downloadWorkbook(XLSX, wb, 'doanh-thu-doi-tac-tram-hy.xlsx');
}

// ---------- 3. ĐỒNG BỘ TRỰC TIẾP SANG GOOGLE SHEETS & MICROSOFT EXCEL (LIVE SYNC) ----------
function buildDelimitedOrders(bookings, sep = '\t') {
  const feePct = Math.round(PLATFORM_FEE_RATE * 100);
  const netPct = 100 - feePct;
  const header = [
    'Mã đơn', 'Ngày tạo', 'Khách hàng', 'Số điện thoại', 'Tiệm đối tác', 'Ngành dịch vụ',
    'Dịch vụ / Mẫu váy', 'Trạng thái', 'Tổng đơn (100%)', `Hoa hồng Sàn (${feePct}%)`,
    `Đối tác nhận (${netPct}%)`, 'Khách đã đóng', 'Đang giữ Escrow', 'Đã giải ngân (100%)',
    `Hoa hồng Thực thu (${feePct}%)`, `Đã trả Đối tác (${netPct}%)`,
  ];
  const clean = (val) => {
    const str = String(val ?? '').replace(/[\r\n\t]+/g, ' ').trim();
    if (sep === ',' && (str.includes(',') || str.includes('"'))) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const lines = [header.map(clean).join(sep)];
  for (const b of bookings) {
    const f = bookingFinance(b);
    lines.push([
      b.code,
      dateTime(b.created_at),
      b.contact_name || '',
      b.contact_phone || '',
      b.vendor?.name || '',
      VENDOR_CATEGORY[b.vendor?.category] || '',
      serviceTitle(b),
      BOOKING_STATUS[b.status]?.label || b.status,
      f.total,
      f.expectedFee,
      f.expectedPartnerNet,
      f.collected,
      f.paidEscrow,
      f.releasedGross,
      f.earnedFee,
      f.partnerPaidNet,
    ].map(clean).join(sep));
  }
  return lines.join('\r\n');
}

export function downloadLiveCsvFeed(bookings, filename = 'tram-hy-live-orders.csv') {
  // Thêm BOM \uFEFF đầu file để Microsoft Excel mở tiếng Việt có dấu chuẩn 100%
  const csv = `\uFEFF${buildDelimitedOrders(bookings, ',')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
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

export function openLiveSpreadsheetSyncDialog(bookings) {
  openDialog({
    title: '🔄 Đồng bộ Đơn hàng & Hoa hồng sang Excel / Google Sheets',
    confirmText: 'Đóng',
    cancelText: '',
    content: html`
      <div class="stack" style="gap:14px">
        <p class="small muted" style="margin:0">
          Dữ liệu trên trang Quản trị đã được kết nối trực tiếp với cơ sở dữ liệu theo thời gian thực (Realtime).
          Bạn có thể đẩy toàn bộ <strong>${bookings.length} đơn hàng</strong> cùng cột <strong>Hoa hồng 10% &amp; Thực trả 90%</strong> sang Google Sheets hoặc Microsoft Excel chỉ với 1 chạm:
        </p>

        <div class="card stack" style="padding:14px;gap:8px;background:var(--gold-soft);border-color:var(--gold-line)">
          <strong>Cách 1: Đồng bộ 1 chạm sang Google Sheets (Nhanh nhất)</strong>
          <p class="small muted" style="margin:0">
            Hệ thống tự động sao chép toàn bộ bảng đối soát chuẩn cột và mở trang Google Sheets mới — bạn chỉ cần bấm <code>Ctrl + V</code> ở ô <code>A1</code> là toàn bộ đơn và số tiền nhảy vào từng cột.
          </p>
          <div class="row" style="gap:8px">
            <button type="button" class="btn btn-primary btn-sm" data-copy-open-sheets>
              📊 Copy bảng &amp; Mở Google Sheets ngay
            </button>
            <button type="button" class="btn btn-outline btn-sm" data-copy-tsv>
              📋 Chỉ sao chép bảng (dán vào Excel đang mở)
            </button>
          </div>
        </div>

        <div class="card stack" style="padding:14px;gap:8px">
          <strong>Cách 2: Gắn nguồn dữ liệu tự làm mới (Power Query) trong Microsoft Excel</strong>
          <p class="small muted" style="margin:0">
            Tải nguồn dữ liệu chuẩn <code>tram-hy-live-orders.csv</code> (UTF-8 tiếng Việt). Trong Excel trên máy tính, vào <b>Data → From Text/CSV</b> chọn file này 1 lần. Những lần sau chỉ cần lưu đè file và bấm <b>Refresh All (Ctrl + Alt + F5)</b> trong Excel là bảng tổng hợp tự động cập nhật đơn mới!
          </p>
          <div>
            <button type="button" class="btn btn-outline btn-sm" data-download-csv>
              ⬇ Tải nguồn dữ liệu chuẩn (.csv UTF-8)
            </button>
          </div>
        </div>
      </div>`,
    onOpen: (dialogEl) => {
      dialogEl.querySelector('[data-copy-tsv]')?.addEventListener('click', async () => {
        const tsv = buildDelimitedOrders(bookings, '\t');
        await navigator.clipboard.writeText(tsv);
        toast(`Đã sao chép ${bookings.length} đơn hàng! Bạn mở Excel hoặc Google Sheets bấm Ctrl+V là xong.`, 'success');
      });
      dialogEl.querySelector('[data-copy-open-sheets]')?.addEventListener('click', async () => {
        const tsv = buildDelimitedOrders(bookings, '\t');
        await navigator.clipboard.writeText(tsv);
        toast('Đã sao chép toàn bộ bảng đơn! Khi Google Sheets mở ra, bạn bấm Ctrl+V vào ô A1 nhé.', 'success');
        window.open('https://sheets.new', '_blank', 'noopener');
      });
      dialogEl.querySelector('[data-download-csv]')?.addEventListener('click', () => {
        downloadLiveCsvFeed(bookings);
        toast('Đã tải file nguồn tram-hy-live-orders.csv.', 'success');
      });
    },
  });
}
