// Mọi trang công khai mở được, không lỗi, không tràn màn hình; trang cần đăng nhập thì chuyển sang Đăng nhập
const { test, expect, trackErrors, expectNoHorizontalOverflow } = require('./helpers');

const PUBLIC_PAGES = [
  { path: '/index.html', heading: /Thử váy cưới trên chính dáng/ },
  { path: '/tryon.html', heading: 'Xem váy lên dáng của bạn' },
  { path: '/marketplace.html', heading: 'Đối tác được Trạm Hỷ bảo chứng' },
  { path: '/vendor.html?slug=tuart', heading: 'TuArt Wedding' },
  { path: '/login.html', heading: 'Chào mừng đến Trạm Hỷ' },
];

for (const { path, heading } of PUBLIC_PAGES) {
  test(`mở được ${path}`, async ({ page }) => {
    const tracker = trackErrors(page);
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expect(page.locator('.site-header .brand')).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expectNoHorizontalOverflow(page);
    await tracker.expectNoErrors();
  });
}

const PROTECTED_PAGES = ['/bookings.html', '/vendor-dashboard.html', '/admin.html', '/invitation.html'];

for (const path of PROTECTED_PAGES) {
  test(`${path} yêu cầu đăng nhập`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`login\\.html\\?next=${path.slice(1).replace('.', '\\.')}`));
  });
}

test('khách mời mở link thiệp không tồn tại', async ({ page }) => {
  await page.goto('/invitation.html?i=khong-co-thiep-nay');
  await expect(page.getByText('Thiệp không tồn tại hoặc đã bị xóa.')).toBeVisible();
});
