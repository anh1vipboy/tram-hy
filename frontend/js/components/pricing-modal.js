// Modal Bảng Giá & Nâng Cấp Gói AI Studio (Chuẩn Soft Luxury & Editorial)
import { $, html, render, money } from '../core/utils.js';
import { openSheet, toast, toastError } from '../core/ui.js';
import {
  listSubscriptionPlans,
  createSubscriptionOrder,
  activateSubscription,
  watchSubscriptionOrder,
  cancelSubscriptionOrder,
  getMySubscription,
} from '../services/subscription.js';

// Hiệu ứng pháo hoa ăn mừng (Pure CSS/DOM, không phụ thuộc thư viện)
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
 * Hộp thoại quảng cáo các gói cước AI Studio khi vào trang Thử Váy (dành cho tài khoản thường)
 */
export function openPromoDialog({ onUpgrade } = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'modal promo-dialog';
  render(dialog, html`
    <div class="promo-box">
      <button type="button" class="promo-close" data-close aria-label="Đóng">✕</button>
      <div class="promo-header">
        <span class="promo-kicker">✨ ĐẶC QUYỀN MÙA CƯỚI 2026</span>
        <h2 class="promo-title">Nâng Tầm Trải Nghiệm Thử Váy AI</h2>
        <p class="promo-desc">
          Tài khoản của bạn đang ở gói cơ bản <strong>(6 credit/ngày)</strong>. Khám phá các gói nâng cấp để mở khóa <strong>Siêu Nét 1K</strong> và thỏa sức ướm thử mọi chiếc váy mơ ước!
        </p>
      </div>

      <div class="promo-plans-mini">
        <div class="promo-plan-item current">
          <div class="ppi-badge">Đang dùng</div>
          <div class="ppi-name">Khởi Điểm</div>
          <div class="ppi-price">0đ</div>
          <div class="ppi-feat">6 credit/ngày · Chất lượng chuẩn</div>
        </div>

        <div class="promo-plan-item popular">
          <div class="ppi-badge popular-badge">⭐ Được 89% Cô dâu chọn</div>
          <div class="ppi-name">Nàng Thơ Rạng Rỡ</div>
          <div class="ppi-price">149.000đ <small>/ 30 ngày</small></div>
          <div class="ppi-feat">⚡ 60 credit/ngày · Mở Siêu Nét 1K · Tải váy riêng</div>
        </div>

        <div class="promo-plan-item vip">
          <div class="ppi-badge vip-badge">👑 VIP Studio</div>
          <div class="ppi-name">Cẩm Tú Trọn Đôi</div>
          <div class="ppi-price">299.000đ <small>/ 60 ngày</small></div>
          <div class="ppi-feat">150 credit/ngày · Thử Đôi Váy & Vest · AI Stylist</div>
        </div>
      </div>

      <div class="promo-foot">
        <button type="button" class="btn btn-primary shimmer-btn promo-btn-upgrade" data-upgrade>
          ✨ Xem Bảng Giá & Nâng Cấp Ngay
        </button>
        <button type="button" class="promo-btn-skip" data-skip>
          Tiếp tục dùng gói 6 credit miễn phí
        </button>
      </div>
    </div>
  `);

  document.body.append(dialog);

  const close = () => {
    dialog.close();
    dialog.remove();
  };

  dialog.querySelector('[data-close]')?.addEventListener('click', close);
  dialog.querySelector('[data-skip]')?.addEventListener('click', close);
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) close();
  });

  dialog.querySelector('[data-upgrade]')?.addEventListener('click', () => {
    close();
    setTimeout(() => {
      onUpgrade?.();
    }, 60);
  });

  dialog.showModal();
  return close;
}

/**
 * Mở modal bảng giá & nâng cấp gói AI Studio
 * @param {Object} options
 * @param {string} [options.currentPlanId='basic'] - Gói hiện tại của user
 * @param {Function} [options.onUpgraded] - Callback khi nâng cấp thành công (truyền subscription mới)
 */
export async function openPricingModal({ currentPlanId = 'basic', onUpgraded } = {}) {
  const plans = await listSubscriptionPlans();

  let activeOrder = null;
  let unsubscribeWatch = null;
  let countdownTimer = null;

  function stopListeners() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    if (unsubscribeWatch) {
      unsubscribeWatch();
      unsubscribeWatch = null;
    }
  }

  openSheet({
    title: 'Gói Cước AI Thử Váy Cưới',
    className: 'pricing-sheet',
    onClose: () => {
      stopListeners();
    },
    onOpen: (body, close) => {
      // Vẽ màn hình danh sách gói
      function renderPlansView() {
        stopListeners();
        render(body, html`
          <div class="pricing-container">
            <header class="pricing-header">
              <p class="pricing-subtitle">
                Mở khóa <strong>60 – 150 credit/ngày</strong>, chế độ <strong>Siêu Nét 1K</strong> và tự do thử mọi mẫu váy mơ ước suốt mùa cưới.
              </p>
            </header>

            <div class="pricing-grid">
              ${plans.map((p) => {
                const isCurrent = p.id === currentPlanId;
                const isHero = p.id === 'pro_bride';
                const badgeText = p.badge
                  ? (isHero && !p.badge.includes('⭐') ? `⭐ ${p.badge}` : p.badge)
                  : '';
                return html`
                  <div class="pricing-card ${isHero ? 'hero-card' : ''} ${isCurrent ? 'current-card' : ''}">
                    ${badgeText ? html`<div class="pricing-badge">${badgeText}</div>` : ''}
                    <div class="card-head">
                      <h3 class="card-name">${p.name}</h3>
                      <p class="card-desc">${p.description}</p>
                      <div class="card-price">
                        <span class="price-val">${money(p.price)}</span>
                        <span class="price-cycle">${p.price === 0 ? '/ mãi mãi' : ` / ${p.duration_days} ngày`}</span>
                      </div>
                    </div>

                    <div class="card-highlight">
                      <strong>⚡ ${p.daily_credits} credit / ngày</strong>
                      ${p.bonus_credits ? html`<span> · Tặng +${p.bonus_credits} credit</span>` : ''}
                    </div>

                    <ul class="card-features">
                      ${p.features.map((f) => html`
                        <li>
                          <span class="feat-check" aria-hidden="true">✓</span>
                          <span>${f}</span>
                        </li>
                      `)}
                    </ul>

                    <div class="card-action">
                      ${isCurrent
                        ? html`<button type="button" class="btn btn-outline card-btn disabled" disabled>Gói đang dùng</button>`
                        : html`
                          <button type="button" class="btn ${isHero ? 'btn-primary shimmer-btn' : 'btn-outline'} card-btn"
                            data-choose-plan="${p.id}">
                            ${p.price === 0 ? 'Dùng miễn phí' : `Nâng Cấp Ngay`}
                          </button>
                        `}
                    </div>
                  </div>
                `;
              })}
            </div>

            <div class="pricing-trust">
              <span class="trust-item">🔒 Thanh toán bảo mật qua VietQR ngân hàng</span>
              <span class="trust-item">⚡ Tự động kích hoạt ngay trong 3–5 giây</span>
              <span class="trust-item">💖 Hỗ trợ tận tâm từ Trạm Hỷ</span>
            </div>
          </div>
        `);

        // Gắn sự kiện chọn gói
        body.addEventListener('click', async (e) => {
          const btn = e.target.closest('[data-choose-plan]');
          if (!btn) return;
          const planId = btn.dataset.choosePlan;
          if (planId === 'basic') {
            close();
            return;
          }

          btn.disabled = true;
          btn.textContent = 'Đang khởi tạo mã QR...';
          try {
            activeOrder = await createSubscriptionOrder(planId);
            renderQrView(activeOrder);
          } catch (err) {
            toastError(err);
            btn.disabled = false;
            btn.textContent = 'Nâng Cấp Ngay';
          }
        });
      }

      // Vẽ màn hình thanh toán VietQR với kênh Realtime & đồng hồ 15 phút
      function renderQrView(order) {
        stopListeners();

        const qrUrl = `https://img.vietqr.io/image/TPB-0355521617-compact2.png?amount=${order.amount}&addInfo=${encodeURIComponent(order.code)}&accountName=PHUNG%20DUC%20ANH`;

        render(body, html`
          <div class="qr-checkout-container">
            <button type="button" class="btn-back" data-back-to-plans>← Chọn gói khác</button>
            <div class="qr-checkout-card">
              <div class="qr-col-left">
                <div class="qr-badge">Quét mã VietQR để kích hoạt tự động</div>
                <div class="qr-image-box">
                  <img src="${qrUrl}" alt="Mã thanh toán VietQR" class="qr-img">
                </div>
                <div class="qr-note">Mở App ngân hàng bất kỳ (TPBank, Vietcombank, MB, Techcombank, MoMo...) quét mã</div>
              </div>

              <div class="qr-col-right">
                <h3 class="qr-title">Xác Nhận Nâng Cấp Gói</h3>
                <div class="qr-plan-pill">
                  <strong>${order.plan.name}</strong> · ${money(order.amount)} / ${order.plan.duration_days} ngày
                </div>

                <div class="qr-info-table">
                  <div class="qr-info-row">
                    <span class="info-label">Ngân hàng</span>
                    <span class="info-val"><strong>TPBank</strong> (Tiên Phong Bank)</span>
                  </div>
                  <div class="qr-info-row">
                    <span class="info-label">Số tài khoản</span>
                    <span class="info-val">
                      <strong class="copyable" data-copy="0355521617">0355521617</strong>
                      <button type="button" class="btn-copy" data-copy="0355521617">Sao chép</button>
                    </span>
                  </div>
                  <div class="qr-info-row">
                    <span class="info-label">Chủ tài khoản</span>
                    <span class="info-val"><strong>PHUNG DUC ANH</strong></span>
                  </div>
                  <div class="qr-info-row">
                    <span class="info-label">Số tiền</span>
                    <span class="info-val highlight-price"><strong>${money(order.amount)}</strong></span>
                  </div>
                  <div class="qr-info-row highlight-code">
                    <span class="info-label">Nội dung CK</span>
                    <span class="info-val">
                      <strong class="code-txt" data-copy="${order.code}">${order.code}</strong>
                      <button type="button" class="btn-copy" data-copy="${order.code}">Sao chép</button>
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
                        <div class="qr-status-headline">Đang tự động nhận diện thanh toán...</div>
                        <div class="qr-status-subline">
                          Hệ thống sẽ tự động nổ pháo hoa và kích hoạt gói cước ngay khi nhận được chuyển khoản từ App ngân hàng.
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
                      Đã chuyển tiền nhưng chưa thấy kích hoạt? Bấm vào đây để kiểm tra lại
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `);

        // Gắn sự kiện chép nội dung & số tài khoản
        body.querySelectorAll('[data-copy]').forEach((el) => {
          el.addEventListener('click', () => {
            const val = el.dataset.copy;
            navigator.clipboard.writeText(val).then(() => toast(`Đã sao chép: ${val}`));
          });
        });

        // Nút quay lại chọn gói
        body.querySelector('[data-back-to-plans]')?.addEventListener('click', () => {
          renderPlansView();
        });

        // 1. Khởi động đồng hồ đếm ngược 15 phút (900 giây)
        let secondsLeft = 15 * 60;
        const countdownEl = body.querySelector('[data-countdown]');
        const statusBox = body.querySelector('[data-auto-status]');
        const footerActions = body.querySelector('[data-footer-actions]');
        const confirmBtn = body.querySelector('[data-confirm-paid]');

        countdownTimer = setInterval(async () => {
          secondsLeft--;
          if (secondsLeft <= 0) {
            stopListeners();
            // Cập nhật trạng thái đơn thành 'cancelled' (Thất bại / Hết hạn) trong DB
            await cancelSubscriptionOrder(order.code);
            if (countdownEl) countdownEl.textContent = '00:00';
            if (statusBox) {
              statusBox.classList.add('status-expired');
              render(statusBox, html`
                <div class="qr-status-indicator">
                  <span style="font-size: 22px;" aria-hidden="true">⏱️</span>
                  <div class="qr-status-details">
                    <div class="qr-status-headline" style="color: var(--danger, #c62828);">Mã QR đã hết hạn (15 phút)</div>
                    <div class="qr-status-subline">Giao dịch chưa hoàn tất đã tự động chuyển sang trạng thái <strong>Thất bại (Hết hạn)</strong> trên hệ thống.</div>
                  </div>
                </div>
              `);
            }
            if (footerActions) {
              render(footerActions, html`
                <button type="button" class="btn btn-recreate-qr" data-recreate-qr>
                  🔄 Tạo mã QR thanh toán mới
                </button>
              `);
              footerActions.querySelector('[data-recreate-qr]')?.addEventListener('click', async () => {
                try {
                  activeOrder = await createSubscriptionOrder(order.plan.id);
                  renderQrView(activeOrder);
                } catch (err) {
                  toastError(err);
                }
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

        // 2. Kênh lắng nghe Supabase Realtime (nhận webhook biến động ngân hàng tự động)
        unsubscribeWatch = watchSubscriptionOrder(order.code, async () => {
          stopListeners();
          toast('Thanh toán thành công! Gói cước đã được kích hoạt ✨');
          const freshSub = await getMySubscription();
          renderSuccessView(freshSub?.has_subscription ? freshSub : {
            plan_id: order.plan.id,
            plan_name: order.plan.name,
            daily_credits: order.plan.daily_credits,
            bonus_credits: order.plan.bonus_credits,
          });
        });

        // 3. Nút kiểm tra thủ công phụ (dành cho trường hợp khách chuyển tiền muộn hoặc kiểm tra lại)
        confirmBtn?.addEventListener('click', async () => {
          confirmBtn.disabled = true;
          confirmBtn.textContent = 'Đang kiểm tra biến động số dư ngân hàng...';
          try {
            const res = await activateSubscription(order);
            stopListeners();
            const freshSub = await getMySubscription();
            renderSuccessView(freshSub?.has_subscription ? freshSub : res);
          } catch (err) {
            toastError(err);
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Đã chuyển tiền nhưng chưa thấy kích hoạt? Bấm vào đây để kiểm tra lại';
          }
        });
      }

      // Vẽ màn hình chúc mừng nâng cấp thành công
      function renderSuccessView(res) {
        stopListeners();
        render(body, html`
          <div class="pricing-success-view">
            <div class="success-icon" aria-hidden="true">🎉</div>
            <h2 class="success-title">Nâng Cấp Thành Công!</h2>
            <p class="success-message">
              Chào mừng bạn đến với <strong>${res.plan_name}</strong>. Hạn mức của bạn đã được nâng lên 
              <strong>${res.daily_credits} credit/ngày</strong>${res.bonus_credits ? ` và được tặng thêm ${res.bonus_credits} credit!` : '!'}
            </p>
            <div class="success-perks">
              <div class="perk-pill">✨ Siêu Nét 1K Ultra HD đã mở khóa</div>
              <div class="perk-pill">👗 Tự do tải lên mẫu váy cưới riêng</div>
              <div class="perk-pill">⚡ Xử lý ưu tiên hàng đợi VIP</div>
            </div>
            <button type="button" class="btn btn-primary success-btn" data-start-tryon>
              Trải Nghiệm Ngay ✨
            </button>
          </div>
        `);
        fireConfetti(body);

        body.querySelector('[data-start-tryon]')?.addEventListener('click', async () => {
          close();
          const freshSub = await getMySubscription();
          onUpgraded?.(freshSub?.has_subscription ? freshSub : res);
        });
      }

      // Khởi tạo
      renderPlansView();
    },
  });
}
