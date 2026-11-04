// Ngăn kéo Giỏ hàng dịch vụ cưới (header) + Hộp thoại Đặt lịch gộp thông minh (chuẩn Klook)
import { getProfile, loginUrl } from '../core/auth.js';
import { $, html, render, money, sizedImage, initials } from '../core/utils.js';
import { toast, toastError, openDialog, withBusy } from '../core/ui.js';
import { VENDOR_CATEGORY } from '../core/labels.js';
import { openBookingDialog } from './booking-dialog.js';
import { createBooking } from '../services/bookings.js';
import { addServiceToPlanBudget } from '../services/planner.js';
import {
  getCartItems,
  itemTotalPrice,
  loadCart,
  removeFromCart,
  clearCart,
  updateCartItemQuantity,
  subscribeCart,
} from '../services/cart.js';

const DAY_MS = 864e5;
const pad = (n) => String(n).padStart(2, '0');
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function itemKindLabel(it) {
  if (it.itemType === 'dress') {
    return it.dressType === 'bespoke' ? 'Váy may đo' : 'Váy thuê sẵn';
  }
  if (it.isVenue || it.vendorCategory === 'venue') return 'Nhà hàng tiệc';
  if (it.itemType === 'package') return VENDOR_CATEGORY[it.vendorCategory] || 'Gói dịch vụ';
  return VENDOR_CATEGORY[it.vendorCategory] || 'Đối tác cưới';
}

function bookingTypeForCartItem(it) {
  if (it.itemType === 'dress') {
    return it.dressType === 'bespoke' ? 'bespoke_image' : 'rental';
  }
  return 'service';
}

/**
 * Đặt lịch riêng cho 1 mục trong giỏ hàng qua hộp thoại chuẩn openBookingDialog.
 * Khi openBookingDialog xác nhận thành công, mục đó cũng được dọn khỏi giỏ.
 */
export async function bookSingleCartItem(it) {
  if (!it) return;
  const bookingPayload = {
    vendorId: it.vendorId,
    vendorName: it.vendorName,
    type: bookingTypeForCartItem(it),
    dressId: it.dressId || null,
    packageId: it.packageId || null,
    title: it.title,
    price: it.price,
    unitPrice: it.price,
    isVenue: Boolean(it.isVenue),
    minQty: it.minQty || 5,
    maxQty: it.maxQty || 300,
    details: {
      source: 'cart',
      item_key: it.key,
      service_name: it.title,
    },
  };
  await removeFromCart(it.key);
  await openBookingDialog(bookingPayload);
}

/**
 * Gợi ý lịch hẹn thông minh cho danh sách dịch vụ trong giỏ:
 * - Các dịch vụ tư vấn / thử váy xếp cách nhau 2 tiếng (09:00, 11:30, 14:30, 16:30), quá 17:00 thì sang ngày kế tiếp.
 * - Nhà hàng tiệc mặc định gợi ý 18:00.
 */
function suggestBatchSlots(items) {
  const SLOTS = ['09:00', '11:30', '14:30', '16:30'];
  let dayOffset = 1;
  let slotIdx = 0;

  return items.map((it) => {
    if (it.isVenue) {
      const dateStr = localDate(new Date(Date.now() + (dayOffset + 1) * DAY_MS));
      return { date: dateStr, time: '18:00' };
    }
    const dateStr = localDate(new Date(Date.now() + dayOffset * DAY_MS));
    const timeStr = SLOTS[slotIdx];
    slotIdx += 1;
    if (slotIdx >= SLOTS.length) {
      slotIdx = 0;
      dayOffset += 1;
    }
    return { date: dateStr, time: timeStr };
  });
}

/**
 * Hộp thoại Đặt lịch gộp thông minh (Batch Booking) theo chuẩn Klook:
 * - Nhập Họ tên, Số điện thoại, Ghi chú chung 1 lần duy nhất.
 * - Chọn Ngày hẹn + Giờ hẹn riêng cho từng dịch vụ (tự động gợi ý cách nhau 2 tiếng).
 */
export async function openBatchBookingDialog(items) {
  if (!items?.length) return;
  if (items.length === 1) {
    await bookSingleCartItem(items[0]);
    return;
  }

  const profile = await getProfile();
  if (!profile) {
    location.href = loginUrl();
    return;
  }

  const tomorrow = localDate(new Date(Date.now() + DAY_MS));
  const suggestions = suggestBatchSlots(items);

  const calcTotals = (dialogEl) => {
    let sum = 0;
    items.forEach((it, idx) => {
      if (it.isVenue && dialogEl) {
        const qInput = dialogEl.querySelector(`[name="qty_${idx}"]`);
        const qty = Number(qInput?.value) || it.quantity || 30;
        sum += it.price * qty;
      } else {
        sum += itemTotalPrice(it);
      }
    });
    return sum;
  };

  const initialTotal = items.reduce((s, it) => s + itemTotalPrice(it), 0);

  const result = await openDialog({
    title: `Đặt lịch gộp ${items.length} dịch vụ cưới`,
    confirmText: `Xác nhận đặt ${items.length} dịch vụ`,
    content: html`
      <div class="stack">
        <div style="background:var(--brand-soft);border-radius:12px;padding:12px 14px">
          <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:6px">
            <span>Tổng dự kiến (${items.length} dịch vụ): <strong class="price" data-batch-total>${money(initialTotal)}</strong></span>
            <span class="small">Cọc giữ lịch đợt 1 (30%): <strong class="price" data-batch-deposit>${money(Math.round(initialTotal * 0.3))}</strong></span>
          </div>
          <div class="small muted" style="margin-top:4px">
            ✨ Hệ thống đã tự động xếp lịch hẹn cách nhau 2 tiếng để hai bạn thong thả di chuyển. Bạn có thể chỉnh lại từng khung giờ bên dưới.
          </div>
          <div class="small" style="margin-top:4px;color:var(--green);font-weight:600">
            🛡️ Bảo chứng Escrow Trạm Hỷ 3 chặng cho từng đơn – Miễn phí 100% cho Cô dâu Chú rể
          </div>
        </div>

        <div class="form-grid">
          <label class="field"><span>Họ tên người đặt</span>
            <input class="input" name="contact_name" value="${profile.full_name || ''}" required maxlength="100"></label>
          <label class="field"><span>Số điện thoại liên hệ</span>
            <input class="input" name="contact_phone" type="tel" value="${profile.phone || ''}" required pattern="[0-9+ ]{9,15}"></label>
          <label class="field full"><span>Ghi chú chung cho các đối tác (không bắt buộc)</span>
            <textarea class="input" name="common_note" rows="2" maxlength="500" placeholder="VD: Tụi mình rảnh buổi sáng cuối tuần, mong các tiệm chuẩn bị sẵn mẫu..."></textarea></label>
        </div>

        <div class="stack" style="gap:10px;max-height:340px;overflow-y:auto;padding-right:4px">
          ${items.map((it, idx) => html`
            <div style="border:1px solid var(--line);border-radius:12px;padding:12px;background:var(--bg)">
              <div class="row" style="justify-content:space-between;align-items:flex-start;gap:8px">
                <div style="min-width:0">
                  <span class="badge">${itemKindLabel(it)}</span>
                  <strong style="display:block;margin-top:4px;overflow-wrap:anywhere">${idx + 1}. ${it.title}</strong>
                  <div class="small muted ellipsis">${it.vendorName}</div>
                </div>
                <div class="price" style="white-space:nowrap" data-item-sub="${idx}">${money(itemTotalPrice(it))}</div>
              </div>
              <div class="form-grid" style="margin-top:8px">
                <label class="field"><span>${it.isVenue ? 'Ngày đãi tiệc' : 'Ngày hẹn'}</span>
                  <input class="input" type="date" name="date_${idx}" min="${tomorrow}" value="${suggestions[idx].date}" required></label>
                <label class="field"><span>${it.isVenue ? 'Giờ đón khách' : 'Giờ hẹn'}</span>
                  <input class="input" type="time" name="time_${idx}" value="${suggestions[idx].time}" required></label>
                ${it.isVenue ? html`
                  <label class="field full"><span>Số bàn dự kiến (${it.minQty || 5}–${it.maxQty || 300} bàn · ${money(it.price)}/bàn)</span>
                    <input class="input" type="number" name="qty_${idx}" min="${it.minQty || 5}" max="${it.maxQty || 300}"
                      step="1" value="${it.quantity || 30}" data-batch-qty="${idx}" required></label>
                ` : ''}
              </div>
            </div>
          `)}
        </div>
      </div>
    `,
    onOpen: (dialogEl) => {
      dialogEl.querySelectorAll('[data-batch-qty]').forEach((input) => {
        input.addEventListener('input', () => {
          const idx = Number(input.dataset.batchQty);
          const it = items[idx];
          const qty = Math.max(it.minQty || 5, Math.min(it.maxQty || 300, Number(input.value) || 30));
          const subEl = dialogEl.querySelector(`[data-item-sub="${idx}"]`);
          if (subEl) subEl.textContent = money(it.price * qty);
          const total = calcTotals(dialogEl);
          const totalEl = dialogEl.querySelector('[data-batch-total]');
          const depEl = dialogEl.querySelector('[data-batch-deposit]');
          if (totalEl) totalEl.textContent = money(total);
          if (depEl) depEl.textContent = money(Math.round(total * 0.3));
        });
      });
    },
    onConfirm: async (form) => {
      const contactName = form.get('contact_name').trim();
      const contactPhone = form.get('contact_phone').trim();
      const commonNote = form.get('common_note')?.trim() || null;

      const createdCodes = [];
      for (let i = 0; i < items.length; i += 1) {
        const it = items[i];
        const dateVal = form.get(`date_${i}`);
        const timeVal = form.get(`time_${i}`);
        const appointment = new Date(`${dateVal}T${timeVal}`);
        const qty = it.isVenue ? Number(form.get(`qty_${i}`)) || it.quantity || 30 : null;

        const created = await createBooking({
          vendorId: it.vendorId,
          type: bookingTypeForCartItem(it),
          dressId: it.dressId || null,
          packageId: it.packageId || null,
          appointmentAt: appointment.toISOString(),
          contactName,
          contactPhone,
          note: commonNote,
          details: {
            source: 'cart_batch',
            item_key: it.key,
            service_name: it.title,
          },
          quantity: qty,
        });
        await removeFromCart(it.key);
        if (created?.code) createdCodes.push(created.code);
      }
      return createdCodes;
    },
  });

  if (Array.isArray(result) && result.length) {
    toast(`🎉 Đã đặt thành công ${result.length} dịch vụ cưới!`, 'success');
    location.href = `bookings.html?new=${encodeURIComponent(result[0])}`;
  }
}

/**
 * Gắn ngăn kéo Giỏ hàng cưới vào nút trên Header.
 * Trả về { close() } để đóng giỏ khi mở Chuông thông báo hoặc Menu tài khoản.
 */
export function mountCartDrawer(button, profile, { onOpen } = {}) {
  if (!button) return { close: () => {} };

  document.querySelectorAll('body > #cart-panel').forEach((el) => el.remove());

  const panel = document.createElement('div');
  panel.className = 'cart-panel';
  panel.id = 'cart-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Giỏ hàng dịch vụ cưới');
  panel.hidden = true;
  document.body.append(panel);
  button.setAttribute('aria-controls', 'cart-panel');

  function updateBadge() {
    const count = getCartItems().length;
    const badge = button.querySelector('.cart-badge');
    if (badge) {
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.hidden = count === 0;
    }
    button.setAttribute('aria-label', count ? `Giỏ hàng dịch vụ cưới – ${count} mục` : 'Giỏ hàng dịch vụ cưới');
  }

  function draw() {
    const items = getCartItems();
    const totalSum = items.reduce((s, it) => s + itemTotalPrice(it), 0);
    const depositSum = Math.round(totalSum * 0.3);

    render(panel, html`
      <div class="cart-head">
        <strong>Giỏ hàng cưới <span class="price">(${items.length})</span></strong>
        <span class="spacer"></span>
        ${items.length ? html`<button type="button" class="btn btn-link btn-sm" data-cart-clear>Xóa tất cả</button>` : ''}
        <button type="button" class="cart-close" data-cart-close aria-label="Đóng">✕</button>
      </div>

      ${!items.length ? html`
        <div class="cart-empty">
          <div class="cart-empty-icon" aria-hidden="true">🛒</div>
          <strong>Giỏ hàng cưới đang trống</strong>
          <p class="small muted">Hãy dạo chợ cưới, chọn các mẫu váy yêu thích, gói chụp ảnh, trang điểm hoặc nhà hàng tiệc để so sánh chi phí và đặt lịch gộp 1 chạm.</p>
          <a class="btn btn-outline btn-sm" href="marketplace.html?view=dresses">Khám phá mẫu váy & dịch vụ →</a>
        </div>
      ` : html`
        <div class="cart-list">
          ${items.map((it) => html`
            <div class="cart-item" data-cart-row="${it.key}">
              <div class="cart-thumb">
                ${it.imageUrl
                  ? html`<img src="${sizedImage(it.imageUrl, 160)}" alt="${it.title}" loading="lazy" decoding="async">`
                  : html`<span class="cart-thumb-fallback" aria-hidden="true">${initials(it.title || it.vendorName) || '囍'}</span>`}
              </div>
              <div class="cart-item-body" style="min-width:0">
                <div class="cart-item-top">
                  <span class="cart-kind-tag">${itemKindLabel(it)}</span>
                  <button type="button" class="cart-item-remove" data-cart-remove="${it.key}" aria-label="Bỏ khỏi giỏ hàng" title="Bỏ khỏi giỏ">✕</button>
                </div>
                <strong class="cart-item-title">${it.title}</strong>
                <a class="cart-item-vendor ellipsis" href="${it.vendorSlug ? `vendor.html?slug=${encodeURIComponent(it.vendorSlug)}` : 'marketplace.html'}">${it.vendorName}</a>

                ${it.isVenue ? html`
                  <div class="cart-venue-qty">
                    <label class="small muted">
                      Số bàn:
                      <input type="number" class="cart-qty-input price" data-cart-qty="${it.key}"
                        min="${it.minQty || 5}" max="${it.maxQty || 300}" step="1" value="${it.quantity || 30}">
                    </label>
                    <span class="small muted">× <span class="price">${money(it.price)}</span>/bàn = <strong class="price">${money(itemTotalPrice(it))}</strong></span>
                  </div>
                ` : html`
                  <div class="cart-item-price">
                    <span class="price">${money(it.price)}</span>
                    ${it.originalPrice > it.price ? html`<s class="old-price price">${money(it.originalPrice)}</s>` : ''}
                  </div>
                `}

                <div class="cart-item-actions">
                  <button type="button" class="btn btn-outline btn-sm" data-cart-book-one="${it.key}">📅 Đặt riêng</button>
                  ${it.itemType === 'dress' && it.dressSlug
                    ? html`<a class="btn btn-outline btn-sm" href="tryon.html?dress=${encodeURIComponent(it.dressSlug)}">✨ Thử AI</a>`
                    : ''}
                </div>
              </div>
            </div>
          `)}
        </div>

        <div class="cart-foot">
          <div class="cart-summary">
            <div class="cart-summary-row">
              <span>Tổng dự kiến (<span class="price">${items.length}</span> dịch vụ):</span>
              <strong class="price">${money(totalSum)}</strong>
            </div>
            <div class="cart-summary-row small muted">
              <span>Cọc giữ lịch đợt 1 (30%):</span>
              <span class="price">${money(depositSum)}</span>
            </div>
          </div>
          <div class="cart-foot-actions">
            <button type="button" class="btn btn-outline btn-sm full" data-cart-sync-budget>+ Đồng bộ cả giỏ vào Ngân sách cưới</button>
            <button type="button" class="btn btn-primary full" data-cart-book-all>📅 Đặt lịch tất cả (<span class="price">${items.length}</span>)</button>
          </div>
        </div>
      `}
    `);

    panel.querySelector('[data-cart-close]')?.addEventListener('click', () => setOpen(false));

    panel.querySelector('[data-cart-clear]')?.addEventListener('click', async () => {
      await clearCart();
      toast('Đã xóa toàn bộ giỏ hàng cưới', 'info');
    });

    panel.querySelectorAll('[data-cart-remove]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await removeFromCart(btn.dataset.cartRemove);
      });
    });

    panel.querySelectorAll('[data-cart-qty]').forEach((input) => {
      input.addEventListener('change', async () => {
        await updateCartItemQuantity(input.dataset.cartQty, Number(input.value));
      });
    });

    panel.querySelectorAll('[data-cart-book-one]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const target = getCartItems().find((x) => x.key === btn.dataset.cartBookOne);
        setOpen(false);
        await bookSingleCartItem(target);
      });
    });

    panel.querySelector('[data-cart-sync-budget]')?.addEventListener('click', (e) => {
      const syncBtn = e.currentTarget;
      withBusy(syncBtn, async () => {
        const currentProfile = profile || (await getProfile());
        if (!currentProfile) {
          location.href = loginUrl();
          return;
        }
        const currentItems = getCartItems();
        if (!currentItems.length) return;
        for (const it of currentItems) {
          await addServiceToPlanBudget(currentProfile.id, {
            vendorCategory: it.vendorCategory || 'bridal',
            categoryTitle: VENDOR_CATEGORY[it.vendorCategory] || 'Dịch vụ cưới',
            itemName: `${it.title} (${it.vendorName})`,
            price: itemTotalPrice(it),
          });
        }
        toast(`📒 Đã đồng bộ ${currentItems.length} dịch vụ vào Ngân sách Kế hoạch cưới!`, 'success');
      }).catch(toastError);
    });

    panel.querySelector('[data-cart-book-all]')?.addEventListener('click', async () => {
      const currentItems = getCartItems();
      if (!currentItems.length) return;
      setOpen(false);
      await openBatchBookingDialog(currentItems);
    });
  }

  function setOpen(open) {
    if (open) onOpen?.();
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('cart-open', open);
    if (open) draw();
  }

  button.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(panel.hidden);
  });

  document.addEventListener('click', (e) => {
    if (!panel.hidden && !panel.contains(e.target) && !button.contains(e.target)) {
      setOpen(false);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) setOpen(false);
  });

  subscribeCart(() => {
    updateBadge();
    if (!panel.hidden) draw();
  });

  window.addEventListener('tramhy:cart-added', () => {
    button.classList.remove('pop');
    void button.offsetWidth;
    button.classList.add('pop');
  });

  window.addEventListener('tramhy:cart-open', () => {
    setOpen(true);
  });

  updateBadge();
  loadCart(profile?.id);

  return { close: () => setOpen(false) };
}
