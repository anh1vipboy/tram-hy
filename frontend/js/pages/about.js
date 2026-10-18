// Trang Giới thiệu (gioi-thieu.html): nội dung chính viết sẵn trong HTML; ở đây chỉ điền số liệu thật (đếm từ
// database), danh sách đội ngũ và kênh liên hệ (khai báo ở js/config.js → CONTACT).
import { initLayout } from '../core/layout.js';
import { $, html, render, initials } from '../core/utils.js';
import { VENDOR_CATEGORY } from '../core/labels.js';
import { CONTACT } from '../config.js';
import { platformStats } from '../services/catalog.js';

// Đội ngũ: { name, role, photo? } – photo là ảnh trong assets/images (không có thì hiện chữ cái đầu của tên).
// Để trống thì mục Đội ngũ chỉ hiện tên nhóm.
const TEAM = [];

// Kênh liên hệ: [khóa trong CONTACT, nhãn, cách tạo link]
const CONTACT_CHANNELS = [
  ['email', '✉️', (v) => `mailto:${v}`],
  ['phone', '📞', (v) => `tel:${v.replace(/\s/g, '')}`],
  ['zalo', '💬 Zalo', (v) => `https://zalo.me/${v.replace(/\D/g, '')}`],
  ['facebook', 'ⓕ Facebook', (v) => v],
];

// Số liệu đếm thật – lỗi mạng thì ẩn 2 ô đó thay vì hiện số bịa
async function renderStats() {
  $('[data-stat="categories"]').textContent = Object.keys(VENDOR_CATEGORY).length;
  try {
    const stats = await platformStats();
    for (const key of ['vendors', 'dresses']) $(`[data-stat="${key}"]`).textContent = stats[key].toLocaleString('vi-VN');
  } catch {
    for (const key of ['vendors', 'dresses']) $(`[data-stat="${key}"]`).closest('.card').hidden = true;
  }
}

function renderTeam() {
  if (!TEAM.length) return;
  const box = $('#about-team');
  render(box, TEAM.map((member) => html`
    <div class="card about-member">
      ${member.photo
        ? html`<img src="${member.photo}" alt="">`
        : html`<span class="avatar lg" aria-hidden="true">${initials(member.name)}</span>`}
      <strong>${member.name}</strong>
      <span class="small muted">${member.role}</span>
    </div>`));
  box.hidden = false;
}

function renderContact() {
  const channels = CONTACT_CHANNELS.filter(([key]) => CONTACT[key]);
  if (!channels.length) return;
  const box = $('#about-contact');
  render(box, html`
    <span class="muted">Liên hệ Trạm Hỷ:</span>
    ${channels.map(([key, label, link]) => html`
      <a href="${link(CONTACT[key])}" ${key === 'facebook' || key === 'zalo' ? html`target="_blank" rel="noopener"` : ''}>
        ${label} ${key === 'facebook' ? '' : CONTACT[key]}</a>`)}`);
  box.hidden = false;
}

// ---------- KHỞI CHẠY TRANG ----------
renderTeam();
renderContact();
initLayout('about');
renderStats();
