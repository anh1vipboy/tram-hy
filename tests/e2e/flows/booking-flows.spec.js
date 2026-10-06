// Các nhánh còn lại của luồng đặt lịch + Escrow (nhánh hoàn tiền nằm ở escrow-journey.spec.js)
const { test, expect, openAs, requireAccounts } = require('../helpers');
const { bookFromTryon, payNextStage, releaseStage, vendorCard, adminTab } = require('./flow-helpers');

test('trả đủ 3 đợt → nghiệm thu hết → đơn hoàn tất → đánh giá đối tác', async ({ browser }) => {
  requireAccounts('bride');
  test.setTimeout(120_000);
  const bride = await openAs(browser, 'bride');
  const { order } = await bookFromTryon(bride);

  for (let stage = 0; stage < 3; stage++) {
    await payNextStage(bride, order);
    await releaseStage(bride, order, stage);
  }
  await expect(order).toContainText('Hoàn tất');

  await order.getByRole('button', { name: 'Đánh giá đối tác' }).click();
  await bride.getByLabel('Số sao').selectOption('5');
  await bride.getByLabel('Nhận xét').fill('Kiểm thử tự động: váy đẹp, tiệm nhiệt tình');
  await bride.getByRole('button', { name: 'Gửi đánh giá' }).click();
  await expect(order).toContainText('Bạn đã đánh giá 5★');

  // Đánh giá hiện công khai ở trang tiệm, kèm tên người đánh giá
  const guest = await openAs(browser, null);
  await guest.goto('/vendor.html?slug=2h-studio');
  await expect(guest.getByText('Kiểm thử tự động: váy đẹp, tiệm nhiệt tình').first()).toBeVisible();
});

test('đối tác từ chối đơn chưa đặt cọc → cô dâu thấy "Đã hủy"', async ({ browser }) => {
  requireAccounts('bride', 'vendor');
  const bride = await openAs(browser, 'bride');
  const vendor = await openAs(browser, 'vendor');
  const { code, order } = await bookFromTryon(bride);

  const card = await vendorCard(vendor, code);
  await card.getByRole('button', { name: 'Từ chối' }).click();
  await vendor.locator('dialog.modal').getByRole('button', { name: 'Từ chối' }).click();
  await expect(card).toContainText('Đã hủy');

  await bride.reload();
  await expect(order).toContainText('Đã hủy');
  await expect(order.getByRole('button', { name: 'Thanh toán' })).toHaveCount(0);   // đơn hủy không trả tiền được nữa
});

test('khách không đến → đối tác báo no-show → admin giải ngân đền bù cho đối tác', async ({ browser }) => {
  requireAccounts('bride', 'vendor', 'admin');
  test.setTimeout(120_000);
  const bride = await openAs(browser, 'bride');
  const vendor = await openAs(browser, 'vendor');
  const admin = await openAs(browser, 'admin');
  const { code, order } = await bookFromTryon(bride);
  await payNextStage(bride, order);                       // cọc đợt 1 – Trạm Hỷ đang giữ

  const card = await vendorCard(vendor, code);
  await expect(card).toContainText('Đã cọc đợt 1');
  await card.getByRole('button', { name: 'Khách không đến' }).click();
  await vendor.getByLabel(/Mô tả/).fill('Kiểm thử tự động: khách không đến, gọi điện không nghe máy');
  await vendor.getByRole('button', { name: 'Gửi báo cáo' }).click();
  await expect(card).toContainText('Đang khiếu nại');

  const disputes = await adminTab(admin, 'disputes');
  const dispute = disputes.locator('article[data-dispute]', { hasText: code });
  await expect(dispute).toContainText('Đối tác báo khách không đến');
  await dispute.getByRole('button', { name: 'Giải ngân đền bù cho đối tác' }).click();
  await admin.getByLabel(/Ghi chú kết luận/).fill('E2E: xác minh khách không đến, đền bù cho tiệm');
  await admin.getByRole('button', { name: 'Xác nhận phân xử' }).click();
  await expect(dispute).toHaveCount(0);

  await bride.reload();
  await expect(order).toContainText('Đã hủy');
  await expect(order.locator('.milestone').nth(0)).toContainText('Đã giải ngân');   // tiền cọc về tiệm
});

test('tự thiết kế may đo → đặt lịch → đơn chia 30/40/30 và có hồ sơ thiết kế', async ({ browser }) => {
  requireAccounts('bride');
  const bride = await openAs(browser, 'bride');
  await bride.goto('/tryon.html');
  await bride.getByRole('button', { name: 'Tự thiết kế may đo' }).click();
  await bride.getByRole('button', { name: /Đuôi cá/ }).click();
  await bride.getByRole('button', { name: /Ren Chantilly Pháp/ }).click();
  await bride.locator('#bespoke-notes').fill('Thêu tên hai vợ chồng ở gấu váy');

  await bride.locator('#book-btn').click();
  await bride.getByLabel('Số điện thoại').fill('0900000000');
  await bride.getByRole('button', { name: 'Xác nhận đặt lịch' }).click();
  await expect(bride).toHaveURL(/bookings\.html\?new=BK/);
  const code = new URL(bride.url()).searchParams.get('new');
  const order = bride.locator('article[data-booking]', { hasText: code });

  await expect(order).toContainText('May đo theo mô tả');                     // có ghi chú → loại "theo mô tả"
  await expect(order.locator('.milestone').nth(0)).toContainText('(30%)');
  await expect(order.locator('.milestone').nth(1)).toContainText('(40%)');
  await expect(order.locator('.milestone').nth(2)).toContainText('(30%)');
  await order.getByText('Hồ sơ số đo & thiết kế').click();
  await expect(order).toContainText('Phom: Đuôi cá');
  await expect(order).toContainText('Vải: Ren Chantilly Pháp');
  await expect(order).toContainText('Thêu tên hai vợ chồng ở gấu váy');
});

test('số đo cơ thể được lưu vào tài khoản', async ({ browser }) => {
  requireAccounts('bride');
  const bride = await openAs(browser, 'bride');
  await bride.goto('/tryon.html');
  await expect(bride.getByText('Số đo được tự lưu vào tài khoản của bạn.')).toBeVisible();

  const height = String(150 + Math.floor(Math.random() * 30));   // giá trị mới mỗi lần chạy
  await bride.locator('#height').evaluate((el, v) => {
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, height);
  await bride.getByRole('button', { name: 'Quả lê' }).click();
  await bride.waitForTimeout(1500);                                   // đợi lưu (debounce 0,8 giây)

  await bride.reload();
  await expect(bride.locator('#height-value')).toHaveText(height);
  await expect(bride.getByRole('button', { name: 'Quả lê' })).toHaveClass(/active/);
});
