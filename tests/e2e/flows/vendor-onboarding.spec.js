// Đối tác MỚI: đăng ký tài khoản → gửi hồ sơ mở tiệm → admin từ chối → sửa & gửi lại → admin duyệt → tiệm lên sàn.
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

  // ---- Đăng ký tài khoản đối tác ----
  const vendor = await openAs(browser, null);
  await vendor.goto('/login.html');
  await vendor.locator('[data-tab="signup"]').click();
  const signup = vendor.locator('#signup-form');
  await signup.getByLabel('Bạn là').selectOption('vendor');
  await signup.getByLabel('Họ tên').fill('Chủ tiệm E2E');
  await signup.getByLabel('Email').fill(email);
  await signup.getByLabel('Mật khẩu (ít nhất 6 ký tự)').fill('E2e-matkhau-123');
  await signup.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(vendor, 'Project test phải tắt "Confirm email" để đăng ký xong vào thẳng').toHaveURL(/vendor-dashboard\.html/);

  // ---- Gửi hồ sơ mở tiệm ----
  await vendor.getByLabel('Tên tiệm / thương hiệu').fill(shopName);
  await vendor.getByLabel('Loại dịch vụ').selectOption('decor');
  await vendor.getByLabel('Số điện thoại liên hệ').fill('0911222333');
  await vendor.getByLabel('Quận / khu vực').fill('Cầu Giấy, Hà Nội');
  await vendor.getByLabel('Giá khởi điểm (VNĐ)').fill('15000000');
  await vendor.getByLabel('Địa chỉ cụ thể').fill('Số 1 Đường Kiểm Thử');
  await vendor.getByRole('button', { name: 'Gửi hồ sơ cho Trạm Hỷ' }).click();
  await expect(vendor.locator('#shop-status')).toContainText('đang chờ Trạm Hỷ duyệt');

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
});
