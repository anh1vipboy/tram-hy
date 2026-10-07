// Đối tác thêm mẫu váy có ảnh chính + ảnh các góc → khách thấy trong trình xem ảnh → xóa mẫu (dọn dữ liệu)
const path = require('node:path');
const { test, expect, openAs, requireAccounts } = require('../helpers');

const IMAGES = path.resolve(__dirname, '../../../frontend/assets/images');

test('thêm mẫu váy có nhiều ảnh, khách xem được, rồi xóa', async ({ browser }) => {
  requireAccounts('vendor');
  test.setTimeout(90_000);
  const vendor = await openAs(browser, 'vendor');
  const name = `E2E Váy thử nghiệm ${Date.now()}`;

  // ---- Đối tác thêm mẫu ----
  await vendor.goto('/vendor-dashboard.html');
  await vendor.getByRole('button', { name: 'Mẫu váy' }).click();
  await vendor.getByRole('button', { name: '+ Thêm mẫu váy' }).click();
  const dialog = vendor.locator('dialog.modal');
  await dialog.getByLabel('Tên mẫu váy').fill(name);
  await dialog.getByLabel('Giá (VNĐ)').fill('1500000');
  await dialog.locator('input[name=image]').setInputFiles(path.join(IMAGES, 'bride_model_2.jpg'));
  await dialog.locator('input[name=angles]').setInputFiles([
    path.join(IMAGES, 'bride_3_tryon_satin.jpg'),
    path.join(IMAGES, 'bride_4_tryon_mermaid.jpg'),
  ]);
  await dialog.getByRole('button', { name: 'Thêm mẫu' }).click();
  // Nén + tải 3 ảnh có thể mất vài chục giây
  await expect(vendor.locator('.toast-success', { hasText: 'Đã thêm mẫu váy.' })).toBeVisible({ timeout: 45_000 });

  const card = vendor.locator('[data-dress]', { hasText: name });
  await expect(card.locator('.photo-count')).toHaveText('3 ảnh');   // 1 ảnh chính + 2 ảnh góc

  // ---- Khách (cửa sổ khác) thấy mẫu và xem đủ 3 ảnh ----
  const guest = await openAs(browser, null);
  await guest.goto('/vendor.html?slug=2h-studio');
  const guestCard = guest.locator('article', { hasText: name });
  await guestCard.locator('[data-gallery]').click();
  const lightbox = guest.locator('dialog.lightbox');
  await expect(lightbox.locator('.lightbox-count')).toHaveText('1 / 3');
  await lightbox.getByRole('button', { name: 'Ảnh sau' }).click();
  await expect(lightbox.locator('.lightbox-count')).toHaveText('2 / 3');

  // ---- Đối tác xóa mẫu (dọn dữ liệu test, kiểm tra luôn chức năng xóa) ----
  await card.getByRole('button', { name: 'Xóa' }).click();
  await vendor.getByRole('button', { name: 'Xóa mẫu' }).click();
  await expect(vendor.locator('.toast-success', { hasText: 'Đã xóa mẫu váy.' })).toBeVisible();
  await expect(card).toHaveCount(0);
});

test('hộp thoại thêm váy: giá tự thêm dấu chấm, lỡ đóng khi đang nhập thì hỏi lại', async ({ browser }) => {
  requireAccounts('vendor');
  const vendor = await openAs(browser, 'vendor');
  await vendor.goto('/vendor-dashboard.html');
  await vendor.getByRole('button', { name: 'Mẫu váy' }).click();
  await vendor.getByRole('button', { name: '+ Thêm mẫu váy' }).click();
  const dialog = vendor.locator('dialog.modal');

  const price = dialog.getByLabel('Giá (VNĐ)');
  await price.pressSequentially('3500000');
  await expect(price).toHaveValue('3.500.000');                 // tự thêm dấu chấm khi gõ
  await dialog.getByLabel('Tên mẫu váy').fill('Váy đang nhập dở');

  await vendor.keyboard.press('Escape');                          // như vuốt "quay lại" trên điện thoại
  await expect(dialog.getByText('Bỏ những gì bạn đã nhập?')).toBeVisible();
  await dialog.getByRole('button', { name: 'Tiếp tục nhập' }).click();
  await expect(dialog.getByLabel('Tên mẫu váy')).toHaveValue('Váy đang nhập dở');   // dữ liệu còn nguyên

  await dialog.getByRole('button', { name: 'Hủy' }).click();
  await dialog.getByRole('button', { name: 'Bỏ', exact: true }).click();
  await expect(vendor.locator('dialog.modal')).toHaveCount(0);
});
