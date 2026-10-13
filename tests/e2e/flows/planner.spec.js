// Kế hoạch cưới (SQL 20): tạo từ mẫu → sửa ngân sách ngay trên bảng → đơn Trạm Hỷ tự hiện → checklist → tổng quan
const { test, expect, openAs, requireAccounts } = require('../helpers');

test('tạo kế hoạch cưới, sửa ngân sách, đánh dấu đã trả, checklist và tổng quan', async ({ browser }) => {
  requireAccounts('bride');
  test.setTimeout(120_000);
  const bride = await openAs(browser, 'bride');
  await bride.goto('/ke-hoach.html');
  await expect(bride.locator('#planner-root .empty')).toHaveCount(0, { timeout: 20_000 });

  // Có kế hoạch từ lần chạy trước → làm lại từ đầu
  if (await bride.getByRole('button', { name: 'Làm lại kế hoạch từ đầu' }).isVisible().catch(() => false)) {
    await bride.getByRole('button', { name: 'Làm lại kế hoạch từ đầu' }).click();
    await bride.locator('dialog.modal').getByRole('button', { name: 'Xóa & làm lại' }).click();
  }

  // ---- Tạo kế hoạch: miền Bắc, 300 triệu ----
  const create = bride.locator('.planner-create');
  await expect(create).toBeVisible();
  await create.getByLabel('Ngày cưới (dự kiến)').fill('2027-03-20');
  await create.getByLabel('Tổng ngân sách').fill('300000000');
  await create.getByLabel('Số khách mời dự kiến').fill('300');
  await create.getByRole('button', { name: 'Tạo kế hoạch cưới' }).click();
  await expect(bride.locator('.toast-success', { hasText: 'Đã tạo kế hoạch cưới' })).toBeVisible({ timeout: 20_000 });

  // ---- Ngân sách: danh mục theo nghi lễ, số dự kiến điền sẵn theo tỷ lệ ----
  const board = bride.locator('#panel-budget');
  const anHoi = board.locator('.budget-category', { has: bride.locator('input[value="Lễ ăn hỏi"]') });
  await expect(anHoi).toBeVisible();
  const trap = anHoi.locator('.budget-row', { has: bride.locator('input[value^="Tráp ăn hỏi"]') });
  await expect(trap.locator('[data-field="estimated"]')).toHaveValue('12.000.000');     // 4% của 300 triệu

  // Đơn đặt qua Trạm Hỷ tự hiện trong danh mục cùng loại tiệm (tài khoản test có đơn váy 2H Studio)
  await expect(board.locator('.booking-row').first()).toContainText('đặt qua Trạm Hỷ');

  // Sửa thực tế cao hơn dự kiến → báo đỏ, tổng cập nhật ngay
  await trap.locator('[data-field="actual"]').fill('15000000');
  await trap.locator('[data-field="actual"]').press('Tab');
  await expect(trap.locator('.cell-act')).toHaveClass(/over/);
  await expect(anHoi.locator('.budget-cat-foot b').last()).toContainText('15.000.000đ');

  // Đánh dấu đã trả → vòng "Đã thanh toán" tăng
  await trap.getByRole('button', { name: 'Chưa trả' }).click();
  await expect(trap.getByRole('button', { name: '✓ Đã trả' })).toBeVisible();
  await expect(board.locator('.budget-summary')).toContainText('Đã thanh toán: 1 mục');

  // Thêm mục mới, đổi tên, rồi xóa
  await anHoi.getByRole('button', { name: '+ Thêm mục chi tiêu' }).click();
  const newName = anHoi.locator('[data-field="name"]').last();
  await expect(newName).toBeFocused();
  await newName.fill('Thuê áo dài đội bê tráp');
  await newName.press('Tab');
  await bride.reload();                                                            // đã lưu vào database
  await expect(bride.locator('#panel-budget input[value="Thuê áo dài đội bê tráp"]')).toBeVisible({ timeout: 20_000 });
  await bride.locator('#panel-budget .budget-row', { has: bride.locator('input[value="Thuê áo dài đội bê tráp"]') })
    .getByRole('button', { name: 'Xóa mục' }).click();
  await expect(bride.locator('#panel-budget input[value="Thuê áo dài đội bê tráp"]')).toHaveCount(0);

  // ---- Checklist: hạn tính từ ngày cưới, tick xong ----
  await bride.getByRole('tab', { name: 'Checklist' }).click();
  const checklist = bride.locator('#panel-checklist');
  const firstTask = checklist.locator('.task').first();
  await expect(firstTask).toContainText('Xem ngày cưới đẹp');
  await expect(firstTask.locator('.task-due')).toContainText('20/03/2026');      // 365 ngày trước 20/03/2027
  await firstTask.locator('.task-check').click();
  await expect(checklist.locator('.checklist-head')).toContainText('1/25 việc đã xong');
  await checklist.getByPlaceholder(/Thêm việc của riêng bạn/).fill('Đặt bánh cưới E2E');
  await checklist.getByRole('button', { name: 'Thêm', exact: true }).click();
  await expect(checklist.locator('.task', { hasText: 'Đặt bánh cưới E2E' })).toBeVisible();

  // ---- Tổng quan ----
  await bride.getByRole('tab', { name: 'Tổng quan' }).click();
  const overview = bride.locator('#panel-overview');
  await expect(overview.locator('.countdown-card')).toContainText('ngày đến đám cưới');
  await expect(overview).toContainText('1/26 việc');
  await expect(overview).toContainText('300 khách (~30 bàn)');
});

test('chưa đăng nhập: trang Kế hoạch cưới giới thiệu tính năng và mời đăng nhập', async ({ browser }) => {
  const guest = await openAs(browser, null);
  await guest.goto('/ke-hoach.html');
  await expect(guest.getByText('Ngân sách theo nghi lễ')).toBeVisible();
  await expect(guest.getByRole('link', { name: /Đăng nhập để lập kế hoạch/ })).toHaveAttribute('href', /login\.html\?next=ke-hoach\.html/);
});
