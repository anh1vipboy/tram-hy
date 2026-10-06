// Đối tác: ảnh bìa + ảnh thực tế · Admin: cấp / thu hồi Tích Xanh
const path = require('node:path');
const { test, expect, openAs, requireAccounts } = require('../helpers');
const { adminTab } = require('./flow-helpers');

const IMAGES = path.resolve(__dirname, '../../../frontend/assets/images');

test('đối tác đổi ảnh bìa, thêm 2 ảnh thực tế → khách thấy → xóa ảnh', async ({ browser }) => {
  requireAccounts('vendor');
  test.setTimeout(90_000);
  const vendor = await openAs(browser, 'vendor');
  await vendor.goto('/vendor-dashboard.html');
  await vendor.locator('[data-panel="media"]').click();
  const panel = vendor.locator('#panel-media');
  await expect(panel.getByRole('heading', { name: /Ảnh thực tế/ })).toBeVisible();
  const countBefore = await panel.locator('.photo').count();

  await panel.locator('input[data-cover]').setInputFiles(path.join(IMAGES, 'bride_1_tryon_royal.jpg'));
  await expect(vendor.locator('.toast-success', { hasText: 'Đã cập nhật ảnh bìa.' })).toBeVisible({ timeout: 30_000 });
  await expect(panel.locator('img.cover-preview')).toBeVisible();

  await panel.locator('input[data-photos]').setInputFiles([
    path.join(IMAGES, 'bride_3_tryon_satin.jpg'),
    path.join(IMAGES, 'user_tryon_aodai.jpg'),
  ]);
  await expect(vendor.locator('.toast-success', { hasText: 'Đã thêm 2 ảnh.' })).toBeVisible({ timeout: 45_000 });
  await expect(panel.locator('.photo')).toHaveCount(countBefore + 2);

  // Khách thấy ảnh bìa + ảnh thực tế ở trang tiệm
  const guest = await openAs(browser, null);
  await guest.goto('/vendor.html?slug=2h-studio');
  await expect(guest.getByRole('heading', { name: 'Ảnh thực tế' })).toBeVisible();
  await expect(guest.locator('.photo-grid .photo')).toHaveCount(countBefore + 2);

  // Dọn: xóa 2 ảnh vừa thêm (ảnh mới nằm cuối danh sách)
  for (let i = 0; i < 2; i++) {
    await panel.locator('.photo').last().getByRole('button', { name: 'Xóa ảnh' }).click();
    await vendor.locator('dialog.modal').getByRole('button', { name: 'Xóa ảnh' }).click();
    await expect(panel.locator('.photo')).toHaveCount(countBefore + 1 - i);
  }
});

test('admin cấp rồi thu hồi Tích Xanh cho đối tác', async ({ browser }) => {
  requireAccounts('admin');
  const admin = await openAs(browser, 'admin');
  const vendors = await adminTab(admin, 'vendors');
  const row = vendors.locator('tr[data-vendor]', { hasText: 'Dezi Wedding Decor' });
  await expect(row).toBeVisible();

  // Đưa về trạng thái ban đầu "chưa cấp" nếu lần chạy trước bị dừng giữa chừng
  if (await row.getByRole('button', { name: 'Thu hồi' }).count()) {
    await row.getByRole('button', { name: 'Thu hồi' }).click();
    await expect(row.locator('.badge', { hasText: /^Chưa$/ })).toBeVisible();
  }

  await row.getByRole('button', { name: 'Cấp Tích Xanh' }).click();
  await expect(row).toContainText('✓ Đã cấp');

  const guest = await openAs(browser, null);
  await guest.goto('/vendor.html?slug=dezidecor');
  await expect(guest.getByText('✓ Đối tác Tích Xanh')).toBeVisible();

  await row.getByRole('button', { name: 'Thu hồi' }).click();
  await expect(row.locator('.badge', { hasText: /^Chưa$/ })).toBeVisible();
  await guest.reload();
  await expect(guest.getByText('Chưa xác minh')).toBeVisible();
});
