// Trang đăng nhập: báo lỗi tiếng Việt, kết quả xác nhận email
const { test, expect } = require('./helpers');

test('sai mật khẩu báo lỗi tiếng Việt', async ({ page }) => {
  await page.goto('/login.html');
  const form = page.locator('#signin-form');
  await form.getByLabel('Email').fill('khong-ton-tai.e2e@example.com');
  await form.getByLabel('Mật khẩu').fill('saimatkhau123');
  await form.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.locator('.toast-error')).toHaveText('Sai email hoặc mật khẩu');
});

test('chuyển qua lại tab Đăng nhập / Tạo tài khoản', async ({ page }) => {
  await page.goto('/login.html');
  await page.getByRole('tab', { name: 'Tạo tài khoản' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tạo tài khoản Trạm Hỷ');
  await expect(page.locator('#signup-form')).toBeVisible();
  await expect(page.locator('#signin-form')).toBeHidden();
});

test('đăng nhập: báo lỗi ngay dưới ô, form rung, không gửi khi email sai định dạng', async ({ page }) => {
  await page.goto('/login.html');
  const form = page.locator('#signin-form');
  let requests = 0;
  page.on('request', (r) => { if (r.url().includes('/auth/v1/token')) requests += 1; });
  await form.getByLabel('Email').fill('ten-khong-co-a-cong');
  await form.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(form.locator('.field-error').first()).toHaveText('Email chưa đúng định dạng (vd: ten@gmail.com)');
  await expect(form.getByText('Vui lòng nhập mật khẩu')).toBeVisible();
  await expect(form).toHaveClass(/shake/);
  await expect(form.getByLabel('Email')).toBeFocused();
  expect(requests).toBe(0);                                         // chưa hợp lệ thì không gửi lên máy chủ
  await form.getByLabel('Email').fill('dung@gmail.com');
  await expect(form.getByText('Email chưa đúng định dạng')).toBeHidden();   // sửa đúng là lỗi biến mất ngay
});

test('nút 👁 hiện / ẩn mật khẩu', async ({ page }) => {
  await page.goto('/login.html');
  const input = page.locator('#signin-form [name=password]');
  await input.fill('BiMat123');
  await expect(input).toHaveAttribute('type', 'password');
  await page.locator('#signin-form').getByRole('button', { name: 'Xem ký tự đã nhập' }).click();
  await expect(input).toHaveAttribute('type', 'text');
  await page.locator('#signin-form').getByRole('button', { name: 'Che ký tự đã nhập' }).click();
  await expect(input).toHaveAttribute('type', 'password');
});

test('tạo tài khoản: thanh độ mạnh, điều kiện mật khẩu, nhập lại phải khớp', async ({ page }) => {
  await page.goto('/login.html?tab=signup');
  const form = page.locator('#signup-form');
  const password = form.getByLabel('Mật khẩu', { exact: true });
  const meter = page.locator('#password-meter');

  await password.fill('abc');
  await expect(meter).toHaveAttribute('data-level', '0');
  await expect(meter).toContainText('Độ mạnh: Rất yếu');
  await expect(meter.locator('[data-rule="length"]')).not.toHaveClass(/ok/);
  await password.fill('matkhau2026');
  await expect(meter.locator('[data-rule="length"]')).toHaveClass(/ok/);
  await expect(meter.locator('[data-rule="mix"]')).toHaveClass(/ok/);
  await password.fill('MatKhau@2026');
  await expect(meter).toHaveAttribute('data-level', '4');
  await expect(meter).toContainText('Độ mạnh: Mạnh');

  await form.getByLabel('Họ tên').fill('Khách Thử');
  await form.getByLabel('Email').fill('khach.thu.e2e@example.com');
  await form.getByLabel('Nhập lại mật khẩu').fill('MatKhau@2025');
  await form.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(form.getByText('Mật khẩu nhập lại chưa khớp')).toBeVisible();

  await password.fill('chiCoChu');                                  // thiếu số
  await form.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(form.getByText('Mật khẩu cần có cả chữ và số')).toBeVisible();
});

test('quay về từ link xác nhận đã hết hạn thì báo rõ', async ({ page }) => {
  await page.goto('/login.html?confirmed=1#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid');
  await expect(page.locator('#auth-notice')).toContainText('Link xác nhận đã hết hạn hoặc đã được dùng');
});

test('quay về từ link xác nhận thành công thì báo thành công', async ({ page }) => {
  await page.goto('/login.html?confirmed=1');
  await expect(page.locator('#auth-notice')).toContainText('Xác nhận tài khoản thành công!');
});

test.describe('Quên mật khẩu', () => {
  test('gửi link đặt lại: hiện hướng dẫn, không tiết lộ email có tồn tại hay không', async ({ page }) => {
    await page.goto('/login.html');
    await page.locator('#signin-form').getByLabel('Email').fill('khong-ton-tai.e2e@example.com');
    await page.getByRole('button', { name: 'Quên mật khẩu?' }).click();
    const dialog = page.locator('dialog.modal');
    await expect(dialog.getByLabel('Email')).toHaveValue('khong-ton-tai.e2e@example.com');   // điền sẵn email
    await dialog.getByRole('button', { name: 'Gửi link đặt lại' }).click();
    await expect(page.locator('#auth-notice')).toContainText('Nếu email này đã đăng ký Trạm Hỷ');
  });

  test('mở trang đặt lại mật khẩu không qua link email thì báo không hợp lệ', async ({ page }) => {
    await page.goto('/reset-password.html');
    await expect(page.getByText('Không mở được link đặt lại mật khẩu')).toBeVisible();
    await expect(page.getByRole('link', { name: /gửi lại link/ })).toHaveAttribute('href', 'login.html');
  });

  test('link đặt lại đã hết hạn thì báo rõ', async ({ page }) => {
    await page.goto('/reset-password.html#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid');
    await expect(page.getByText('Link đã hết hạn hoặc đã được dùng')).toBeVisible();
  });
});

test.describe('Đăng nhập bằng Google', () => {
  test('nút Google chuyển sang trang đăng nhập Google qua Supabase', async ({ page }) => {
    await page.goto('/login.html?next=bookings.html');
    const request = page.waitForRequest((r) => r.url().includes('/auth/v1/authorize') && r.url().includes('provider=google'));
    await page.getByRole('button', { name: 'Tiếp tục với Google' }).click();
    const url = new URL((await request).url());
    expect(url.searchParams.get('redirect_to')).toContain('login.html?next=bookings.html');   // quay về đúng trang đang dở
  });

  test('bấm Hủy ở Google thì quay về báo rõ', async ({ page }) => {
    await page.goto('/login.html#error=access_denied&error_description=The+user+denied+the+request');
    await expect(page.locator('#auth-notice')).toContainText('Chưa đăng nhập được bằng Google');
  });
});
