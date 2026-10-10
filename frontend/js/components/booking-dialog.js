// Hộp thoại đặt lịch dùng chung (trang thử váy + trang đối tác)
import { getProfile, loginUrl } from '../core/auth.js';
import { html, money } from '../core/utils.js';
import { openDialog } from '../core/ui.js';
import { createBooking } from '../services/bookings.js';

const SPLITS = {
  standard: [30, 50, 20],
  bespoke: [30, 40, 30],
};

function tomorrowISODate() {
  const d = new Date(Date.now() + 864e5);
  return d.toISOString().slice(0, 10);
}

/**
 * booking: { vendorId, vendorName, type, dressId?, packageId?, title, price, details?, customPrice? }
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

  const created = await openDialog({
    title: 'Đặt lịch & giữ cọc an toàn',
    confirmText: 'Xác nhận đặt lịch',
    content: html`
      <div class="stack">
        <div class="card" style="padding:12px">
          <strong>${booking.title}</strong>
          <div class="muted small">${booking.vendorName}</div>
          <div class="price">${money(booking.price)}</div>
          <div class="small muted">Thanh toán 3 đợt qua Trạm Hỷ: ${split.join('% → ')}%. Tiền chỉ đến tay đối tác sau khi bạn nghiệm thu từng đợt.</div>
        </div>
        <div class="form-grid">
          <label class="field"><span>Ngày hẹn</span>
            <input class="input" type="date" name="date" min="${tomorrowISODate()}" value="${tomorrowISODate()}" required></label>
          <label class="field"><span>Giờ hẹn</span>
            <input class="input" type="time" name="time" value="09:30" required></label>
          <label class="field"><span>Họ tên</span>
            <input class="input" name="name" value="${profile.full_name || ''}" required maxlength="100"></label>
          <label class="field"><span>Số điện thoại</span>
            <input class="input" name="phone" type="tel" value="${profile.phone || ''}" required pattern="[0-9+ ]{9,15}"></label>
          <label class="field full"><span>Ghi chú cho đối tác (không bắt buộc)</span>
            <textarea class="input" name="note" maxlength="500"></textarea></label>
        </div>
      </div>`,
    onConfirm: (form) => createBooking({
      vendorId: booking.vendorId,
      type: booking.type,
      dressId: booking.dressId,
      packageId: booking.packageId,
      appointmentAt: new Date(`${form.get('date')}T${form.get('time')}`).toISOString(),
      contactName: form.get('name').trim(),
      contactPhone: form.get('phone').trim(),
      note: form.get('note').trim() || null,
      details: booking.details,
      customPrice: booking.customPrice,
    }),
  });

  if (created) location.href = `bookings.html?new=${encodeURIComponent(created.code)}`;
}
