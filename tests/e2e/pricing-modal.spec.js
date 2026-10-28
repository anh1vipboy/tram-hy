// Kiểm thử giao diện Popup Gói Cước AI Thử Váy Cưới (Desktop & Mobile)
const { test, expect, trackErrors, expectNoHorizontalOverflow } = require('./helpers');

test.describe('Popup Gói Cước AI Thử Váy Cưới', () => {
  test('Desktop: hiển thị trọn vẹn 3 gói, không scrollbar ở 800px chiều cao, huy hiệu không bị cắt', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const tracker = trackErrors(page);

    await page.goto('/tryon.html');
    await expect(page.locator('#open-pricing')).toBeVisible();

    // Mở popup bảng giá
    await page.locator('#open-pricing').click();
    const sheet = page.locator('dialog.sheet.pricing-sheet');
    await expect(sheet).toBeVisible();

    // 1. Kiểm tra tiêu đề modal
    await expect(sheet.locator('.sheet-head h3')).toHaveText('Gói Cước AI Thử Váy Cưới');

    // 2. Kiểm tra pricing-header đã tinh gọn, không còn h2 trùng lặp
    await expect(sheet.locator('.pricing-header h2')).toHaveCount(0);
    const subtitle = sheet.locator('.pricing-subtitle');
    await expect(subtitle).toBeVisible();
    await expect(subtitle).toContainText('60 – 150 credit/ngày');

    // 3. Kiểm tra 3 gói cước
    const cards = sheet.locator('.pricing-card');
    await expect(cards).toHaveCount(3);
    await expect(cards.nth(0).locator('.card-name')).toHaveText('Khởi Điểm');
    await expect(cards.nth(1).locator('.card-name')).toHaveText('Nàng Thơ Rạng Rỡ');
    await expect(cards.nth(2).locator('.card-name')).toHaveText('Cẩm Tú Trọn Đôi');

    // 4. Huy hiệu ngôi sao vàng trên thẻ hero "Nàng Thơ Rạng Rỡ"
    const heroCard = sheet.locator('.pricing-card.hero-card');
    await expect(heroCard).toBeVisible();
    const badge = heroCard.locator('.pricing-badge');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText('⭐ Được 89% Cô dâu chọn');

    // Kiểm tra huy hiệu không bị cắt cụt (bounding box nằm trong vùng hiển thị của sheet)
    const badgeBox = await badge.boundingBox();
    const sheetHeadBox = await sheet.locator('.sheet-head').boundingBox();
    const sheetBodyBox = await sheet.locator('.sheet-body').boundingBox();

    expect(badgeBox).not.toBeNull();
    // Huy hiệu phải nằm bên dưới đáy của sheet-head (không bị che bởi header)
    expect(badgeBox.y).toBeGreaterThanOrEqual(sheetHeadBox.y + sheetHeadBox.height - 2);

    // 5. Kiểm tra chiều cao modal hiển thị trọn vẹn, không sinh thanh cuộn dọc trên desktop 800px
    const scrollInfo = await sheet.locator('.sheet-body').evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    // Cho phép dung sai tối đa 2px do subpixel rendering
    expect(scrollInfo.scrollHeight - scrollInfo.clientHeight).toBeLessThanOrEqual(2);

    // 6. Kiểm tra trust bar ở đáy
    const trust = sheet.locator('.pricing-trust');
    await expect(trust).toBeVisible();
    await expect(trust).toContainText('VietQR');

    // Chụp ảnh desktop để xác nhận
    await page.screenshot({ path: 'test-results/pricing-modal-desktop.png', fullPage: false });

    await tracker.expectNoErrors();
  });

  test('Mobile (390px): xếp dọc mượt mà, thẻ nổi bật đưa lên đầu, nút >= 44px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const tracker = trackErrors(page);

    await page.goto('/tryon.html');
    await expect(page.locator('#open-pricing')).toBeVisible();

    await page.locator('#open-pricing').click();
    const sheet = page.locator('dialog.sheet.pricing-sheet');
    await expect(sheet).toBeVisible();

    // Không tràn ngang
    await expectNoHorizontalOverflow(page);

    // Thẻ Nàng Thơ Rạng Rỡ có order: -1
    const heroOrder = await sheet.locator('.pricing-card.hero-card').evaluate((el) => window.getComputedStyle(el).order);
    expect(Number(heroOrder)).toBe(-1);

    // Vùng chạm nút bấm trên mobile >= 44px
    const btns = sheet.locator('.card-btn');
    const count = await btns.count();
    for (let i = 0; i < count; i++) {
      const box = await btns.nth(i).boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
    }

    // Chụp ảnh mobile để xác nhận
    await page.screenshot({ path: 'test-results/pricing-modal-mobile.png', fullPage: false });

    await tracker.expectNoErrors();
  });
});
