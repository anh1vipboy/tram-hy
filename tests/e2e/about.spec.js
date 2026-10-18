// Trang Giới thiệu: số liệu đếm thật từ database, thẻ tính năng dẫn đúng trang, câu hỏi thường gặp, link ở footer
const { test, expect } = require('./helpers');

test.beforeEach(async ({ page }) => {
  await page.goto('/gioi-thieu.html');
});

test('số liệu lấy thật từ database', async ({ page }) => {
  await expect(page.locator('[data-stat="vendors"]')).toHaveText(/^\d[\d.]*$/);
  await expect(page.locator('[data-stat="dresses"]')).toHaveText(/^\d[\d.]*$/);
  await expect(page.locator('[data-stat="categories"]')).toHaveText('8');   // 5 loại cũ + tráp ăn hỏi, MC & âm nhạc, xe hoa
});

test('thẻ tính năng dẫn tới đúng trang', async ({ page }) => {
  const features = page.locator('.about-features a.card');
  await expect(features).toHaveCount(6);
  await expect(features.filter({ hasText: 'Phòng thử váy AI' })).toHaveAttribute('href', 'tryon.html');
  await expect(features.filter({ hasText: 'Thiết kế váy may đo' })).toHaveAttribute('href', 'thiet-ke-vay.html');
  await features.filter({ hasText: 'Đặt lịch & giữ cọc an toàn' }).click();
  await expect(page).toHaveURL(/#giu-coc$/);
  await expect(page.locator('#giu-coc .escrow-step')).toHaveCount(3);
});

test('câu hỏi thường gặp mở ra xem được câu trả lời', async ({ page }) => {
  const faq = page.locator('.faq details', { hasText: 'Dùng Trạm Hỷ có mất phí không?' });
  await expect(faq.locator('p')).toBeHidden();
  await faq.locator('summary').click();
  await expect(faq.locator('p')).toContainText('phí nền tảng do đối tác trả');
});

test('trang chủ và footer có link tới trang Giới thiệu', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#app-footer').getByRole('link', { name: 'Giới thiệu Trạm Hỷ' })).toHaveAttribute('href', 'gioi-thieu.html');
  await page.getByRole('link', { name: 'Tìm hiểu về Trạm Hỷ →' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Kết duyên cát hỷ, trọn vẹn niềm tin' })).toBeVisible();
});
