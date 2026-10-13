import { initLayout } from '../core/layout.js';
import { clearProfileCache, getProfile, homeForRole, signIn, signUp, signInWithGoogle, requestPasswordReset, friendlyAuthError } from '../core/auth.js';
import { authRedirectParams } from '../core/supabase.js';
import { $, $$, html, render, param, sleep } from '../core/utils.js';
import { openDialog, toastError, withBusy } from '../core/ui.js';
import { mountCaptcha } from '../components/captcha.js';
import { enhancePasswordInputs, bindPasswordMeter, passwordProblem } from '../components/password-field.js';

// ---------- KIỂM TRA TỪNG Ô (báo lỗi ngay dưới ô, không dùng bong bóng mặc định của trình duyệt) ----------
const VALIDATORS = {
  email: (v) => (!v ? 'Vui lòng nhập email'
    : !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? 'Email chưa đúng định dạng (vd: ten@gmail.com)' : ''),
  password: (v) => (!v ? 'Vui lòng nhập mật khẩu' : ''),
  fullName: (v) => (v.length < 2 ? 'Vui lòng nhập họ tên (ít nhất 2 ký tự)' : ''),
  phone: (v) => (v && !/^(\+?84|0)\d{8,10}$/.test(v.replace(/[\s.-]/g, '')) ? 'Số điện thoại chưa đúng (vd: 0912 345 678)' : ''),
  newPassword: (v) => passwordProblem(v),
  confirm: (v, form) => (!v ? 'Vui lòng nhập lại mật khẩu'
    : v !== form.elements.password.value ? 'Mật khẩu nhập lại chưa khớp' : ''),
};

function errorBox(input) {
  const field = input.closest('.field');
  let box = field.nextElementSibling?.classList.contains('field-error') ? field.nextElementSibling : null;
  if (!box) {
    box = document.createElement('p');
    box.className = 'field-error';
    box.id = `${input.form.id}-${input.name}-error`;
    box.hidden = true;
    field.after(box);
    input.setAttribute('aria-describedby', box.id);
  }
  return box;
}

/** Kiểm tra 1 ô → hiện / ẩn lỗi, đổi viền đỏ / xanh. Trả về true nếu hợp lệ. */
function validateInput(input) {
  const rule = VALIDATORS[input.dataset.validate];
  if (!rule) return true;
  // mật khẩu giữ nguyên khoảng trắng (đúng như người dùng gõ), ô khác bỏ khoảng trắng 2 đầu
  const raw = ['password', 'newPassword', 'confirm'].includes(input.dataset.validate) ? input.value : input.value.trim();
  const message = rule(raw, input.form);
  const box = errorBox(input);
  box.textContent = message;
  box.hidden = !message;
  input.setAttribute('aria-invalid', String(Boolean(message)));
  input.closest('.input-wrap')?.classList.toggle('is-valid', !message && Boolean(input.value));
  return !message;
}

/** Kiểm tra cả form; sai thì rung form + đưa con trỏ tới ô lỗi đầu tiên */
function validateForm(form) {
  const inputs = [...form.querySelectorAll('[data-validate]')];
  const invalid = inputs.filter((input) => !validateInput(input));
  if (invalid.length) {
    shake(form);
    invalid[0].focus();
  }
  return !invalid.length;
}

function shake(el) {
  el.classList.remove('shake');
  void el.offsetWidth;            // chạy lại hiệu ứng
  el.classList.add('shake');
}

// Lỗi chỉ hiện sau khi người dùng rời ô (hoặc bấm gửi); đã báo lỗi rồi thì kiểm tra lại ngay khi gõ
for (const input of $$('[data-validate]')) {
  input.addEventListener('blur', (e) => {
    // Rời ô vì đang bấm nút gửi → để lúc gửi kiểm tra cả form. Báo lỗi ngay lúc này sẽ đẩy nút tụt xuống
    // giữa lúc nhấn và nhả chuột → lần bấm bị mất.
    if (e.relatedTarget?.type === 'submit' && e.relatedTarget.form === input.form) return;
    if (input.value || input.dataset.touched) validateInput(input);
    input.dataset.touched = '1';
  });
  input.addEventListener('input', () => {
    if (input.getAttribute('aria-invalid') === 'true' || input.closest('.input-wrap')?.classList.contains('is-valid')) validateInput(input);
    // gõ lại mật khẩu → kiểm tra lại ô "Nhập lại mật khẩu" nếu đã nhập
    if (input.name === 'password' && input.form.elements.confirm?.value) validateInput(input.form.elements.confirm);
  });
}
enhancePasswordInputs($('main'));
bindPasswordMeter($('#signup-password'), $('#password-meter'));

function showNotice(type, title, message) {
  const box = $('#auth-notice');
  box.className = `notice notice-${type}`;
  render(box, html`<strong>${title}</strong>${message}`);
  box.hidden = false;
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

const TAB_TEXT = {
  signin: ['Chào mừng trở lại', 'Đăng nhập để tiếp tục chuẩn bị đám cưới của bạn.'],
  signup: ['Tạo tài khoản Trạm Hỷ', 'Miễn phí – thử váy AI, đặt lịch và giữ cọc an toàn trong vài phút.'],
};

function switchTab(name) {
  $('.auth-tabs').dataset.active = name;                     // thanh chọn trượt theo tab
  for (const tab of $$('[data-tab]')) {
    tab.classList.toggle('active', tab.dataset.tab === name);
    tab.setAttribute('aria-selected', String(tab.dataset.tab === name));
  }
  $('#auth-title').textContent = TAB_TEXT[name][0];
  $('#auth-subtitle').textContent = TAB_TEXT[name][1];
  for (const id of ['signin', 'signup']) {
    const form = $(`#${id}-form`);
    form.hidden = id !== name;
    if (id === name) { form.classList.remove('form-enter'); void form.offsetWidth; form.classList.add('form-enter'); }
  }
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
    await redirectAfterLogin();                    // về đúng trang đang dở (vd mở tiệm) hoặc trang chủ
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
  if (!validateForm(e.target)) return;
  const form = new FormData(e.target);
  await withBusy(e.submitter, async () => {
    try {
      await withCaptcha('signin', (token) => signIn(form.get('email').trim(), form.get('password'), token));
      e.submitter.textContent = 'Đang vào Trạm Hỷ…';
      await redirectAfterLogin();
    } catch (error) {
      shake(e.target);
      toastError(friendlyAuthError(error));
    }
  });
});

$('#signup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!validateForm(e.target)) return;
  const form = new FormData(e.target);
  const email = form.get('email').trim();
  await withBusy(e.submitter, async () => {
    try {
      const { needsEmailConfirm } = await withCaptcha('signup', (captchaToken) => signUp({
        email,
        password: form.get('password'),
        fullName: form.get('fullName').trim(),
        phone: form.get('phone').trim(),
        next: param('next'),
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
      shake(e.target);
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
$$('#signin-form [type=submit], #signup-form [type=submit], [data-tab]').forEach((b) => { b.disabled = false; });   // xử lý đã gắn → mở nút
const profile = await initLayout('login');
const oauthError = !param('confirmed') && (authRedirectParams.get('error') || param('error'));
// Đến từ "Trở thành đối tác" (?tab=signup&next=vendor-dashboard.html): mở sẵn tab Tạo tài khoản + nói rõ bước tiếp theo
if (param('tab') === 'signup') switchTab('signup');
if (!param('confirmed') && param('next')?.startsWith('vendor-dashboard')) {
  showNotice('info', 'Bước 1/2: Đăng nhập hoặc tạo tài khoản',
    'Xong bước này bạn được đưa thẳng tới form mở tiệm. Đăng ký bằng Google cũng được.');
}
if (param('confirmed')) {
  const keepNext = param('next') ? `?next=${encodeURIComponent(param('next'))}` : '';
  history.replaceState(null, '', `login.html${keepNext}`);   // F5 không hiện lại thông báo, vẫn nhớ trang cần quay về
  await handleEmailConfirmation(profile);
} else if (oauthError) {
  // Quay về từ Google nhưng không thành công (vd bấm Hủy)
  history.replaceState(null, '', location.pathname + location.search);
  showNotice('error', 'Chưa đăng nhập được bằng Google', 'Bạn đã hủy hoặc Google từ chối yêu cầu. Hãy thử lại hoặc dùng email và mật khẩu.');
} else if (profile) {
  await redirectAfterLogin();   // vừa đăng nhập Google xong, hoặc đã đăng nhập từ trước
}
