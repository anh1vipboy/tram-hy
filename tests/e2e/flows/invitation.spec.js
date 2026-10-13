// Thiệp cưới: cô dâu chọn mẫu, điền gia đình & tiệc → khách mời (không đăng nhập) mở link riêng, mở phong bì, gửi RSVP
// → cô dâu thấy phản hồi ngay (realtime)
const { test, expect, openAs, requireAccounts } = require('../helpers');

// Khách mở link → phong bì → chạm con dấu → thiệp + form phản hồi
async function openEnvelope(guest) {
  await guest.getByRole('button', { name: 'Mở thiệp cưới' }).click();
  await expect(guest.locator('#rsvp-section')).toBeVisible({ timeout: 10_000 });
}

test('chọn mẫu, tạo thiệp → khách mở link riêng, mở phong bì, gửi phản hồi → cô dâu thấy số khách', async ({ browser }) => {
  requireAccounts('bride');
  const bride = await openAs(browser, 'bride');
  await bride.goto('/invitation.html');

  await bride.getByRole('radio', { name: /Đỏ hỷ truyền thống/ }).click();
  await bride.getByLabel('Họ tên chú rể').fill('Minh Quân');
  await bride.getByLabel('Họ tên cô dâu').fill('Khánh Linh');
  await bride.getByLabel('Bố chú rể').fill('Nguyễn Văn Bình');
  await bride.getByLabel('Mẹ chú rể').fill('Lê Thị Mai');
  await bride.getByLabel('Giờ đãi tiệc').fill('2026-12-20T11:00');
  await bride.getByLabel('Nhà hàng / nơi đãi tiệc').fill('Trung tâm tiệc cưới E2E');
  await bride.getByLabel('Địa chỉ nhà hàng').fill('Số 1 Tràng Tiền, Hà Nội');
  await bride.getByLabel('Số tài khoản').fill('19036789999');
  // Xem trước cập nhật ngay: đúng mẫu, đúng tên, có ngày âm lịch
  const preview = bride.locator('#preview');
  await expect(preview.locator('.inv')).toHaveClass(/inv-song-hy/);
  await expect(preview.locator('.inv-p2 .inv-fullnames')).toContainText('Minh Quân');
  await expect(preview.locator('.inv-p2')).toContainText('Ông: Nguyễn Văn Bình');
  await expect(preview.locator('.inv-p3')).toContainText('11 giờ 00 | Chủ nhật | 20.12.2026');
  await expect(preview.locator('.inv-p3')).toContainText('Nhằm ngày 12 tháng 11 năm Bính Ngọ');
  await bride.getByRole('button', { name: /Tạo thiệp|Lưu thiệp/ }).click();
  await expect(bride.locator('.toast-success', { hasText: 'Đã lưu thiệp.' })).toBeVisible();

  const link = await bride.locator('#share input').first().inputValue();
  expect(link).toMatch(/invitation\.html\?i=/);

  // Khách mời: chưa đăng nhập, mở link mời riêng có tên
  const guestName = `Khách E2E ${Date.now()}`;
  const guest = await openAs(browser, null);
  await guest.goto(`${link.replace(/^https?:\/\/[^/]+/, '')}&to=${encodeURIComponent(guestName)}`);
  await expect(guest.locator('.envelope-name')).toHaveText(guestName);
  await openEnvelope(guest);
  await expect(guest.locator('.inv-p1 .inv-cover-names')).toContainText('Quân');
  await expect(guest.locator('.inv-p1 .inv-guest')).toHaveText(guestName);
  await expect(guest.getByRole('link', { name: /Chỉ đường đến tiệc/ })).toHaveAttribute('href', /maps\/search.*Tr%C3%A0ng%20Ti%E1%BB%81n/);
  await expect(guest.getByLabel('Tên của bạn')).toHaveValue(guestName);
  await guest.getByLabel('Số người đi cùng (tính cả bạn)').fill('2');
  await guest.getByRole('button', { name: '💬 Gửi lời chúc' }).click();
  await expect(guest.getByLabel('Lời chúc')).toBeFocused();
  await guest.getByLabel('Lời chúc').fill('Chúc hai bạn trăm năm hạnh phúc!');
  await guest.getByRole('button', { name: 'Gửi phản hồi' }).click();
  await expect(guest.getByText(`Cảm ơn ${guestName}!`)).toBeVisible();

  // Cô dâu thấy phản hồi ngay, KHÔNG tải lại trang (realtime – SQL 14)
  await expect(bride.locator('.toast-success', { hasText: `${guestName} vừa phản hồi` })).toBeVisible({ timeout: 15_000 });
  await expect(bride.locator('#rsvps')).toContainText(guestName);
  await expect(bride.locator('#rsvps')).toContainText('đến (2 người)');
});

test('chống spam phản hồi thiệp: trùng tên bị chặn, bot điền ô bẫy không gửi được, lời chúc không chứa link', async ({ browser }) => {
  requireAccounts('bride');
  const bride = await openAs(browser, 'bride');
  await bride.goto('/invitation.html');
  const link = await bride.locator('#share input').first().inputValue();      // thiệp tạo ở bài trước
  const path = link.replace(/^https?:\/\/[^/]+/, '');
  const guest = await openAs(browser, null);
  const name = `Khách chống spam ${Date.now()}`;
  const send = async (guestName, message = '') => {
    await guest.getByLabel('Tên của bạn').fill(guestName);
    await guest.getByLabel('Lời chúc').fill(message);
    await guest.getByRole('button', { name: 'Gửi phản hồi' }).click();
  };

  await guest.goto(path);
  await openEnvelope(guest);
  await send(name);
  await expect(guest.getByText(`Cảm ơn ${name}!`)).toBeVisible();

  // Máy này đã gửi → mở lại thiệp vẫn thấy lời cảm ơn; bấm gửi cho người khác mới hiện form
  await guest.reload();
  await openEnvelope(guest);
  await expect(guest.getByText(`Cảm ơn ${name}!`)).toBeVisible();
  await guest.getByRole('button', { name: 'Gửi phản hồi cho người khác' }).click();

  await send(name.toUpperCase());                                     // trùng tên (khác hoa/thường)
  await expect(guest.locator('.toast-error')).toContainText('đã gửi phản hồi cho thiệp này rồi');

  await send(`${name} 2`, 'Xem quà tại https://spam.example');        // lời chúc chứa link
  await expect(guest.locator('.toast-error').last()).toContainText('không được chứa đường link');

  let requests = 0;
  guest.on('request', (r) => { if (r.url().includes('/rest/v1/rsvps') && r.method() === 'POST') requests += 1; });
  await guest.locator('[name=website]').fill('http://bot.example', { force: true });   // bot điền ô bẫy
  await send(`${name} bot`);
  await expect(guest.getByText('Cảm ơn bạn!')).toBeVisible();
  expect(requests).toBe(0);                                          // không gửi gì lên server
});

