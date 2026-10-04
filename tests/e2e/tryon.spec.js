// Phòng thử váy khi chưa đăng nhập
const { test, expect, trackErrors } = require('./helpers');

test.beforeEach(async ({ page }) => {
  await page.goto('/tryon.html');
  await expect(page.locator('#dress-list .dress-option').first()).toBeVisible();
});

test('chọn mẫu váy: gương đổi ảnh, tóm tắt và đường dẫn cập nhật', async ({ page }) => {
  const tracker = trackErrors(page);
  const option = page.locator('#dress-list .dress-option').nth(1);
  const dressName = (await option.locator('.name').textContent()).trim();

  await option.click();
  await expect(page.locator('#summary strong').first()).toHaveText(dressName);
  await expect(page).toHaveURL(/tryon\.html\?dress=/);
  await expect(page.locator('#mirror-label')).toContainText('Đã thử');
  await expect(page.locator('#fit-score')).toHaveText(/\d+%/);
  await tracker.expectNoErrors();
});

test('mở thẳng bằng đường dẫn ?dress= chọn đúng mẫu', async ({ page }) => {
  await page.goto('/tryon.html?dress=korean-satin');
  await expect(page.locator('#summary strong').first()).toHaveText('Váy Satin Lụa Trơn Hàn Quốc');
});

test('đổi dáng người làm đổi điểm tôn dáng', async ({ page }) => {
  await page.goto('/tryon.html?dress=royal-mermaid');   // váy đuôi cá: đồng hồ cát hợp hơn quả táo
  await expect(page.locator('#fit-score')).toHaveText(/\d+%/);
  const hourglass = await page.locator('#fit-score').textContent();
  await page.getByRole('button', { name: 'Quả táo' }).click();
  await expect(page.locator('#fit-score')).not.toHaveText(hourglass);
});

test('tự thiết kế may đo: giá thay đổi theo lựa chọn', async ({ page }) => {
  await page.getByRole('button', { name: 'Tự thiết kế may đo' }).click();
  await expect(page.locator('#summary strong').first()).toContainText('Váy may đo');
  const price = page.locator('#summary .price').first();
  const before = await price.textContent();
  await page.getByRole('button', { name: /Ren Chantilly Pháp/ }).click();
  await expect(price).not.toHaveText(before);
});

test('đặt lịch khi chưa đăng nhập chuyển sang trang đăng nhập rồi quay lại đúng mẫu', async ({ page }) => {
  await page.goto('/tryon.html?dress=korean-satin');
  await page.locator('#book-btn').click();
  await expect(page).toHaveURL(/login\.html\?next=tryon\.html%3Fdress%3Dkorean-satin/);
});
