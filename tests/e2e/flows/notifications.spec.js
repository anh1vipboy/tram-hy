// Chuông thông báo (SQL 18): database tự tạo thông báo, chuông nhảy số realtime, bấm để đi đúng chỗ.
const { test, expect, openAs, requireAccounts } = require('../helpers');
const { bookFromTryon, vendorCard } = require('./flow-helpers');

const badgeCount = async (bell) => {
  const badge = bell.locator('.notif-badge');
  return (await badge.isHidden()) ? 0 : Number((await badge.textContent()).replace('+', ''));
};

test('cô dâu đặt lịch → chuông đối tác nhảy số ngay → bấm thông báo tới đúng đơn → tiệm từ chối → cô dâu được báo', async ({ browser }) => {
  requireAccounts('bride', 'vendor');
  test.setTimeout(90_000);
  const vendor = await openAs(browser, 'vendor');
  await vendor.goto('/vendor-dashboard.html');
  const bell = vendor.locator('.site-header [data-notif]');
  await expect(bell, 'Chưa chạy SQL 18 trên database test?').toBeVisible({ timeout: 20_000 });
  await vendor.waitForTimeout(1500);                       // chờ chuông tải số chưa đọc ban đầu
  const before = await badgeCount(bell);

  // ---- Cô dâu đặt lịch → đối tác thấy ngay (không tải lại trang) ----
  const bride = await openAs(browser, 'bride');
  const { code } = await bookFromTryon(bride);
  await expect(vendor.locator('.toast', { hasText: `Đơn đặt lịch mới ${code}` })).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => badgeCount(bell)).toBe(before + 1);
  await expect(vendor).toHaveTitle(/^\(\d+\+?\) /);         // số chưa đọc trên tiêu đề tab

  // ---- Mở chuông → thông báo mới nhất ở đầu, chưa đọc → bấm → tới đúng đơn trên Kanban ----
  await bell.click();
  const panel = vendor.locator('#notif-panel');
  const item = panel.locator('.notif-item').first();
  await expect(item).toContainText(`Đơn đặt lịch mới ${code}`);
  await expect(item).toHaveClass(/unread/);
  await item.click();
  await expect(vendor).toHaveURL(new RegExp(`vendor-dashboard\\.html\\?focus=${code}`));
  await expect(vendor.locator(`.kanban-card[data-code="${code}"]`)).toHaveClass(/flash/);
  await expect.poll(() => badgeCount(vendor.locator('.site-header [data-notif]'))).toBe(before);   // đã đọc

  // ---- Đối tác từ chối đơn → chuông cô dâu báo ----
  const card = await vendorCard(vendor, code);
  await card.getByRole('button', { name: 'Từ chối' }).click();
  await vendor.locator('dialog.modal').getByRole('button', { name: 'Từ chối' }).click();
  await expect(bride.locator('.toast', { hasText: `đã hủy đơn ${code}` })).toBeVisible({ timeout: 15_000 });
  await bride.locator('.site-header [data-notif]').click();
  await expect(bride.locator('#notif-panel .notif-item').first()).toContainText('Đơn chưa đặt cọc nên bạn không mất tiền');

  // ---- Đánh dấu đã đọc tất cả ----
  await bride.locator('#notif-panel').getByRole('button', { name: 'Đánh dấu đã đọc tất cả' }).click();
  await expect(bride.locator('#notif-panel .notif-item.unread')).toHaveCount(0);
  await expect(bride.locator('.site-header .notif-badge')).toBeHidden();
});

test('điện thoại: thông báo mở thành tấm trượt từ dưới lên, có nút đóng', async ({ browser }) => {
  requireAccounts('bride');
  const bride = await openAs(browser, 'bride');
  await bride.setViewportSize({ width: 390, height: 844 });
  await bride.goto('/index.html');
  const bell = bride.locator('.site-header [data-notif]');
  await expect(bell).toBeVisible({ timeout: 20_000 });
  await bell.click();
  const panel = bride.locator('#notif-panel');
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  expect(Math.round(box.y + box.height)).toBeGreaterThanOrEqual(840);   // dính đáy màn hình
  await panel.getByRole('button', { name: 'Đóng' }).click();
  await expect(panel).toBeHidden();
});
