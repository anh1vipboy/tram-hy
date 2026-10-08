import { initLayout } from '../core/layout.js';
import { clearProfileCache, getProfile, homeForRole, signIn, signUp, signInWithGoogle, requestPasswordReset, friendlyAuthError } from '../core/auth.js';
import { authRedirectParams } from '../core/supabase.js';
import { $, $$, html, render, param, sleep } from '../core/utils.js';
import { openDialog, toastError, withBusy } from '../core/ui.js';
import { mountCaptcha } from '../components/captcha.js';

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
  captchas[name]?.show().catch(toastError);     // vẽ ô xác minh khi form hiện ra
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
// Ô CAPTCHA riêng cho từng form (quên mật khẩu dùng ô của form đăng nhập); token dùng 1 lần → reset sau mỗi lần gửi
const captchas = {
  signin: mountCaptcha($('#captcha-signin')),
  signup: mountCaptcha($('#captcha-signup')),
};
async function withCaptcha(form, task) {
  try {
    return await task(await captchas[form].getToken());
  } finally {
    captchas[form].reset();
  }
}
captchas.signin.show().catch(() => {});      // form đăng nhập hiện sẵn → vẽ ngay (lỗi đã hiện trong ô)

for (const tab of $$('[data-tab]')) {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
}

$('#signin-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  await withBusy(e.submitter, async () => {
    try {
      await withCaptcha('signin', (token) => signIn(form.get('email').trim(), form.get('password'), token));
      await redirectAfterLogin();
    } catch (error) {
      toastError(friendlyAuthError(error));
    }
  });
});

$('#signup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const email = form.get('email').trim();
  await withBusy(e.submitter, async () => {
    try {
      const { needsEmailConfirm } = await withCaptcha('signup', (captchaToken) => signUp({
        email,
        password: form.get('password'),
        fullName: form.get('fullName').trim(),
        phone: form.get('phone').trim(),
        role: form.get('role'),
        captchaToken,
      }));
      if (needsEmailConfirm) {
        switchTab('signin');
        $('#signin-form [name=email]').value = email;
        showNotice('info', 'Kiểm tra email để kích hoạt tài khoản',
          `Trạm Hỷ đã gửi link xác nhận tới ${email}. Bấm link đó (trên điện thoại hay máy tính đều được) – bạn sẽ được đưa về đây và đăng nhập tự động. Không thấy thư? Xem thêm mục Spam/Quảng cáo.`);
      } else {
        await redirectAfterLogin();
      }
    } catch (error) {
      toastError(friendlyAuthError(error));
    }
  });
});

$('#forgot-password').addEventListener('click', async () => {
  const done = await openDialog({
    title: 'Quên mật khẩu',
    confirmText: 'Gửi link đặt lại',
    content: html`
      <p class="small muted">Nhập email bạn đã dùng để đăng ký. Trạm Hỷ sẽ gửi link để đặt mật khẩu mới.</p>
      <label class="field"><span>Email</span>
        <input class="input" type="email" name="email" required autocomplete="email"
               value="${$('#signin-form [name=email]').value}"></label>`,
    onConfirm: async (form) => {
      try {
        await withCaptcha('signin', (token) => requestPasswordReset(form.get('email').trim(), token));
      } catch (error) {
        throw friendlyAuthError(error);
      }
    },
  });
  if (done) {
    // Không nói "email có tồn tại hay không" để người lạ không dò được ai đã đăng ký
    showNotice('info', 'Kiểm tra email để đặt lại mật khẩu',
      'Nếu email này đã đăng ký Trạm Hỷ, bạn sẽ nhận được link đặt mật khẩu mới trong vài phút. Không thấy thư? Xem thêm mục Spam/Quảng cáo.');
  }
});

$('#google-signin').addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
  try {
    await signInWithGoogle(param('next'));   // trình duyệt chuyển sang trang Google
  } catch (error) {
    toastError(friendlyAuthError(error));
  }
}));

// ---------- KHỞI CHẠY TRANG ----------
$$('#signin-form [type=submit], #signup-form [type=submit]').forEach((b) => { b.disabled = false; });   // xử lý đã gắn → mở nút
const profile = await initLayout('login');
const oauthError = !param('confirmed') && (authRedirectParams.get('error') || param('error'));
if (param('confirmed')) {
  history.replaceState(null, '', 'login.html');   // bấm F5 không hiện lại thông báo
  await handleEmailConfirmation(profile);
} else if (oauthError) {
  // Quay về từ Google nhưng không thành công (vd bấm Hủy)
  history.replaceState(null, '', location.pathname + location.search);
  showNotice('error', 'Chưa đăng nhập được bằng Google', 'Bạn đã hủy hoặc Google từ chối yêu cầu. Hãy thử lại hoặc dùng email và mật khẩu.');
} else if (profile) {
  await redirectAfterLogin();   // vừa đăng nhập Google xong, hoặc đã đăng nhập từ trước
}
