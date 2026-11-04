const { test, expect, trackErrors, expectNoHorizontalOverflow } = require('./helpers');

test.describe('Giỏ hàng cưới & Nút đặt trực tiếp trên thẻ', () => {
  test('Header: có nút Giỏ hàng cạnh chuông thông báo, mở được ngăn kéo giỏ hàng', async ({ page }) => {
    const tracker = trackErrors(page);
    await page.goto('/marketplace.html');

    const cartBtn = page.locator('#app-header [data-cart]');
    await expect(cartBtn).toBeVisible();

    const notifBtn = page.locator('#app-header [data-notif]');
    if (await notifBtn.count() > 0) {
      await expect(notifBtn).toBeVisible();
    }

    // Bấm mở giỏ hàng
    await cartBtn.click();
    const cartPanel = page.locator('#cart-panel');
    await expect(cartPanel).toBeVisible();
    await expect(cartPanel.locator('.cart-head strong')).toContainText('Giỏ hàng cưới');

    // Bấm đóng giỏ hàng
    await page.locator('#cart-panel [data-cart-close]').click();
    await expect(cartPanel).toBeHidden();

    await expectNoHorizontalOverflow(page);
    await tracker.expectNoErrors();
  });

  test('Thẻ váy cưới: có nút nổi Thử váy AI trên ảnh, nút Đặt thuê ngay trực tiếp và nút 🛒 thêm giỏ', async ({ page }) => {
    const tracker = trackErrors(page);
    await page.goto('/marketplace.html?view=dresses');

    const firstCard = page.locator('#vendor-grid .item-card').first();
    await expect(firstCard).toBeVisible();

    // Nút nổi ✨ Thử váy AI trên ảnh (chuẩn Sephora)
    const floatPill = firstCard.locator('.tryon-float-pill');
    await expect(floatPill).toBeVisible();
    await expect(floatPill).toContainText('Thử váy AI');

    // Chân thẻ có nút chính Đặt thuê/may ngay và nút giỏ hàng
    const bookBtn = firstCard.locator('.card-primary-cta');
    await expect(bookBtn).toBeVisible();

    const cartBtn = firstCard.locator('.btn-cart-icon');
    await expect(cartBtn).toBeVisible();

    // Bấm thêm vào giỏ hàng
    await cartBtn.click();
    await expect(cartBtn).toHaveClass(/active/);

    // Header badge nhảy lên 1
    const badge = page.locator('#app-header .cart-badge');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText('1');

    // Mở giỏ hàng kiểm tra có món vừa thêm
    await page.locator('#app-header [data-cart]').click();
    const cartPanel = page.locator('#cart-panel');
    await expect(cartPanel).toBeVisible();
    await expect(cartPanel.locator('.cart-item')).toHaveCount(1);

    // Bấm đóng giỏ hàng
    await page.locator('#cart-panel [data-cart-close]').click();

    // Bấm nút Đặt thuê ngay trên thẻ -> chưa đăng nhập sẽ chuyển hướng tới login.html
    await Promise.all([
      page.waitForURL(/login\.html/, { timeout: 15_000 }).catch(() => {}),
      bookBtn.click(),
    ]);
    const isLogin = page.url().includes('login.html');
    const hasDialog = await page.locator('dialog.modal').count() > 0;
    expect(isLogin || hasDialog).toBeTruthy();

    await tracker.expectNoErrors();
  });

  test('Trang đối tác: thẻ váy có nút Đặt thuê ngay và nút 🛒', async ({ page }) => {
    const tracker = trackErrors(page);
    await page.goto('/vendor.html?slug=tuart');

    // Nếu tiệm có mẫu váy
    const dressCards = page.locator('#dresses .item-card');
    if (await dressCards.count() > 0) {
      const firstDress = dressCards.first();
      await expect(firstDress.locator('.tryon-float-pill')).toBeVisible();
      await expect(firstDress.locator('.card-primary-cta')).toBeVisible();
      await expect(firstDress.locator('.btn-cart-icon')).toBeVisible();
    }

    await expectNoHorizontalOverflow(page);
    await tracker.expectNoErrors();
  });
});
