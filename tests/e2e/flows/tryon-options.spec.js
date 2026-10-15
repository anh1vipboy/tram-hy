// Tùy chỉnh ướm thử AI: mô hình (Siêu nét chỉ khi admin bật), chất lượng, số ảnh → đúng credit, nhiều ảnh để chọn,
// so sánh trước/sau, "Ướm kiểu khác". Edge Function + cài đặt admin được giả lập (không tốn credit FASHN, không đụng
// cài đặt thật); ảnh váy thật vẫn lưu vào Storage rồi xóa.
const path = require('node:path');
const { test, expect, openAs, requireAccounts } = require('../helpers');

const GARMENT = path.resolve(__dirname, '../../../frontend/assets/images/bride_3_tryon_satin.jpg');
const IMG_1 = '/assets/images/bride_model_1.png';
const IMG_2 = '/assets/images/bride_model_2.jpg';

// Giả lập bảng app_settings (SQL 28). maybeSingle() có thể xin 1 object hoặc 1 mảng → trả đúng kiểu được hỏi.
async function mockSettings(page, settings) {
  await page.route('**/rest/v1/app_settings*', (route) => {
    const row = { value: { max_enabled: settings.maxEnabled, daily_credits: 6 } };
    const single = (route.request().headers().accept ?? '').includes('vnd.pgrst.object');
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(single ? row : [row]) });
  });
}

test('tùy chỉnh ướm thử AI: Siêu nét, chất lượng, số ảnh, chọn ảnh, so sánh, kiểu khác', async ({ browser }) => {
  requireAccounts('bride');
  test.setTimeout(120_000);
  const bride = await openAs(browser, 'bride');
  const settings = { maxEnabled: true };
  await mockSettings(bride, settings);
  const sent = [];
  await bride.route('**/functions/v1/thu-vay-ai', (route) => {
    const body = route.request().postDataJSON();
    sent.push(body);
    const images = body.options.samples > 1 ? [IMG_1, IMG_2] : [IMG_1];
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ imageUrl: images[0], images, remaining: 2, limit: 6, credits: 4, provider: 'fashn' }),
    });
  });

  await bride.goto('/tryon.html?mode=own');
  await bride.evaluate(() => localStorage.removeItem('tramhy.tryon-options'));
  await bride.reload();
  await expect(bride.locator('#ai-hint')).toHaveText('Tải ảnh váy mẫu ở bước 2 trước nhé', { timeout: 30_000 });
  await bride.locator('#garment-input').setInputFiles(GARMENT);
  await expect(bride.locator('.toast-success', { hasText: 'Đã lưu ảnh váy' })).toBeVisible({ timeout: 30_000 });

  // ---- Mặc định: Tiêu chuẩn, Đẹp nhất, 1 ảnh = 1 credit ----
  const button = bride.locator('#ai-tryon');
  const options = bride.locator('#ai-options');
  await expect(button).toContainText('1 credit');
  await expect(bride.locator('#ai-options-sum')).toHaveText('Tiêu chuẩn · Đẹp nhất · 1 ảnh');
  await options.locator('summary').click();

  // ---- Siêu nét (admin đã bật): giá theo chất lượng × số ảnh ----
  await options.getByRole('button', { name: '💎 Siêu nét' }).click();
  await expect(options.getByRole('button', { name: 'Đẹp nhất · 3 credit' })).toBeVisible();
  await expect(options.getByText('Loại trang phục')).toHaveCount(0);       // Siêu nét không có các lựa chọn này
  await options.getByRole('button', { name: '2 ảnh' }).click();
  await expect(button).toContainText('6 credit');
  await options.getByRole('button', { name: 'Cân bằng · 2 credit' }).click();
  await expect(button).toContainText('4 credit');
  await expect(options.locator('.ai-opt-total')).toContainText('Mỗi lần ướm: 4 credit');

  await button.click();
  await expect(bride.locator('#mirror-label')).toHaveText('✨ Ảnh AI ghép váy thật');
  expect(sent[0].options).toMatchObject({ model: 'max', quality: 'balanced', samples: 2, seed: expect.any(Number) });
  expect(sent[0].garmentPath).toMatch(/\/garment-\d+\.jpg$/);

  // ---- 2 ảnh → chọn ảnh ưng nhất ----
  const picks = bride.locator('#ai-picks button');
  await expect(picks).toHaveCount(2);
  await picks.nth(1).click();
  await expect(bride.locator('#mirror-img')).toHaveAttribute('src', IMG_2);
  await expect(picks.nth(1)).toHaveClass(/active/);
  // Còn 2 credit mà lựa chọn hiện tại cần 4 → khóa nút, gợi ý giảm
  await expect(bride.locator('#ai-hint')).toHaveText('Cần 4 credit, hôm nay còn 2 – giảm số ảnh hoặc chất lượng');
  await expect(button).toBeDisabled();

  // ---- So sánh trước/sau ----
  await bride.getByRole('button', { name: 'So sánh trước/sau' }).click();
  await expect(bride.locator('#mirror-compare')).toBeVisible();
  await bride.locator('#compare-range').fill('30');
  await expect(bride.locator('.mirror-frame')).toHaveAttribute('style', /--split: calc\(22px \+ \(100% - 44px\) \* 0\.3\)/);
  await bride.getByRole('button', { name: 'Tắt so sánh' }).click();
  await expect(bride.locator('#mirror-compare')).toBeHidden();

  // ---- Đổi về Tiêu chuẩn + xóa kỹ đồ đang mặc → "Ướm kiểu khác" (seed mới) ----
  await options.getByRole('button', { name: '⚡ Tiêu chuẩn' }).click();
  await options.getByRole('button', { name: '1 ảnh' }).click();
  await expect(options.getByRole('button', { name: 'Váy liền' })).toHaveClass(/active/);
  await options.getByLabel(/Xóa kỹ đồ đang mặc/).check();
  await expect(button).toContainText('🎲 Ướm kiểu khác');
  await expect(button).toContainText('1 credit');
  await expect(bride.locator('#ai-hint')).toHaveText('Còn 2/6 credit hôm nay');
  await button.click();
  await expect.poll(() => sent.length).toBe(2);
  expect(sent[1].options).toMatchObject({ model: 'standard', samples: 1, category: 'one-pieces', cleanOriginal: true });
  expect(sent[1].options.seed).not.toBe(sent[0].options.seed);
  await expect(bride.locator('#ai-picks')).toBeHidden();

  // ---- Admin tắt Siêu nét: không còn lựa chọn đó, dù máy đã nhớ "Siêu nét" ----
  await options.getByRole('button', { name: '💎 Siêu nét' }).click();          // máy nhớ model = max
  settings.maxEnabled = false;
  await bride.reload();
  await expect(bride.locator('#ai-hint')).toHaveText('Tải ảnh váy mẫu ở bước 2 trước nhé', { timeout: 30_000 });
  await bride.locator('#garments [data-garment]').first().click();
  await expect(bride.locator('#ai-options-sum')).toHaveText(/^Tiêu chuẩn/);
  await bride.locator('#ai-options summary').click();
  await expect(bride.locator('#ai-options').getByRole('button', { name: '💎 Siêu nét' })).toHaveCount(0);
  await bride.locator('#ai-tryon').click();
  await expect.poll(() => sent.length).toBe(3);
  expect(sent[2].options.model).toBe('standard');

  // ---- Dọn ảnh váy ----
  const garmentPath = sent[0].garmentPath;
  await bride.locator(`#garments [data-remove="${garmentPath}"]`).click();
  await bride.locator('dialog.modal').getByRole('button', { name: 'Xóa ảnh' }).click();
  await expect(bride.locator(`#garments [data-remove="${garmentPath}"]`)).toHaveCount(0);
  await bride.context().close();
});

// Cần SQL 28 trên project test. Bật/tắt thật trong database test rồi trả về như cũ.
test('admin bật/tắt Siêu nét và đổi hạn mức credit', async ({ browser }) => {
  requireAccounts('admin');
  const admin = await openAs(browser, 'admin');
  await admin.goto('/admin.html');
  await admin.getByRole('button', { name: 'Thử váy AI' }).click();
  const form = admin.locator('#ai-settings');
  const max = form.getByLabel('Bật mô hình Siêu nét (Max) cho người dùng');
  const credits = form.getByLabel('Hạn mức mỗi người mỗi ngày (credit)');
  await expect(credits).not.toHaveValue('');
  const before = { max: await max.isChecked(), credits: await credits.inputValue() };

  await max.setChecked(!before.max);
  await credits.fill('7');
  await form.getByRole('button', { name: 'Lưu cài đặt' }).click();
  await expect(admin.locator('.toast-success', { hasText: 'Đã lưu' })).toBeVisible();

  await admin.reload();
  await admin.getByRole('button', { name: 'Thử váy AI' }).click();
  await expect(max).toBeChecked({ checked: !before.max });
  await expect(credits).toHaveValue('7');

  // Trả lại như cũ
  await max.setChecked(before.max);
  await credits.fill(before.credits);
  await form.getByRole('button', { name: 'Lưu cài đặt' }).click();
  await expect(admin.locator('.toast-success', { hasText: 'Đã lưu' }).last()).toBeVisible();
  await admin.context().close();
});
