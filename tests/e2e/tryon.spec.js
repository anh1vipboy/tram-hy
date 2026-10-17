// Phòng thử váy AI (dạng trò chuyện) + trang Thiết kế váy may đo – khi chưa đăng nhập
const { test, expect, trackErrors } = require('./helpers');

test.describe('Phòng thử váy AI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tryon.html');
    await expect(page.getByText('Mình là trợ lý thử váy của Trạm Hỷ.')).toBeVisible();
  });

  test('chọn người mẫu + váy có sẵn, gửi → mời đăng nhập và quay lại đúng mẫu', async ({ page }) => {
    const tracker = trackErrors(page);
    await page.locator('[data-slot="person"]').click();
    await page.locator('dialog.sheet [data-pick="sample:bride1"]').click();
    await expect(page.locator('dialog.sheet')).toHaveCount(0);
    await expect(page.locator('[data-slot="person"]')).toContainText('Dâu Mai');

    await page.locator('[data-slot="dress"]').click();
    const firstDress = page.locator('dialog.sheet .pick-grid.dresses .pick-main').first();
    const dressName = (await firstDress.locator('.pick-name').textContent()).trim();
    await firstDress.click();
    await expect(page.locator('[data-slot="dress"]')).toContainText(dressName);
    await expect(page).toHaveURL(/tryon\.html\?dress=/);

    await page.getByRole('button', { name: 'Gửi' }).click();
    const sent = page.locator('.msg-row.user').last();
    await expect(sent.locator('.msg-attachments figure')).toHaveCount(2);
    await expect(page.locator('.msg-row.ai').last()).toContainText('Bạn đăng nhập để mình ướm váy');
    const slug = new URL(page.url()).searchParams.get('dress');
    await page.getByRole('button', { name: '🔑 Đăng nhập' }).click();
    await expect(page).toHaveURL(new RegExp(`login\\.html\\?next=tryon\\.html%3Fdress%3D${slug}`));
    await tracker.expectNoErrors();
  });

  test('bấm gửi khi chưa chọn gì → nhắc chọn ảnh, không gửi tin', async ({ page }) => {
    await page.getByRole('button', { name: 'Gửi' }).click();
    await expect(page.locator('.toast', { hasText: 'Chọn ảnh của bạn trước nhé.' })).toBeVisible();
    await expect(page.locator('[data-slot="person"]')).toHaveClass(/nudge/);
    await expect(page.locator('.msg-row.user')).toHaveCount(0);
  });

  test('chưa đăng nhập: tải ảnh lên mời đăng nhập, người mẫu có sẵn vẫn chọn được', async ({ page }) => {
    await page.getByRole('button', { name: '📷 Chọn ảnh của bạn' }).click();
    const sheet = page.locator('dialog.sheet');
    await expect(sheet.getByRole('link', { name: /Đăng nhập để tải ảnh lên/ })).toHaveAttribute('href', /login\.html\?next=tryon\.html/);
    await expect(sheet.locator('[data-pick^="sample:"]')).toHaveCount(5);
    await expect(sheet.locator('[data-upload]')).toHaveCount(0);
    await sheet.getByRole('button', { name: 'Đóng' }).click();
    await expect(sheet).toHaveCount(0);
  });

  test('Tùy chỉnh: BMI theo chiều cao, cân nặng và gợi ý phom váy', async ({ page }) => {
    await page.locator('#open-settings').click();
    const bmi = page.locator('dialog.sheet #bmi');
    await expect(bmi).toContainText('BMI 19,1 · Cân đối');          // mặc định 160cm, 49kg
    await page.locator('dialog.sheet #weight').fill('70');
    await expect(bmi).toContainText('BMI 27,3 · Đầy đặn');
    await expect(bmi).toContainText('Phom chữ A');
    await expect(page.locator('dialog.sheet').getByText('Đăng nhập để lưu số đo cho lần sau.')).toBeVisible();
  });

  test('nút "Tự thiết kế váy" mở trang may đo', async ({ page }) => {
    await page.getByRole('link', { name: '✂️ Tự thiết kế váy' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Thiết kế váy may đo' })).toBeVisible();
  });
});

test.describe('Mở bằng đường dẫn ?dress=', () => {
  test('giới thiệu đúng mẫu, độ tôn dáng đổi theo dáng người', async ({ page }) => {
    await page.goto('/tryon.html?dress=korean-satin');
    const card = page.locator('.dress-card');
    await expect(card).toContainText('Váy Satin Lụa Trơn Hàn Quốc');
    const fit = card.locator('[data-fit]');
    await expect(fit).toContainText(/\d+%/);
    const before = await fit.textContent();
    await page.locator('#open-settings').click();
    await page.locator('dialog.sheet').getByRole('button', { name: 'Quả táo' }).click();
    await expect(fit).not.toHaveText(before);
  });

  test('đặt lịch từ thẻ mẫu khi chưa đăng nhập → đăng nhập rồi quay lại đúng mẫu', async ({ page }) => {
    await page.goto('/tryon.html?dress=korean-satin');
    await page.locator('.dress-card').getByRole('button', { name: '📅 Đặt lịch thử váy' }).click();
    await expect(page).toHaveURL(/login\.html\?next=tryon\.html%3Fdress%3Dkorean-satin/);
  });

  test('"Xem tất cả mẫu" ở trang chủ mở thẳng bảng chọn váy', async ({ page }) => {
    await page.goto('/tryon.html?chon-vay=1');
    await expect(page.locator('dialog.sheet h3')).toHaveText('Chọn váy cưới');
    await expect(page.locator('dialog.sheet .tab.active')).toHaveText('Mẫu của các tiệm');
  });
});

test.describe('Thiết kế váy may đo', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/thiet-ke-vay.html');
    await expect(page.locator('#summary strong').first()).toContainText('Váy may đo');
  });

  test('giá thay đổi theo lựa chọn', async ({ page }) => {
    const price = page.locator('#summary .price').first();
    const before = await price.textContent();
    await page.getByRole('button', { name: /Ren Chantilly Pháp/ }).click();
    await expect(price).not.toHaveText(before);
  });

  test('đổi phom và dáng người làm đổi ảnh minh họa và điểm tôn dáng', async ({ page }) => {
    await page.getByRole('button', { name: /^Đuôi cá/ }).click();
    await expect(page.locator('#mirror-label')).toHaveText('Minh họa: Đuôi cá');
    const hourglass = await page.locator('#fit-score').textContent();
    await page.getByRole('button', { name: 'Quả táo' }).click();
    await expect(page.locator('#fit-score')).not.toHaveText(hourglass);
  });

  test('đến từ Phòng thử ("Đặt may theo mẫu này") thì ghi chú sẵn', async ({ page }) => {
    await page.goto('/thiet-ke-vay.html?tu=anh-vay');
    await expect(page.locator('#bespoke-notes')).toHaveValue(/ảnh váy mẫu/);
  });

  test('đặt lịch khi chưa đăng nhập chuyển sang trang đăng nhập', async ({ page }) => {
    await page.locator('#book-btn').click();
    await expect(page).toHaveURL(/login\.html\?next=thiet-ke-vay\.html/);
  });
});
