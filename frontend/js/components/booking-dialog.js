// Hộp thoại đặt lịch dùng chung (trang thử váy, trang đối tác, may đo)
// - Nhà hàng tiệc: khách nhập số bàn → tổng tiền và 3 đợt thanh toán tính lại ngay khi gõ.
// - Mọi tiệm: xem trước giờ / ngày đã có lịch ngay dưới ô ngày giờ, trùng thì chặn nút đặt.
//   Database vẫn tự chặn trùng lịch trong create_booking (SQL 30) – phần này để khách khỏi bấm xong mới biết.
import { getProfile, loginUrl } from '../core/auth.js';
import { $, html, render, money, sleep } from '../core/utils.js';
import { openDialog } from '../core/ui.js';
import { createBooking, vendorBusyTimes, vendorHalls } from '../services/bookings.js';
import { tableRange } from './package-card.js';

const SPLITS = {
  standard: [30, 50, 20],
  bespoke: [30, 40, 30],
};
const STAGES = ['Cọc giữ lịch', 'Sau buổi thực hiện', 'Nghiệm thu'];
const GAP_MS = 2 * 3600e3;     // 2 lịch hẹn của cùng tiệm phải cách nhau ít nhất 2 tiếng (giống create_booking)
const DAY_MS = 864e5;
const BUSY_TIMEOUT_MS = 8000;  // chờ xem lịch trống tối đa 8 giây
const TYPICAL_TABLES = 30;     // số bàn điền sẵn – cỡ tiệc cưới phổ biến, khách sửa lại được

const pad = (n) => String(n).padStart(2, '0');
// YYYY-MM-DD theo giờ máy khách (toISOString theo giờ UTC → trước 7h sáng ở Việt Nam sẽ lùi 1 ngày)
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// Ngày theo giờ Việt Nam – database đếm tiệc của nhà hàng theo ngày này (en-CA cho ra dạng YYYY-MM-DD)
const vnDate = (d) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
// HH:mm giống giá trị của ô <input type="time">
const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Chia tổng tiền thành các đợt – làm tròn giống create_booking: đợt cuối lấy phần còn lại */
function splitAmounts(total, percents) {
  let sum = 0;
  return percents.map((p, i) => {
    const amount = i === percents.length - 1 ? total - sum : Math.round(total * p / 100);
    sum += amount;
    return amount;
  });
}

/**
 * booking: { vendorId, vendorName, type, dressId?, packageId?, title, price, details?, customPrice?,
 *            isVenue?, unitPrice?, minQty?, maxQty? }
 *   isVenue: nhà hàng tiệc – price / unitPrice là giá MỖI BÀN, khách nhập số bàn trong khoảng minQty–maxQty
 *            (để trống → 5–300 bàn như database).
 * Chưa đăng nhập → chuyển sang trang đăng nhập rồi quay lại `returnTo`.
 * Thành công → chuyển sang trang Đơn của tôi.
 */
export async function openBookingDialog(booking, returnTo) {
  const profile = await getProfile();
  if (!profile) {
    location.href = loginUrl(returnTo);
    return;
  }

  const isBespoke = booking.type.startsWith('bespoke');
  const split = isBespoke ? SPLITS.bespoke : SPLITS.standard;
  const venue = booking.isVenue ? venueInfo(booking) : null;
  const slots = slotChecker(booking.vendorId, Boolean(venue));
  const tomorrow = localDate(new Date(Date.now() + DAY_MS));

  const created = await openDialog({
    title: 'Đặt lịch & giữ cọc an toàn',
    confirmText: 'Xác nhận đặt lịch',
    content: html`
      <div class="stack">
        <div class="card" style="padding:12px">
          <strong>${booking.title}</strong>
          <div class="muted small">${booking.vendorName}</div>
          ${venue
            ? html`<div><span class="price" data-unit-price="${venue.unitPrice}">${money(venue.unitPrice)}</span><span class="muted small"> / bàn · nhận ${venue.min}–${venue.max} bàn</span></div>`
            : html`<div class="price">${money(booking.price)}</div>`}
          <div class="small muted">Thanh toán 3 đợt qua Trạm Hỷ: ${split.join('% → ')}%. Tiền chỉ đến tay đối tác sau khi bạn nghiệm thu từng đợt.</div>
        </div>
        <div class="form-grid">
          ${venue ? html`
            <label class="field"><span>Số bàn</span>
              <input class="input" type="number" name="tables" min="${venue.min}" max="${venue.max}" step="1"
                inputmode="numeric" value="${venue.initial}" required></label>
            <div class="small muted" style="align-self:end;padding-bottom:12px">Nhà hàng nhận từ ${venue.min} đến ${venue.max} bàn – tổng tiền tính theo số bàn bạn nhập.</div>
            <div class="full" data-total aria-live="polite" style="background:var(--brand-soft);border-radius:12px;padding:10px 12px"></div>` : ''}
          <label class="field"><span>${venue ? 'Ngày tổ chức tiệc' : 'Ngày hẹn'}</span>
            <input class="input" type="date" name="date" min="${tomorrow}" value="${tomorrow}" required></label>
          <label class="field"><span>${venue ? 'Giờ đón khách' : 'Giờ hẹn'}</span>
            <input class="input" type="time" name="time" value="${venue ? '18:00' : '09:30'}" required></label>
          <div class="full" data-slots aria-live="polite"></div>
          <label class="field"><span>Họ tên</span>
            <input class="input" name="name" value="${profile.full_name || ''}" required maxlength="100"></label>
          <label class="field"><span>Số điện thoại</span>
            <input class="input" name="phone" type="tel" value="${profile.phone || ''}" required pattern="[0-9+ ]{9,15}"></label>
          <label class="field full"><span>Ghi chú cho đối tác (không bắt buộc)</span>
            <textarea class="input" name="note" maxlength="500"></textarea></label>
        </div>
      </div>`,
    onOpen: (dialogEl) => {
      if (venue) bindTables(dialogEl, venue, split);
      bindSlots(dialogEl, slots, Boolean(venue));
    },
    onConfirm: async (form) => {
      const appointment = new Date(`${form.get('date')}T${form.get('time')}`);
      // Lịch trống có thể chưa tải xong lúc bấm → chờ rồi kiểm tra lại (database vẫn chặn lần nữa)
      const verdict = await slots.check(form.get('date'), appointment);
      if (verdict.error) throw new Error(verdict.error);
      return createBooking({
        vendorId: booking.vendorId,
        type: booking.type,
        dressId: booking.dressId,
        packageId: booking.packageId,
        appointmentAt: appointment.toISOString(),
        contactName: form.get('name').trim(),
        contactPhone: form.get('phone').trim(),
        note: form.get('note').trim() || null,
        details: booking.details,
        customPrice: booking.customPrice,
        quantity: venue ? Number(form.get('tables')) : null,
      });
    },
  });

  if (created) location.href = `bookings.html?new=${encodeURIComponent(created.code)}`;
}

// Khoảng số bàn giống hệt database: gói ghi min/max thì theo gói, không thì 5–300
function venueInfo(booking) {
  const { min, max } = tableRange({ min_qty: booking.minQty, max_qty: booking.maxQty });
  return {
    unitPrice: booking.unitPrice ?? booking.price,
    min,
    max,
    initial: Math.min(max, Math.max(min, TYPICAL_TABLES)),
  };
}

// Ô "Số bàn": gõ tới đâu tính lại tổng + 3 đợt tới đó; ngoài khoảng nhận thì báo ngay và chặn nút đặt
function bindTables(dialogEl, venue, split) {
  const input = $('[name=tables]', dialogEl);
  const box = $('[data-total]', dialogEl);
  const draw = () => {
    const tables = Number(input.value);
    const ok = input.value !== '' && Number.isInteger(tables) && tables >= venue.min && tables <= venue.max;
    const error = ok ? '' : `Nhà hàng nhận từ ${venue.min} đến ${venue.max} bàn – bạn chỉnh lại số bàn nhé`;
    input.setCustomValidity(error);
    input.setAttribute('aria-invalid', String(!ok));
    if (!ok) {
      render(box, html`<p class="field-error">${error}</p>`);
      return;
    }
    const total = venue.unitPrice * tables;
    const amounts = splitAmounts(total, split);
    render(box, html`
      <div>${tables} bàn × ${money(venue.unitPrice)} = <strong class="price" style="font-size:18px">${money(total)}</strong></div>
      <table class="small" style="margin-top:4px">
        ${amounts.map((amount, i) => html`<tr>
          <td style="padding:3px 0;border:0">Đợt ${i + 1}: ${STAGES[i]} (${split[i]}%)</td>
          <td class="price" style="padding:3px 0;border:0;text-align:right">${money(amount)}</td></tr>`)}
      </table>`);
  };
  input.addEventListener('input', draw);
  draw();
}

/**
 * Hỏi database lịch đã có của tiệm (chỉ giờ hẹn) và chấm giờ khách chọn.
 * check(dateStr, appointment) → { state: 'free' | 'taken' | 'unknown', info?, error?, suggestion? }
 * Database chưa chạy SQL 30 / mất mạng → 'unknown': không báo gì, để database tự kiểm tra khi đặt.
 */
function slotChecker(vendorId, isVenue) {
  let cache = { key: null, promise: null };
  const halls = isVenue ? vendorHalls(vendorId).catch(() => 1) : Promise.resolve(1);

  // Lấy rộng ±1 ngày quanh ngày đã chọn: đủ cả lịch sát nửa đêm (cách < 2 tiếng sang ngày bên cạnh)
  // và ngày theo giờ Việt Nam khi máy khách để múi giờ khác. Cùng ngày thì dùng lại, không hỏi lại database.
  // Mạng chậm quá 8 giây → thôi gợi ý (không để dòng "Đang xem lịch trống…" treo mãi); database vẫn chặn trùng khi đặt
  function load(dateStr) {
    if (cache.key !== dateStr) {
      const start = new Date(`${dateStr}T00:00`).getTime();
      const busy = vendorBusyTimes(vendorId, start - DAY_MS, start + 2 * DAY_MS).catch((error) => {
        console.warn('Chưa xem được lịch trống của tiệm', error);
        return null;
      });
      cache = { key: dateStr, promise: Promise.race([busy, sleep(BUSY_TIMEOUT_MS).then(() => null)]) };
    }
    return cache.promise;
  }

  async function check(dateStr, appointment) {
    if (!dateStr || Number.isNaN(appointment.getTime())) return { state: 'unknown' };
    const [times, hallCount] = await Promise.all([load(dateStr), halls]);
    if (!times) return { state: 'unknown' };

    if (isVenue) {
      // Mỗi sảnh nhận 1 tiệc/ngày: đếm tiệc cùng ngày (giờ Việt Nam) như database
      const day = vnDate(appointment);
      const left = hallCount - times.filter((t) => vnDate(t) === day).length;
      return left > 0
        ? { state: 'free', ok: `✓ Ngày này nhà hàng còn ${left}/${hallCount} sảnh trống.` }
        : { state: 'taken', error: 'Ngày này nhà hàng đã kín sảnh – bạn chọn ngày khác nhé.' };
    }

    const sameDay = times.filter((t) => localDate(t) === dateStr);
    const info = sameDay.length
      ? `Giờ đã có lịch hôm đó: ${sameDay.map(hhmm).join(', ')} – chọn cách ít nhất 2 tiếng.`
      : '';
    const clash = times.find((t) => Math.abs(t - appointment) < GAP_MS);
    if (!clash) {
      return { state: 'free', info, ok: sameDay.length ? `✓ ${hhmm(appointment)} còn trống.` : '✓ Ngày này tiệm chưa có lịch hẹn nào – giờ nào cũng được.' };
    }
    return {
      state: 'taken',
      info,
      error: `${hhmm(appointment)} sát lịch ${hhmm(clash)} tiệm đã nhận – bạn chọn giờ cách ít nhất 2 tiếng nhé.`,
      suggestion: nearestFreeTime(appointment, times, dateStr),
    };
  }

  return { check };
}

// Giờ trống gần giờ khách chọn nhất, trong cùng ngày, 07:00–21:00, cách mọi lịch đã có ≥ 2 tiếng.
// Ứng viên = đúng 2 tiếng trước / sau mỗi lịch (làm tròn ra phút ngoài, vì lịch cũ có thể lẻ giây).
function nearestFreeTime(appointment, times, dateStr) {
  const minute = 60e3;
  const candidates = times
    .flatMap((t) => [Math.floor((t.getTime() - GAP_MS) / minute) * minute, Math.ceil((t.getTime() + GAP_MS) / minute) * minute])
    .map((ms) => new Date(ms))
    .filter((d) => {
      const hour = d.getHours() + d.getMinutes() / 60;
      return localDate(d) === dateStr && hour >= 7 && hour <= 21 && d.getTime() > Date.now()
        && times.every((t) => Math.abs(t - d) >= GAP_MS);
    })
    .sort((a, b) => Math.abs(a - appointment) - Math.abs(b - appointment));
  return candidates[0] ?? null;
}

// Đổi ngày / giờ → chấm lại; trùng thì đặt lỗi lên ô (trình duyệt chặn nút "Xác nhận" + hiện lời nhắc)
function bindSlots(dialogEl, slots, isVenue) {
  const box = $('[data-slots]', dialogEl);
  const dateInput = $('[name=date]', dialogEl);
  const timeInput = $('[name=time]', dialogEl);
  const target = isVenue ? dateInput : timeInput;      // nhà hàng kín cả ngày → báo ở ô ngày
  let ticket = 0;

  async function refresh() {
    const current = ++ticket;
    dateInput.setCustomValidity('');
    timeInput.setCustomValidity('');
    const appointment = new Date(`${dateInput.value}T${timeInput.value}`);
    if (!dateInput.value || !timeInput.value || Number.isNaN(appointment.getTime())) {
      box.dataset.state = '';
      render(box, '');
      return;
    }
    box.dataset.state = 'loading';
    render(box, html`<p class="small muted" style="margin:0">Đang xem lịch trống của ${isVenue ? 'nhà hàng' : 'tiệm'}…</p>`);
    const verdict = await slots.check(dateInput.value, appointment);
    if (current !== ticket) return;                     // khách đã đổi ngày / giờ khác trong lúc chờ
    box.dataset.state = verdict.state;
    if (verdict.error) target.setCustomValidity(verdict.error);
    render(box, html`
      ${verdict.info ? html`<p class="small muted" style="margin:0">${verdict.info}</p>` : ''}
      ${verdict.ok ? html`<p class="small text-green" style="margin:2px 0 0">${verdict.ok}</p>` : ''}
      ${verdict.error ? html`
        <p class="field-error" style="margin-top:4px">${verdict.error}</p>
        ${verdict.suggestion ? html`<button class="btn btn-outline btn-sm" type="button" style="margin-top:6px"
          data-suggest="${hhmm(verdict.suggestion)}">Chọn ${hhmm(verdict.suggestion)} (còn trống)</button>` : ''}` : ''}`);
    $('[data-suggest]', box)?.addEventListener('click', (e) => {
      timeInput.value = e.currentTarget.dataset.suggest;
      timeInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  for (const input of [dateInput, timeInput]) {
    input.addEventListener('input', refresh);
    input.addEventListener('change', refresh);
  }
  refresh();
}
