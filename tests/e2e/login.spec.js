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
  await page.getByRole('button', { name: 'Tạo tài khoản' }).first().click();
  await expect(page.locator('#signup-form')).toBeVisible();
  await expect(page.locator('#signin-form')).toBeHidden();
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
