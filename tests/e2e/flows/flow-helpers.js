// Thao tác dùng chung cho các luồng cần đăng nhập
const { expect } = require('../helpers');

const pad = (n) => String(n).padStart(2, '0');

/** Ngày giờ ngẫu nhiên cách hôm nay 30–1500 ngày, trong khoảng 07:00–20:59: { date: 'YYYY-MM-DD', time: 'HH:mm' } */
function randomSlot() {
  const d = new Date(Date.now() + (30 + Math.floor(Math.random() * 1470)) * 864e5);
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(7 + Math.floor(Math.random() * 14))}:${pad(Math.floor(Math.random() * 60))}`,
  };
}

/**
 * Chọn ngày giờ hẹn ngẫu nhiên trong hộp thoại đặt lịch đang mở. Trả về { date, time } đã chọn.
 * Vì sao: hộp thoại điền sẵn ngày mai 09:30, còn database chặn trùng lịch (SQL 30: cùng tiệm cách nhau
 * ≥ 2 tiếng, nhà hàng mỗi ngày tối đa = số sảnh) mà các bài test đặt đi đặt lại cùng một tiệm
 * → mỗi lần đặt một giờ khác. Hộp thoại báo giờ đó đã kín (data-state="taken") thì chọn lại.
 */
async function pickFreeSlot(page) {
  const dialog = page.locator('dialog.modal');
  const slots = dialog.locator('[data-slots]');
  for (let attempt = 0; attempt < 5; attempt++) {
    const slot = randomSlot();
    await dialog.locator('input[name=date]').fill(slot.date);
    await dialog.locator('input[name=time]').fill(slot.time);
    await expect(slots).not.toHaveAttribute('data-state', 'loading');   // chưa chạy SQL 30 → 'unknown', vẫn đặt được
    if ((await slots.getAttribute('data-state')) !== 'taken') return slot;
  }
  throw new Error('Chọn ngẫu nhiên 5 lần đều trùng lịch – kiểm tra dữ liệu đơn trên database test');
}

/** Cô dâu đặt lịch từ Phòng thử váy (thẻ mẫu khi mở bằng ?dress=). Trả về { code, order } – order là thẻ đơn ở trang Đơn của tôi. */
async function bookFromTryon(bride, path = '/tryon.html?dress=royal-mermaid') {
  await bride.goto(path);
  await bride.locator('.dress-card').getByRole('button', { name: '📅 Đặt lịch thử váy' }).click();
  await bride.getByLabel('Số điện thoại').fill('0900000000');   // tài khoản test chưa có SĐT
  await pickFreeSlot(bride);
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

module.exports = { randomSlot, pickFreeSlot, bookFromTryon, payNextStage, releaseStage, vendorCard, adminTab };
