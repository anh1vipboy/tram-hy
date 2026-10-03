// Nhãn tiếng Việt + màu badge cho các giá trị enum trong database
import { html } from './utils.js';

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

export const statusBadge = (map, key) => badge(map[key]?.label ?? key, map[key]?.tone);
