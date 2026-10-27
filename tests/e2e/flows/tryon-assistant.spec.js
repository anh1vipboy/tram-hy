// Trợ lý chat ở Phòng thử: hỏi tư vấn → trả lời + gợi ý mẫu đúng kiểu → chọn mẫu gợi ý → nhắn "ướm váy này…"
// → trợ lý hiểu là ướm + ghi chú cách mặc (Siêu nét) → AI ướm, tin nhắn được lưu kèm.
// Cả 2 Edge Function (tro-ly-thu-vay, thu-vay-ai) và cài đặt admin được giả lập – không tốn credit.
const { test, expect, openAs, requireAccounts } = require('../helpers');

const IMG = '/assets/images/bride_model_1.png';

// Kiểu váy (theme) của một mẫu có ảnh thật trong database test → trợ lý giả lập gợi ý đúng kiểu đó
async function themeWithPhoto() {
  const res = await fetch(`${process.env.TEST_SUPABASE_URL}/rest/v1/dresses?select=theme&is_active=eq.true&image_url=not.is.null&limit=1`, {
    headers: { apikey: process.env.TEST_SUPABASE_KEY },
  });
  const [row] = await res.json();
  return row?.theme;
}

test('hỏi tư vấn → gợi ý mẫu → nhắn ướm kèm ghi chú cách mặc', async ({ browser }) => {
  requireAccounts('bride');
  test.setTimeout(90_000);
  const theme = await themeWithPhoto();
  test.skip(!theme, 'Database test chưa có mẫu váy nào có ảnh thật');

  const bride = await openAs(browser, 'bride');
  await bride.route('**/rest/v1/app_settings*', (route) => {
    const row = { value: { max_enabled: true, daily_credits: 6 } };
    const single = (route.request().headers().accept ?? '').includes('vnd.pgrst.object');
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(single ? row : [row]) });
  });
  const asked = [];
  const replies = [
    { reply: 'Dáng của bạn hợp kiểu váy này – mình gợi ý vài mẫu ngay bên dưới nhé.', action: 'chat', prompt: '', samples: 0, theme },
    { reply: 'Mình sẽ ướm chiếc váy lên ảnh, tà váy dài chạm đất nhé!', action: 'tryon', prompt: 'floor-length hem', samples: 0, theme: '' },
  ];
  await bride.route('**/functions/v1/tro-ly-thu-vay', (route) => {
    asked.push(route.request().postDataJSON());
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...replies[asked.length - 1], remaining: 39 }) });
  });
  let tried;
  await bride.route('**/functions/v1/thu-vay-ai', (route) => {
    tried = route.request().postDataJSON();
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ imageUrl: IMG, images: [IMG], remaining: 4, limit: 6 }) });
  });

  await bride.goto('/tryon.html');
  await expect(bride.locator('.msg-row.ai').last()).toBeVisible({ timeout: 30_000 });

  // ---- Câu hỏi gợi ý ở lời chào → trợ lý trả lời + mẫu đúng kiểu ----
  await bride.getByRole('button', { name: '💡 Váy nào hợp dáng mình?' }).click();
  await expect(bride.getByText('mình gợi ý vài mẫu ngay bên dưới')).toBeVisible();
  expect(asked[0]).toMatchObject({ message: 'Váy cưới kiểu nào hợp với dáng của mình?', hasPerson: false, garment: null, model: 'max' });
  expect(asked[0].body).toMatchObject({ height: expect.any(Number), shape: expect.any(String) });
  const suggestion = bride.locator('.suggest-dresses .mini-dress').first();
  const name = (await suggestion.locator('.mini-name').textContent()).trim();
  await suggestion.click();
  await expect(bride.locator('[data-slot="dress"]')).toContainText(name);

  // ---- Chọn người mẫu, nhắn kèm ghi chú → ướm với prompt tiếng Anh ----
  await bride.locator('[data-slot="person"]').click();
  await bride.locator('dialog.sheet [data-pick="sample:bride3"]').click();
  await bride.locator('#composer-text').fill('Ướm váy này cho mình, tà váy dài chạm đất');
  await bride.locator('#composer-text').press('Enter');
  await expect(bride.locator('.msg-bubble').last()).toHaveText('Ướm váy này cho mình, tà váy dài chạm đất');
  await expect(bride.locator('#composer-text')).toHaveValue('');
  await expect(bride.getByText('tà váy dài chạm đất nhé!')).toBeVisible();
  await expect(bride.locator('.gen:not(.gen-pending) .gen-main').last()).toHaveAttribute('src', IMG);

  expect(asked[1]).toMatchObject({ hasPerson: true, garment: { kind: 'dress', name } });
  expect(asked[1].history.map((m) => m.role)).toEqual(['user', 'ai']);          // nhớ đoạn chat trước
  expect(tried).toMatchObject({ sampleModel: 'bride3', prompt: 'floor-length hem', message: 'Ướm váy này cho mình, tà váy dài chạm đất' });
  expect(tried.options.model).toBe('max');
  await bride.context().close();
});

test('trợ lý lỗi mạng mà đã đủ ảnh + váy → vẫn ướm được', async ({ browser }) => {
  requireAccounts('bride');
  const bride = await openAs(browser, 'bride');
  await bride.route('**/functions/v1/tro-ly-thu-vay', (route) => route.abort());
  let tried;
  await bride.route('**/functions/v1/thu-vay-ai', (route) => {
    tried = route.request().postDataJSON();
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ imageUrl: IMG, images: [IMG], remaining: 4, limit: 6 }) });
  });
  await bride.goto('/tryon.html');
  await expect(bride.locator('.msg-row.ai').last()).toBeVisible({ timeout: 30_000 });
  await bride.locator('[data-slot="person"]').click();
  await bride.locator('dialog.sheet [data-pick="sample:bride1"]').click();
  await bride.locator('[data-slot="dress"]').click();
  await bride.locator('dialog.sheet .pick-grid.dresses .pick-main').first().click();
  await bride.locator('#composer-text').fill('thử váy này giúp mình');
  await bride.getByRole('button', { name: 'Gửi' }).click();
  await expect(bride.locator('.gen:not(.gen-pending) .gen-main').last()).toHaveAttribute('src', IMG);
  expect(tried).toMatchObject({ prompt: '', message: 'thử váy này giúp mình' });
  await bride.context().close();
});

test('đang chat với AI có thể bấm nút dừng (⏹) để ngắt và dùng lại câu chat đó; nút "Dùng lại" nạp lại tin cũ', async ({ browser }) => {
  requireAccounts('bride');
  const bride = await openAs(browser, 'bride');
  
  // Trợ lý phản hồi chậm 3 giây để người dùng kịp bấm Dừng
  await bride.route('**/functions/v1/tro-ly-thu-vay', async (route) => {
    await new Promise((r) => setTimeout(r, 2000));
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ reply: 'Câu trả lời xong rồi', action: 'chat', prompt: '', samples: 0, theme: '' }),
    });
  });

  await bride.goto('/tryon.html');
  await expect(bride.locator('.msg-row.ai').last()).toBeVisible({ timeout: 30_000 });

  const input = bride.locator('#composer-text');
  const sendBtn = bride.locator('#send-btn');

  // 1. Nhập câu hỏi và gửi
  const promptText = 'Tư vấn cho mình váy che bắp tay to với';
  await input.fill(promptText);
  await sendBtn.click();

  // 2. Trong khi đang xử lý (busy): nút đổi sang class 'is-stop' và có aria-label 'Dừng lại'
  await expect(sendBtn).toHaveClass(/is-stop/);
  await expect(sendBtn).toHaveAttribute('aria-label', /Dừng lại/);

  // 3. Người dùng bấm Dừng (⏹)
  await sendBtn.click();

  // 4. Kiểm tra: nút trở về trạng thái gửi bình thường, câu chat cũ được nạp lại vào ô nhập
  await expect(sendBtn).not.toHaveClass(/is-stop/);
  await expect(input).toHaveValue(promptText);
  await expect(bride.locator('#chat-thread')).toContainText('Đã dừng theo yêu cầu');

  // 5. Thử nút "Dùng lại" trên bóng chat người dùng
  await input.fill('Một câu khác');
  const reuseBtn = bride.locator('.btn-reuse-msg').first();
  await expect(reuseBtn).toBeVisible();
  await reuseBtn.click();
  await expect(input).toHaveValue(promptText);

  await bride.context().close();
});
