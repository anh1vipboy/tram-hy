// Đối tác MỚI: trang "Trở thành đối tác" → tạo tài khoản → mở tiệm từng bước → admin từ chối → sửa & gửi lại
// → admin duyệt → tiệm lên sàn. (Cần SQL 17: cô dâu tự mở tiệm.)
// Mỗi lần chạy tạo 1 tài khoản + 1 tiệm mới trong database TEST (project test phải TẮT "Confirm email").
const { test, expect, openAs, requireAccounts, account } = require('../helpers');
const { adminTab } = require('./flow-helpers');

test('đối tác mới đăng ký → mở tiệm → bị từ chối → gửi lại → được duyệt → lên sàn', async ({ browser }) => {
  requireAccounts('admin');
  test.setTimeout(120_000);
  const stamp = Date.now();
  const shopName = `E2E Decor ${stamp}`;
  const [user, domain] = account('admin').email.split('@');
  const email = `${user.split('+')[0]}+e2e-shop-${stamp}@${domain}`;   // mẹo dấu + : thư về cùng hộp Gmail

  // ---- Trang "Trở thành đối tác" → tạo tài khoản (không còn chọn vai trò) ----
  const vendor = await openAs(browser, null);
  await vendor.goto('/doi-tac.html');
  await vendor.locator('#partner-cta').click();
  await expect(vendor).toHaveURL(/login\.html\?tab=signup&next=vendor-dashboard/);
  await expect(vendor.locator('#auth-notice')).toContainText('Bước 1/2');
  const signup = vendor.locator('#signup-form');
  await expect(signup).toBeVisible();                                  // mở sẵn tab Tạo tài khoản
  await expect(signup.getByLabel('Bạn là')).toHaveCount(0);
  await signup.getByLabel('Họ tên').fill('Chủ tiệm E2E');
  await signup.getByLabel('Email').fill(email);
  await signup.getByLabel('Mật khẩu (ít nhất 6 ký tự)').fill('E2e-matkhau-123');
  await signup.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(vendor, 'Project test phải tắt "Confirm email" để đăng ký xong vào thẳng').toHaveURL(/vendor-dashboard\.html/);

  // ---- Mở tiệm từng bước ----
  await vendor.locator('.category-option', { hasText: 'Trang trí' }).click();   // ① loại dịch vụ (bấm cả thẻ)
  await vendor.getByRole('button', { name: 'Tiếp tục →' }).click();
  await vendor.getByLabel('Tên tiệm / thương hiệu').fill(shopName);            // ② thông tin tiệm
  await vendor.getByLabel('Số điện thoại liên hệ').fill('0911222333');
  await vendor.getByLabel('Quận / khu vực').fill('Cầu Giấy, Hà Nội');
  await vendor.getByLabel('Giá khởi điểm (VNĐ)').fill('15000000');
  await vendor.getByLabel('Địa chỉ cụ thể').fill('Số 1 Đường Kiểm Thử');
  await vendor.reload();                                                        // nháp được giữ khi tải lại
  await expect(vendor.getByLabel('Tên tiệm / thương hiệu')).toHaveValue(shopName);
  await vendor.getByRole('button', { name: 'Tiếp tục →' }).click();
  await expect(vendor.locator('.review-box')).toContainText('15.000.000đ');    // ③ xem lại
  await vendor.getByRole('button', { name: 'Gửi hồ sơ cho Trạm Hỷ' }).click();
  await expect(vendor.locator('.review-box')).toBeVisible();                     // chưa tick đồng ý → chưa gửi
  await vendor.getByLabel(/Tôi đồng ý/).check();
  await vendor.getByRole('button', { name: 'Gửi hồ sơ cho Trạm Hỷ' }).click();
  await expect(vendor.locator('#shop-status')).toContainText('đang chờ Trạm Hỷ duyệt');
  await expect(vendor.locator('.timeline li.active')).toContainText('đang xét duyệt');

  // Khách chưa thấy tiệm chờ duyệt
  const guest = await openAs(browser, null);
  await guest.goto('/marketplace.html');
  await guest.locator('#search').fill(shopName);
  await expect(guest.getByText('Không có đối tác phù hợp')).toBeVisible();

  // ---- Admin từ chối ----
  const admin = await openAs(browser, 'admin');
  const approvals = await adminTab(admin, 'approvals');
  const application = approvals.locator('article[data-vendor]', { hasText: shopName });
  await application.getByRole('button', { name: 'Từ chối' }).click();
  await admin.getByLabel(/Lý do từ chối/).fill('E2E: địa chỉ chưa cụ thể');
  await admin.locator('dialog.modal').getByRole('button', { name: 'Từ chối' }).click();
  await expect(application).toHaveCount(0);

  // ---- Đối tác thấy lý do (realtime), sửa và gửi lại ----
  await expect(vendor.locator('#shop-status')).toContainText('E2E: địa chỉ chưa cụ thể', { timeout: 20_000 });
  await vendor.getByLabel('Địa chỉ cụ thể').fill('Số 1 Đường Kiểm Thử, phường Dịch Vọng');
  await vendor.getByRole('button', { name: 'Sửa & gửi duyệt lại' }).click();
  await expect(vendor.locator('#shop-status')).toContainText('đang chờ Trạm Hỷ duyệt');

  // ---- Admin duyệt ----
  await admin.reload();
  const again = (await adminTab(admin, 'approvals')).locator('article[data-vendor]', { hasText: shopName });
  await again.getByRole('button', { name: 'Duyệt – cho lên sàn' }).click();
  await admin.locator('dialog.modal').getByRole('button', { name: 'Duyệt' }).click();
  await expect(again).toHaveCount(0);

  // ---- Đối tác vào được khu làm việc, khách thấy tiệm trên sàn ----
  await expect(vendor.locator('#workspace')).toBeVisible({ timeout: 20_000 });
  await expect(vendor.getByRole('heading', { level: 1 })).toHaveText(shopName);
  await guest.reload();
  await guest.locator('#search').fill(shopName);
  await expect(guest.locator('#vendor-grid h3')).toHaveText(shopName);

  // ---- Gói dịch vụ (SQL 19): tiệm Trang trí thêm "mẫu rạp" có ảnh + giá giảm ----
  const pkgName = `Rạp hoa trắng E2E ${stamp}`;
  await expect(vendor.locator('#tab-dresses')).toHaveText('Mẫu rạp & trang trí');
  await vendor.locator('#tab-dresses').click();
  await vendor.getByRole('button', { name: '+ Thêm mẫu rạp' }).first().click();
  const dialog = vendor.locator('dialog.modal');
  await dialog.getByLabel('Tên mẫu').fill(pkgName);
  await dialog.getByLabel('Giá (VNĐ)').fill('35000000');
  await dialog.getByLabel(/Giá gốc/).fill('40000000');
  await dialog.getByLabel(/Mô tả/).fill('Cổng hoa 3m, 8 trụ hoa lối đi, backdrop sân khấu.');
  await dialog.locator('input[name=image]').setInputFiles(require('node:path').resolve(__dirname, '../../../frontend/assets/images/bride_1_tryon_royal.jpg'));
  await dialog.getByRole('button', { name: 'Thêm mẫu' }).click();
  await expect(vendor.locator('.toast-success', { hasText: 'Đã thêm mẫu.' })).toBeVisible({ timeout: 30_000 });
  await expect(vendor.locator('#panel-dresses [data-package]')).toHaveCount(1);

  // Khách thấy mục "Mẫu rạp & trang trí" trên trang tiệm, có nhãn giảm giá
  await guest.locator('#vendor-grid article', { hasText: shopName }).getByRole('link', { name: 'Xem chi tiết' }).click();
  const shopUrl = guest.url().replace(/^https?:\/\/[^/]+/, '');
  await expect(guest.getByRole('heading', { name: 'Mẫu rạp & trang trí' })).toBeVisible();
  const pkgCard = guest.locator('#packages article', { hasText: pkgName });
  await expect(pkgCard).toContainText('-13%');
  await expect(guest.locator('aside')).toContainText('1 mẫu · từ 35.000.000đ');

  // Cô dâu đặt đúng mẫu → đơn mang tên mẫu và giá của mẫu (giá lấy ở server, không tin giá gửi lên)
  const bride = await openAs(browser, 'bride');
  await bride.goto(shopUrl);
  await bride.locator('#packages article', { hasText: pkgName }).getByRole('button', { name: 'Đặt mẫu này' }).click();
  const booking = bride.locator('dialog.modal');
  await expect(booking).toContainText(pkgName);
  await expect(booking).toContainText('35.000.000đ');
  await booking.getByLabel('Số điện thoại').fill('0900000000');
  await booking.getByRole('button', { name: 'Xác nhận đặt lịch' }).click();
  await expect(bride).toHaveURL(/bookings\.html\?new=BK/);
  const order = bride.locator('article[data-booking]', { hasText: pkgName });
  await expect(order).toContainText('35.000.000đ');
});
