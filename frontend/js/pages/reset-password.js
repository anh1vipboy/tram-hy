// Trang người dùng tới từ link "đặt lại mật khẩu" trong email (reset-password.html#access_token=…&type=recovery).
// supabase-js tự đọc phần # và tạo phiên đăng nhập tạm → cho phép đặt mật khẩu mới.
import { initLayout } from '../core/layout.js';
import { clearProfileCache, getProfile, homeForRole, updatePassword, friendlyAuthError } from '../core/auth.js';
import { authRedirectParams } from '../core/supabase.js';
import { $, html, render, sleep } from '../core/utils.js';
import { toast, toastError, withBusy } from '../core/ui.js';

const card = $('#reset-card');

function renderInvalidLink(title, message) {
  render(card, html`
    <h1 style="font-size:28px">Đặt mật khẩu mới</h1>
    <div class="notice notice-error"><strong>${title}</strong>${message}</div>
    <a class="btn btn-primary btn-block" href="login.html">Về trang đăng nhập để gửi lại link</a>`);
}

function renderForm(profile) {
  render(card, html`
    <h1 style="font-size:28px">Đặt mật khẩu mới</h1>
    <p class="muted">Tài khoản: <strong>${profile.email}</strong></p>
    <form id="reset-form" class="stack">
      <label class="field"><span>Mật khẩu mới (ít nhất 6 ký tự)</span>
        <input class="input" type="password" name="password" required minlength="6" autocomplete="new-password"></label>
      <label class="field"><span>Nhập lại mật khẩu mới</span>
        <input class="input" type="password" name="confirm" required minlength="6" autocomplete="new-password"></label>
      <button class="btn btn-primary btn-block" type="submit">Lưu mật khẩu mới</button>
    </form>`);

  $('#reset-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    if (form.get('password') !== form.get('confirm')) {
      toastError(new Error('Hai mật khẩu chưa khớp nhau'));
      return;
    }
    await withBusy(e.submitter, async () => {
      try {
        await updatePassword(form.get('password'));
        toast('Đã đổi mật khẩu thành công!', 'success');
        await sleep(1500);
        location.href = homeForRole(profile.role);
      } catch (error) {
        toastError(friendlyAuthError(error));
      }
    });
  });
}

// ---------- KHỞI CHẠY TRANG ----------
const linkError = authRedirectParams.get('error_code') || authRedirectParams.get('error');
await initLayout('login');              // chờ supabase-js đọc link và tạo phiên
history.replaceState(null, '', 'reset-password.html');   // bỏ mã trong thanh địa chỉ
clearProfileCache();
const profile = await getProfile();

if (linkError) {
  renderInvalidLink(
    linkError === 'otp_expired' ? 'Link đã hết hạn hoặc đã được dùng' : 'Link không hợp lệ',
    'Mỗi link đặt lại mật khẩu chỉ dùng được 1 lần và có hạn sử dụng. Hãy gửi lại link mới.');
} else if (!profile) {
  renderInvalidLink('Không mở được link đặt lại mật khẩu',
    'Hãy mở đúng link trong email Trạm Hỷ gửi bạn, hoặc gửi lại link mới.');
} else {
  renderForm(profile);
}
