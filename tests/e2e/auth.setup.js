// Chạy 1 lần trước các test cần đăng nhập: đăng nhập 3 vai trò qua giao diện thật,
// lưu phiên vào tests/.auth/<vai-trò>.json để các test sau dùng lại (không phải đăng nhập mỗi bài).
const { test, expect, account, authFile } = require('./helpers');

const ROLES = [
  { role: 'bride', landing: /index\.html/ },
  { role: 'vendor', landing: /vendor-dashboard\.html/ },
  { role: 'admin', landing: /admin\.html/ },
];

for (const { role, landing } of ROLES) {
  test(`đăng nhập tài khoản test: ${role}`, async ({ page }) => {
    const { email, password } = account(role);
    test.skip(!email || !password, `Chưa điền E2E_${role.toUpperCase()}_EMAIL / _PASSWORD trong tests/.env`);

    await page.goto('/login.html');
    const form = page.locator('#signin-form');
    await form.getByLabel('Email').fill(email);
    await form.getByLabel('Mật khẩu').fill(password);
    await form.getByRole('button', { name: 'Đăng nhập' }).click();
    await expect(page).toHaveURL(landing);   // đúng vai trò thì được đưa tới đúng trang
    await expect(page.locator('.site-header [data-account]')).toBeVisible();   // avatar tài khoản ở header
    await page.context().storageState({ path: authFile(role) });
  });
}
