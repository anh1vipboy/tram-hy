// Luồng chính của Phòng thử dạng trò chuyện: tải ảnh váy mẫu → chọn người mẫu → gửi → AI ướm (kèm số đo)
// → ảnh hiện trong khung chat → "Đặt may theo mẫu này" sang trang may đo.
// Edge Function được giả lập (page.route) để test không tốn credit FASHN; ảnh váy thật vẫn lưu vào Storage rồi xóa.
const path = require('node:path');
const { test, expect, openAs, requireAccounts } = require('../helpers');

const GARMENT = path.resolve(__dirname, '../../../frontend/assets/images/bride_3_tryon_satin.jpg');
const RESULT = '/assets/images/bride_model_1.png';

test('tải ảnh váy mẫu → AI ướm thử theo số đo trong khung chat → đặt may → xóa ảnh váy', async ({ browser }) => {
  requireAccounts('bride');
  test.setTimeout(90_000);
  const bride = await openAs(browser, 'bride');
  let sent;
  await bride.route('**/functions/v1/thu-vay-ai', (route) => {
    sent = route.request().postDataJSON();
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ imageUrl: RESULT, images: [RESULT], remaining: 4, limit: 6, provider: 'fashn' }),
    });
  });

  await bride.goto('/tryon.html?mode=own');                       // mở thẳng tab "Ảnh váy của bạn"
  const sheet = bride.locator('dialog.sheet');
  await expect(sheet.locator('.tab.active')).toHaveText('Ảnh váy của bạn', { timeout: 30_000 });

  // ---- Tải ảnh váy mẫu → được lưu riêng tư, vào ô "Váy cưới" ----
  await sheet.locator('[data-upload]').setInputFiles(GARMENT);
  await expect(bride.locator('.toast-success', { hasText: 'Đã lưu ảnh váy' })).toBeVisible({ timeout: 30_000 });
  await expect(bride.locator('[data-slot="dress"]')).toContainText('Váy bạn tải lên');

  // ---- Chọn người mẫu có sẵn rồi gửi (không cần gõ chữ) ----
  await bride.locator('[data-slot="person"]').click();
  await sheet.locator('[data-pick="sample:bride2"]').click();
  await bride.getByRole('button', { name: 'Gửi' }).click();
  await expect(bride.getByText('Mình sẽ ướm chiếc váy lên ảnh của bạn')).toBeVisible();
  const result = bride.locator('.gen:not(.gen-pending)').last();
  await expect(result.locator('.gen-main')).toHaveAttribute('src', RESULT);
  await expect(bride.locator('#composer-cost')).toContainText('còn 4/6');
  expect(sent.garmentPath).toMatch(/\/garment-\d+\.jpg$/);
  expect(sent.dressId).toBeUndefined();
  expect(sent.sampleModel).toBe('bride2');
  expect(sent.body).toMatchObject({ height: expect.any(Number), weight: expect.any(Number) });
  expect(sent.options).toMatchObject({ category: 'one-pieces', samples: 1, seed: expect.any(Number) });

  // ---- So sánh trước/sau ----
  await result.getByRole('button', { name: '⇆ So sánh trước/sau' }).click();
  await expect(result.locator('.gen-compare img')).toHaveAttribute('src', /bride_model_2\.jpg/);
  await result.locator('.gen-range').fill('30');
  await expect(result.locator('.gen-frame')).toHaveAttribute('style', /--split: calc\(22px \+ \(100% - 44px\) \* 0\.3\)/);

  // ---- Đặt may theo mẫu này → trang may đo có ghi chú sẵn ----
  const garmentPath = sent.garmentPath;
  await bride.getByRole('button', { name: '✂️ Đặt may theo mẫu này' }).click();
  await expect(bride).toHaveURL(/thiet-ke-vay\.html\?tu=anh-vay/);
  await expect(bride.locator('#bespoke-notes')).toHaveValue(/ảnh váy mẫu/);

  // ---- Xóa ảnh váy (dọn dữ liệu) ----
  await bride.goto('/tryon.html?mode=own');
  await expect(sheet.locator(`[data-remove="${garmentPath}"]`)).toBeVisible({ timeout: 30_000 });
  await sheet.locator(`[data-remove="${garmentPath}"]`).click();
  await bride.locator('dialog.modal').getByRole('button', { name: 'Xóa ảnh' }).click();
  await expect(sheet.locator(`[data-remove="${garmentPath}"]`)).toHaveCount(0);
  await bride.context().close();
});
