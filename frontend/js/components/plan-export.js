// Xuất kế hoạch cưới ra file Excel (.xlsx) thật: Tổng quan · Ngân sách · Checklist · Đơn Trạm Hỷ.
// Dùng SheetJS Community Edition 0.20.3 (Apache-2.0, bản "mini" chỉ có XLSX ~280KB) đặt sẵn trong js/vendor/
// – chỉ tải khi bấm nút, không làm chậm trang. Dữ liệu không gửi đi đâu: file tạo ngay trên trình duyệt.
// Dùng chung cho chủ kế hoạch và người xem link chia sẻ (cùng dạng dữ liệu).
import { BOOKING_STATUS, VENDOR_CATEGORY } from '../core/labels.js';
import { REGION_LABEL, CHECKLIST_STAGES } from '../data/planner-templates.js';
import { parseCategoryParty } from '../services/planner.js';
import { budgetTotals, partyTotals, bookingPaid, bookingName, linkBookings } from './budget-board.js';
import { checklistProgress, dueLabel, stageIndex } from './checklist-board.js';

const XLSX_SRC = new URL('../vendor/xlsx-0.20.3.mini.min.js', import.meta.url).href;
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const EXCEL_FILENAME = 'ke-hoach-cuoi-tram-hy.xlsx';

// Định dạng số kiểu Việt Nam: Excel tự dùng dấu chấm / phẩy theo máy người mở, đuôi "đ" giống trên web
const MONEY = '#,##0"đ"';
const DATE = 'dd/mm/yyyy';
const DATE_TIME = 'dd/mm/yyyy hh:mm';

let loading = null;
/** Tải thư viện 1 lần (thẻ <script> thường – bản mini là UMD, gắn vào window.XLSX) */
function loadXlsx() {
  if (window.XLSX?.utils) return Promise.resolve(window.XLSX);
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = XLSX_SRC;
    script.async = true;
    script.onload = () => (window.XLSX?.utils ? resolve(window.XLSX) : reject(new Error('Không mở được công cụ xuất Excel')));
    script.onerror = () => {
      loading = null;                       // lần sau bấm lại thì tải lại (vd vừa mất mạng)
      script.remove();
      reject(new Error('Không tải được công cụ xuất Excel – kiểm tra kết nối mạng rồi thử lại'));
    };
    document.head.append(script);
  });
  return loading;
}

// ---------- Ô Excel ----------
// Ngày lưu dạng số sê-ri của Excel (tính theo ngày lịch, không theo múi giờ) → mở ở máy nào cũng đúng ngày
const serial = (y, m, d, hh = 0, mm = 0) => (Date.UTC(y, m - 1, d, hh, mm) - Date.UTC(1899, 11, 30)) / 86_400_000;
const moneyCell = (n) => ({ t: 'n', v: Math.round(Number(n) || 0), z: MONEY });
const optionalMoney = (n) => (Number(n) > 0 ? moneyCell(n) : null);         // ô trống thay vì "0đ" khi chưa nhập
const isoDateCell = (iso) => {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return { t: 'n', v: serial(y, m, d), z: DATE };
};
const localDateCell = (date, withTime = false) => ({
  t: 'n',
  v: serial(date.getFullYear(), date.getMonth() + 1, date.getDate(), withTime ? date.getHours() : 0, withTime ? date.getMinutes() : 0),
  z: withTime ? DATE_TIME : DATE,
});
// Công thức kèm sẵn kết quả (v) → file mở bằng app xem trước trên điện thoại (không tính công thức) vẫn thấy số
const formulaCell = (f, value) => ({ t: 'n', f, v: value, z: MONEY });
// SUBTOTAL(9, …) thay cho SUM: dòng "Tổng cộng" cộng cả cột mà không tính trùng các dòng "Cộng: danh mục"
const subtotal = (col, from, to, value) => formulaCell(`SUBTOTAL(9,${col}${from}:${col}${to})`, value);

const DAY = 86_400_000;
const dueDate = (plan, task) => (plan.wedding_date
  ? new Date(new Date(`${plan.wedding_date}T00:00:00`).getTime() - task.days_before * DAY) : null);

// ---------- Từng trang tính ----------
function overviewSheet(XLSX, { plan, couple, categories, tasks, bookings }) {
  const t = budgetTotals(categories, bookings, plan);
  const pt = partyTotals(categories, bookings);
  const items = categories.flatMap((c) => c.items);
  const activeList = activeBookings(categories, bookings);
  const actual = items.reduce((s, i) => s + (i.actual || 0), 0) + activeList.reduce((s, b) => s + b.total_price, 0);
  const { done, total } = checklistProgress(tasks);
  const names = couple?.groom_name && couple?.bride_name ? `${couple.bride_name} & ${couple.groom_name}` : '';

  const rows = [
    ['KẾ HOẠCH CƯỚI – TRẠM HỶ'],
    [],
    ['THÔNG TIN ĐÁM CƯỚI'],
    ...(names ? [['Cô dâu & chú rể', names]] : []),
    ['Ngày cưới', plan.wedding_date ? isoDateCell(plan.wedding_date) : 'Chưa đặt'],
    ['Phong tục', REGION_LABEL[plan.region] ?? ''],
    ['Thành phố', plan.city || 'Chưa có'],
    ['Số khách mời', plan.guests ? { t: 'n', v: plan.guests, z: '#,##0' } : 'Chưa có'],
    ...(plan.guests ? [['Số bàn (ước tính, 10 khách/bàn)', Math.ceil(plan.guests / 10)]] : []),
    [],
    ['NGÂN SÁCH TỔNG HỢP'],
    ['Tổng ngân sách', plan.total_budget ? moneyCell(plan.total_budget) : 'Chưa đặt'],
    ['Chi phí dự kiến', moneyCell(t.estimated)],
    ['Chi phí thực tế (đã nhập)', moneyCell(actual)],
    ['Đã thanh toán', moneyCell(t.paid)],
    ['Còn phải trả (dự kiến − đã trả)', moneyCell(Math.max(0, t.estimated - t.paid))],
    ...(plan.total_budget ? [[t.over ? 'Vượt ngân sách' : 'Còn dư so với ngân sách', moneyCell(Math.abs(plan.total_budget - t.estimated))]] : []),
    ['Số mục đã thanh toán', `${t.paidCount}/${t.itemCount} mục`],
    [],
    ['PHÂN BỔ THEO BÊN PHỤ TRÁCH', 'Dự kiến', 'Đã thanh toán', 'Còn phải trả'],
    ['Hai vợ chồng (Chung)', moneyCell(pt.both.estimated), moneyCell(pt.both.paid), moneyCell(Math.max(0, pt.both.estimated - pt.both.paid))],
    ['Nhà Trai', moneyCell(pt.groom.estimated), moneyCell(pt.groom.paid), moneyCell(Math.max(0, pt.groom.estimated - pt.groom.paid))],
    ['Nhà Gái', moneyCell(pt.bride.estimated), moneyCell(pt.bride.paid), moneyCell(Math.max(0, pt.bride.estimated - pt.bride.paid))],
    [],
    ['CHECKLIST'],
    ['Việc đã xong', `${done}/${total} việc (${total ? Math.round((done / total) * 100) : 0}%)`],
    [],
    ['ĐƠN TRÊN TRẠM HỶ'],
    ['Số đơn đang có', activeList.length],
    ['Tổng giá trị đơn', moneyCell(activeList.reduce((s, b) => s + b.total_price, 0))],
    [],
    ['Xuất lúc', localDateCell(new Date(), true)],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 34 }, { wch: 24 }, { wch: 18 }, { wch: 18 }];
  return ws;
}

function budgetSheet(XLSX, { plan, categories, bookings }) {
  const { byCategory, unlinked } = linkBookings(categories, bookings);
  const rows = [['Danh mục', 'Bên phụ trách', 'Mục chi tiêu', 'Dự kiến', 'Thực tế', 'Đã trả', 'Ghi chú']];
  const groups = categories.map((c) => {
    const p = parseCategoryParty(c.name);
    return { name: p.name, partyLabel: p.short, items: c.items, bookings: byCategory.get(c) ?? [] };
  });
  if (unlinked.length) groups.push({ name: 'Dịch vụ khác đặt qua Trạm Hỷ', partyLabel: 'Chung', items: [], bookings: unlinked });

  let est = 0; let act = 0; let paidSum = 0;
  for (const g of groups) {
    const first = rows.length + 1;                      // số dòng Excel (bắt đầu từ 1) của mục đầu tiên
    let gEst = 0; let gAct = 0; let gPaid = 0;
    for (const i of g.items) {
      const paid = i.paid ? (i.actual || i.estimated) : 0;      // giống cách tính "Đã thanh toán" trên web
      const note = [i.paid ? 'Đã thanh toán' : '',
        i.actual > 0 && i.estimated > 0 && i.actual > i.estimated ? 'Vượt dự kiến' : ''].filter(Boolean).join(' · ');
      rows.push([g.name, g.partyLabel, i.name, moneyCell(i.estimated), optionalMoney(i.actual), optionalMoney(paid), note]);
      gEst += i.estimated; gAct += i.actual || 0; gPaid += paid;
    }
    for (const b of g.bookings) {
      const paid = bookingPaid(b);
      rows.push([g.name, g.partyLabel, bookingName(b), moneyCell(b.total_price), moneyCell(b.total_price), optionalMoney(paid),
        `Đặt qua Trạm Hỷ · ${b.vendor?.name ?? ''} · ${BOOKING_STATUS[b.status]?.label ?? b.status}`]);
      gEst += b.total_price; gAct += b.total_price; gPaid += paid;
    }
    if (rows.length + 1 === first) {
      rows.push([g.name, g.partyLabel, '(chưa có mục chi tiêu)', null, null, null, '']);
      continue;
    }
    const last = rows.length;
    rows.push([g.name, g.partyLabel, `Cộng: ${g.name}`, subtotal('D', first, last, gEst), subtotal('E', first, last, gAct), subtotal('F', first, last, gPaid), '']);
    est += gEst; act += gAct; paidSum += gPaid;
  }
  const end = rows.length;
  rows.push(['TỔNG CỘNG', '', '', subtotal('D', 2, end, est), subtotal('E', 2, end, act), subtotal('F', 2, end, paidSum), '']);
  if (plan.total_budget) {
    rows.push(['Tổng ngân sách', '', '', moneyCell(plan.total_budget), null, null,
      est > plan.total_budget ? `Dự kiến vượt ngân sách ${(est - plan.total_budget).toLocaleString('vi-VN')}đ` : '']);
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 26 }, { wch: 15 }, { wch: 40 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 46 }];
  ws['!autofilter'] = { ref: `A1:G${end}` };          // lọc theo danh mục hoặc bên phụ trách ngay trong Excel
  return ws;
}

function checklistSheet(XLSX, { plan, tasks }) {
  const rows = [['Mốc thời gian', 'Việc cần làm', 'Hạn', 'Trạng thái', 'Ngày hoàn thành']];
  const sorted = [...tasks].sort((a, b) => b.days_before - a.days_before);
  for (const task of sorted) {
    const due = dueDate(plan, task);
    const label = dueLabel(plan, task);
    const status = task.done ? 'Đã xong' : label.tone === 'late' ? 'Quá hạn' : label.tone === 'soon' ? 'Sắp đến hạn' : 'Chưa xong';
    rows.push([
      CHECKLIST_STAGES[stageIndex(task.days_before)]?.label ?? '',
      task.title,
      due ? localDateCell(due) : label.text,             // chưa có ngày cưới → "Trước 6 tháng"
      status,
      task.done && task.done_at ? localDateCell(new Date(task.done_at)) : null,
    ]);
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 24 }, { wch: 52 }, { wch: 14 }, { wch: 14 }, { wch: 16 }];
  ws['!autofilter'] = { ref: `A1:E${rows.length}` };
  return ws;
}

// Đơn còn hiệu lực, xếp theo thứ tự danh mục ngân sách (giống trên web)
function activeBookings(categories, bookings) {
  const { byCategory, unlinked } = linkBookings(categories, bookings);
  return [...byCategory.values()].flat().concat(unlinked);
}

function bookingsSheet(XLSX, { categories, bookings }) {
  const list = activeBookings(categories, bookings);
  const withCode = list.some((b) => b.code);
  const rows = [['Dịch vụ', 'Đối tác', 'Loại dịch vụ', 'Trạng thái', 'Lịch hẹn', 'Tổng tiền', 'Đã trả', 'Còn lại', ...(withCode ? ['Mã đơn'] : [])]];
  for (const b of list) {
    const paid = bookingPaid(b);
    rows.push([bookingName(b), b.vendor?.name ?? '', VENDOR_CATEGORY[b.vendor?.category] ?? '', BOOKING_STATUS[b.status]?.label ?? b.status,
      b.appointment_at ? localDateCell(new Date(b.appointment_at), true) : 'Chưa hẹn',
      moneyCell(b.total_price), moneyCell(paid), moneyCell(Math.max(0, b.total_price - paid)), ...(withCode ? [b.code ?? ''] : [])]);
  }
  const n = rows.length;
  rows.push(['TỔNG CỘNG', '', '', '', '', formulaCell(`SUM(F2:F${n})`, list.reduce((s, b) => s + b.total_price, 0)),
    formulaCell(`SUM(G2:G${n})`, list.reduce((s, b) => s + bookingPaid(b), 0)),
    formulaCell(`SUM(H2:H${n})`, list.reduce((s, b) => s + Math.max(0, b.total_price - bookingPaid(b)), 0))]);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 34 }, { wch: 26 }, { wch: 16 }, { wch: 18 }, { wch: 17 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
  return ws;
}

const STAGE_LABEL = {
  1: 'Đợt 1 – Cọc giữ lịch (30%)',
  2: 'Đợt 2 – Ngày thực hiện (50%)',
  3: 'Đợt 3 – Bàn giao hoàn tất (20%)',
};

function cashflowSheet(XLSX, { categories, bookings }) {
  const list = activeBookings(categories, bookings);
  const rows = [['Khoản chi / Đơn dịch vụ', 'Đối tác / Danh mục', 'Bên phụ trách', 'Đợt thanh toán', 'Số tiền', 'Đã trả', 'Còn cần chuẩn bị', 'Trạng thái']];
  let totalAmt = 0;
  let totalPaid = 0;
  let totalRemain = 0;

  for (const b of list) {
    const cat = categories.find((c) => c.vendor_category === b.vendor?.category);
    const partyLabel = cat ? parseCategoryParty(cat.name).short : 'Chung';
    const milestones = [...(b.milestones || [])].sort((a, m) => (a.stage ?? 0) - (m.stage ?? 0));
    if (milestones.length) {
      for (const m of milestones) {
        const isPaid = ['paid', 'released'].includes(m.status);
        const amt = Math.round(Number(m.amount) || 0);
        const paid = isPaid ? amt : 0;
        const remain = isPaid ? 0 : amt;
        rows.push([
          bookingName(b),
          b.vendor?.name ?? 'Trạm Hỷ',
          partyLabel,
          STAGE_LABEL[m.stage] ?? `Đợt ${m.stage ?? ''}`,
          moneyCell(amt),
          optionalMoney(paid),
          optionalMoney(remain),
          isPaid ? 'Đã thanh toán' : 'Chờ thanh toán',
        ]);
        totalAmt += amt; totalPaid += paid; totalRemain += remain;
      }
    } else {
      const paid = bookingPaid(b);
      const remain = Math.max(0, b.total_price - paid);
      rows.push([
        bookingName(b),
        b.vendor?.name ?? 'Trạm Hỷ',
        partyLabel,
        'Trọn gói',
        moneyCell(b.total_price),
        optionalMoney(paid),
        optionalMoney(remain),
        remain === 0 ? 'Đã thanh toán' : 'Chờ thanh toán',
      ]);
      totalAmt += b.total_price; totalPaid += paid; totalRemain += remain;
    }
  }

  for (const c of categories) {
    const p = parseCategoryParty(c.name);
    for (const i of c.items) {
      const amt = i.actual || i.estimated || 0;
      if (!amt) continue;
      const paid = i.paid ? amt : 0;
      const remain = i.paid ? 0 : amt;
      rows.push([
        i.name,
        p.name,
        p.short,
        'Chi tiêu theo kế hoạch',
        moneyCell(amt),
        optionalMoney(paid),
        optionalMoney(remain),
        i.paid ? 'Đã thanh toán' : 'Cần chuẩn bị',
      ]);
      totalAmt += amt; totalPaid += paid; totalRemain += remain;
    }
  }

  const n = rows.length;
  rows.push([
    'TỔNG DÒNG TIỀN', '', '', '',
    formulaCell(`SUM(E2:E${n})`, totalAmt),
    formulaCell(`SUM(F2:F${n})`, totalPaid),
    formulaCell(`SUM(G2:G${n})`, totalRemain),
    '',
  ]);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 34 }, { wch: 24 }, { wch: 15 }, { wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 18 }];
  ws['!autofilter'] = { ref: `A1:H${n}` };
  return ws;
}

/** Tạo workbook (tách riêng để kiểm thử / dùng lại) */
export function buildPlanWorkbook(XLSX, data) {
  const wb = XLSX.utils.book_new();
  wb.Props = { Title: 'Kế hoạch cưới', Author: 'Trạm Hỷ', CreatedDate: new Date() };
  XLSX.utils.book_append_sheet(wb, overviewSheet(XLSX, data), 'Tổng quan');
  XLSX.utils.book_append_sheet(wb, budgetSheet(XLSX, data), 'Ngân sách');
  XLSX.utils.book_append_sheet(wb, cashflowSheet(XLSX, data), 'Lịch thanh toán');
  XLSX.utils.book_append_sheet(wb, checklistSheet(XLSX, data), 'Checklist');
  if (activeBookings(data.categories, data.bookings).length) XLSX.utils.book_append_sheet(wb, bookingsSheet(XLSX, data), 'Đơn Trạm Hỷ');
  return wb;
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
  setTimeout(() => URL.revokeObjectURL(url), 60_000);   // iPhone cần link sống thêm một lúc để mở bảng "Tải về"
}

/**
 * Tải file Excel về máy. data = { plan, couple?, categories, tasks, bookings }.
 * Tự tạo link tải (Blob) thay vì để thư viện tự lưu → chạy được cả Safari / Chrome trên iPhone, Android.
 */
export async function exportPlanExcel(data, filename = EXCEL_FILENAME) {
  const XLSX = await loadXlsx();
  const wb = buildPlanWorkbook(XLSX, data);
  downloadWorkbook(XLSX, wb, filename);
}

/**
 * Xuất bảng so sánh các dịch vụ / mẫu váy / gói dịch vụ từ trang Dịch vụ cưới ra file Excel (.xlsx).
 */
export async function exportCompareExcel(items, filename = 'bang-so-sanh-dich-vu-tram-hy.xlsx') {
  const XLSX = await loadXlsx();
  const wb = XLSX.utils.book_new();
  wb.Props = { Title: 'Bảng so sánh dịch vụ cưới – Trạm Hỷ', Author: 'Trạm Hỷ', CreatedDate: new Date() };
  const rows = [
    ['BẢNG SO SÁNH & BÁO GIÁ DỊCH VỤ CƯỚI – TRẠM HỶ'],
    ['Xuất lúc', localDateCell(new Date(), true)],
    [],
    ['Phân loại', 'Tên dịch vụ / Mẫu váy', 'Cửa hàng đối tác', 'Khu vực', 'Tích Xanh', 'Đánh giá', 'Giá ưu đãi / Hiện tại', 'Giá gốc', 'Ghi chú / Mô tả', 'Link xem trên Trạm Hỷ'],
  ];
  for (const it of items) {
    rows.push([
      it.typeLabel || 'Dịch vụ',
      it.title || '',
      it.vendorName || '',
      it.district || '',
      it.verified ? '✓ Tích Xanh' : 'Đối tác',
      it.rating ? `${it.rating} ★` : '—',
      moneyCell(it.price || 0),
      it.originalPrice > it.price ? moneyCell(it.originalPrice) : null,
      it.note || '',
      it.url || '',
    ]);
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 18 }, { wch: 36 }, { wch: 28 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 18 }, { wch: 16 }, { wch: 42 }, { wch: 44 }];
  XLSX.utils.book_append_sheet(wb, ws, 'So sánh báo giá');
  downloadWorkbook(XLSX, wb, filename);
}
