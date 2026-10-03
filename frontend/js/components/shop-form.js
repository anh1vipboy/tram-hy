// Ô nhập thông tin tiệm – dùng cho đăng ký mở tiệm và sửa hồ sơ
import { html } from '../core/utils.js';
import { VENDOR_CATEGORY } from '../core/labels.js';

/** withCategory = false khi sửa: loại dịch vụ không đổi được sau khi đăng ký. */
export function shopFields(shop = {}, { withCategory = true } = {}) {
  return html`
    <div class="form-grid">
      <label class="field full"><span>Tên tiệm / thương hiệu</span>
        <input class="input" name="name" value="${shop.name || ''}" required maxlength="100"></label>
      ${withCategory ? html`
        <label class="field"><span>Loại dịch vụ</span>
          <select class="input" name="category" required>
            ${Object.entries(VENDOR_CATEGORY).map(([key, label]) => html`
              <option value="${key}" ${key === shop.category ? 'selected' : ''}>${label}</option>`)}
          </select></label>` : ''}
      <label class="field"><span>Số điện thoại liên hệ</span>
        <input class="input" type="tel" name="phone" value="${shop.phone || ''}" required pattern="[0-9+ ]{9,15}"></label>
      <label class="field"><span>Quận / khu vực</span>
        <input class="input" name="district" value="${shop.district || ''}" required maxlength="80" placeholder="VD: Cầu Giấy, Hà Nội"></label>
      <label class="field"><span>Giá khởi điểm (VNĐ)</span>
        <input class="input" type="number" name="basePrice" value="${shop.base_price || ''}" required min="100000" step="100000"></label>
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
    basePrice: Number(form.get('basePrice')),
    description: text('description'),
  };
}
