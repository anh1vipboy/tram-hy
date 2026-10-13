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
  // Ảnh trang 3: mặc định dùng chung ảnh bìa; bỏ chọn thì hiện ô chọn ảnh thứ 2
  const photo2 = bride.locator('[data-slot="photo2_url"]');
  await bride.getByLabel(/Dùng ảnh bìa cho cả trang tiệc cưới/).uncheck();
  await expect(photo2).toBeVisible();
  await expect(photo2).toContainText('Ảnh trang tiệc cưới (trang 3)');
  await bride.getByLabel(/Dùng ảnh bìa cho cả trang tiệc cưới/).check();
  await expect(photo2).toBeHidden();
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
  const rsvp = guest.locator('#rsvp-form');
  await expect(rsvp.getByLabel('Tên của bạn')).toHaveValue(guestName);
  await rsvp.getByLabel('Số người đi cùng (tính cả bạn)').fill('2');
  await rsvp.getByLabel(/Lời nhắn riêng/).fill('Mình đi cùng vợ nhé');
  await rsvp.getByRole('button', { name: 'Gửi phản hồi' }).click();
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
  const rsvp = guest.locator('#rsvp-form');
  const send = async (guestName, message = '') => {
    await rsvp.getByLabel('Tên của bạn').fill(guestName);
    await rsvp.getByLabel(/Lời nhắn riêng/).fill(message);
    await rsvp.getByRole('button', { name: 'Gửi phản hồi' }).click();
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
  await rsvp.locator('[name=website]').fill('http://bot.example', { force: true });   // bot điền ô bẫy
  await send(`${name} bot`);
  await expect(guest.getByText('Cảm ơn bạn!')).toBeVisible();
  expect(requests).toBe(0);                                          // không gửi gì lên server
});


test('sổ lời chúc: khách gửi → chờ duyệt (khách khác chưa thấy) → cô dâu duyệt → hiện trên thiệp; album, chuyện tình yêu, nhạc', async ({ browser }) => {
  requireAccounts('bride');
  test.setTimeout(120_000);
  const bride = await openAs(browser, 'bride');
  await bride.goto('/invitation.html');
  await expect(bride.locator('#share input').first()).toBeVisible({ timeout: 20_000 });

  // Thêm chuyện tình yêu + chọn nhạc hộp nhạc rồi lưu
  const editor = bride.locator('#editor');
  while (await editor.getByRole('button', { name: 'Xóa cột mốc' }).count()) await editor.getByRole('button', { name: 'Xóa cột mốc' }).first().click();
  await editor.getByRole('button', { name: '＋ Thêm cột mốc' }).click();
  await editor.getByLabel('Thời gian').fill('Mùa thu 2020');
  await editor.getByLabel('Tiêu đề').fill('Lần đầu gặp nhau');
  await editor.getByLabel('Kể ngắn').fill('Ở quán cà phê nhỏ gần trường.');
  await editor.getByRole('radio', { name: /Canon in D/ }).check();
  await editor.getByRole('button', { name: /Lưu thiệp/ }).click();
  await expect(bride.locator('.toast-success', { hasText: 'Đã lưu thiệp.' })).toBeVisible();
  const link = (await bride.locator('#share input').first().inputValue()).replace(/^https?:\/\/[^/]+/, '');

  const wish = `Chúc hai bạn hạnh phúc E2E ${Date.now()}`;
  const guest = await openAs(browser, null);
  await guest.goto(link);
  await openEnvelope(guest);
  await expect(guest.getByRole('button', { name: 'Tắt nhạc nền' })).toBeVisible();            // nhạc bật khi mở phong bì
  await expect(guest.locator('.story-timeline')).toContainText('Lần đầu gặp nhau');
  await guest.getByRole('button', { name: '💬 Gửi lời chúc' }).click();
  const form = guest.locator('#wish-form');
  await expect(form.getByLabel('Lời chúc')).toBeFocused();
  await form.getByLabel('Tên của bạn').fill('Bạn thân E2E');
  await form.getByLabel('Lời chúc').fill(wish);
  await form.getByRole('button', { name: 'Gửi lời chúc' }).click();
  await expect(guest.getByText('Cảm ơn lời chúc của bạn!')).toBeVisible();

  // Chưa duyệt → khách khác chưa thấy
  const other = await openAs(browser, null);
  await other.goto(link);
  await openEnvelope(other);
  await expect(other.locator('#wish-list')).not.toContainText(wish);

  // Cô dâu: lời chúc mới tự hiện ở "Chờ duyệt" → duyệt
  const book = bride.locator('#guestbook');
  const item = book.locator('.wish-item', { hasText: wish });
  await expect(item).toBeVisible({ timeout: 15_000 });
  await item.getByRole('button', { name: '✓ Duyệt' }).click();
  await expect(bride.locator('.toast-success', { hasText: 'Đã duyệt' })).toBeVisible();

  await other.reload();
  await openEnvelope(other);
  await expect(other.locator('#wish-list')).toContainText(wish);

  // Dọn: xóa lời chúc vừa tạo
  await book.getByRole('button', { name: /Đã duyệt/ }).click();
  await book.locator('.wish-item', { hasText: wish }).getByRole('button', { name: 'Xóa' }).click();
  await expect(book.locator('.wish-item', { hasText: wish })).toHaveCount(0);
});
