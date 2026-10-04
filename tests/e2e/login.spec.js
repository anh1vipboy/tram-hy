// Trang đăng nhập: báo lỗi tiếng Việt, kết quả xác nhận email
const { test, expect } = require('@playwright/test');

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
