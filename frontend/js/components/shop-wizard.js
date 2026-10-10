// Đăng ký mở tiệm từng bước (kiểu "Trở thành người bán" của các sàn lớn), tự lưu nháp trên máy:
//   ① Loại dịch vụ → ② Thông tin tiệm → ③ Xem lại & đồng ý điều khoản → gửi duyệt
import { html, render, money } from '../core/utils.js';
import { VENDOR_CATEGORY } from '../core/labels.js';
import { toastError, withBusy } from '../core/ui.js';
import { PLATFORM_FEE_RATE } from '../config.js';
import { registerVendor } from '../services/shop.js';
import { categoryPicker, shopFields, readShopForm, CATEGORY_CHOICES } from './shop-form.js';

const STEPS = ['Loại dịch vụ', 'Thông tin tiệm', 'Xem lại & gửi'];

export function mountShopWizard(container, { userId, onSubmitted }) {
  const draftKey = `tramhy-shop-draft-${userId}`;
  let draft = {};
  try { draft = JSON.parse(localStorage.getItem(draftKey)) ?? {}; } catch { draft = {}; }
  let step = draft.category ? (draft.name ? 2 : 1) : 0;

  const saveDraft = () => { try { localStorage.setItem(draftKey, JSON.stringify(draft)); } catch { /* bỏ qua */ } };
  // Lưu nháp các ô đang gõ ở bước 2 (chưa kiểm tra – kiểm tra khi bấm Tiếp tục)
  const keepTyping = (form) => {
    for (const key of ['name', 'phone', 'district', 'address', 'description', 'basePriceText']) {
      const input = form.elements[key === 'basePriceText' ? 'basePrice' : key];
      if (input) draft[key] = input.value;
    }
    saveDraft();
  };

  function stepBody() {
    if (step === 0) return categoryPicker(draft.category);
    if (step === 1) {
      return shopFields({ ...draft, base_price: null }, { withCategory: false });
    }
    const c = CATEGORY_CHOICES[draft.category];
    return html`
      <div class="review-box">
        <div class="row"><span class="review-icon" aria-hidden="true">${c?.icon}</span>
          <div><strong>${draft.name}</strong><div class="small muted">${VENDOR_CATEGORY[draft.category]}</div></div></div>
        <dl class="review-list">
          <dt>Điện thoại</dt><dd>${draft.phone}</dd>
          <dt>Khu vực</dt><dd>${draft.district}</dd>
          <dt>Địa chỉ</dt><dd>${draft.address}</dd>
          <dt>Giá khởi điểm</dt><dd>${money(draft.basePrice)}</dd>
          ${draft.description ? html`<dt>Giới thiệu</dt><dd>${draft.description}</dd>` : ''}
        </dl>
      </div>
      <label class="terms">
        <input type="checkbox" name="agree" required>
        <span>Tôi đồng ý <strong>Điều khoản đối tác Trạm Hỷ</strong>: khách trả tiền qua Escrow 3 đợt, Trạm Hỷ giải ngân
          sau mỗi đợt khách nghiệm thu và thu phí <strong>${Math.round(PLATFORM_FEE_RATE * 100)}%</strong> trên số tiền giải ngân;
          làm sai cam kết thì khách được hoàn tiền.</span>
      </label>
      <p class="small muted" style="margin:0">Sau khi gửi, tài khoản của bạn trở thành tài khoản đối tác – bạn vẫn đặt dịch vụ
        cho đám cưới của mình như bình thường.</p>`;
  }

  function draw() {
    render(container, html`
      <section class="card stack wizard">
        <div>
          <h2 style="margin:0">Mở tiệm trên Trạm Hỷ</h2>
          <p class="muted" style="margin:4px 0 0">Mất khoảng 3 phút. Thông tin được lưu nháp tự động – thoát ra vào lại vẫn còn.</p>
        </div>
        <ol class="wizard-steps" aria-label="Các bước đăng ký">
          ${STEPS.map((label, i) => html`
            <li class="${i < step ? 'done' : i === step ? 'active' : ''}" aria-current="${i === step ? 'step' : 'false'}">
              <span class="num">${i < step ? '✓' : i + 1}</span><span class="label">${label}</span></li>`)}
        </ol>
        <form class="stack wizard-body" novalidate>
          ${stepBody()}
          <div class="wizard-nav">
            ${step > 0 ? html`<button class="btn btn-outline" type="button" data-back>← Quay lại</button>` : html`<span></span>`}
            <button class="btn btn-primary" type="submit">${step < 2 ? 'Tiếp tục →' : 'Gửi hồ sơ cho Trạm Hỷ'}</button>
          </div>
        </form>
      </section>`);

    const form = container.querySelector('form');
    if (step === 1) {
      // Giá trong nháp lưu dạng chữ đã có dấu chấm
      if (draft.basePriceText) form.elements.basePrice.value = draft.basePriceText;
      form.addEventListener('input', () => keepTyping(form));
    }
    form.addEventListener('change', (e) => {
      if (e.target.name === 'category') { draft.category = e.target.value; saveDraft(); }
    });
    container.querySelector('[data-back]')?.addEventListener('click', () => { step -= 1; draw(); });
    form.addEventListener('submit', (e) => next(e, form));
    container.querySelector('.wizard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function next(e, form) {
    e.preventDefault();
    if (!form.reportValidity()) return;
    try {
      if (step === 0) {
        draft.category = new FormData(form).get('category');
      } else if (step === 1) {
        const values = readShopForm(new FormData(form));      // kiểm tra giá (100.000đ – 10 tỷ)
        Object.assign(draft, values, { category: draft.category, basePriceText: form.elements.basePrice.value });
      } else {
        await withBusy(e.submitter, async () => {
          await registerVendor(draft);
          try { localStorage.removeItem(draftKey); } catch { /* bỏ qua */ }
          await onSubmitted();
        });
        return;
      }
    } catch (error) {
      toastError(error);
      return;
    }
    saveDraft();
    step += 1;
    draw();
  }

  draw();
}
