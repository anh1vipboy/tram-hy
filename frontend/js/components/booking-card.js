// Các phần hiển thị dùng chung cho thẻ đơn hàng (trang cô dâu, đối tác, admin)
import { html, money } from '../core/utils.js';
import { MILESTONE_STATUS, statusBadge } from '../core/labels.js';
import { BODY_SHAPES } from '../data/tryon-data.js';

const shapeLabel = (key) => BODY_SHAPES.find((s) => s.key === key)?.label ?? key;

export function milestonesView(booking, actionFor = () => '') {
  return html`
    <div class="milestones">
      ${booking.milestones.map((m) => html`
        <div class="milestone is-${m.status}">
          <span class="small muted">Đợt ${m.stage} (${m.percent}%) · ${m.title}</span>
          <span class="amount">${money(m.amount)}</span>
          ${statusBadge(MILESTONE_STATUS, m.status)}
          ${actionFor(m)}
        </div>`)}
    </div>`;
}

// Thông số may đo / số đo cơ thể lưu trong bookings.details
export function detailsView(details) {
  if (!details || (!details.design && !details.body)) return '';
  const { design, body } = details;
  return html`
    <details>
      <summary class="small" style="cursor:pointer">Hồ sơ số đo & thiết kế</summary>
      <div class="small muted" style="margin-top:6px">
        ${body ? html`<div>Cao ${body.height}cm · Nặng ${body.weight}kg · Giày ${body.heel}cm · Dáng: ${shapeLabel(body.shape)}</div>` : ''}
        ${design ? html`
          <div>Phom: ${design.silhouette} · Cổ: ${design.neckline} · Tay: ${design.sleeve} · Vải: ${design.fabric} · Đuôi: ${design.train_m}m</div>
          ${design.extras?.length ? html`<div>Thêm: ${design.extras.join(', ')}</div>` : ''}
          ${design.notes ? html`<div>Ý tưởng: ${design.notes}</div>` : ''}` : ''}
      </div>
    </details>`;
}

export function openDisputeView(booking) {
  const open = booking.disputes?.find((d) => d.status === 'open');
  if (!open) return '';
  const who = open.kind === 'no_show' ? 'Đối tác báo khách không đến' : 'Cô dâu yêu cầu hoàn cọc';
  return html`<div class="card" style="background:var(--red-soft);border-color:#efc2bd;padding:12px">
    <strong>${who}</strong> – Trạm Hỷ đang xem xét.<div class="small">Lý do: ${open.reason}</div></div>`;
}
