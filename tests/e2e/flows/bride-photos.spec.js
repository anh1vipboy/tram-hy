// Cô dâu tải ảnh toàn thân → ảnh được lưu riêng tư → mở lại trang vẫn chọn được → xóa ảnh (dọn dữ liệu)
const path = require('node:path');
const { test, expect, openAs, requireAccounts } = require('../helpers');

const PHOTO = path.resolve(__dirname, '../../../frontend/assets/images/bride_model_2.jpg');

test('ảnh của cô dâu được lưu, mở lại trang vẫn chọn được, rồi xóa', async ({ browser }) => {
  requireAccounts('bride');
  test.setTimeout(90_000);
  const bride = await openAs(browser, 'bride');
  await bride.goto('/tryon.html');
  const note = bride.locator('#photo-note');
  await expect(note).toContainText('chỉ bạn xem được');
  const savedBefore = await bride.locator('#models [data-remove]').count();
  test.skip(savedBefore >= 6, 'Tài khoản test đã đủ 6 ảnh');

  // ---- Tải ảnh lên ----
  await bride.locator('#photo-input').setInputFiles(PHOTO);
  await expect(bride.locator('.toast-success', { hasText: 'Đã lưu ảnh riêng tư' })).toBeVisible({ timeout: 30_000 });
  await expect(bride.locator('#models [data-remove]')).toHaveCount(savedBefore + 1);

  // ---- Mở lại trang: ảnh vẫn còn, chọn được ----
  await bride.reload();
  const photos = bride.locator('#models [data-model^="photo:"]');
  await expect(photos).toHaveCount(savedBefore + 1, { timeout: 30_000 });   // chờ tải xong mẫu váy + ảnh
  await photos.first().click();
  await expect(photos.first()).toHaveClass(/active/);
  await expect(bride.locator('#mirror-note')).toBeVisible();      // ảnh của bạn → nhắc dùng AI thật

  // ---- Xóa ảnh vừa tải ----
  await bride.locator('#models [data-remove]').first().click();
  await bride.locator('dialog.modal').getByRole('button', { name: 'Xóa ảnh' }).click();
  await expect(bride.locator('.toast-success', { hasText: 'Đã xóa ảnh.' })).toBeVisible();
  await expect(bride.locator('#models [data-remove]')).toHaveCount(savedBefore);
  await bride.reload();
  await expect(bride.locator('#models [data-model^="photo:"]')).toHaveCount(savedBefore);
  await bride.context().close();
});
