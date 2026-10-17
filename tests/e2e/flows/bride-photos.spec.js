// Cô dâu tải ảnh của mình ở Phòng thử (tấm "Ảnh của bạn") → ảnh được lưu riêng tư → mở lại trang vẫn chọn được
// → xóa ảnh (dọn dữ liệu)
const path = require('node:path');
const { test, expect, openAs, requireAccounts } = require('../helpers');

const PHOTO = path.resolve(__dirname, '../../../frontend/assets/images/bride_model_2.jpg');

async function openPersonSheet(bride) {
  await bride.locator('[data-slot="person"]').click();
  const sheet = bride.locator('dialog.sheet');
  await expect(sheet.locator('h3')).toHaveText('Ảnh của bạn');
  return sheet;
}

test('ảnh của cô dâu được lưu, mở lại trang vẫn chọn được, rồi xóa', async ({ browser }) => {
  requireAccounts('bride');
  test.setTimeout(90_000);
  const bride = await openAs(browser, 'bride');
  await bride.goto('/tryon.html');
  await expect(bride.locator('.msg-row.ai').last()).toBeVisible({ timeout: 30_000 });   // tải xong dữ liệu tài khoản

  let sheet = await openPersonSheet(bride);
  const saved = sheet.locator('[data-remove]');
  const savedBefore = await saved.count();
  test.skip(savedBefore >= 6, 'Tài khoản test đã đủ 6 ảnh');

  // ---- Tải ảnh lên: tấm đóng lại, ô "Ảnh của bạn" hiện ảnh mới ----
  await sheet.locator('[data-upload]').setInputFiles(PHOTO);
  await expect(bride.locator('.toast-success', { hasText: 'Đã lưu ảnh riêng tư' })).toBeVisible({ timeout: 30_000 });
  await expect(bride.locator('[data-slot="person"]')).toContainText('Ảnh của bạn');

  // ---- Mở lại trang: ảnh vẫn còn, chọn được ----
  await bride.reload();
  await expect(bride.locator('.msg-row.ai').last()).toBeVisible({ timeout: 30_000 });
  sheet = await openPersonSheet(bride);
  await expect(saved).toHaveCount(savedBefore + 1);
  await sheet.locator('.pick-tile:has([data-remove]) .pick-main').first().click();
  await expect(bride.locator('[data-slot="person"] img')).toBeVisible();

  // ---- Xóa ảnh vừa tải ----
  sheet = await openPersonSheet(bride);
  await saved.first().click();
  await bride.locator('dialog.modal').getByRole('button', { name: 'Xóa ảnh' }).click();
  await expect(bride.locator('.toast-success', { hasText: 'Đã xóa ảnh.' })).toBeVisible();
  await expect(saved).toHaveCount(savedBefore);
  await expect(bride.locator('[data-slot="person"]')).toContainText('Chọn ảnh');   // đang chọn ảnh vừa xóa → bỏ chọn
  await bride.context().close();
});
