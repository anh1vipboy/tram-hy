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
  await expect(page.locator('#mirror-label')).toContainText('Minh họa');
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

test('BMI tính theo chiều cao, cân nặng và đổi gợi ý phom váy', async ({ page }) => {
  const bmi = page.locator('#bmi');
  await expect(bmi).toContainText('BMI 19,1 · Cân đối');          // mặc định 160cm, 49kg
  await page.locator('#weight').fill('70');
  await expect(bmi).toContainText('BMI 27,3 · Đầy đặn');
  await expect(bmi).toContainText('Phom chữ A');
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

test('nút "Ướm thử bằng AI thật": chưa đăng nhập thì mời đăng nhập và quay lại đúng mẫu', async ({ page }) => {
  await page.goto('/tryon.html?dress=korean-satin');
  await expect(page.locator('#ai-hint')).toHaveText('Đăng nhập để ghép váy lên ảnh bằng AI thật');
  await page.getByRole('button', { name: '✨ Ướm thử bằng AI thật' }).click();
  await expect(page).toHaveURL(/login\.html\?next=tryon\.html%3Fdress%3Dkorean-satin/);
});

test('chưa đăng nhập: tải ảnh vẫn xem thử được, nhắc đăng nhập để lưu ảnh', async ({ page }) => {
  await expect(page.locator('#photo-note')).toHaveText('Đăng nhập để lưu ảnh và chọn lại ở lần sau.');
  await page.locator('#photo-input').setInputFiles(require('node:path')
    .resolve(__dirname, '../../frontend/assets/images/bride_model_2.jpg'));
  await expect(page.locator('#models [data-model="local"]')).toHaveClass(/active/);
  await expect(page.locator('#models [data-remove]')).toHaveCount(0);   // chưa lưu thì không có nút xóa
});

test('"Váy bạn chọn": tải ảnh váy mẫu, mời đăng nhập để AI ướm, đặt may chuyển sang may đo', async ({ page }) => {
  await page.getByRole('button', { name: '✨ Váy bạn chọn' }).click();
  await expect(page.locator('#ai-hint')).toHaveText('Đăng nhập để ghép váy lên ảnh bằng AI thật');
  await page.locator('#garment-input').setInputFiles(require('node:path')
    .resolve(__dirname, '../../frontend/assets/images/bride_3_tryon_satin.jpg'));
  await expect(page.locator('#garments .model.active')).toBeVisible();
  await expect(page.locator('#mirror-label')).toHaveText('Chưa ghép váy');
  await expect(page.locator('#fit-score')).toHaveText('–');

  await page.locator('#book-btn').click();                       // "Đặt may theo mẫu này"
  await expect(page.locator('#bespoke-panel')).toBeVisible();
  await expect(page.locator('#bespoke-notes')).toHaveValue(/ảnh váy mẫu/);
});

test('chế độ tự thiết kế may đo thì ẩn nút AI (chưa có ảnh váy thật để ghép)', async ({ page }) => {
  await page.getByRole('button', { name: 'Tự thiết kế may đo' }).click();
  await expect(page.locator('#ai-tryon-box')).toBeHidden();
});
