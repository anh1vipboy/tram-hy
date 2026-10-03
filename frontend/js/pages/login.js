import { initLayout } from '../core/layout.js';
import { clearProfileCache, getProfile, homeForRole, signIn, signUp } from '../core/auth.js';
import { authRedirectParams } from '../core/supabase.js';
import { $, $$, html, render, param, sleep } from '../core/utils.js';
import { toastError, withBusy } from '../core/ui.js';

const LOGIN_ERRORS = {
  'Invalid login credentials': 'Sai email hoặc mật khẩu',
  'Email not confirmed': 'Email chưa được xác nhận – hãy bấm link trong email Trạm Hỷ gửi bạn',
  'User already registered': 'Email này đã có tài khoản – hãy đăng nhập',
};

function showNotice(type, title, message) {
  const box = $('#auth-notice');
  box.className = `notice notice-${type}`;
  render(box, html`<strong>${title}</strong>${message}`);
  box.hidden = false;
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function switchTab(name) {
  for (const tab of $$('[data-tab]')) tab.classList.toggle('active', tab.dataset.tab === name);
  $('#signin-form').hidden = name !== 'signin';
  $('#signup-form').hidden = name !== 'signup';
}

async function redirectAfterLogin() {
  const next = param('next');
  // Chỉ cho quay về trang nội bộ (tránh chuyển hướng ra web lạ)
  if (next && /^[\w-]+\.html/.test(next)) {
    location.href = next;
    return;
  }
  clearProfileCache();
  const current = await getProfile();
  location.href = homeForRole(current?.role);
}

// Người dùng quay về từ link xác nhận trong email (login.html?confirmed=1#...)
async function handleEmailConfirmation(profile) {
  const error = authRedirectParams.get('error_code') || authRedirectParams.get('error');
  if (error) {
    const expired = error === 'otp_expired';
    showNotice('error',
      expired ? 'Link xác nhận đã hết hạn hoặc đã được dùng' : 'Không xác nhận được tài khoản',
      expired ? 'Nếu bạn đã bấm link trước đó thì tài khoản đã được xác nhận – hãy đăng nhập. Nếu chưa, hãy đăng ký lại để nhận link mới.'
              : authRedirectParams.get('error_description') || error);
    return;
  }

  if (profile) {
    showNotice('success', 'Xác nhận tài khoản thành công!', `Chào ${profile.full_name || profile.email}, đang chuyển bạn vào Trạm Hỷ…`);
    await sleep(2500);
    location.href = homeForRole(profile.role);
  } else {
    showNotice('success', 'Xác nhận tài khoản thành công!', 'Hãy đăng nhập bằng email và mật khẩu bạn vừa đăng ký.');
  }
}

// ---------- SỰ KIỆN ----------
for (const tab of $$('[data-tab]')) {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
}

$('#signin-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  await withBusy(e.submitter, async () => {
    try {
      await signIn(form.get('email').trim(), form.get('password'));
      await redirectAfterLogin();
    } catch (error) {
      toastError(new Error(LOGIN_ERRORS[error.message] ?? error.message));
    }
  });
});

$('#signup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const email = form.get('email').trim();
  await withBusy(e.submitter, async () => {
    try {
      const { needsEmailConfirm } = await signUp({
        email,
        password: form.get('password'),
        fullName: form.get('fullName').trim(),
        phone: form.get('phone').trim(),
        role: form.get('role'),
      });
      if (needsEmailConfirm) {
        switchTab('signin');
        $('#signin-form [name=email]').value = email;
        showNotice('info', 'Kiểm tra email để kích hoạt tài khoản',
          `Trạm Hỷ đã gửi link xác nhận tới ${email}. Bấm link đó (trên điện thoại hay máy tính đều được) – bạn sẽ được đưa về đây và đăng nhập tự động. Không thấy thư? Xem thêm mục Spam/Quảng cáo.`);
      } else {
        await redirectAfterLogin();
      }
    } catch (error) {
      toastError(new Error(LOGIN_ERRORS[error.message] ?? error.message));
    }
  });
});

// ---------- KHỞI CHẠY TRANG ----------
const profile = await initLayout('login');
if (param('confirmed')) {
  history.replaceState(null, '', 'login.html');   // bấm F5 không hiện lại thông báo
  await handleEmailConfirmation(profile);
} else if (profile) {
  await redirectAfterLogin();
}
