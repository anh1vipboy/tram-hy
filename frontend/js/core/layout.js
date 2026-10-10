// Header + footer dùng chung cho mọi trang
import { getProfile, signOut } from './auth.js';
import { $, html, render, initials } from './utils.js';
import { sb } from './supabase.js';
import { mountNotificationBell } from '../components/notification-bell.js';

// roles: undefined = ai cũng thấy; 'any' = đã đăng nhập; mảng = chỉ các vai trò đó
const NAV_ITEMS = [
  { page: 'home',        href: 'index.html',            label: 'Trang chủ' },
  { page: 'tryon',       href: 'tryon.html',            label: 'Thử váy AI' },
  { page: 'marketplace', href: 'marketplace.html',      label: 'Dịch vụ cưới' },
  { page: 'invitation',  href: 'invitation.html',       label: 'Thiệp cưới' },
  { page: 'bookings',    href: 'bookings.html',         label: 'Đơn của tôi', roles: ['bride', 'vendor'] },   // admin xem đơn ở Quản trị
  { page: 'vendor',      href: 'vendor-dashboard.html', label: 'Kênh đối tác', roles: ['vendor'] },
  { page: 'admin',       href: 'admin.html',            label: 'Quản trị', roles: ['admin'] },
];

function canSee(item, profile) {
  if (!item.roles) return true;
  if (!profile) return false;
  return item.roles === 'any' || item.roles.includes(profile.role);
}

// Các tab cùng trình duyệt dùng chung phiên đăng nhập: tab khác đăng nhập tài khoản khác / đăng xuất
// thì tab này đang hiện dữ liệu của người cũ nhưng gửi yêu cầu bằng người mới (bị database chặn).
// → tải lại để giao diện luôn khớp đúng tài khoản. (Trang đăng nhập tự điều hướng nên bỏ qua.)
function watchAccountSwitch(profile) {
  const shownUserId = profile?.id ?? null;
  sb.auth.onAuthStateChange((event, session) => {
    // Chỉ khi thật sự đổi tài khoản (không phản ứng với INITIAL_SESSION / làm mới token → tránh tải lại liên tục)
    if (event !== 'SIGNED_IN' && event !== 'SIGNED_OUT') return;
    if ((session?.user?.id ?? null) !== shownUserId) location.reload();
  });
}

// Thanh tab dưới đáy (chỉ hiện trên điện thoại) – 4 trang chính + Tài khoản
const TAB_ITEMS = [
  { page: 'home',        href: 'index.html',       icon: '🏠', label: 'Trang chủ' },
  { page: 'tryon',       href: 'tryon.html',       icon: '👗', label: 'Thử váy' },
  { page: 'marketplace', href: 'marketplace.html', icon: '💍', label: 'Dịch vụ' },
  { page: 'invitation',  href: 'invitation.html',  icon: '💌', label: 'Thiệp cưới' },
];
const ACCOUNT_PAGES = ['bookings', 'vendor', 'admin', 'login'];   // trang thuộc ô "Tài khoản"
const ROLE_LABEL = { bride: 'Cô dâu / chú rể', vendor: 'Đối tác', admin: 'Quản trị viên' };

const displayName = (profile) => profile.full_name || profile.email || 'Tài khoản';
const avatar = (profile, size = '') => html`
  <span class="avatar ${size}" aria-hidden="true">${initials(displayName(profile)) || '?'}</span>`;

function accountMenu(profile, activePage) {
  const links = [
    ...(profile.role !== 'admin' ? [{ page: 'bookings', href: 'bookings.html', label: '📋 Đơn của tôi' }] : []),
    { page: 'invitation', href: 'invitation.html', label: '💌 Thiệp cưới' },
    ...(profile.role === 'vendor' ? [{ page: 'vendor', href: 'vendor-dashboard.html', label: '🏪 Kênh đối tác' }] : []),
    ...(profile.role === 'admin' ? [{ page: 'admin', href: 'admin.html', label: '🛡️ Quản trị' }] : []),
    ...(profile.role === 'bride' ? [{ page: 'partner', href: 'doi-tac.html', label: '🏪 Trở thành đối tác' }] : []),
  ];
  return html`
    <div class="account-menu" id="account-menu" role="menu" hidden>
      <div class="account-head">
        ${avatar(profile, 'lg')}
        <div style="min-width:0">
          <strong class="ellipsis">${displayName(profile)}</strong>
          <div class="small muted ellipsis">${ROLE_LABEL[profile.role] ?? ''}${profile.email ? ` · ${profile.email}` : ''}</div>
        </div>
      </div>
      ${links.map((l) => html`<a role="menuitem" href="${l.href}" class="${l.page === activePage ? 'active' : ''}">${l.label}</a>`)}
      <button type="button" role="menuitem" class="account-signout" data-signout>Đăng xuất</button>
    </div>`;
}

// Mở/đóng menu tài khoản: bấm avatar (header) hoặc ô Tài khoản (thanh tab); bấm ra ngoài / Esc để đóng.
// onOpen: đóng chuông thông báo khi menu mở (không mở chồng 2 bảng). Trả về hàm close().
function bindAccountMenu({ onOpen } = {}) {
  const menu = $('#account-menu');
  if (!menu) return () => {};
  // Đưa ra ngoài header: header có backdrop-filter làm menu "fixed" bị định vị theo header thay vì màn hình
  document.body.append(menu);
  const triggers = [...document.querySelectorAll('[data-account]')];
  const setOpen = (open) => {
    if (open) onOpen?.();
    menu.hidden = !open;
    document.body.classList.toggle('account-open', open);
    triggers.forEach((t) => t.setAttribute('aria-expanded', String(open)));
  };
  triggers.forEach((t) => t.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(menu.hidden);
  }));
  document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target)) setOpen(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
  menu.querySelector('[data-signout]').addEventListener('click', signOut);
  return () => setOpen(false);
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
          ? html`<button type="button" class="notif-button" data-notif aria-haspopup="dialog" aria-expanded="false" aria-label="Thông báo">
                   <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-1.7 1.7A1 1 0 0 0 4 19.4h16a1 1 0 0 0 .7-1.7L19 16Z"/></svg>
                   <span class="notif-badge" hidden>0</span>
                 </button>
                 <button type="button" class="account-button" data-account aria-haspopup="menu" aria-expanded="false"
                         title="${displayName(profile)}">
                   ${avatar(profile)}<span class="user-name">${displayName(profile)}</span>
                 </button>
                 ${accountMenu(profile, activePage)}`
          : html`<a class="btn btn-primary btn-sm" href="login.html">Đăng nhập</a>`}
      </div>
    </div>`);

  // Thanh tab dưới đáy cho điện thoại (CSS ẩn trên máy tính)
  let tabbar = $('#app-tabbar');
  if (!tabbar) {
    tabbar = document.createElement('nav');
    tabbar.id = 'app-tabbar';
    tabbar.className = 'tabbar';
    tabbar.setAttribute('aria-label', 'Điều hướng nhanh');
    document.body.append(tabbar);
    document.body.classList.add('has-tabbar');
  }
  const accountActive = ACCOUNT_PAGES.includes(activePage);
  render(tabbar, html`
    ${TAB_ITEMS.map((t) => html`
      <a href="${t.href}" class="${t.page === activePage ? 'active' : ''}"><span aria-hidden="true">${t.icon}</span>${t.label}</a>`)}
    ${profile
      ? html`<button type="button" class="${accountActive ? 'active' : ''}" data-account aria-haspopup="menu" aria-expanded="false">
               ${avatar(profile, 'sm')}Tài khoản</button>`
      : html`<a href="login.html" class="${accountActive ? 'active' : ''}"><span aria-hidden="true">👤</span>Đăng nhập</a>`}`);

  // Chuông thông báo + menu tài khoản: mở cái này thì đóng cái kia
  let closeBell = () => {};
  const closeAccount = bindAccountMenu({ onOpen: () => closeBell() });
  const bellButton = header.querySelector('[data-notif]');
  if (profile && bellButton) {
    closeBell = mountNotificationBell(bellButton, profile, { onOpen: closeAccount }).close;
  }
  if (activePage !== 'login') watchAccountSwitch(profile);

  const footer = $('#app-footer');
  footer.className = 'site-footer';
  render(footer, html`
    <div class="container footer-row">
      <span>© 2026 Trạm Hỷ – Kết duyên cát hỷ, trọn vẹn niềm tin · Dự án EXE – Group 5</span>
      ${profile?.role === 'admin' ? '' : html`<a href="doi-tac.html">🏪 Trở thành đối tác bán hàng</a>`}
    </div>`);

  return profile;
}
