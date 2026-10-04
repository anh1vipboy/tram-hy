// Trang chủ, Dịch vụ cưới, Chi tiết đối tác – dữ liệu đọc thật từ Supabase
const { test, expect } = require('@playwright/test');
const { trackErrors } = require('./helpers');

test.describe('Trang chủ', () => {
  test('hiện 4 mẫu váy nổi bật và đối tác uy tín', async ({ page }) => {
    const tracker = trackErrors(page);
    await page.goto('/index.html');
    await expect(page.locator('#featured-dresses article')).toHaveCount(4);
    await expect(page.locator('#top-vendors a').first()).toBeVisible();
    await tracker.expectNoErrors();
  });

  test('chia ngân sách cưới theo tỷ lệ', async ({ page }) => {
    await page.goto('/index.html');
    await page.locator('#budget-input').fill('100000000');
    await page.getByRole('button', { name: 'Chia ngân sách' }).click();
    const result = page.locator('#budget-result');
    await expect(result).toContainText('50.000.000đ');   // nhà hàng 50%
    await expect(result).toContainText('20.000.000đ');   // chụp ảnh 20%
  });
});

test.describe('Dịch vụ cưới', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/marketplace.html');
    await expect(page.locator('#vendor-grid article').first()).toBeVisible();
  });

  test('lọc theo loại dịch vụ', async ({ page }) => {
    await page.getByRole('button', { name: 'Chụp ảnh cưới' }).click();
    const categories = await page.locator('#vendor-grid article .badge-gold').allTextContents();
    expect(categories.length).toBeGreaterThan(0);
    expect(new Set(categories)).toEqual(new Set(['Chụp ảnh cưới']));
  });

  test('tìm theo tên và báo khi không có kết quả', async ({ page }) => {
    await page.locator('#search').fill('TuArt');
    await expect(page.locator('#vendor-grid article')).toHaveCount(1);
    await expect(page.locator('#vendor-grid h3')).toHaveText('TuArt Wedding');

    await page.locator('#search').fill('khong-co-tiem-nao-ten-nay');
    await expect(page.getByText('Không có đối tác phù hợp')).toBeVisible();
  });

  test('bấm Xem chi tiết mở đúng trang đối tác', async ({ page }) => {
    await page.locator('#search').fill('TuArt');
    await page.getByRole('link', { name: 'Xem chi tiết' }).click();
    await expect(page).toHaveURL(/vendor\.html\?slug=tuart/);
    await expect(page.getByRole('heading', { level: 1, name: 'TuArt Wedding' })).toBeVisible();
  });
});

test.describe('Chi tiết đối tác', () => {
  test('tiệm váy: hiện mẫu váy và mở trình xem ảnh', async ({ page }) => {
    const tracker = trackErrors(page);
    await page.goto('/vendor.html?slug=2h-studio');
    const firstDressPhoto = page.locator('[data-gallery]').first();
    await expect(firstDressPhoto).toBeVisible();

    await firstDressPhoto.click();
    const lightbox = page.locator('dialog.lightbox');
    await expect(lightbox).toBeVisible();
    await expect(lightbox.getByRole('link', { name: 'Thử váy này' })).toBeVisible();
    await lightbox.getByRole('button', { name: 'Đóng' }).click();
    await expect(lightbox).toHaveCount(0);
    await tracker.expectNoErrors();
  });

  test('dịch vụ: có bảng thanh toán 3 đợt và nút đặt lịch', async ({ page }) => {
    await page.goto('/vendor.html?slug=tuart');
    await expect(page.getByText('Đợt 1: Cọc giữ lịch (30%)')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Đặt lịch qua Trạm Hỷ' })).toBeVisible();
  });

  test('đường dẫn sai báo không tìm thấy', async ({ page }) => {
    await page.goto('/vendor.html?slug=khong-ton-tai');
    await expect(page.getByText('Không tìm thấy đối tác.')).toBeVisible();
  });
});
