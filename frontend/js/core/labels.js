// Nhãn tiếng Việt + màu badge cho các giá trị enum trong database
import { html, money } from './utils.js';

export const BOOKING_STATUS = {
  pending:          { label: 'Chờ đặt cọc',     tone: '' },
  confirmed:        { label: 'Đã cọc đợt 1',    tone: 'gold' },
  in_progress:      { label: 'Đang thực hiện',  tone: 'blue' },
  ready_for_review: { label: 'Chờ nghiệm thu',  tone: 'purple' },
  completed:        { label: 'Hoàn tất',        tone: 'green' },
  disputed:         { label: 'Đang khiếu nại',  tone: 'red' },
  cancelled:        { label: 'Đã hủy',          tone: '' },
  refunded:         { label: 'Đã hoàn tiền',    tone: '' },
};

export const MILESTONE_STATUS = {
  locked:   { label: 'Chưa thanh toán',      tone: '' },
  paid:     { label: 'Trạm Hỷ đang giữ',     tone: 'gold' },
  released: { label: 'Đã giải ngân',         tone: 'green' },
  refunded: { label: 'Đã hoàn cho cô dâu',   tone: 'red' },
};

export const BOOKING_TYPE = {
  rental:         'Thuê váy',
  bespoke_prompt: 'May đo theo mô tả',
  bespoke_image:  'May đo theo ảnh mẫu',
  bespoke_manual: 'May đo tự thiết kế',
  service:        'Dịch vụ cưới',
};

export const VENDOR_CATEGORY = {
  bridal: 'Váy cưới',
  studio: 'Chụp ảnh cưới',
  decor:  'Trang trí',
  makeup: 'Trang điểm',
  venue:  'Nhà hàng tiệc',
};

// "Gói dịch vụ" của tiệm không bán váy – tên gọi theo loại tiệm (tab Kênh đối tác, mục trên trang tiệm)
export const PACKAGE_LABEL = {
  decor:  { section: 'Mẫu rạp & trang trí', item: 'mẫu', add: '+ Thêm mẫu rạp', hint: 'VD: Rạp hoa trắng cổ điển, Cổng hoa pastel…' },
  studio: { section: 'Gói chụp ảnh cưới', item: 'gói', add: '+ Thêm gói chụp', hint: 'VD: Pre-wedding studio, Phóng sự ngày cưới…' },
  makeup: { section: 'Gói trang điểm', item: 'gói', add: '+ Thêm gói trang điểm', hint: 'VD: Makeup cô dâu + làm tóc, Trang điểm mẹ…' },
  venue:  { section: 'Sảnh & thực đơn', item: 'gói', add: '+ Thêm sảnh / thực đơn', hint: 'VD: Sảnh Ruby 30 bàn, Thực đơn Á 8 món…' },
};
export const packageLabel = (category) => PACKAGE_LABEL[category] ?? PACKAGE_LABEL.decor;

export const VENDOR_STATUS = {
  pending:  { label: 'Chờ duyệt', tone: 'gold' },
  approved: { label: 'Đang hoạt động', tone: 'green' },
  rejected: { label: 'Bị từ chối', tone: 'red' },
};

export const DRESS_THEME = {
  mermaid:    'Đuôi cá',
  fairy:      'Công chúa',
  minimalist: 'Tối giản',
  royal:      'Hoàng gia',
  heritage:   'Áo dài',
};

export const badge = (label, tone = '') => html`<span class="badge ${tone ? `badge-${tone}` : ''}">${label}</span>`;

/** % giảm của mẫu váy (0 nếu không giảm) */
export const discountPercent = (dress) =>
  dress.original_price > dress.price ? Math.round((1 - dress.price / dress.original_price) * 100) : 0;

/** Giá bán + giá gốc gạch ngang + nhãn -X% khi có giảm giá */
export function priceTag(dress, { small = false } = {}) {
  const off = discountPercent(dress);
  return html`
    <span class="price-tag ${small ? 'small' : ''}">
      <span class="price">${money(dress.price)}</span>
      ${off ? html`<s class="old-price">${money(dress.original_price)}</s><span class="sale-badge">-${off}%</span>` : ''}
    </span>`;
}

export const statusBadge = (map, key) => badge(map[key]?.label ?? key, map[key]?.tone);
