// Luật đặt lịch (SQL 30): nhà hàng tính giá theo bàn + chặn trùng lịch.
//   - Nhà hàng: tổng = giá mỗi bàn × số bàn (server tự tính), mỗi ngày nhận tối đa = số sảnh.
//   - Tiệm thường: 2 lịch hẹn cùng tiệm cách nhau ít nhất 2 tiếng; hộp thoại hiện trước giờ đã có lịch.
// Cần database test đã chạy SQL 30. Mỗi lần chạy tạo vài đơn mới ở ngày giờ ngẫu nhiên (không vướng lần chạy trước):
// 1 đơn ở studio + đủ số sảnh của nhà hàng trong 1 ngày.
const { test, expect, openAs, requireAccounts } = require('../helpers');
const { pickFreeSlot } = require('./flow-helpers');

const money = (n) => `${Number(n).toLocaleString('vi-VN')}đ`;
const VENUE = 'daewoo';        // Daewoo Hotel Venue – nhà hàng mẫu (04_seed), ít sảnh → ít đơn phải tạo để lấp kín 1 ngày
const SHOP = 'tuart';          // TuArt Wedding – studio mẫu, đặt lịch chung theo giá khởi điểm

/** "HH:mm" + số phút → "HH:mm" (giờ trong test luôn 07:00–20:59 nên không vượt sang ngày khác) */
const addMinutes = (time, minutes) => {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

/** Mở hộp thoại "đặt lịch chung" ở trang tiệm (nút #book-service – có gói hay không đều có nút này) */
async function openGeneralBooking(page, slug) {
  await page.goto(`/vendor.html?slug=${slug}`);
  await page.locator('#book-service').click();
  const dialog = page.locator('dialog.modal');
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Gửi thẳng create_booking (bỏ qua kiểm tra trên giao diện) → trả câu lỗi của database, hoặc "Đã tạo đơn ..." */
async function bookDirectly(page, { slug, date, time, quantity = null }) {
  return page.evaluate(async (args) => {
    const { getVendorBySlug } = await import('/js/services/catalog.js');
    const { createBooking } = await import('/js/services/bookings.js');
    const vendor = await getVendorBySlug(args.slug);
    try {
      const booking = await createBooking({
        vendorId: vendor.id,
        type: 'service',
        appointmentAt: new Date(`${args.date}T${args.time}`).toISOString(),
        contactName: 'E2E trùng lịch',
        contactPhone: '0900000000',
        quantity: args.quantity,
      });
      return `Đã tạo đơn ${booking.code}`;
    } catch (error) {
      return error.message;
    }
  }, { slug, date, time, quantity });
}

test('nhà hàng: nhập số bàn → tổng & 3 đợt tính theo bàn → đơn đúng tổng; ngày đó kín sảnh thì bị chặn', async ({ browser }) => {
  requireAccounts('bride');
  test.setTimeout(90_000);
  const bride = await openAs(browser, 'bride');

  // ---- 1. Hộp thoại có ô "Số bàn", tổng tiền tính lại ngay khi gõ ----
  let dialog = await openGeneralBooking(bride, VENUE);
  const unit = Number(await dialog.locator('[data-unit-price]').getAttribute('data-unit-price'));
  expect(unit, 'Nhà hàng mẫu vẫn ghi giá trọn gói – database test chưa chạy SQL 30?').toBeLessThan(20_000_000);
  const tables = dialog.getByLabel('Số bàn');
  const total = dialog.locator('[data-total]');

  await tables.fill('2');                                           // dưới mức tối thiểu (đặt chung: 5–300 bàn)
  await expect(total).toContainText('Nhà hàng nhận từ 5 đến 300 bàn');
  await tables.fill('25');
  const sum = unit * 25;
  await expect(total).toContainText(`25 bàn × ${money(unit)} = ${money(sum)}`);
  await expect(total).toContainText(money(Math.round(sum * 0.3)));  // đợt 1 – cọc 30%
  await expect(total).toContainText(money(Math.round(sum * 0.5)));  // đợt 2 – 50%

  // ---- 2. Chọn ngày còn sảnh → đặt → đơn đúng tổng = giá mỗi bàn × số bàn (server tự nhân) ----
  const slot = await pickFreeSlot(bride);
  const slots = dialog.locator('[data-slots]');
  await expect(slots).toContainText(/Ngày này nhà hàng còn \d+\/\d+ sảnh trống\./);
  const [, hallsLeft] = (await slots.textContent()).match(/còn (\d+)\/\d+ sảnh/).map(Number);
  await dialog.getByLabel('Số điện thoại').fill('0900000000');
  await dialog.getByRole('button', { name: 'Xác nhận đặt lịch' }).click();
  await expect(bride).toHaveURL(/bookings\.html\?new=BK/);
  const code = new URL(bride.url()).searchParams.get('new');
  const order = bride.locator('article[data-booking]', { hasText: code });
  await expect(order).toContainText(`Tổng ${money(sum)}`);
  await expect(order.locator('.milestone').nth(0)).toContainText(money(Math.round(sum * 0.3)));

  // Các sảnh còn lại của ngày đó: đặt thẳng qua database cho nhanh (mỗi sảnh 1 tiệc/ngày)
  for (let i = 1; i < hallsLeft; i++) {
    expect(await bookDirectly(bride, { slug: VENUE, date: slot.date, time: '11:00', quantity: 20 })).toMatch(/^Đã tạo đơn BK/);
  }

  // ---- 3. Đặt tiếp đúng ngày đó: hộp thoại báo kín sảnh và không cho gửi ----
  dialog = await openGeneralBooking(bride, VENUE);
  await dialog.locator('input[name=date]').fill(slot.date);
  const slotsAgain = dialog.locator('[data-slots]');
  await expect(slotsAgain).toHaveAttribute('data-state', 'taken');
  await expect(slotsAgain).toContainText('Ngày này nhà hàng đã kín sảnh – bạn chọn ngày khác nhé.');
  await dialog.getByLabel('Số điện thoại').fill('0900000000');
  await dialog.getByRole('button', { name: 'Xác nhận đặt lịch' }).click();
  await expect(dialog).toBeVisible();
  await expect(bride).toHaveURL(/vendor\.html/);

  // ---- 4. Database cũng tự chặn khi bỏ qua giao diện ----
  expect(await bookDirectly(bride, { slug: VENUE, date: slot.date, time: '11:00', quantity: 25 }))
    .toBe('Ngày này nhà hàng đã kín sảnh – bạn chọn ngày khác nhé');
  // nhà hàng bắt buộc có số bàn
  expect(await bookDirectly(bride, { slug: VENUE, date: slot.date, time: '11:00' }))
    .toBe('Bạn nhập số bàn dự kiến giúp nhà hàng nhé');
});

test('tiệm thường: hộp thoại hiện giờ đã có lịch, đặt sát dưới 2 tiếng bị chặn (cả giao diện lẫn database)', async ({ browser }) => {
  requireAccounts('bride');
  test.setTimeout(90_000);
  const bride = await openAs(browser, 'bride');

  // ---- 1. Đặt 1 lịch ở giờ ngẫu nhiên ----
  let dialog = await openGeneralBooking(bride, SHOP);
  await expect(dialog.getByLabel('Số bàn')).toHaveCount(0);           // chỉ nhà hàng mới hỏi số bàn
  const slot = await pickFreeSlot(bride);
  await dialog.getByLabel('Số điện thoại').fill('0900000000');
  await dialog.getByRole('button', { name: 'Xác nhận đặt lịch' }).click();
  await expect(bride).toHaveURL(/bookings\.html\?new=BK/);

  // ---- 2. Mở lại, chọn đúng ngày đó: thấy giờ đã có lịch; chọn sát 1 tiếng → báo trùng + gợi ý giờ trống ----
  dialog = await openGeneralBooking(bride, SHOP);
  const slots = dialog.locator('[data-slots]');
  const near = addMinutes(slot.time, 60);
  await dialog.locator('input[name=date]').fill(slot.date);
  await dialog.locator('input[name=time]').fill(near);
  await expect(slots).toHaveAttribute('data-state', 'taken');
  await expect(slots).toContainText('Giờ đã có lịch hôm đó:');
  await expect(slots).toContainText(slot.time);
  await expect(slots).toContainText('chọn cách ít nhất 2 tiếng');
  await expect(slots).toContainText(`${near} sát lịch ${slot.time}`);

  // nút xác nhận bị chặn – vẫn ở trang tiệm, hộp thoại còn mở
  await dialog.getByLabel('Số điện thoại').fill('0900000000');
  await dialog.getByRole('button', { name: 'Xác nhận đặt lịch' }).click();
  await expect(dialog).toBeVisible();
  await expect(bride).toHaveURL(/vendor\.html/);

  // bấm giờ gợi ý → hết trùng
  await slots.getByRole('button', { name: /^Chọn \d\d:\d\d/ }).click();
  await expect(slots).toHaveAttribute('data-state', 'free');
  await expect(slots.locator('.field-error')).toHaveCount(0);

  // cách đúng 2 tiếng là được
  await dialog.locator('input[name=time]').fill(addMinutes(slot.time, 120));
  await expect(slots).toHaveAttribute('data-state', 'free');

  // ---- 3. Database cũng tự chặn khi bỏ qua giao diện ----
  expect(await bookDirectly(bride, { slug: SHOP, date: slot.date, time: near }))
    .toBe('Khung giờ này tiệm đã có lịch – bạn chọn giờ khác (cách ít nhất 2 tiếng) nhé');
  // giờ đã qua cũng bị chặn
  expect(await bookDirectly(bride, { slug: SHOP, date: '2020-01-01', time: '09:00' }))
    .toBe('Giờ hẹn này đã qua – bạn chọn một thời điểm sắp tới nhé');
});
