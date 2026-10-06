// Luồng chính: cô dâu tải ảnh váy mẫu → AI ướm lên người (kèm số đo) → ảnh hiện trên gương + "Ảnh đã thử"
// Edge Function được giả lập (page.route) để test không tốn credit FASHN; ảnh váy thật vẫn lưu vào Storage rồi xóa.
const path = require('node:path');
const { test, expect, openAs, requireAccounts } = require('../helpers');

const GARMENT = path.resolve(__dirname, '../../../frontend/assets/images/bride_3_tryon_satin.jpg');

test('tải ảnh váy mẫu → AI ướm thử theo số đo → xem lại → xóa ảnh váy', async ({ browser }) => {
  requireAccounts('bride');
  test.setTimeout(90_000);
  const bride = await openAs(browser, 'bride');
  let sent;
  await bride.route('**/functions/v1/thu-vay-ai', (route) => {
    sent = route.request().postDataJSON();
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ imageUrl: '/assets/images/bride_model_1.png', remaining: 4, provider: 'fashn' }),
    });
  });

  await bride.goto('/tryon.html?mode=own');
  await expect(bride.locator('#own-panel')).toBeVisible();
  await expect(bride.locator('#ai-hint')).toHaveText('Tải ảnh váy mẫu ở bước 2 trước nhé', { timeout: 30_000 });

  // ---- Tải ảnh váy mẫu → được lưu riêng tư ----
  await bride.locator('#garment-input').setInputFiles(GARMENT);
  await expect(bride.locator('.toast-success', { hasText: 'Đã lưu ảnh váy' })).toBeVisible({ timeout: 30_000 });

  // ---- AI ướm thử ----
  await bride.getByRole('button', { name: '✨ Ướm thử bằng AI thật' }).click();
  await expect(bride.locator('#mirror-label')).toHaveText('✨ Ảnh AI ghép váy thật');
  await expect(bride.locator('#ai-history-list button')).not.toHaveCount(0);
  expect(sent.garmentPath).toMatch(/\/garment-\d+\.jpg$/);
  expect(sent.dressId).toBeUndefined();
  expect(sent.body).toMatchObject({ height: expect.any(Number), weight: expect.any(Number) });

  // ---- Xóa ảnh váy (dọn dữ liệu) ----
  const garmentPath = sent.garmentPath;
  await bride.locator(`#garments [data-remove="${garmentPath}"]`).click();
  await bride.locator('dialog.modal').getByRole('button', { name: 'Xóa ảnh' }).click();
  await expect(bride.locator(`#garments [data-remove="${garmentPath}"]`)).toHaveCount(0);
  await bride.context().close();
});
