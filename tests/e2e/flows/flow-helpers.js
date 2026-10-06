// Thao tác dùng chung cho các luồng cần đăng nhập
const { expect } = require('../helpers');

/** Cô dâu đặt lịch từ Phòng thử váy. Trả về { code, order } – order là thẻ đơn ở trang Đơn của tôi. */
async function bookFromTryon(bride, path = '/tryon.html?dress=royal-mermaid') {
  await bride.goto(path);
  await bride.locator('#book-btn').click();
  await bride.getByLabel('Số điện thoại').fill('0900000000');   // tài khoản test chưa có SĐT
  await bride.getByRole('button', { name: 'Xác nhận đặt lịch' }).click();
  await expect(bride).toHaveURL(/bookings\.html\?new=BK/);
  const code = new URL(bride.url()).searchParams.get('new');
  const order = bride.locator('article[data-booking]', { hasText: code });
  await expect(order).toBeVisible();
  return { code, order };
}

async function payNextStage(bride, order) {
  await order.getByRole('button', { name: 'Thanh toán' }).click();
  await bride.getByRole('button', { name: 'Tôi đã chuyển khoản' }).click();
  await expect(bride.locator('dialog.modal')).toHaveCount(0);
}

async function releaseStage(bride, order, stageIndex) {
  await order.getByRole('button', { name: 'Nghiệm thu' }).click();
  await bride.getByRole('button', { name: 'Đồng ý giải ngân' }).click();
  await expect(order.locator('.milestone').nth(stageIndex)).toContainText('Đã giải ngân');
}

/** Thẻ đơn trên Kanban của đối tác (mở Kênh đối tác nếu chưa mở) */
async function vendorCard(vendor, code) {
  if (!vendor.url().includes('vendor-dashboard')) await vendor.goto('/vendor-dashboard.html');
  const card = vendor.locator('.kanban-card', { hasText: code });
  await expect(card).toBeVisible();
  return card;
}

/** Admin mở tab theo mã: 'approvals' | 'disputes' | 'vendors' | 'bookings' (tên chữ dễ trùng: "Đối tác" ⊂ "Duyệt đối tác") */
async function adminTab(admin, tab) {
  if (!admin.url().includes('admin.html')) await admin.goto('/admin.html');
  await admin.locator(`[data-tab="${tab}"]`).click();
  return admin.locator(`#tab-${tab}`);
}

module.exports = { bookFromTryon, payNextStage, releaseStage, vendorCard, adminTab };
