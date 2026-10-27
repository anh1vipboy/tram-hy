// Kế hoạch cưới: thẻ đếm ngày đọc được ở mọi trạng thái · Xuất Excel · Chia sẻ link chỉ xem (SQL 33).
// Bài "chia sẻ" cần database test đã chạy backend/supabase/33_plan_share.sql – chưa chạy thì bài đó sẽ báo lỗi.
const path = require('node:path');
const fs = require('node:fs');
const { test, expect, openAs, requireAccounts, expectNoHorizontalOverflow } = require('../helpers');

const XLSX = require(path.resolve(__dirname, '../../../frontend/js/vendor/xlsx-0.20.3.mini.min.js'));

const pad = (n) => String(n).padStart(2, '0');
// Lỗi JavaScript + thông báo lỗi đỏ. (Không bắt "Failed to load resource" như trackErrors: máy chạy test bị chặn
// tải font Google thì vẫn là lỗi môi trường, không phải lỗi của trang.)
function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (err) => errors.push(`Lỗi JS: ${err.message}`));
  return {
    async expectNoErrors() {
      const toasts = await page.locator('.toast-error').allTextContents();
      expect([...errors, ...toasts.map((t) => `Toast lỗi: ${t}`)]).toEqual([]);
    },
  };
}

const isoInDays = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Có sẵn kế hoạch (bài planner.spec để lại) – chạy riêng thì tự tạo */
async function ensurePlan(page) {
  await page.goto('/ke-hoach.html');
  const create = page.locator('.planner-create');
  await expect(create.or(page.locator('#panel-overview .countdown-card'))).toBeVisible({ timeout: 30_000 });
  if (await create.isVisible()) {
    await create.getByLabel('Ngày cưới (dự kiến)').fill('2027-03-20');
    await create.getByLabel('Tổng ngân sách').fill('300000000');
    await create.getByRole('button', { name: 'Tạo kế hoạch cưới' }).click();
    await expect(page.locator('#panel-budget .budget-category').first()).toBeVisible({ timeout: 20_000 });
  }
}

// Độ tương phản WCAG giữa màu chữ và MỌI màu nền của thẻ (nền gradient → lấy từng điểm màu)
async function contrastOf(locator) {
  return locator.evaluate((el) => {
    const parse = (s) => [...s.matchAll(/rgba?\(([^)]+)\)/g)].map((m) => m[1].split(',').map((x) => parseFloat(x)));
    const lum = ([r, g, b]) => {
      const f = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const card = el.closest('.countdown-card');
    const cs = getComputedStyle(card);
    const backgrounds = [...parse(cs.backgroundImage), ...parse(cs.backgroundColor).filter((c) => c[3] !== 0)];
    const text = parse(getComputedStyle(el).color)[0];
    const ratios = backgrounds.map((bg) => {
      const [a, b] = [lum(text), lum(bg)].sort((x, y) => y - x);
      return (a + 0.05) / (b + 0.05);
    });
    return { min: Math.min(...ratios), text: getComputedStyle(el).color, background: cs.backgroundImage };
  });
}

test('thẻ đếm ngày ở Tổng quan đọc rõ trước / đúng / sau ngày cưới', async ({ browser }) => {
  requireAccounts('bride');
  test.setTimeout(90_000);
  const bride = await openAs(browser, 'bride');
  await ensurePlan(bride);

  // Đổi ngày cưới ngay trong phản hồi của database (không sửa dữ liệu thật) để xem đủ 3 trạng thái
  let fakeDate = null;
  await bride.route(/\/rest\/v1\/wedding_plans\?/, async (route) => {
    if (route.request().method() !== 'GET' || !fakeDate) return route.continue();
    const response = await route.fetch();
    const body = await response.json();
    const patch = (p) => (p ? { ...p, wedding_date: fakeDate } : p);
    await route.fulfill({ response, json: Array.isArray(body) ? body.map(patch) : patch(body) });
  });

  const cases = [
    { days: 30, state: 'before', text: 'ngày đến đám cưới', num: '30' },
    { days: 0, state: 'today', text: 'Hôm nay là ngày cưới!' },
    { days: -5, state: 'after', text: 'ngày hạnh phúc', num: '5', sub: 'Đã về chung một nhà' },
  ];
  for (const c of cases) {
    fakeDate = isoInDays(c.days);
    await bride.goto('/ke-hoach.html');
    const card = bride.locator('#panel-overview .countdown-card');
    await expect(card).toHaveAttribute('data-state', c.state, { timeout: 20_000 });
    await expect(card).toContainText(c.text);
    if (c.num) await expect(card.locator('.countdown-num')).toHaveText(c.num);
    if (c.sub) await expect(card).toContainText(c.sub);
    for (const part of await card.locator('.countdown-text, .countdown-sub').all()) {
      const { min, text, background } = await contrastOf(part);
      expect(min, `Chữ "${await part.innerText()}" (${text}) trên nền ${background} – trạng thái ${c.state}`).toBeGreaterThanOrEqual(4.5);
    }
  }
  await expect(bride.locator('#planner-subtitle')).toContainText('về chung một nhà');
});

test('xuất Excel: tải file .xlsx có đủ trang Tổng quan, Ngân sách, Checklist, tiếng Việt đúng dấu', async ({ browser }, testInfo) => {
  requireAccounts('bride');
  test.setTimeout(90_000);
  const bride = await openAs(browser, 'bride');
  const errors = watchErrors(bride);
  await ensurePlan(bride);

  const exportBtn = bride.getByRole('button', { name: /⬇ (Tải|Xuất) Excel/ });
  await expect(exportBtn).toBeVisible();
  const [download] = await Promise.all([bride.waitForEvent('download'), exportBtn.click()]);
  expect(download.suggestedFilename()).toBe('ke-hoach-cuoi-tram-hy.xlsx');
  const file = testInfo.outputPath('ke-hoach.xlsx');
  await download.saveAs(file);

  const bytes = fs.readFileSync(file);
  expect(bytes.subarray(0, 2).toString()).toBe('PK');          // file zip thật (định dạng .xlsx), không phải CSV đổi đuôi
  expect(bytes.length).toBeGreaterThan(3000);

  const wb = XLSX.read(bytes, { cellNF: true });           // cellNF: đọc cả định dạng số
  expect(wb.SheetNames.slice(0, 4)).toEqual(['Tổng quan', 'Ngân sách', 'Lịch thanh toán', 'Checklist']);

  const overview = XLSX.utils.sheet_to_json(wb.Sheets['Tổng quan'], { header: 1 });
  expect(overview[0][0]).toBe('KẾ HOẠCH CƯỚI – TRẠM HỶ');
  expect(overview.map((r) => r[0])).toEqual(expect.arrayContaining(['Ngày cưới', 'Tổng ngân sách', 'Chi phí dự kiến', 'Đã thanh toán']));

  const budget = wb.Sheets['Ngân sách'];
  const budgetRows = XLSX.utils.sheet_to_json(budget, { header: 1 });
  expect(budgetRows[0]).toEqual(['Danh mục', 'Bên phụ trách', 'Mục chi tiêu', 'Dự kiến', 'Thực tế', 'Đã trả', 'Ghi chú']);
  expect(budgetRows.some((r) => r[0] === 'Trang phục' && (r[1] === 'Váy cưới' || r[2] === 'Váy cưới'))).toBe(true);    // dấu tiếng Việt giữ nguyên
  expect(budgetRows.some((r) => String(r[1]).startsWith('Cộng: Trang phục') || String(r[2]).startsWith('Cộng: Trang phục'))).toBe(true);     // cộng theo danh mục
  expect(budgetRows.at(-1)[0] === 'TỔNG CỘNG' || budgetRows.at(-2)[0] === 'TỔNG CỘNG').toBe(true);
  const amountCell = budget.D2 || budget.C2;
  expect(amountCell.t).toBe('n');                                  // số tiền là số thật (cộng trừ được), định dạng VNĐ
  expect(amountCell.z).toContain('đ');

  const checklist = XLSX.utils.sheet_to_json(wb.Sheets.Checklist, { header: 1 });
  expect(checklist[0]).toEqual(['Mốc thời gian', 'Việc cần làm', 'Hạn', 'Trạng thái', 'Ngày hoàn thành']);
  expect(checklist.some((r) => String(r[1]).startsWith('Xem ngày cưới đẹp'))).toBe(true);
  await expect(bride.locator('.toast-success', { hasText: 'Đã tải file Excel' })).toBeVisible();
  await errors.expectNoErrors();
});

// ---- Cần SQL 33 trên database test ----
test('chia sẻ: bật link → người khác mở không cần đăng nhập, chỉ xem → tạo link mới thì link cũ hết hiệu lực', async ({ browser }) => {
  requireAccounts('bride');
  test.setTimeout(120_000);
  const bride = await openAs(browser, 'bride');
  await ensurePlan(bride);

  const openShare = async () => {
    await bride.getByRole('button', { name: '🔗 Chia sẻ' }).click();
    const sheet = bride.locator('dialog.plan-share-sheet');
    await expect(sheet.getByText('Cho phép xem bằng link')).toBeVisible({ timeout: 15_000 });
    return sheet;
  };
  const sheet = await openShare();
  const toggle = sheet.getByRole('switch');
  if (!(await toggle.isChecked())) {
    await sheet.locator('.share-switch').click();
    await expect(bride.locator('.toast-success', { hasText: 'Đã bật chia sẻ' })).toBeVisible();
  }
  await expect(toggle).toBeChecked();
  const linkInput = sheet.getByLabel('Link xem kế hoạch');
  const link = await linkInput.inputValue();
  expect(link).toMatch(/ke-hoach\.html\?xem=[A-Za-z0-9_-]{24,}$/);
  await expect(sheet.locator('.share-qr img')).toBeVisible();
  await expect(sheet).toContainText('chỉ xem');

  // ---- Người xem: trình duyệt khác, chưa đăng nhập ----
  const viewer = await openAs(browser, null);
  const viewerErrors = watchErrors(viewer);
  await viewer.goto(link);
  await expect(viewer.getByText('Bạn đang xem kế hoạch cưới được chia sẻ')).toBeVisible({ timeout: 20_000 });
  await expect(viewer.getByRole('link', { name: 'Lập kế hoạch của bạn' })).toHaveAttribute('href', 'ke-hoach.html');
  const root = viewer.locator('#planner-root');
  await expect(root.locator('.countdown-card')).toBeVisible();
  await expect(root.locator('input, textarea, select, [contenteditable]')).toHaveCount(0);   // không có ô sửa
  await expect(root.getByRole('button', { name: /Sửa|Xóa|Làm lại|Thêm/ })).toHaveCount(0);
  await expect(viewer.locator('#planner-actions')).toBeHidden();

  await root.getByRole('tab', { name: 'Ngân sách' }).click();
  await expect(root.locator('.view-category').filter({ hasText: 'Trang phục 💑' })).toContainText('Váy cưới');
  await expect(root.locator('.budget-summary')).toContainText('Chi phí dự kiến');
  await root.getByRole('tab', { name: 'Checklist' }).click();
  await expect(root.locator('.checklist-head')).toContainText('việc đã xong');
  await expect(root.locator('.view-task').first()).toBeVisible();
  await expectNoHorizontalOverflow(viewer);
  // Người xem cũng tải được Excel
  const [download] = await Promise.all([viewer.waitForEvent('download'), viewer.getByRole('button', { name: '⬇ Tải Excel' }).click()]);
  expect(download.suggestedFilename()).toBe('ke-hoach-cuoi-tram-hy.xlsx');
  await viewerErrors.expectNoErrors();

  // ---- Tạo link mới → link cũ không mở được nữa ----
  await sheet.getByRole('button', { name: '🔄 Tạo link mới' }).click();
  await bride.locator('dialog.modal').getByRole('button', { name: 'Tạo link mới' }).click();
  await expect(bride.locator('.toast-success', { hasText: 'Đã tạo link mới' })).toBeVisible();
  await expect(linkInput).not.toHaveValue(link);
  const newLink = await linkInput.inputValue();

  await viewer.goto(link);
  await expect(viewer.getByRole('heading', { name: 'Link không còn hiệu lực' })).toBeVisible({ timeout: 20_000 });
  await viewer.goto(newLink);
  await expect(viewer.getByText('Bạn đang xem kế hoạch cưới được chia sẻ')).toBeVisible({ timeout: 20_000 });

  // ---- Tắt chia sẻ → link báo đã tạm ẩn; link sai → báo thân thiện ----
  await sheet.locator('.share-switch').click();
  await expect(bride.locator('.toast-success', { hasText: 'Đã tắt chia sẻ' })).toBeVisible();
  await expect(sheet.getByRole('switch')).not.toBeChecked();
  await viewer.goto(newLink);
  await expect(viewer.getByRole('heading', { name: 'Kế hoạch đang tạm ẩn' })).toBeVisible({ timeout: 20_000 });
  await viewer.goto('/ke-hoach.html?xem=khong-co-link-nay-dau-1234567');
  await expect(viewer.getByRole('heading', { name: 'Link không còn hiệu lực' })).toBeVisible({ timeout: 20_000 });
});

test('chia sẻ trên điện thoại: hộp chia sẻ và trang xem không tràn màn hình', async ({ browser }) => {
  requireAccounts('bride');
  test.setTimeout(90_000);
  const bride = await openAs(browser, 'bride');
  await bride.setViewportSize({ width: 390, height: 844 });
  await ensurePlan(bride);
  await bride.getByRole('button', { name: '🔗 Chia sẻ' }).click();
  const sheet = bride.locator('dialog.plan-share-sheet');
  await expect(sheet.getByText('Cho phép xem bằng link')).toBeVisible({ timeout: 15_000 });
  if (!(await sheet.getByRole('switch').isChecked())) await sheet.locator('.share-switch').click();
  const link = await sheet.getByLabel('Link xem kế hoạch').inputValue();
  await expectNoHorizontalOverflow(bride);

  const viewer = await openAs(browser, null);
  await viewer.setViewportSize({ width: 390, height: 844 });
  await viewer.goto(link);
  await expect(viewer.getByText('Bạn đang xem kế hoạch cưới được chia sẻ')).toBeVisible({ timeout: 20_000 });
  await expectNoHorizontalOverflow(viewer);
  await viewer.locator('#planner-root').getByRole('tab', { name: 'Ngân sách' }).click();
  await expectNoHorizontalOverflow(viewer);

  // Dọn: tắt chia sẻ để tài khoản test không để link mở
  await sheet.locator('.share-switch').click();
  await expect(sheet.getByRole('switch')).not.toBeChecked();
});
