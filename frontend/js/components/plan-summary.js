// Phần dùng chung giữa trang Kế hoạch của chủ kế hoạch và trang xem kế hoạch được chia sẻ:
// đếm ngày đến đám cưới (trước / đúng ngày / sau ngày cưới) và nhãn ngày cưới.
import { html } from '../core/utils.js';

const weddingDay = (plan) => new Date(`${plan.wedding_date}T00:00:00`);

/** Số ngày từ hôm nay đến ngày cưới: > 0 còn bao nhiêu ngày, 0 là hôm nay, < 0 là đã cưới được bao lâu; null khi chưa có ngày */
export function daysToWedding(plan) {
  if (!plan.wedding_date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Làm tròn theo ngày lịch (không theo giờ hiện tại) – tránh lệch 1 ngày quanh nửa đêm / đổi giờ
  return Math.round((weddingDay(plan) - today) / 86_400_000);
}

export const weddingDateLabel = (plan, long = false) => (plan.wedding_date
  ? weddingDay(plan).toLocaleDateString('vi-VN', long
    ? { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' })
  : '');

// Đã cưới lâu thì nói theo tháng / năm cho tự nhiên hơn "Đã cưới được 400 ngày"
function marriedFor(days) {
  if (days < 60) return { num: days, unit: 'ngày' };
  if (days < 730) return { num: Math.floor(days / 30.44), unit: 'tháng' };
  return { num: Math.floor(days / 365.25), unit: 'năm' };
}

/**
 * Thẻ đếm ngày ở tab Tổng quan. data-state quyết định màu nền + màu chữ (CSS .countdown-card[data-state]) – mỗi trạng thái
 * có nền riêng, chữ luôn đủ tương phản. editable = true thì hiện nút "Đặt ngày cưới" khi chưa có ngày (data-edit).
 */
export function countdownCard(plan, { editable = true } = {}) {
  const days = daysToWedding(plan);
  if (days === null) {
    return html`<section class="card countdown-card" data-state="none">
      <span class="countdown-icon" aria-hidden="true">📅</span>
      <strong class="countdown-text">Chưa có ngày cưới</strong>
      ${editable ? html`<button type="button" class="btn btn-light btn-sm" data-edit>Đặt ngày cưới</button>`
        : html`<span class="small countdown-sub">Hai bạn chưa chốt ngày</span>`}
    </section>`;
  }
  if (days > 0) {
    return html`<section class="card countdown-card" data-state="before">
      <span class="small countdown-sub">Còn</span>
      <strong class="countdown-num">${days}</strong>
      <span class="countdown-text">ngày đến đám cưới</span>
      <span class="small countdown-sub">${weddingDateLabel(plan, true)}</span>
    </section>`;
  }
  if (days === 0) {
    return html`<section class="card countdown-card" data-state="today">
      <strong class="countdown-num" aria-hidden="true">🎉</strong>
      <span class="countdown-text">Hôm nay là ngày cưới!</span>
      <span class="small countdown-sub">Chúc hai bạn trăm năm hạnh phúc</span>
    </section>`;
  }
  const { num, unit } = marriedFor(-days);
  return html`<section class="card countdown-card" data-state="after">
    <span class="small countdown-sub">Đã về chung một nhà</span>
    <strong class="countdown-num">${num}</strong>
    <span class="countdown-text">${unit} hạnh phúc 💕</span>
    <span class="small countdown-sub">Cưới ngày ${weddingDateLabel(plan)}</span>
  </section>`;
}
