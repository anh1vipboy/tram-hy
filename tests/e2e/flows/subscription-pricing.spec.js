// @ts-check
const { test, expect, openAs } = require('../helpers');

test.describe('Gói cước AI Studio & Nâng cấp VietQR', () => {
  test('tự động hiện dialog quảng cáo gói cước khi tài khoản thường vào tryon', async ({ page }) => {
    await page.goto('/tryon.html');

    // Dialog quảng cáo tự động hiện lên cho khách / tài khoản thường
    const promo = page.locator('dialog.promo-dialog');
    await expect(promo).toBeVisible({ timeout: 6000 });
    await expect(promo.locator('.promo-title')).toHaveText(/Nâng Tầm Trải Nghiệm Thử Váy AI/);

    // Có thông tin tóm tắt 3 gói
    await expect(promo.locator('.promo-plan-item')).toHaveCount(3);
    await expect(promo.locator('.promo-plan-item.popular')).toContainText('Nàng Thơ Rạng Rỡ');

    // Bấm nút "Xem Bảng Giá & Nâng Cấp Ngay" chuyển sang modal bảng giá
    await promo.locator('[data-upgrade]').click();
    await expect(promo).not.toBeVisible();
    await expect(page.locator('.pricing-sheet')).toBeVisible();
  });

  test('mở modal bảng giá từ thanh composer bar và hiển thị đủ 3 gói', async ({ browser }) => {
    const bride = await openAs(browser, 'bride');
    await bride.goto('/tryon.html');

    // Đóng promo dialog nếu hiện ra
    const promo = bride.locator('dialog.promo-dialog');
    if (await promo.isVisible({ timeout: 1500 }).catch(() => false)) {
      await promo.locator('[data-skip]').click();
    }

    await expect(bride.locator('#composer-cost')).toBeVisible();

    // Nút Nâng cấp hiển thị cạnh composer-cost
    const upgradeBtn = bride.locator('#open-pricing');
    await expect(upgradeBtn).toBeVisible();
    await upgradeBtn.click();

    // Modal bảng giá xuất hiện
    const modal = bride.locator('.pricing-sheet');
    await expect(modal).toBeVisible();
    await expect(modal.locator('.pricing-title')).toHaveText(/Tỏa Sáng Trong Ngày Hỷ/);

    // Có đủ 3 gói: Khởi Điểm, Nàng Thơ Rạng Rỡ, Cẩm Tú Trọn Đôi
    await expect(modal.locator('.pricing-card')).toHaveCount(3);
    await expect(modal.locator('.card-name').nth(0)).toHaveText('Khởi Điểm');
    await expect(modal.locator('.card-name').nth(1)).toHaveText('Nàng Thơ Rạng Rỡ');
    await expect(modal.locator('.card-name').nth(2)).toHaveText('Cẩm Tú Trọn Đôi');

    // Thẻ Hero có badge nổi bật
    await expect(modal.locator('.hero-card .pricing-badge')).toBeVisible();
  });

  test('chọn gói Nàng Thơ Rạng Rỡ chuyển sang màn hình VietQR và kích hoạt thành công', async ({ browser }) => {
    const bride = await openAs(browser, 'bride');
    await bride.goto('/tryon.html');

    // Đóng promo dialog nếu hiện ra
    const promo = bride.locator('dialog.promo-dialog');
    if (await promo.isVisible({ timeout: 1500 }).catch(() => false)) {
      await promo.locator('[data-upgrade]').click();
    } else {
      await bride.locator('#open-pricing').click();
    }

    const modal = bride.locator('.pricing-sheet');
    await expect(modal).toBeVisible();

    // Bấm Nâng Cấp Ngay trên gói Nàng Thơ Rạng Rỡ
    const heroBtn = modal.locator('.hero-card [data-choose-plan="pro_bride"]');
    await heroBtn.click();

    // Màn hình VietQR hiển thị
    await expect(bride.locator('.qr-checkout-card')).toBeVisible();
    await expect(bride.locator('.qr-img')).toBeVisible();
    await expect(bride.locator('.highlight-price')).toContainText('149.000');
    await expect(bride.locator('.code-txt')).toBeVisible();

    // Bấm nút "Tôi đã chuyển khoản thành công"
    const confirmBtn = bride.locator('[data-confirm-paid]');
    await confirmBtn.click();

    // Màn hình thành công xuất hiện
    await expect(bride.locator('.pricing-success-view')).toBeVisible();
    await expect(bride.locator('.success-title')).toHaveText(/Nâng Cấp Thành Công/);

    // Bấm Trải Nghiệm Ngay đóng modal
    await bride.locator('[data-start-tryon]').click();
    await expect(modal).not.toBeVisible();

    // Composer bar cập nhật hiển thị gói Nàng Thơ và hạn mức mới
    await expect(bride.locator('#composer-cost')).toContainText('Nàng Thơ');
  });

  test('tấm Tùy chỉnh có thẻ gợi ý nâng cấp mở khóa Siêu Nét 1K', async ({ browser }) => {
    const bride = await openAs(browser, 'bride');
    await bride.goto('/tryon.html');

    const promo = bride.locator('dialog.promo-dialog');
    if (await promo.isVisible({ timeout: 1500 }).catch(() => false)) {
      await promo.locator('[data-skip]').click();
    }

    await bride.locator('#open-settings').click();

    const sheet = bride.locator('.settings-sheet');
    await expect(sheet).toBeVisible();

    // Nếu Siêu nét chưa bật, có thẻ mời nâng cấp
    const upgradeCard = sheet.locator('.opt-upgrade-card');
    if (await upgradeCard.isVisible()) {
      await upgradeCard.locator('[data-open-pricing]').click();
      await expect(bride.locator('.pricing-sheet')).toBeVisible();
    }
  });

  test('quản trị viên mở tab "Đơn gói AI", xem bảng đơn hàng và KPI doanh thu', async ({ browser }) => {
    const admin = await openAs(browser, 'admin');
    await admin.goto('/admin.html');

    const tab = admin.locator('[data-tab="ai-orders"]');
    await expect(tab).toBeVisible();
    await tab.click();

    const section = admin.locator('#tab-ai-orders');
    await expect(section).toBeVisible();

    // Có bảng danh sách đơn gói AI hoặc empty state
    await expect(section.locator('table.finance-table, .empty')).toBeVisible();

    // Có nút tải Excel đơn gói AI
    await expect(section.locator('[data-export-ai-excel]')).toBeVisible();

    // Có các bộ lọc chips
    await expect(section.locator('[data-aifilter]')).toHaveCount(3);
  });

  test('quản trị viên lọc đơn theo loại dịch vụ cưới trong tab "Tất cả đơn"', async ({ browser }) => {
    const admin = await openAs(browser, 'admin');
    await admin.goto('/admin.html');

    const tab = admin.locator('[data-tab="bookings"]');
    await tab.click();

    const section = admin.locator('#tab-bookings');
    await expect(section).toBeVisible();

    const categorySelect = section.locator('[data-category-filter]');
    await expect(categorySelect).toBeVisible();

    // Có option "Tất cả dịch vụ"
    await expect(categorySelect.locator('option[value="all"]')).toContainText('Tất cả dịch vụ');

    // Có các dịch vụ từ VENDOR_CATEGORY
    await expect(categorySelect.locator('option[value="bridal"]')).toHaveCount(1);
    await expect(categorySelect.locator('option[value="studio"]')).toHaveCount(1);

    // Chọn lọc theo dịch vụ Váy cưới
    await categorySelect.selectOption('bridal');
    await expect(categorySelect).toHaveValue('bridal');

    // Bảng cập nhật mượt mà
    await expect(section.locator('table.finance-table, .empty')).toBeVisible();
  });
});
