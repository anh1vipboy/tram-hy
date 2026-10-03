// Header + footer dùng chung cho mọi trang
import { getProfile, signOut } from './auth.js';
import { $, html, render } from './utils.js';

// roles: undefined = ai cũng thấy; 'any' = đã đăng nhập; mảng = chỉ các vai trò đó
const NAV_ITEMS = [
  { page: 'home',        href: 'index.html',            label: 'Trang chủ' },
  { page: 'tryon',       href: 'tryon.html',            label: 'Thử váy AI' },
  { page: 'marketplace', href: 'marketplace.html',      label: 'Dịch vụ cưới' },
  { page: 'invitation',  href: 'invitation.html',       label: 'Thiệp cưới' },
  { page: 'bookings',    href: 'bookings.html',         label: 'Đơn của tôi', roles: 'any' },
  { page: 'vendor',      href: 'vendor-dashboard.html', label: 'Kênh đối tác', roles: ['vendor'] },
  { page: 'admin',       href: 'admin.html',            label: 'Quản trị', roles: ['admin'] },
];

function canSee(item, profile) {
  if (!item.roles) return true;
  if (!profile) return false;
  return item.roles === 'any' || item.roles.includes(profile.role);
}

/** Vẽ header/footer và trả về hồ sơ người dùng (hoặc null) để trang dùng tiếp. */
export async function initLayout(activePage) {
  const profile = await getProfile().catch(() => null);

  const header = $('#app-header');
  header.className = 'site-header';
  render(header, html`
    <div class="container">
      <a class="brand" href="index.html">
        <img src="assets/images/logo.jpg" alt="">
        <strong>Trạm Hỷ</strong>
      </a>
      <nav class="nav" aria-label="Điều hướng chính">
        ${NAV_ITEMS.filter((item) => canSee(item, profile)).map((item) => html`
          <a href="${item.href}" class="${item.page === activePage ? 'active' : ''}">${item.label}</a>`)}
      </nav>
      <div class="user-area">
        ${profile
          ? html`<span class="user-name" title="${profile.email}">${profile.full_name || profile.email}</span>
                 <button class="btn btn-outline btn-sm" data-signout>Đăng xuất</button>`
          : html`<a class="btn btn-primary btn-sm" href="login.html">Đăng nhập</a>`}
      </div>
    </div>`);
  header.querySelector('[data-signout]')?.addEventListener('click', signOut);

  const footer = $('#app-footer');
  footer.className = 'site-footer';
  render(footer, html`
    <div class="container">© 2026 Trạm Hỷ – Kết duyên cát hỷ, trọn vẹn niềm tin · Dự án EXE – Group 5</div>`);

  return profile;
}
