// Modal Thanh Toán VietQR Tự Động & Bảo Chứng Escrow Trạm Hỷ
// Tương thích chuẩn Soft Luxury & Realtime giống gói cước AI Studio
import { $, html, render, money } from '../core/utils.js';
import { openSheet, toast, toastError } from '../core/ui.js';
import { ESCROW_BANK } from '../config.js';
import { sb } from '../core/supabase.js';
import { payMilestone } from '../services/bookings.js';

// Hiệu ứng pháo hoa ăn mừng (Pure CSS/DOM, không phụ thuộc thư viện bên ngoài)
function fireConfetti(root) {
  const container = document.createElement('div');
  container.className = 'confetti-wrapper';
  const colors = ['#9b2335', '#d4af37', '#e8ded4', '#2a2421', '#ff758c'];
  for (let i = 0; i < 40; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-piece';
    el.style.left = `${Math.random() * 100}%`;
    el.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    el.style.animationDelay = `${Math.random() * 0.4}s`;
    el.style.transform = `scale(${0.6 + Math.random() * 0.8})`;
    container.append(el);
  }
  root.append(container);
  setTimeout(() => container.remove(), 3500);
}

/**
 * Mở modal thanh toán bảo chứng Escrow thời gian thực cho một đợt của đơn đặt lịch
 * @param {Object} options
 * @param {Object} options.booking - Đối tượng booking đầy đủ (kèm milestones, vendor...)
 * @param {number} options.stage - Đợt thanh toán (1, 2 hoặc 3)
 * @param {Function} [options.onPaid] - Callback sau khi thanh toán thành công
 */
export function openEscrowPaymentModal({ booking, stage, onPaid } = {}) {
  const milestone = (booking.milestones || []).find((m) => m.stage === stage);
  if (!milestone) {
    toastError('Không tìm thấy thông tin đợt thanh toán này.');
    return;
  }

  const transferNote = `${booking.code} D${stage}`;
  const qrUrl = `https://img.vietqr.io/image/${ESCROW_BANK.bankId}-${ESCROW_BANK.accountNo}-compact2.png`
    + `?amount=${milestone.amount}&addInfo=${encodeURIComponent(transferNote)}&accountName=${encodeURIComponent(ESCROW_BANK.accountName)}`;

  let channel = null;
  let countdownTimer = null;
  let pollInterval = null;
  let isDone = false;

  function stopAllListeners() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    if (channel) {
      sb.removeChannel(channel);
      channel = null;
    }
  }

  openSheet({
    title: `Thanh toán Đợt ${stage} · ${money(milestone.amount)}`,
    className: 'pricing-sheet escrow-sheet',
    onClose: () => {
      stopAllListeners();
    },
    onOpen: (body, close) => {
      render(body, html`
        <div class="qr-checkout-container">
          <div class="qr-checkout-card">
            <div class="qr-col-left">
              <div class="qr-badge">🛡️ BẢO CHỨNG ESCROW TRẠM HỶ</div>
              <div class="qr-image-box">
                <img src="${qrUrl}" alt="Mã thanh toán VietQR Escrow" class="qr-img">
              </div>
              <div class="qr-note">
                Mở App ngân hàng bất kỳ (TPBank, Vietcombank, MB, Techcombank, MoMo...) quét mã để chuyển khoản
              </div>
            </div>

            <div class="qr-col-right">
              <h3 class="qr-title">Xác Nhận Đặt Cọc Bảo Chứng</h3>
              <div class="qr-plan-pill">
                <strong>Đơn ${booking.code}</strong> · Đợt ${stage}: ${milestone.title || 'Đặt cọc'}
              </div>

              <div class="qr-info-table">
                <div class="qr-info-row">
                  <span class="info-label">Ngân hàng</span>
                  <span class="info-val"><strong>TPBank</strong> (Tiên Phong Bank)</span>
                </div>
                <div class="qr-info-row">
                  <span class="info-label">Số tài khoản</span>
                  <span class="info-val">
                    <strong class="copyable" data-copy="${ESCROW_BANK.accountNo}">${ESCROW_BANK.accountNo}</strong>
                    <button type="button" class="btn-copy" data-copy="${ESCROW_BANK.accountNo}">Sao chép</button>
                  </span>
                </div>
                <div class="qr-info-row">
                  <span class="info-label">Chủ tài khoản</span>
                  <span class="info-val"><strong>${ESCROW_BANK.accountName}</strong></span>
                </div>
                <div class="qr-info-row">
                  <span class="info-label">Số tiền đợt ${stage}</span>
                  <span class="info-val highlight-price">
                    <strong data-copy="${milestone.amount}">${money(milestone.amount)}</strong>
                    <button type="button" class="btn-copy" data-copy="${milestone.amount}">Sao chép</button>
                  </span>
                </div>
                <div class="qr-info-row highlight-code">
                  <span class="info-label">Nội dung CK</span>
                  <span class="info-val">
                    <strong class="code-txt" data-copy="${transferNote}">${transferNote}</strong>
                    <button type="button" class="btn-copy" data-copy="${transferNote}">Sao chép</button>
                  </span>
                </div>
              </div>

              <div class="qr-actions">
                <div class="qr-auto-status" data-auto-status>
                  <div class="qr-status-indicator">
                    <div class="radar-pulse" aria-hidden="true">
                      <span class="radar-circle"></span>
                      <span class="radar-circle"></span>
                      <span class="radar-dot"></span>
                    </div>
                    <div class="qr-status-details">
                      <div class="qr-status-headline">Đang tự động nhận diện thanh toán qua SePay...</div>
                      <div class="qr-status-subline">
                        Khoản tiền sẽ được đưa vào hệ thống Bảo chứng (Escrow) an toàn của Trạm Hỷ ngay khi ngân hàng báo có.
                      </div>
                    </div>
                  </div>

                  <div class="qr-timer-pill">
                    <span class="timer-icon" aria-hidden="true">⏱️</span>
                    <span>Mã QR có hiệu lực trong: <strong class="qr-countdown" data-countdown>15:00</strong></span>
                  </div>
                </div>

                <div class="qr-footer-actions" data-footer-actions>
                  <button type="button" class="btn-troubleshoot-check" data-confirm-paid>
                    Đã chuyển tiền nhưng chưa thấy cập nhật? Bấm vào đây để kiểm tra lại
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      `);

      // Sao chép số tài khoản & nội dung
      body.querySelectorAll('[data-copy]').forEach((el) => {
        el.addEventListener('click', () => {
          const val = el.dataset.copy;
          navigator.clipboard.writeText(val).then(() => toast(`Đã sao chép: ${val}`));
        });
      });

      // Màn hình chúc mừng thành công
      function renderSuccessView() {
        if (isDone) return;
        isDone = true;
        stopAllListeners();

        render(body, html`
          <div class="pricing-success-view">
            <div class="success-icon" aria-hidden="true">🎉</div>
            <h2 class="success-title">Thanh Toán Bảo Chứng Thành Công!</h2>
            <p class="success-message">
              Trạm Hỷ đã nhận và đưa khoản tiền <strong>${money(milestone.amount)}</strong> vào tài khoản bảo chứng an toàn.
              Đơn hàng của bạn đã chuyển sang trạng thái <strong>Đã xác nhận</strong>.
            </p>
            <div class="success-perks">
              <div class="perk-pill">🔒 Tiền được Trạm Hỷ bảo vệ an toàn 100% trong Escrow</div>
              <div class="perk-pill">💍 Đối tác <strong>${booking.vendor?.name || 'tiệm'}</strong> đã nhận thông báo chuẩn bị dịch vụ</div>
              <div class="perk-pill">✨ Bạn chỉ giải ngân cho đối tác khi đã hoàn toàn hài lòng</div>
            </div>
            <button type="button" class="btn btn-primary success-btn" data-finish-escrow>
              Hoàn Tất & Xem Đơn Hàng ✨
            </button>
          </div>
        `);
        fireConfetti(body);

        body.querySelector('[data-finish-escrow]')?.addEventListener('click', () => {
          close();
          onPaid?.();
        });
      }

      // 1. Đếm ngược 15 phút (900s)
      let secondsLeft = 15 * 60;
      const countdownEl = body.querySelector('[data-countdown]');
      const statusBox = body.querySelector('[data-auto-status]');
      const footerActions = body.querySelector('[data-footer-actions]');

      countdownTimer = setInterval(() => {
        secondsLeft--;
        if (secondsLeft <= 0) {
          stopAllListeners();
          if (countdownEl) countdownEl.textContent = '00:00';
          if (statusBox) {
            statusBox.classList.add('status-expired');
            render(statusBox, html`
              <div class="qr-status-indicator">
                <span style="font-size: 22px;" aria-hidden="true">⏱️</span>
                <div class="qr-status-details">
                  <div class="qr-status-headline" style="color: var(--danger, #c62828);">Mã QR đã hết hạn (15 phút)</div>
                  <div class="qr-status-subline">Vui lòng tải lại hoặc mở lại thanh toán để nhận thông tin giao dịch mới nhất.</div>
                </div>
              </div>
            `);
          }
          if (footerActions) {
            render(footerActions, html`
              <button type="button" class="btn btn-recreate-qr" data-reload-page>
                🔄 Tải lại trang
              </button>
            `);
            footerActions.querySelector('[data-reload-page]')?.addEventListener('click', () => {
              location.reload();
            });
          }
          return;
        }

        const m = Math.floor(secondsLeft / 60);
        const s = secondsLeft % 60;
        if (countdownEl) {
          countdownEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        }
      }, 1000);

      // 2. Kênh Supabase Realtime đón sự kiện SePay webhook cập nhật milestone sang 'paid'
      const channelName = `escrow-realtime-${booking.id}-${stage}-${Date.now()}`;
      channel = sb.channel(channelName)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'milestones',
            filter: `booking_id=eq.${booking.id}`,
          },
          (payload) => {
            if (payload.new && payload.new.stage === stage && payload.new.status === 'paid') {
              toast('Nhận diện chuyển khoản thành công qua SePay! ✨');
              renderSuccessView();
            }
          }
        )
        .subscribe();

      // 3. Polling dự phòng mỗi 4 giây phòng trường hợp Realtime WebSocket tạm gián đoạn
      pollInterval = setInterval(async () => {
        if (isDone) return;
        try {
          const { data } = await sb
            .from('milestones')
            .select('status')
            .eq('booking_id', booking.id)
            .eq('stage', stage)
            .maybeSingle();

          if (data && data.status === 'paid') {
            renderSuccessView();
          }
        } catch {
          // Bỏ qua lỗi polling im lặng
        }
      }, 4000);

      // 4. Nút kiểm tra thủ công phụ
      const confirmBtn = body.querySelector('[data-confirm-paid]');
      confirmBtn?.addEventListener('click', async () => {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Đang kiểm tra biến động số dư ngân hàng...';
        try {
          // Kiểm tra xem milestone đã được SePay kích hoạt chưa
          const { data } = await sb
            .from('milestones')
            .select('status')
            .eq('booking_id', booking.id)
            .eq('stage', stage)
            .maybeSingle();

          if (data && data.status === 'paid') {
            renderSuccessView();
            return;
          }

          // Fallback gọi payMilestone nếu người dùng đã chuyển nhưng ngân hàng chậm gửi webhook
          await payMilestone(booking.id, stage);
          renderSuccessView();
        } catch (err) {
          toastError(err);
          confirmBtn.disabled = false;
          confirmBtn.textContent = 'Đã chuyển tiền nhưng chưa thấy cập nhật? Bấm vào đây để kiểm tra lại';
        }
      });
    },
  });
}
