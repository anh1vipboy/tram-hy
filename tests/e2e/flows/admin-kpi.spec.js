const { test, expect, openAs, requireAccounts, expectNoHorizontalOverflow } = require('../helpers');

test('admin: kiểm tra Bảng tổng hợp User & chỉ số đo lường KPI môn học', async ({ browser }) => {
  requireAccounts('admin');
  const admin = await openAs(browser, 'admin');
  await admin.goto('/admin.html');

  // Tab KPI hiển thị và được chọn mặc định
  const kpiTab = admin.locator('[data-tab="kpi"]');
  await expect(kpiTab).toBeVisible();
  await expect(kpiTab).toHaveClass(/active/);
  await expect(kpiTab).toContainText('218 users');

  // Thẻ tóm tắt trên đầu (stats) có liên kết tới KPI
  const kpiStat = admin.locator('#stats [data-open-kpi]');
  await expect(kpiStat).toBeVisible();
  await expect(kpiStat).toContainText('218 users');

  // Section KPI hiển thị đầy đủ
  const section = admin.locator('#tab-kpi');
  await expect(section).toBeVisible();
  await expect(section.getByRole('heading', { name: /Bảng Tổng Hợp Chỉ Số Đo Lường & KPI Người Dùng/ })).toBeVisible();

  // Kiểm tra 6 chỉ số trên bảng dữ liệu (đúng chuẩn ảnh yêu cầu)
  const rows = section.locator('.kpi-table tbody tr');
  await expect(rows).toHaveCount(6);

  // 1. Tổng lượt truy cập (Visits)
  await expect(rows.nth(0)).toContainText('Tổng lượt truy cập (Visits)');
  await expect(rows.nth(0)).toContainText('≥ 2.000');
  await expect(rows.nth(0)).toContainText('2.380 visits');
  await expect(rows.nth(0)).toContainText('119%');
  await expect(rows.nth(0)).toContainText('Đạt độ phủ rộng nhờ viral TikTok/Threads');

  // 2. Lượt nhấp nút hành động (CTA Click)
  await expect(rows.nth(1)).toContainText('Lượt nhấp nút hành động (CTA Click)');
  await expect(rows.nth(1)).toContainText('≥ 300');
  await expect(rows.nth(1)).toContainText('412 clicks');
  await expect(rows.nth(1)).toContainText('137%');
  await expect(rows.nth(1)).toContainText('Tỷ lệ CTR đạt 17,31%');

  // 3. Tổng User đăng ký mới (Sign-ups)
  await expect(rows.nth(2)).toContainText('Tổng User đăng ký mới (Sign-ups)');
  await expect(rows.nth(2)).toContainText('≥ 200');
  await expect(rows.nth(2)).toContainText('218 users');
  await expect(rows.nth(2)).toContainText('109%');
  await expect(rows.nth(2)).toContainText('Đạt chuẩn KPI Web của môn học');

  // 4. Người dùng hoạt động (Active Users)
  await expect(rows.nth(3)).toContainText('Người dùng hoạt động (Active Users)');
  await expect(rows.nth(3)).toContainText('≥ 50');
  await expect(rows.nth(3)).toContainText('78 active users');
  await expect(rows.nth(3)).toContainText('156%');
  await expect(rows.nth(3)).toContainText('Thao tác trên 2 trang hoặc thử AR ≥ 2 lần');

  // 5. Khách hàng trả tiền mua gói cước AI
  await expect(rows.nth(4)).toContainText('Khách hàng trả tiền mua gói cước AI');
  await expect(rows.nth(4)).toContainText('Không bắt buộc');
  await expect(rows.nth(4)).toContainText('40 khách hàng thanh toán');
  await expect(rows.nth(4)).toContainText('Doanh thu AI thực thu: 6.360.000đ');

  // 6. Giao dịch dịch vụ cưới qua Escrow
  await expect(rows.nth(5)).toContainText('Giao dịch dịch vụ cưới qua Escrow');
  await expect(rows.nth(5)).toContainText('≥ 1 đơn');
  await expect(rows.nth(5)).toContainText('6 đơn (4 đơn hiệu lực)');
  await expect(rows.nth(5)).toContainText('400%');
  await expect(rows.nth(5)).toContainText('Tổng giá trị GMV: 22.800.000đ');

  // Chuyển sang chế độ 7 chỉ số (Kèm Luồng Thử Váy AR)
  await section.locator('#btn-kpi-mode-full').click();
  await expect(section.locator('.kpi-table tbody tr')).toHaveCount(7);
  await expect(section.locator('.kpi-table tbody tr').nth(6)).toContainText('Lượt hoàn tất luồng AR Try-on');
  await expect(section.locator('.kpi-table tbody tr').nth(6)).toContainText('164 lượt hoàn tất');
  await expect(section.locator('.kpi-table tbody tr').nth(6)).toContainText('109%');

  // Mở hộp thoại xem danh sách 218 tài khoản
  await section.locator('#btn-view-user-list').click();
  const dialog = admin.locator('dialog.modal');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: /Danh sách 218 Tài khoản/ })).toBeVisible();
  await expect(dialog.locator('#user-filtered-count')).toContainText('218 tài khoản');
  await expect(dialog.locator('#user-table-tbody tr')).toHaveCount(218);

  // Đóng hộp thoại
  await dialog.getByRole('button', { name: 'Đóng' }).click();
  await expect(dialog).toBeHidden();

  // Kiểm tra Tab Thời gian dùng 276 User
  const userTimeTab = admin.locator('[data-tab="user-time"]');
  await expect(userTimeTab).toBeVisible();
  await userTimeTab.click();
  await expect(userTimeTab).toHaveClass(/active/);

  const userTimeSection = admin.locator('#tab-user-time');
  await expect(userTimeSection).toBeVisible();
  await expect(userTimeSection.getByRole('heading', { name: /Tổng Hợp 276 Tài Khoản & Thời Gian Sử Dụng/ })).toBeVisible();

  // Kiểm tra bảng hiển thị đúng các cột và các dòng phân trang
  const userTimeRows = userTimeSection.locator('.user-time-table tbody tr');
  await expect(userTimeRows).toHaveCount(25); // Mặc định 25 dòng/trang
  await expect(userTimeSection.locator('.user-time-banner')).toContainText('276 tài khoản');

  // Nút tải Excel tồn tại
  await expect(userTimeSection.locator('#btn-export-user-time')).toBeVisible();

  // Kiểm tra không tràn màn hình ngang trên Desktop
  await expectNoHorizontalOverflow(admin);

  // Kiểm tra trên màn hình điện thoại 390px (chuẩn iPhone / AGENTS.md)
  await admin.setViewportSize({ width: 390, height: 844 });
  await admin.waitForTimeout(300);
  await expectNoHorizontalOverflow(admin);
});
