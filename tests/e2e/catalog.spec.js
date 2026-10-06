// Trang chủ, Dịch vụ cưới, Chi tiết đối tác – dữ liệu đọc thật từ Supabase
const { test, expect, trackErrors } = require('./helpers');

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

  // Giả lập Edge Function "tu-van-ngan-sach" để test không phụ thuộc Gemini (và không tốn lượt gọi)
  const mockBudgetAi = (page, body) => page.route('**/functions/v1/tu-van-ngan-sach', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }));

  test('AI tư vấn ngân sách: gửi số khách, ưu tiên và hiện lý do, mẹo', async ({ page }) => {
    let sent;
    await page.route('**/functions/v1/tu-van-ngan-sach', (route) => {
      sent = route.request().postDataJSON();
      route.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify({
          source: 'ai',
          allocations: [
            { category: 'venue', label: 'Nhà hàng tiệc', amount: 60_000_000, percent: 60, reason: 'Tiệc 20 bàn' },
            { category: 'other', label: 'Chi phí khác & dự phòng', amount: 40_000_000, percent: 40, reason: 'Nhẫn, thiệp' },
          ],
          tips: ['Đặt tiệc sớm để được giá tốt'],
          warning: '',
        }),
      });
    });
    await page.goto('/index.html');
    await page.locator('#budget-input').fill('100000000');
    await page.getByText('Nhờ AI tư vấn chi tiết').click();
    await page.locator('#ai-guests').fill('200');
    await page.getByRole('button', { name: 'Ảnh cưới đẹp' }).click();
    await page.getByRole('button', { name: 'AI tư vấn chia ngân sách' }).click();

    const result = page.locator('#budget-result');
    await expect(result).toContainText('Gợi ý bởi AI');
    await expect(result).toContainText('60.000.000đ');
    await expect(result).toContainText('Tiệc 20 bàn');
    await expect(result).toContainText('Đặt tiệc sớm để được giá tốt');
    expect(sent).toMatchObject({ total: 100_000_000, guests: 200, priorities: ['Ảnh cưới đẹp'] });
  });

  test('AI tư vấn ngân sách quá tải → tự dùng cách chia cố định', async ({ page }) => {
    await mockBudgetAi(page, { fallback: true, reason: 'busy' });
    await page.goto('/index.html');
    await page.locator('#budget-input').fill('100000000');
    await page.getByText('Nhờ AI tư vấn chi tiết').click();
    await page.getByRole('button', { name: 'AI tư vấn chia ngân sách' }).click();

    const result = page.locator('#budget-result');
    await expect(result).toContainText('AI đang quá tải');
    await expect(result).toContainText('50.000.000đ');   // vẫn có kết quả chia theo tỷ lệ
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

test.describe('Kiểm tra số tiền nhập', () => {
  test('chia ngân sách: tự thêm dấu chấm, chặn dưới 10 triệu và trên 10 tỷ', async ({ page }) => {
    await page.goto('/index.html');
    const input = page.locator('#budget-input');
    const error = page.locator('#budget-error');
    const submit = page.getByRole('button', { name: 'Chia ngân sách' });

    await input.fill('abc250000000xyz');                 // chữ bị bỏ, số được định dạng
    await expect(input).toHaveValue('250.000.000');
    await submit.click();
    await expect(page.locator('#budget-result')).toContainText('125.000.000đ');

    await input.fill('5000000');
    await submit.click();
    await expect(error).toHaveText('Số tiền tối thiểu là 10.000.000đ');
    await expect(page.locator('#budget-result')).toBeEmpty();      // không chia khi nhập sai

    await input.fill('20000000000');
    await expect(error).toHaveText('Số tiền tối đa là 10.000.000.000đ');
    await expect(page.locator('#budget-result')).toBeEmpty();

    await input.fill('');
    await submit.click();
    await expect(error).toHaveText('Vui lòng nhập số tiền');
  });

  test('dịch vụ cưới: tự nhập ngân sách tối đa, tối đa 10 tỷ', async ({ page }) => {
    await page.goto('/marketplace.html');
    await expect(page.locator('#vendor-grid article').first()).toBeVisible();
    await expect(page.locator('#max-custom-wrap')).toBeHidden();

    await page.locator('#max-price').selectOption('custom');
    const input = page.locator('#max-custom');
    await expect(input).toBeVisible();
    await input.fill('5000000');
    await expect(input).toHaveValue('5.000.000');
    const prices = await page.locator('#vendor-grid .price').allTextContents();
    expect(prices.length).toBeGreaterThan(0);
    for (const p of prices) expect(Number(p.replace(/\D/g, ''))).toBeLessThanOrEqual(5_000_000);

    await input.fill('99999999999');
    await expect(page.locator('#max-error')).toHaveText('Số tiền tối đa là 10.000.000.000đ');

    await page.locator('#max-price').selectOption('');       // về "Không giới hạn" thì ẩn ô và lỗi
    await expect(page.locator('#max-custom-wrap')).toBeHidden();
    await expect(page.locator('#max-error')).toBeHidden();
  });

  test('ngân sách từ trang chủ (?max=) không trùng mốc thì điền vào ô tự nhập', async ({ page }) => {
    await page.goto('/marketplace.html?category=studio&max=30000000');
    await expect(page.locator('#max-price')).toHaveValue('custom');
    await expect(page.locator('#max-custom')).toHaveValue('30.000.000');
  });
});
