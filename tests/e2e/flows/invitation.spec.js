// Thiệp cưới: cô dâu tạo/sửa thiệp → khách mời (không đăng nhập) mở link gửi RSVP → cô dâu thấy phản hồi ngay (realtime)
const { test, expect, openAs, requireAccounts } = require('../helpers');

test('tạo thiệp → khách gửi phản hồi qua link → cô dâu thấy số khách', async ({ browser }) => {
  requireAccounts('bride');
  const bride = await openAs(browser, 'bride');
  await bride.goto('/invitation.html');

  await bride.getByLabel('Tên chú rể').fill('Minh Quân');
  await bride.getByLabel('Tên cô dâu').fill('Khánh Linh');
  await bride.getByLabel('Thời gian').fill('2026-12-20T11:00');
  await bride.getByLabel('Địa điểm').fill('Trung tâm tiệc cưới E2E, Hà Nội');
  await bride.getByLabel('Số tài khoản').fill('19036789999');
  await expect(bride.locator('#preview .names')).toHaveText('Minh Quân & Khánh Linh');   // xem trước cập nhật ngay
  await bride.getByRole('button', { name: /Tạo thiệp|Lưu thay đổi/ }).click();
  await expect(bride.locator('.toast-success', { hasText: 'Đã lưu thiệp.' })).toBeVisible();

  const link = await bride.locator('#share input').inputValue();
  expect(link).toMatch(/invitation\.html\?i=/);

  // Khách mời: chưa đăng nhập, mở link
  const guestName = `Khách E2E ${Date.now()}`;
  const guest = await openAs(browser, null);
  await guest.goto(link.replace(/^https?:\/\/[^/]+/, ''));     // cùng đường dẫn, chạy trên server test
  await expect(guest.locator('.invite-card .names')).toHaveText('Minh Quân & Khánh Linh');
  await guest.getByLabel('Tên của bạn').fill(guestName);
  await guest.getByLabel('Số người đi cùng (tính cả bạn)').fill('2');
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
  const link = await bride.locator('#share input').inputValue();      // thiệp tạo ở bài trước
  const path = link.replace(/^https?:\/\/[^/]+/, '');
  const guest = await openAs(browser, null);
  const name = `Khách chống spam ${Date.now()}`;
  const send = async (guestName, message = '') => {
    await guest.getByLabel('Tên của bạn').fill(guestName);
    await guest.getByLabel('Lời chúc').fill(message);
    await guest.getByRole('button', { name: 'Gửi phản hồi' }).click();
  };

  await guest.goto(path);
  await send(name);
  await expect(guest.getByText(`Cảm ơn ${name}!`)).toBeVisible();

  // Máy này đã gửi → mở lại thiệp vẫn thấy lời cảm ơn; bấm gửi cho người khác mới hiện form
  await guest.reload();
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

