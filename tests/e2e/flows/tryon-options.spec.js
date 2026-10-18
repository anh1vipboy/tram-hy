// Tùy chỉnh ướm thử AI: Siêu nét (chỉ khi admin bật, bật thì dùng mặc định), chất lượng, số ảnh → đúng credit,
// nhiều ảnh để chọn, "Thử kiểu khác" (seed mới), hết credit thì báo. Edge Function + cài đặt admin được giả lập
// (không tốn credit FASHN, không đụng cài đặt thật).
const { test, expect, openAs, requireAccounts } = require('../helpers');

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

// Chọn người mẫu + mẫu váy đầu tiên của tiệm (có ảnh thật) ở khung soạn tin
async function pickPersonAndDress(page) {
  await page.locator('[data-slot="person"]').click();
  await page.locator('dialog.sheet [data-pick="sample:bride1"]').click();
  await page.locator('[data-slot="dress"]').click();
  await page.locator('dialog.sheet .pick-grid.dresses .pick-main').first().click();
  await expect(page.locator('dialog.sheet')).toHaveCount(0);
}

test('Siêu nét, chất lượng, số ảnh → credit; chọn ảnh; thử kiểu khác; hết credit', async ({ browser }) => {
  requireAccounts('bride');
  test.setTimeout(120_000);
  const bride = await openAs(browser, 'bride');
  const settings = { maxEnabled: true };
  await mockSettings(bride, settings);
  const sent = [];
  const left = [2, 0, 6];                                          // credit còn lại sau mỗi lần ướm
  await bride.route('**/functions/v1/thu-vay-ai', (route) => {
    const body = route.request().postDataJSON();
    sent.push(body);
    const images = body.options.samples > 1 ? [IMG_1, IMG_2] : [IMG_1];
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ imageUrl: images[0], images, remaining: left[sent.length - 1], limit: 6, provider: 'fashn' }),
    });
  });

  await bride.goto('/tryon.html');
  await bride.evaluate(() => localStorage.removeItem('tramhy.tryon-chat-options'));
  await bride.reload();
  await expect(bride.locator('.msg-row.ai').last()).toBeVisible({ timeout: 30_000 });
  await pickPersonAndDress(bride);

  // ---- Admin đã bật Siêu nét → dùng mặc định, chất lượng Cân bằng = 2 credit ----
  await expect(bride.locator('#settings-sum')).toHaveText('Siêu nét · 1 ảnh');
  await expect(bride.locator('#composer-cost')).toContainText('2 credit');
  await bride.locator('#open-settings').click();
  const sheet = bride.locator('dialog.sheet');
  await expect(sheet.getByRole('button', { name: 'Đẹp nhất · 3 credit' })).toBeVisible();
  await expect(sheet.getByText('Ảnh váy là')).toHaveCount(0);          // lựa chọn riêng của Tiêu chuẩn
  await sheet.getByRole('button', { name: '2 ảnh' }).click();
  await expect(sheet.locator('.opt-total')).toContainText('Mỗi lần ướm: 4 credit');
  await sheet.getByRole('button', { name: 'Nhanh · 1 credit' }).click();
  await expect(sheet.locator('.opt-total')).toContainText('Mỗi lần ướm: 2 credit');
  await sheet.getByRole('button', { name: 'Đóng' }).click();
  await expect(bride.locator('#composer-cost')).toContainText('2 credit');

  // ---- Gửi kèm tin nhắn? Không – chỉ ảnh: ướm ngay, 2 ảnh để chọn ----
  await bride.getByRole('button', { name: 'Gửi' }).click();
  const result = bride.locator('.gen:not(.gen-pending)').last();
  await expect(result.locator('.gen-thumbs button')).toHaveCount(2);
  expect(sent[0].options).toMatchObject({ model: 'max', quality: 'fast', samples: 2, category: 'one-pieces', seed: expect.any(Number) });
  expect(sent[0].dressId).toEqual(expect.any(String));
  await result.locator('.gen-thumbs button').nth(1).click();
  await expect(result.locator('.gen-main')).toHaveAttribute('src', IMG_2);
  await expect(bride.locator('#composer-cost')).toContainText('còn 2/6');
  await expect(bride.getByRole('button', { name: '📅 Đặt lịch thử váy này' })).toBeVisible();

  // ---- Thử kiểu khác: cùng ảnh + váy, seed mới ----
  await bride.getByRole('button', { name: '🎲 Thử kiểu khác' }).click();
  await expect.poll(() => sent.length).toBe(2);
  expect(sent[1].dressId).toBe(sent[0].dressId);
  expect(sent[1].options.seed).not.toBe(sent[0].options.seed);
  await expect(bride.locator('#composer-cost')).toContainText('còn 0/6');
  await expect(bride.locator('#composer-cost')).toHaveClass(/short/);

  // ---- Hết credit: không gọi AI, báo rõ ----
  await bride.getByRole('button', { name: 'Gửi' }).click();
  await expect(bride.locator('.msg-row.ai').last()).toContainText('Bạn đã dùng hết 6 credit thử váy hôm nay');
  expect(sent).toHaveLength(2);
  await bride.context().close();
});

test('admin tắt Siêu nét: không còn lựa chọn đó, máy đã nhớ "Siêu nét" vẫn gửi Tiêu chuẩn', async ({ browser }) => {
  requireAccounts('bride');
  test.setTimeout(90_000);
  const bride = await openAs(browser, 'bride');
  await mockSettings(bride, { maxEnabled: false });
  const sent = [];
  await bride.route('**/functions/v1/thu-vay-ai', (route) => {
    sent.push(route.request().postDataJSON());
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ imageUrl: IMG_1, images: [IMG_1], remaining: 5, limit: 6 }) });
  });
  await bride.goto('/tryon.html');
  await bride.evaluate(() => localStorage.setItem('tramhy.tryon-chat-options', JSON.stringify({ model: 'max', samples: 1 })));
  await bride.reload();
  await expect(bride.locator('.msg-row.ai').last()).toBeVisible({ timeout: 30_000 });
  await pickPersonAndDress(bride);

  await expect(bride.locator('#settings-sum')).toHaveText('Tiêu chuẩn · 1 ảnh');
  await bride.locator('#open-settings').click();
  const sheet = bride.locator('dialog.sheet');
  await expect(sheet.getByRole('button', { name: '💎 Siêu nét' })).toHaveCount(0);
  await sheet.getByLabel(/Xóa kỹ đồ đang mặc/).check();
  await sheet.getByRole('button', { name: 'Đóng' }).click();
  await bride.getByRole('button', { name: 'Gửi' }).click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0].options).toMatchObject({ model: 'standard', quality: 'quality', cleanOriginal: true });
  await bride.context().close();
});

// Cần SQL 28 trên project test. Bật/tắt thật trong database test rồi trả về như cũ.
test('admin bật/tắt Siêu nét và đổi hạn mức credit', async ({ browser }) => {
  requireAccounts('admin');
  const admin = await openAs(browser, 'admin');
  await admin.goto('/admin.html');
  await admin.getByRole('button', { name: 'Thử váy AI' }).click();
  const form = admin.locator('#ai-settings');
  await expect(form).toBeVisible();
  await expect(form.getByRole('alert'), 'Chưa chạy SQL 28 trên database test').toHaveCount(0);
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

test('admin dùng không giới hạn credit và luôn có Siêu nét (kể cả khi đang tắt cho mọi người)', async ({ browser }) => {
  requireAccounts('admin');
  const admin = await openAs(browser, 'admin');
  await mockSettings(admin, { maxEnabled: false });
  await admin.goto('/tryon.html');
  await expect(admin.locator('.msg-row.ai').last()).toBeVisible({ timeout: 30_000 });
  await expect(admin.locator('#composer-cost')).toContainText('admin không giới hạn');
  await admin.locator('#open-settings').click();
  await expect(admin.locator('dialog.sheet').getByRole('button', { name: '💎 Siêu nét' })).toBeVisible();
  await admin.context().close();
});
