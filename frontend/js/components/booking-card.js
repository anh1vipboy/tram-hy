// Các phần hiển thị & xử lý dùng chung cho thẻ đơn hàng (trang cô dâu, đối tác, admin)
// Áp dụng đồng nhất cho TẤT CẢ dịch vụ cưới: Váy cưới (thuê/may đo), Nhà hàng tiệc cưới, Studio, Trang trí, Makeup.
import { html, money, dateTime } from '../core/utils.js';
import { MILESTONE_STATUS, VENDOR_CATEGORY, statusBadge } from '../core/labels.js';
import { openDialog, toast, toastError, withBusy } from '../core/ui.js';
import { BODY_SHAPES } from '../data/tryon-data.js';
import {
  respondDisputeAsBride,
  respondDisputeAsVendor,
  restoreDisputedBooking,
  triggerBookingSla,
} from '../services/bookings.js';

const shapeLabel = (key) => BODY_SHAPES.find((s) => s.key === key)?.label ?? key;

export const SLA_DISPUTE_HOURS = 48;
export const SLA_REVIEW_HOURS = 72;

/** Tính thời gian đếm ngược SLA 48 giờ cho khiếu nại đang mở */
export function disputeSlaInfo(openDispute, details = {}) {
  if (!openDispute) return null;
  const createdMs = new Date(openDispute.created_at).getTime();
  const deadlineMs = createdMs + SLA_DISPUTE_HOURS * 3_600_000;
  const remainMs = deadlineMs - Date.now();
  const isOverdue = remainMs <= 0;
  const hours = Math.max(0, Math.floor(remainMs / 3_600_000));
  const minutes = Math.max(0, Math.floor((remainMs % 3_600_000) / 60_000));
  const brideResponse = details?.dispute_response || null;
  const vendorReply = details?.vendor_dispute_reply || null;
  const hasCounterResponse = openDispute.kind === 'no_show' ? Boolean(brideResponse) : Boolean(vendorReply);

  let badgeText = '';
  let badgeTone = 'warn';
  if (hasCounterResponse) {
    badgeText = brideResponse?.type === 'reschedule'
      ? '📅 Khách đã đề xuất lịch hẹn mới – Chờ xác nhận'
      : '💬 Đã có phản hồi giải trình – Chờ phân xử';
    badgeTone = 'info';
  } else if (isOverdue) {
    badgeText = `⚠️ Quá hạn ${SLA_DISPUTE_HOURS}h chưa phản hồi`;
    badgeTone = 'overdue';
  } else {
    badgeText = `⏳ Hạn phản hồi: còn ${hours}h ${minutes}p`;
    badgeTone = 'countdown';
  }

  return {
    deadlineMs,
    remainMs,
    isOverdue,
    hours,
    minutes,
    brideResponse,
    vendorReply,
    hasCounterResponse,
    badgeText,
    badgeTone,
  };
}

/** Tính thời gian đếm ngược SLA 72 giờ tự động nghiệm thu khi đối tác đã bấm "Báo đã xong" */
export function reviewSlaInfo(booking) {
  if (!booking || booking.status !== 'ready_for_review') return null;
  const updatedMs = new Date(booking.updated_at || booking.created_at).getTime();
  const deadlineMs = updatedMs + SLA_REVIEW_HOURS * 3_600_000;
  const remainMs = deadlineMs - Date.now();
  const isOverdue = remainMs <= 0;
  const hours = Math.max(0, Math.floor(remainMs / 3_600_000));
  const minutes = Math.max(0, Math.floor((remainMs % 3_600_000) / 60_000));
  return {
    isOverdue,
    hours,
    minutes,
    label: isOverdue
      ? `⚡ Đã qua ${SLA_REVIEW_HOURS}h chờ nghiệm thu – Đủ điều kiện giải ngân tự động`
      : `⏳ Tự động nghiệm thu & giải ngân sau ${hours}h ${minutes}p nếu khách bận quên bấm`,
  };
}

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

// Thông số may đo / số đo cơ thể / lịch sử dời lịch lưu trong bookings.details
export function detailsView(details) {
  if (!details) return '';
  const { design, body, reschedule_history: history } = details;
  const hasSpec = Boolean(design || body);
  const hasHistory = Array.isArray(history) && history.length > 0;
  if (!hasSpec && !hasHistory) return '';

  return html`
    <div class="stack" style="gap:6px">
      ${hasSpec ? html`
        <details>
          <summary class="small" style="cursor:pointer">Hồ sơ số đo & thiết kế</summary>
          <div class="small muted" style="margin-top:6px">
            ${body ? html`<div>Cao ${body.height}cm · Nặng ${body.weight}kg · Giày ${body.heel}cm · Dáng: ${shapeLabel(body.shape)}</div>` : ''}
            ${design ? html`
              <div>Phom: ${design.silhouette} · Cổ: ${design.neckline} · Tay: ${design.sleeve} · Vải: ${design.fabric} · Đuôi: ${design.train_m}m</div>
              ${design.extras?.length ? html`<div>Thêm: ${design.extras.join(', ')}</div>` : ''}
              ${design.budget ? html`<div>Ngân sách mong muốn: <strong>${design.budget}</strong></div>` : ''}
              ${design.notes ? html`<div>Ý tưởng: ${design.notes}</div>` : ''}` : ''}
          </div>
        </details>` : ''}
      ${hasHistory ? html`
        <div class="small muted" style="padding:6px 10px;background:var(--bg-soft);border-radius:8px;border:1px dashed var(--line)">
          🔄 <strong>Đã hỗ trợ dời lịch hẹn (${history.length} lần):</strong>
          Lịch mới nhất ${dateTime(history[history.length - 1].to_appointment_at)}
          ${history[history.length - 1].note ? ` · "${history[history.length - 1].note}"` : ''}
        </div>` : ''}
    </div>`;
}

function defaultTomorrowIso() {
  const d = new Date(Date.now() + 2 * 86_400_000);
  d.setHours(10, 0, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T10:00`;
}

function cleanPhone(phone) {
  return String(phone || '').replace(/[^0-9+]/g, '');
}

/**
 * Hiển thị hộp Khiếu nại & SLA 48h kèm các nút phản hồi / xin dời lịch / khôi phục đơn
 * viewerRole: 'bride' | 'vendor' | 'admin'
 */
export function openDisputeView(booking, { viewerRole = 'bride' } = {}) {
  const open = booking.disputes?.find((d) => d.status === 'open');
  if (!open) {
    // Nếu đơn đang ở trạng thái chờ nghiệm thu (ready_for_review), hiện nhắc SLA 72h
    if (booking.status === 'ready_for_review') {
      const revSla = reviewSlaInfo(booking);
      if (!revSla) return '';
      return html`
        <div class="dispute-sla-bar is-review" data-booking-sla="${booking.id}">
          <span>${revSla.label}</span>
          ${revSla.isOverdue && (viewerRole === 'vendor' || viewerRole === 'admin') ? html`
            <button type="button" class="btn btn-primary btn-sm" data-dispute-act="trigger-sla" data-booking-id="${booking.id}">
              ⚡ Giải ngân tự động (Quá 72h)
            </button>` : ''}
        </div>`;
    }
    return '';
  }

  const sla = disputeSlaInfo(open, booking.details);
  const held = (booking.milestones || []).filter((m) => m.status === 'paid').reduce((t, m) => t + m.amount, 0);
  const isNoShow = open.kind === 'no_show';
  const who = isNoShow ? 'Đối tác báo khách không đến buổi hẹn' : 'Khách hàng yêu cầu hoàn tiền cọc';
  const catLabel = VENDOR_CATEGORY[booking.vendor?.category] || 'Dịch vụ cưới';
  const brideResp = sla.brideResponse;
  const vendorReply = sla.vendorReply;
  const customerPhone = cleanPhone(booking.contact_phone);
  const vendorPhone = cleanPhone(booking.vendor?.phone);

  return html`
    <div class="dispute-box stack" data-dispute-box="${booking.id}">
      <div class="row" style="justify-content:space-between;align-items:flex-start;gap:8px">
        <div>
          <strong style="color:var(--red);font-size:14px">${isNoShow ? '🚫' : '⚠️'} ${who}</strong>
          <div class="small muted">Áp dụng quy chuẩn bảo chứng Escrow (${catLabel}) · Đang khóa tạm thời: <strong>${money(held)}</strong></div>
        </div>
        <span class="sla-pill is-${sla.badgeTone}">${sla.badgeText}</span>
      </div>

      <div class="small" style="background:rgba(255,255,255,0.75);padding:8px 10px;border-radius:8px;border:1px solid #efc2bd">
        <div><strong>Lý do báo cáo:</strong> ${open.reason}</div>
        ${booking.appointment_at ? html`<div class="muted" style="margin-top:2px">Lịch hẹn gốc của đơn: <strong>${dateTime(booking.appointment_at)}</strong></div>` : ''}
      </div>

      ${brideResp ? html`
        <div class="dispute-response-card is-bride">
          <div class="row" style="justify-content:space-between">
            <strong>${brideResp.type === 'reschedule' ? '📅 Khách hàng xin dời sang lịch hẹn mới' : '💬 Giải trình từ Khách hàng'}</strong>
            <span class="small muted">${dateTime(brideResp.responded_at)}</span>
          </div>
          ${brideResp.proposed_appointment_at ? html`
            <div class="small" style="margin-top:4px">
              Giờ hẹn mới đề xuất: <strong style="color:var(--brand)">${dateTime(brideResp.proposed_appointment_at)}</strong>
            </div>` : ''}
          <div class="small" style="margin-top:4px">"${brideResp.message}"</div>
        </div>` : ''}

      ${vendorReply ? html`
        <div class="dispute-response-card is-vendor">
          <div class="row" style="justify-content:space-between">
            <strong>🏪 Phản hồi từ Đối tác (${vendorReply.by_name})</strong>
            <span class="small muted">${dateTime(vendorReply.responded_at)}</span>
          </div>
          <div class="small" style="margin-top:4px">"${vendorReply.message}"</div>
        </div>` : ''}

      <div class="small muted">
        ${isNoShow
          ? (sla.hasCounterResponse
              ? '💡 Khách hàng đã gửi đề xuất. Nếu Đối tác đồng ý hẹn lại, đơn hàng sẽ được khôi phục ngay và giữ nguyên tiền cọc.'
              : `💡 Cơ chế tự động bảo vệ 2 chiều: Nếu khách bận/quên không phản hồi hoặc xin dời lịch trong ${SLA_DISPUTE_HOURS} giờ kể từ lúc báo cáo, hệ thống cho phép giải ngân tiền cọc đền bù cho Đối tác.`)
          : `💡 Tiền cọc ${money(held)} đang được Trạm Hỷ khóa an toàn. Nếu Đối tác không phản hồi trong ${SLA_DISPUTE_HOURS} giờ, khách hàng được ưu tiên hoàn cọc 100%.`}
      </div>

      ${viewerRole === 'bride' ? html`
        <div class="row" style="gap:8px;padding-top:4px">
          ${isNoShow ? html`
            <button type="button" class="btn btn-primary btn-sm" data-dispute-act="bride-reschedule" data-booking-id="${booking.id}">
              📅 ${brideResp?.type === 'reschedule' ? 'Đổi lại lịch đề xuất' : 'Xin hẹn lại lịch mới (Giữ cọc)'}
            </button>
            <button type="button" class="btn btn-outline btn-sm" data-dispute-act="bride-rebuttal" data-booking-id="${booking.id}">
              💬 ${brideResp ? 'Cập nhật giải trình' : 'Gửi giải trình cho Admin'}
            </button>
            ${vendorPhone ? html`<a class="btn btn-outline btn-sm" href="tel:${vendorPhone}">📞 Gọi tiệm</a>` : ''}
          ` : html`
            <button type="button" class="btn btn-outline btn-sm" data-dispute-act="restore-booking" data-booking-id="${booking.id}">
              ↩️ Rút khiếu nại &amp; Tiếp tục đơn
            </button>
            ${sla.isOverdue && !sla.hasCounterResponse ? html`
              <button type="button" class="btn btn-primary btn-sm" data-dispute-act="trigger-sla" data-booking-id="${booking.id}">
                ⚡ Nhận hoàn cọc tự động (Quá 48h)
              </button>` : ''}
          `}
        </div>` : ''}

      ${viewerRole === 'vendor' ? html`
        <div class="row" style="gap:8px;padding-top:4px">
          ${isNoShow ? html`
            <button type="button" class="btn ${brideResp?.type === 'reschedule' ? 'btn-primary' : 'btn-outline'} btn-sm"
                    data-dispute-act="restore-booking" data-booking-id="${booking.id}">
              ✅ ${brideResp?.type === 'reschedule' ? `Đồng ý lịch mới (${dateTime(brideResp.proposed_appointment_at)})` : 'Đồng ý hẹn lại & Khôi phục đơn'}
            </button>
            ${sla.isOverdue && !sla.hasCounterResponse ? html`
              <button type="button" class="btn btn-primary btn-sm" data-dispute-act="trigger-sla" data-booking-id="${booking.id}">
                ⚡ Giải ngân đền bù (Quá 48h khách quên)
              </button>` : ''}
          ` : html`
            <button type="button" class="btn btn-outline btn-sm" data-dispute-act="vendor-reply" data-booking-id="${booking.id}">
              💬 ${vendorReply ? 'Cập nhật giải trình của tiệm' : 'Gửi giải trình cho Admin'}
            </button>
          `}
          ${customerPhone ? html`
            <a class="btn btn-outline btn-sm" href="tel:${customerPhone}" title="Gọi nhắc khách">📞 Gọi khách</a>
            <a class="btn btn-outline btn-sm" href="https://zalo.me/${customerPhone}" target="_blank" rel="noopener">💬 Zalo khách</a>
          ` : ''}
        </div>` : ''}
    </div>`;
}

/**
 * Gắn sự kiện cho các nút xử lý Khiếu nại / Xin dời lịch / SLA tự động bên trong container.
 * Dùng chung cho cả trang Đơn của tôi (bride), Kênh đối tác (vendor) và Quản trị (admin).
 */
export function bindDisputeActions(container, getBookingById, onDone) {
  if (!container) return;

  container.querySelectorAll('[data-dispute-act]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const bookingId = btn.dataset.bookingId;
      const booking = getBookingById(bookingId);
      if (!booking) return;
      const act = btn.dataset.disputeAct;

      if (act === 'bride-reschedule') {
        const prevProp = booking.details?.dispute_response?.proposed_appointment_at;
        const defaultDt = prevProp ? String(prevProp).slice(0, 16) : defaultTomorrowIso();
        const defaultMsg = booking.details?.dispute_response?.message
          || 'Xin lỗi tiệm, hôm hẹn vừa rồi mình bận việc đột xuất nên quên báo trước. Cho mình xin phép dời sang lịch hẹn mới này nhé!';
        const ok = await openDialog({
          title: `📅 Xin hẹn lại lịch mới – Đơn ${booking.code}`,
          confirmText: 'Gửi đề xuất lịch mới',
          content: html`
            <div class="stack" style="gap:12px">
              <p class="small muted" style="margin:0">
                Đề xuất sẽ được gửi ngay tới <strong>${booking.vendor?.name || 'Đối tác'}</strong> và <strong>Quản trị viên Trạm Hỷ</strong>.
                Khi tiệm hoặc Admin xác nhận, đơn hàng sẽ được khôi phục và <strong>giữ nguyên 100% tiền cọc</strong> của bạn.
              </p>
              <label class="field">
                <span>Chọn ngày &amp; giờ hẹn mới bạn chắc chắn đến được</span>
                <input class="input" type="datetime-local" name="proposedAt" required value="${defaultDt}">
              </label>
              <label class="field">
                <span>Lời nhắn gửi tiệm &amp; Trạm Hỷ</span>
                <textarea class="input" name="message" rows="3" required minlength="5" maxlength="600">${defaultMsg}</textarea>
              </label>
            </div>`,
          onConfirm: (form) => respondDisputeAsBride(booking.id, {
            responseType: 'reschedule',
            proposedAppointmentAt: new Date(form.get('proposedAt')).toISOString(),
            message: form.get('message').trim(),
          }),
        });
        if (ok) {
          toast('Đã gửi đề xuất lịch hẹn mới cho Đối tác & Trạm Hỷ!', 'success');
          onDone?.();
        }
      }

      if (act === 'bride-rebuttal') {
        const defaultMsg = booking.details?.dispute_response?.message || '';
        const ok = await openDialog({
          title: `💬 Gửi giải trình khiếu nại – Đơn ${booking.code}`,
          confirmText: 'Gửi giải trình',
          content: html`
            <div class="stack" style="gap:12px">
              <p class="small muted" style="margin:0">
                Nếu bạn đã đến đúng hẹn, đã báo tiệm trước hoặc có sự nhầm lẫn từ phía đối tác, hãy ghi rõ bên dưới để Trạm Hỷ bảo vệ tiền cọc cho bạn.
              </p>
              <label class="field">
                <span>Nội dung giải trình chi tiết</span>
                <textarea class="input" name="message" rows="4" required minlength="5" maxlength="1000"
                          placeholder="VD: Mình đã nhắn Zalo báo tiệm dời lịch từ hôm trước và được nhân viên xác nhận...">${defaultMsg}</textarea>
              </label>
            </div>`,
          onConfirm: (form) => respondDisputeAsBride(booking.id, {
            responseType: 'rebuttal',
            proposedAppointmentAt: null,
            message: form.get('message').trim(),
          }),
        });
        if (ok) {
          toast('Đã gửi giải trình lên Trạm Hỷ và Đối tác.', 'success');
          onDone?.();
        }
      }

      if (act === 'vendor-reply') {
        const defaultMsg = booking.details?.vendor_dispute_reply?.message || '';
        const ok = await openDialog({
          title: `🏪 Giải trình của Tiệm – Đơn ${booking.code}`,
          confirmText: 'Gửi phản hồi',
          content: html`
            <div class="stack" style="gap:12px">
              <p class="small muted" style="margin:0">
                Ghi rõ tình trạng thực hiện đơn, lịch sử trao đổi với khách để Quản trị viên Trạm Hỷ đối chiếu công bằng.
              </p>
              <label class="field">
                <span>Phản hồi từ tiệm</span>
                <textarea class="input" name="message" rows="4" required minlength="5" maxlength="1000"
                          placeholder="VD: Tiệm đã chuẩn bị đầy đủ sảnh/váy theo đúng hợp đồng và liên hệ khách...">${defaultMsg}</textarea>
              </label>
            </div>`,
          onConfirm: (form) => respondDisputeAsVendor(booking.id, {
            message: form.get('message').trim(),
          }),
        });
        if (ok) {
          toast('Đã gửi phản hồi của tiệm lên hệ thống.', 'success');
          onDone?.();
        }
      }

      if (act === 'restore-booking') {
        const proposedIso = booking.details?.dispute_response?.proposed_appointment_at || booking.appointment_at;
        const defaultDt = proposedIso ? new Date(new Date(proposedIso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : defaultTomorrowIso();
        const ok = await openDialog({
          title: `✅ Khôi phục đơn ${booking.code} & Cập nhật lịch hẹn`,
          confirmText: 'Xác nhận khôi phục đơn',
          content: html`
            <div class="stack" style="gap:12px">
              <p class="small muted" style="margin:0">
                Khiếu nại sẽ được đóng lại, tiền cọc bảo chứng vẫn giữ nguyên và đơn hàng quay trở lại tiến độ hoạt động bình thường.
              </p>
              <label class="field">
                <span>Lịch hẹn thống nhất mới</span>
                <input class="input" type="datetime-local" name="newAppointmentAt" required value="${defaultDt}">
              </label>
              <label class="field">
                <span>Ghi chú thống nhất (gửi thông báo cho hai bên)</span>
                <input class="input" name="note" maxlength="400" value="Hai bên đã thống nhất dời sang lịch hẹn mới và tiếp tục thực hiện đơn.">
              </label>
            </div>`,
          onConfirm: (form) => restoreDisputedBooking(booking.id, {
            newAppointmentAt: new Date(form.get('newAppointmentAt')).toISOString(),
            note: form.get('note').trim(),
          }),
        });
        if (ok) {
          toast('Đã khôi phục đơn hàng & cập nhật lịch hẹn mới!', 'success');
          onDone?.();
        }
      }

      if (act === 'trigger-sla') {
        withBusy(btn, async () => {
          try {
            await triggerBookingSla(booking.id);
            toast('Đã xử lý tự động theo hạn chót SLA thành công!', 'success');
            onDone?.();
          } catch (err) {
            toastError(err);
          }
        });
      }
    });
  });
}
