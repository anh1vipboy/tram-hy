// Hành trình đầy đủ qua 3 vai trò, đúng luồng tiền Escrow:
// cô dâu đặt lịch + trả cọc → đối tác thấy đơn realtime, bắt đầu làm → cô dâu nghiệm thu, trả đợt 2,
// khiếu nại → admin hoàn tiền → cô dâu thấy "Đã hoàn tiền".
// Chạy trên database TEST, mỗi lần chạy tạo 1 đơn mới.
const { test, expect, openAs, requireAccounts } = require('../helpers');

test.describe.configure({ mode: 'serial' });

test('đặt lịch → cọc → đối tác thực hiện → khiếu nại → admin hoàn tiền', async ({ browser }) => {
  requireAccounts('bride', 'vendor', 'admin');
  test.setTimeout(120_000);
  const bride = await openAs(browser, 'bride');
  const vendor = await openAs(browser, 'vendor');
  const admin = await openAs(browser, 'admin');

  // ---- 1. Cô dâu đặt lịch thuê váy của 2H Studio ----
  await bride.goto('/tryon.html?dress=royal-mermaid');
  await bride.locator('#book-btn').click();
  await bride.getByRole('button', { name: 'Xác nhận đặt lịch' }).click();
  await expect(bride).toHaveURL(/bookings\.html\?new=BK/);
  const code = new URL(bride.url()).searchParams.get('new');
  const order = bride.locator('article[data-booking]', { hasText: code });
  await expect(order).toContainText('Chờ đặt cọc');

  // Đối tác mở Kênh đối tác sẵn để kiểm tra đơn nhảy realtime
  await vendor.goto('/vendor-dashboard.html');
  await expect(vendor.locator('.kanban-col', { hasText: 'Chờ khách đặt cọc' })).toContainText(code);

  // ---- 2. Cô dâu trả đợt 1 (30%) ----
  await order.getByRole('button', { name: 'Thanh toán' }).click();
  await bride.getByRole('button', { name: 'Tôi đã chuyển khoản' }).click();
  await expect(order).toContainText('Đã cọc đợt 1');
  await expect(order.locator('.milestone').nth(0)).toContainText('Trạm Hỷ đang giữ');
  // Chỉ được trả đợt kế tiếp – không có nút trả đợt 3 khi đợt 2 chưa trả
  await expect(order.getByRole('button', { name: 'Thanh toán' })).toHaveCount(1);

  // ---- 3. Đối tác thấy đơn chuyển cột (không tải lại trang) và bắt đầu thực hiện ----
  const vendorCard = vendor.locator('.kanban-card', { hasText: code });
  await expect(vendor.locator('.kanban-col', { hasText: 'Đã nhận cọc' }).locator('.kanban-card', { hasText: code })).toBeVisible();
  await vendorCard.getByRole('button', { name: 'Bắt đầu thực hiện' }).click();
  await expect(vendorCard).toContainText('Đang thực hiện');

  // ---- 4. Cô dâu nghiệm thu đợt 1, trả đợt 2, rồi khiếu nại ----
  await bride.reload();
  await order.getByRole('button', { name: 'Nghiệm thu' }).click();
  await bride.getByRole('button', { name: 'Đồng ý giải ngân' }).click();
  await expect(order.locator('.milestone').nth(0)).toContainText('Đã giải ngân');

  await order.getByRole('button', { name: 'Thanh toán' }).click();
  await bride.getByRole('button', { name: 'Tôi đã chuyển khoản' }).click();
  await expect(order.locator('.milestone').nth(1)).toContainText('Trạm Hỷ đang giữ');

  await order.getByRole('button', { name: 'Yêu cầu hoàn cọc' }).click();
  await bride.getByLabel(/Lý do/).fill('Kiểm thử tự động: váy giao không đúng mẫu đã thử');
  await bride.getByRole('button', { name: 'Gửi yêu cầu' }).click();
  await expect(order).toContainText('Đang khiếu nại');

  // ---- 5. Admin hoàn tiền đợt đang giữ cho cô dâu ----
  await admin.goto('/admin.html');
  await admin.getByRole('button', { name: 'Khiếu nại' }).click();
  const dispute = admin.locator('article[data-dispute]', { hasText: code });
  await expect(dispute).toContainText('Cô dâu yêu cầu hoàn cọc');
  await dispute.getByRole('button', { name: 'Hoàn tiền cho cô dâu' }).click();
  await admin.getByLabel(/Ghi chú kết luận/).fill('E2E: chấp nhận hoàn tiền');
  await admin.getByRole('button', { name: 'Xác nhận phân xử' }).click();
  await expect(dispute).toHaveCount(0);

  // ---- 6. Cô dâu thấy kết quả ----
  await bride.reload();
  await expect(order).toContainText('Đã hoàn tiền');
  await expect(order.locator('.milestone').nth(0)).toContainText('Đã giải ngân');      // đợt đã nghiệm thu giữ nguyên
  await expect(order.locator('.milestone').nth(1)).toContainText('Đã hoàn cho cô dâu');
});
