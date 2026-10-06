// Thiệp cưới: cô dâu tạo/sửa thiệp → khách mời (không đăng nhập) mở link gửi RSVP → cô dâu thấy phản hồi
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
  await expect(guest.getByText('Cảm ơn bạn!')).toBeVisible();

  // Cô dâu thấy phản hồi
  await bride.reload();
  await expect(bride.locator('#rsvps')).toContainText(guestName);
  await expect(bride.locator('#rsvps')).toContainText('đến (2 người)');
});
