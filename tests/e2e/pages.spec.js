// Mọi trang công khai mở được, không lỗi, không tràn màn hình; trang cần đăng nhập thì chuyển sang Đăng nhập
const { test, expect, trackErrors, expectNoHorizontalOverflow } = require('./helpers');

const PUBLIC_PAGES = [
  { path: '/index.html', heading: /Thử váy cưới trên chính dáng/ },
  { path: '/tryon.html', heading: 'Phòng thử váy AI' },
  { path: '/thiet-ke-vay.html', heading: 'Thiết kế váy may đo' },
  { path: '/gioi-thieu.html', heading: 'Kết duyên cát hỷ, trọn vẹn niềm tin' },
  { path: '/marketplace.html', heading: /Đối tác.*bảo chứng/ },
  { path: '/vendor.html?slug=tuart', heading: 'TuArt Wedding' },
  { path: '/login.html', heading: 'Chào mừng trở lại' },
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

const PROTECTED_PAGES = ['/bookings.html', '/vendor-dashboard.html', '/admin.html'];

for (const path of PROTECTED_PAGES) {
  test(`${path} yêu cầu đăng nhập`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`login\\.html\\?next=${path.slice(1).replace('.', '\\.')}`));
  });
}

test('chưa đăng nhập: trang Thiệp cưới là thư viện mẫu, Dùng mẫu này dẫn tới đăng nhập', async ({ page }) => {
  await page.goto('/invitation.html');
  await expect(page.locator('.tpl-card')).toHaveCount(6);
  await expect(page.locator('.tpl-card').first().getByRole('link', { name: 'Dùng mẫu này' }))
    .toHaveAttribute('href', /login\.html\?next=invitation\.html%3Ftemplate%3Dla-tim/);
  await page.locator('.tpl-card').nth(2).getByRole('button', { name: 'Xem thiệp' }).click();
  await expect(page.locator('dialog.modal .inv-page')).toHaveCount(3);
});

test('khách mời mở link thiệp không tồn tại', async ({ page }) => {
  await page.goto('/invitation.html?i=khong-co-thiep-nay');
  await expect(page.getByText('Thiệp không tồn tại hoặc đã bị xóa.')).toBeVisible();
});

test('điện thoại: thanh tab dưới đáy thay cho menu kéo ngang', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Chỉ kiểm tra trên điện thoại');
  await page.goto('/marketplace.html');
  await expect(page.locator('.site-header .nav')).toBeHidden();
  const tabbar = page.locator('#app-tabbar');
  await expect(tabbar).toBeVisible();
  await expect(tabbar.getByRole('link', { name: /Dịch vụ/ })).toHaveClass(/active/);
  await tabbar.getByRole('link', { name: /Thử váy/ }).click();
  await expect(page).toHaveURL(/tryon\.html/);
  await expect(tabbar.getByRole('link', { name: /Đăng nhập/ })).toBeVisible();   // chưa đăng nhập
});
