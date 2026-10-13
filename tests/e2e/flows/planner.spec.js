// Kế hoạch cưới (SQL 20): tạo từ mẫu → sửa ngân sách ngay trên bảng → đơn Trạm Hỷ tự hiện → checklist → tổng quan
const { test, expect, openAs, requireAccounts } = require('../helpers');

test('tạo kế hoạch cưới, sửa ngân sách, đánh dấu đã trả, checklist và tổng quan', async ({ browser }) => {
  requireAccounts('bride');
  test.setTimeout(120_000);
  const bride = await openAs(browser, 'bride');
  await bride.goto('/ke-hoach.html');
  const reset = bride.getByRole('button', { name: 'Làm lại kế hoạch từ đầu' });
  await expect(bride.locator('.planner-create').or(reset)).toBeVisible({ timeout: 30_000 });

  // Có kế hoạch từ lần chạy trước → làm lại từ đầu
  if (await reset.isVisible()) {
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

  // Đánh dấu đã trả → vòng "Đã thanh toán" tăng thêm 1 mục (đơn Trạm Hỷ đã cọc cũng được tính sẵn)
  const paidCount = async () => Number((await board.locator('.budget-summary').innerText()).match(/Đã thanh toán: (\d+) mục/)[1]);
  const paidBefore = await paidCount();
  await trap.getByRole('button', { name: 'Chưa trả' }).click();
  await expect(trap.getByRole('button', { name: '✓ Đã trả' })).toBeVisible();
  await expect(board.locator('.budget-summary')).toContainText(`Đã thanh toán: ${paidBefore + 1} mục`);

  // Thêm mục mới, đổi tên, rồi xóa
  await anHoi.getByRole('button', { name: '+ Thêm mục chi tiêu' }).click();
  const newName = anHoi.locator('[data-field="name"]').last();
  await expect(newName).toBeFocused();
  await newName.fill('Thuê áo dài đội bê tráp');
  await newName.press('Tab');
  await expect(bride.locator('#save-status')).toHaveAttribute('data-state', /saved|idle/);   // chờ "✓ Đã lưu tự động"
  await bride.reload();                                                           // đã lưu vào database
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

// Có sẵn kế hoạch (test trên để lại) – chạy riêng thì tự tạo
async function ensurePlan(page) {
  await page.goto('/ke-hoach.html?tab=budget');
  const create = page.locator('.planner-create');
  await expect(page.locator('.planner-create, #panel-budget .budget-category').first()).toBeVisible({ timeout: 20_000 });
  if (await create.isVisible()) {
    await create.getByLabel('Tổng ngân sách').fill('300000000');
    await create.getByRole('button', { name: 'Tạo kế hoạch cưới' }).click();
    await expect(page.locator('#panel-budget .budget-category').first()).toBeVisible({ timeout: 20_000 });
  }
}

test('trợ lý AI: đề xuất sửa từng mục → bỏ chọn 1 mục → áp dụng → tab Ngân sách đổi số → hoàn tác', async ({ browser }) => {
  requireAccounts('bride');
  test.setTimeout(120_000);
  const bride = await openAs(browser, 'bride');
  await ensurePlan(bride);

  const rowOf = (name) => bride.locator('#panel-budget .budget-row', { has: bride.locator(`input[value^="${name}"]`) });
  const firstId = await rowOf('Váy cưới').getAttribute('data-item');
  const secondId = await rowOf('Đồ uống').getAttribute('data-item');
  const before = await rowOf('Váy cưới').locator('[data-field="estimated"]').inputValue();

  // Giả lập Edge Function (không tốn lượt Gemini); kiểm tra web gửi đúng chế độ plan
  let sent;
  await bride.route('**/functions/v1/tu-van-ngan-sach', (route) => {
    sent = route.request().postDataJSON();
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      source: 'ai',
      reply: 'Bạn có thể giảm tiền váy và đồ uống để cân đối.',
      remaining: 17,
      changes: [
        { id: firstId, name: 'Váy cưới', category: 'Trang phục', from: 12_000_000, to: 9_900_000, reason: 'Thuê thay vì may' },
        { id: secondId, name: 'Đồ uống', category: 'Tiệc cưới', from: 12_000_000, to: 8_000_000, reason: 'Bia nội' },
      ],
    }) });
  });

  // Nút ở tab Ngân sách mở tab Trợ lý AI
  await bride.locator('#panel-budget [data-ask-ai=""]').click();
  const ai = bride.locator('#panel-ai');
  await expect(bride.getByRole('tab', { name: '✨ Hỏi AI' })).toHaveClass(/active/);
  await expect(ai.getByPlaceholder(/Hỏi về kế hoạch cưới/)).toBeFocused();
  await ai.getByPlaceholder(/Hỏi về kế hoạch cưới/).fill('Giúp mình cân đối ngân sách');
  await ai.getByRole('button', { name: 'Gửi' }).click();

  await expect(ai.locator('.msg.ai').last()).toContainText('giảm tiền váy');
  expect(sent).toMatchObject({ mode: 'plan', question: 'Giúp mình cân đối ngân sách' });
  await expect(ai.locator('[data-remaining]')).toHaveText('Còn 17/20 câu hôm nay');

  const card = ai.locator('.ai-proposal');
  await expect(card).toContainText('Đề xuất điều chỉnh · 2 mục');
  await expect(card.getByRole('button', { name: 'Áp dụng 2 thay đổi' })).toBeVisible();
  await card.getByRole('checkbox').nth(1).uncheck();                         // chỉ lấy đề xuất váy
  await card.getByRole('button', { name: 'Áp dụng 1 thay đổi' }).click();
  await expect(card).toContainText('✓ Đã áp dụng 1 thay đổi');

  await bride.getByRole('tab', { name: 'Ngân sách' }).click();
  await expect(rowOf('Váy cưới').locator('[data-field="estimated"]')).toHaveValue('9.900.000');
  await expect(rowOf('Đồ uống').locator('[data-field="estimated"]')).not.toHaveValue('8.000.000');

  // Hoàn tác → trở lại số cũ
  await bride.getByRole('tab', { name: '✨ Hỏi AI' }).click();
  await card.getByRole('button', { name: '↶ Hoàn tác' }).click();
  await expect(card).toContainText('Đã hoàn tác');
  await bride.getByRole('tab', { name: 'Ngân sách' }).click();
  await expect(rowOf('Váy cưới').locator('[data-field="estimated"]')).toHaveValue(before);
});

test('trang chủ: "Lưu thành kế hoạch cưới" mang cách chia AI sang kế hoạch đang có', async ({ browser }) => {
  requireAccounts('bride');
  test.setTimeout(120_000);
  const bride = await openAs(browser, 'bride');
  await ensurePlan(bride);
  await bride.route('**/functions/v1/tu-van-ngan-sach', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({
      source: 'ai', tips: [], warning: '',
      allocations: [
        { category: 'venue', label: 'Nhà hàng tiệc', amount: 200_000_000, percent: 50, reason: '' },
        { category: 'studio', label: 'Chụp ảnh cưới', amount: 40_000_000, percent: 10, reason: '' },
        { category: 'bridal', label: 'Váy cưới', amount: 40_000_000, percent: 10, reason: '' },
        { category: 'decor', label: 'Trang trí', amount: 40_000_000, percent: 10, reason: '' },
        { category: 'makeup', label: 'Trang điểm', amount: 20_000_000, percent: 5, reason: '' },
        { category: 'other', label: 'Chi phí khác & dự phòng', amount: 60_000_000, percent: 15, reason: '' },
      ],
    }),
  }));

  await bride.goto('/index.html');
  await bride.locator('#budget-input').fill('400000000');
  await bride.locator('#ai-budget-btn').click();
  await expect(bride.locator('#budget-source')).toContainText('Gợi ý bởi AI');
  await bride.getByRole('button', { name: '💾 Lưu thành kế hoạch cưới' }).click();

  await expect(bride).toHaveURL(/ke-hoach\.html/);
  const dialog = bride.locator('dialog.modal');
  await expect(dialog).toContainText('Áp dụng cách chia AI vào kế hoạch?');
  await expect(dialog).toContainText('Tiệc 200.000.000đ');
  await dialog.getByRole('button', { name: /^Áp dụng/ }).click();
  await expect(bride.locator('.toast-success', { hasText: 'Đã áp dụng cách chia AI' })).toBeVisible({ timeout: 20_000 });
  await expect(bride.locator('#panel-budget .budget-total')).toContainText('400.000.000đ');
});
