// Ô nhập thông tin tiệm – dùng cho đăng ký mở tiệm và sửa hồ sơ
import { html } from '../core/utils.js';
import { VENDOR_CATEGORY } from '../core/labels.js';
import { moneyValue, readMoneyField } from './money-input.js';

// Mô tả ngắn cho từng loại dịch vụ – khớp các mục lọc ở trang Dịch vụ cưới
const CATEGORY_CHOICES = {
  bridal: { icon: '👗', hint: 'Cho thuê, may váy cưới, áo dài' },
  studio: { icon: '📸', hint: 'Ảnh cưới, quay phim, phóng sự' },
  decor:  { icon: '💐', hint: 'Hoa, cổng cưới, sân khấu' },
  makeup: { icon: '💄', hint: 'Trang điểm, làm tóc cô dâu' },
  venue:  { icon: '🍽️', hint: 'Nhà hàng, sảnh tiệc cưới' },
};

/** withCategory = false khi sửa: loại dịch vụ không đổi được sau khi đăng ký. */
export function shopFields(shop = {}, { withCategory = true } = {}) {
  return html`
    <div class="form-grid">
      <label class="field full"><span>Tên tiệm / thương hiệu</span>
        <input class="input" name="name" value="${shop.name || ''}" required maxlength="100"></label>
      ${withCategory ? html`
        <fieldset class="field full category-picker">
          <legend>Bạn cung cấp dịch vụ gì?</legend>
          <div class="category-options">
            ${Object.entries(VENDOR_CATEGORY).map(([key, label], i) => html`
              <label class="category-option">
                <input type="radio" name="category" value="${key}" ${key === shop.category ? 'checked' : ''} ${i === 0 ? 'required' : ''}>
                <span class="icon" aria-hidden="true">${CATEGORY_CHOICES[key].icon}</span>
                <strong>${label}</strong>
                <span class="small muted">${CATEGORY_CHOICES[key].hint}</span>
              </label>`)}
          </div>
          <span class="small muted">Tiệm sẽ hiện ở mục này trên trang Dịch vụ cưới. Không đổi được sau khi đăng ký.</span>
        </fieldset>` : ''}
      <label class="field"><span>Số điện thoại liên hệ</span>
        <input class="input" type="tel" name="phone" value="${shop.phone || ''}" required pattern="[0-9+ ]{9,15}"></label>
      <label class="field"><span>Quận / khu vực</span>
        <input class="input" name="district" value="${shop.district || ''}" required maxlength="80" placeholder="VD: Cầu Giấy, Hà Nội"></label>
      <label class="field"><span>Giá khởi điểm (VNĐ)</span>
        <input class="input" name="basePrice" data-money inputmode="numeric" autocomplete="off" placeholder="VD: 5.000.000"
          value="${moneyValue(shop.base_price)}" required></label>
      <label class="field full"><span>Địa chỉ cụ thể</span>
        <input class="input" name="address" value="${shop.address || ''}" required maxlength="200"></label>
      <label class="field full"><span>Giới thiệu tiệm (không bắt buộc)</span>
        <textarea class="input" name="description" maxlength="1000"
          placeholder="Phong cách, kinh nghiệm, điểm nổi bật…">${shop.description || ''}</textarea></label>
    </div>`;
}

export function readShopForm(form) {
  const text = (name) => (form.get(name) || '').trim();
  return {
    name: text('name'),
    category: text('category'),
    phone: text('phone'),
    district: text('district'),
    address: text('address'),
    basePrice: readMoneyField(form.get('basePrice'), 'Giá khởi điểm', { min: 100_000 }),
    description: text('description'),
  };
}
