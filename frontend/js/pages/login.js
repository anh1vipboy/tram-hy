import { initLayout } from '../core/layout.js';
import { clearProfileCache, getProfile, homeForRole, signIn, signUp } from '../core/auth.js';
import { $, $$, param } from '../core/utils.js';
import { toast, toastError, withBusy } from '../core/ui.js';

const LOGIN_ERRORS = {
  'Invalid login credentials': 'Sai email hoặc mật khẩu',
  'Email not confirmed': 'Email chưa được xác nhận – hãy bấm link trong email Trạm Hỷ gửi bạn',
};

const profile = await initLayout('login');
if (profile) redirectAfterLogin();

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
  await withBusy(e.submitter, async () => {
    try {
      const { needsEmailConfirm } = await signUp({
        email: form.get('email').trim(),
        password: form.get('password'),
        fullName: form.get('fullName').trim(),
        phone: form.get('phone').trim(),
        role: form.get('role'),
      });
      if (needsEmailConfirm) {
        toast('Đã tạo tài khoản. Hãy mở email để xác nhận rồi đăng nhập.', 'success');
        switchTab('signin');
      } else {
        await redirectAfterLogin();
      }
    } catch (error) {
      toastError(error);
    }
  });
});

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
