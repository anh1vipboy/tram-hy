// Thiệp cưới: cô dâu soạn thiệp (mẫu, gia đình, nhiều sự kiện, mừng cưới 2 bên, câu hỏi) → khách mời (không đăng nhập)
// mở link riêng, mở phong bì, chọn sự kiện sẽ dự, trả lời câu hỏi → cô dâu thấy số khách theo từng sự kiện (realtime).
// Bảo mật (SQL 25): không đọc / ghi thẳng bảng qua API được; thiệp khóa mật khẩu.
const { test, expect, openAs, requireAccounts } = require('../helpers');

const pathOf = (link) => link.replace(/^https?:\/\/[^/]+/, '');

// Khách mở link → phong bì → chạm con dấu → thiệp + form phản hồi
async function openEnvelope(guest) {
  await guest.getByRole('button', { name: 'Mở thiệp cưới' }).click();
  await expect(guest.locator('#rsvp-section')).toBeVisible({ timeout: 10_000 });
}

async function openEditor(bride) {
  await bride.goto('/invitation.html');
  await expect(bride.locator('.inv-step').first()).toBeVisible({ timeout: 30_000 });
}

// Thanh mục: mỗi lần chỉ hiện 1 mục → bấm đúng mục trước khi điền
async function step(bride, n) {
  await bride.locator(`.inv-step[data-step="${n}"]`).click();
  await expect(bride.locator(`[data-section="${n}"]`)).toBeVisible();
}

async function save(bride) {
  await bride.locator('#editor').getByRole('button', { name: /Tạo thiệp|Lưu thiệp/ }).click();
  await expect(bride.locator('.toast-success', { hasText: 'Đã lưu thiệp.' })).toBeVisible();
}

// Xóa hết các dòng trong 1 danh sách (sự kiện / câu hỏi) để test bắt đầu sạch
async function clearList(box, name) {
  while (await box.getByRole('button', { name }).count()) await box.getByRole('button', { name }).first().click();
}

async function addEvent(bride, preset, { at, place, address, main = false }) {
  const box = bride.locator('#events-edit');
  await box.getByRole('button', { name: `＋ ${preset}` }).click();
  const card = box.locator('.event-edit').last();
  await card.locator('[data-ev-field="at"]').fill(at);
  await card.locator('[data-ev-field="place"]').fill(place);
  await card.locator('[data-ev-field="address"]').fill(address);
  if (main) await card.getByLabel(/Tiệc chính/).check();
}

test('soạn thiệp nhiều sự kiện + mừng cưới 2 bên + câu hỏi → khách chọn sự kiện, trả lời → cô dâu thấy theo từng sự kiện', async ({ browser }) => {
  requireAccounts('bride');
  test.setTimeout(120_000);
  const bride = await openAs(browser, 'bride');
  await openEditor(bride);

  await step(bride, 1);
  await bride.getByRole('radio', { name: /Đỏ hỷ truyền thống/ }).click();
  await step(bride, 2);
  // Ảnh trang 3: mặc định dùng chung ảnh bìa; bỏ chọn thì hiện ô chọn ảnh thứ 2
  const photo2 = bride.locator('[data-slot="photo2_url"]');
  await bride.getByLabel(/Dùng ảnh bìa cho cả trang tiệc cưới/).uncheck();
  await expect(photo2).toBeVisible();
  await bride.getByLabel(/Dùng ảnh bìa cho cả trang tiệc cưới/).check();
  await expect(photo2).toBeHidden();
  await bride.getByLabel('Họ tên chú rể').fill('Minh Quân');
  await bride.getByLabel('Họ tên cô dâu').fill('Khánh Linh');
  await step(bride, 3);
  await bride.getByLabel('Bố chú rể').fill('Nguyễn Văn Bình');
  await bride.getByLabel('Mẹ chú rể').fill('Lê Thị Mai');

  // Lễ & tiệc: lễ vu quy (trang 2), tiệc nhà gái, tiệc nhà trai (tiệc chính – trang 3)
  await step(bride, 4);
  await clearList(bride.locator('#events-edit'), /^Xóa /);
  await addEvent(bride, 'Lễ vu quy', { at: '2026-12-19T09:00', place: 'Tư gia nhà gái', address: 'Số 8 Bạch Đằng, Đà Nẵng' });
  await addEvent(bride, 'Tiệc nhà gái', { at: '2026-12-19T17:30', place: 'Nhà hàng Hoa Sen', address: 'Số 20 Trần Phú, Đà Nẵng' });
  await addEvent(bride, 'Tiệc nhà trai', { at: '2026-12-20T11:00', place: 'Trung tâm tiệc cưới E2E', address: 'Số 1 Tràng Tiền, Hà Nội', main: true });

  // Mừng cưới 2 bên
  await step(bride, 6);
  await bride.locator('[name=gift_groom_account]').fill('19036789999');
  await bride.locator('[name=gift_groom_holder]').fill('Nguyen Minh Quan');
  await bride.locator('[name=gift_bride_account]').fill('0123456789');
  await bride.locator('[name=gift_bride_holder]').fill('Tran Khanh Linh');

  // Câu hỏi bắt buộc khi xác nhận
  await step(bride, 11);
  const qs = bride.locator('#questions-edit');
  await clearList(qs, 'Xóa câu hỏi');
  await qs.getByRole('button', { name: '＋ Bạn có ăn chay không?' }).click();
  await qs.getByLabel('Bắt buộc trả lời').check();

  // Xem trước: trang 2 = lễ đầu tiên, trang 3 = tiệc chính, có âm lịch
  const preview = bride.locator('#preview');
  await expect(preview.locator('.inv')).toHaveClass(/inv-song-hy/);
  await expect(preview.locator('.inv-p2')).toContainText('Ông: Nguyễn Văn Bình');
  await expect(preview.locator('.inv-p2')).toContainText('09 giờ 00 | Thứ bảy | 19.12.2026');
  await expect(preview.locator('.inv-p2')).toContainText('Tại Tư gia nhà gái');
  await expect(preview.locator('.inv-p3')).toContainText('11 giờ 00 | Chủ nhật | 20.12.2026');
  await expect(preview.locator('.inv-p3')).toContainText('Nhằm ngày 12 tháng 11 năm Bính Ngọ');
  await save(bride);

  const link = await bride.locator('#share input').first().inputValue();
  expect(link).toMatch(/invitation\.html\?i=/);

  // Khách mời: chưa đăng nhập, mở link mời riêng có tên
  const guestName = `Khách E2E ${Date.now()}`;
  const guest = await openAs(browser, null);
  await guest.goto(`${pathOf(link)}&to=${encodeURIComponent(guestName)}`);
  await expect(guest.locator('.envelope-name')).toHaveText(guestName);
  await openEnvelope(guest);
  await expect(guest.locator('.inv-p1 .inv-guest')).toHaveText(guestName);
  await expect(guest.getByRole('link', { name: /Chỉ đường đến tiệc/ })).toHaveAttribute('href', /maps\/search.*Tr%C3%A0ng%20Ti%E1%BB%81n/);
  await expect(guest.locator('.event-card')).toHaveCount(3);                         // lịch cưới đủ 3 sự kiện
  await expect(guest.locator('.gift-card')).toHaveCount(2);                          // mừng cưới 2 bên
  await expect(guest.locator('.gift-card').nth(1)).toContainText('TRAN KHANH LINH');

  const rsvp = guest.locator('#rsvp-form');
  await expect(rsvp.getByLabel('Tên của bạn')).toHaveValue(guestName);
  await rsvp.getByLabel(/Lễ vu quy/).uncheck();
  await rsvp.getByLabel(/Tiệc nhà trai/).uncheck();                                   // chỉ dự tiệc nhà gái
  await rsvp.getByLabel('Số người đi cùng (tính cả bạn)').fill('2');
  await rsvp.getByRole('button', { name: 'Gửi phản hồi' }).click();
  await expect(guest.locator('.toast-error')).toContainText('Vui lòng trả lời: Bạn có ăn chay không?');
  await rsvp.locator('.rsvp-choice', { hasText: 'Có, ăn chay' }).click();
  await rsvp.getByRole('button', { name: 'Gửi phản hồi' }).click();
  await expect(guest.getByText(`Cảm ơn ${guestName}!`)).toBeVisible();

  // Cô dâu: phản hồi tự hiện (realtime), có số khách theo từng sự kiện và thống kê câu trả lời
  await expect(bride.locator('.toast-success', { hasText: `${guestName} vừa phản hồi` })).toBeVisible({ timeout: 15_000 });
  const panel = bride.locator('#rsvps');
  await expect(panel).toContainText(guestName);
  await expect(panel.locator('.rsvp-item', { hasText: guestName })).toContainText('Tiệc nhà gái');
  await expect(panel.locator('.rsvp-item', { hasText: guestName })).toContainText('Có, ăn chay');
  await expect(panel.locator('.rsvp-breakdown li', { hasText: 'Tiệc nhà gái' })).toContainText('khách');
});

test('chống spam phản hồi thiệp: trùng tên bị chặn, bot điền ô bẫy không gửi được, lời nhắn không chứa link', async ({ browser }) => {
  requireAccounts('bride');
  const bride = await openAs(browser, 'bride');
  await openEditor(bride);
  const path = pathOf(await bride.locator('#share input').first().inputValue());   // thiệp tạo ở bài trước
  const guest = await openAs(browser, null);
  const name = `Khách chống spam ${Date.now()}`;
  const rsvp = guest.locator('#rsvp-form');
  const send = async (guestName, message = '') => {
    await rsvp.getByLabel('Tên của bạn').fill(guestName);
    const choice = rsvp.locator('.rsvp-choice').first();                           // câu hỏi bắt buộc (nếu có)
    if (await choice.count()) await choice.click();
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

  await send(name.toUpperCase());                                                     // trùng tên (khác hoa/thường)
  await expect(guest.locator('.toast-error')).toContainText('đã gửi phản hồi cho thiệp này rồi');

  await send(`${name} 2`, 'Xem quà tại https://spam.example');                        // lời nhắn chứa link
  await expect(guest.locator('.toast-error').last()).toContainText('không được chứa đường link');

  let requests = 0;
  guest.on('request', (r) => { if (r.url().includes('/rpc/submit_rsvp') && r.method() === 'POST') requests += 1; });
  await rsvp.locator('[name=website]').fill('http://bot.example', { force: true });   // bot điền ô bẫy
  await send(`${name} bot`);
  await expect(guest.getByText('Cảm ơn bạn!')).toBeVisible();
  expect(requests).toBe(0);                                                          // không gửi gì lên server
});

test('sổ lời chúc: gửi → chờ duyệt → duyệt + cô dâu trả lời → hiện trên thiệp; chuyện tình yêu, video, phù dâu phù rể, nhạc, hiệu ứng', async ({ browser }) => {
  requireAccounts('bride');
  test.setTimeout(120_000);
  const bride = await openAs(browser, 'bride');
  await openEditor(bride);

  const editor = bride.locator('#editor');
  await step(bride, 9);
  await clearList(editor, 'Xóa cột mốc');
  await editor.getByRole('button', { name: '＋ Thêm cột mốc' }).click();
  await editor.getByLabel('Thời gian', { exact: true }).last().fill('Mùa thu 2020');
  await editor.getByLabel('Tiêu đề').fill('Lần đầu gặp nhau');
  await editor.getByLabel('Kể ngắn').fill('Ở quán cà phê nhỏ gần trường.');
  await step(bride, 5);
  await editor.getByLabel(/Phù rể/).fill('Nguyễn Văn An\nTrần Văn Bảo');
  await editor.getByLabel(/Phù dâu/).fill('Lê Thị Cúc');
  await step(bride, 8);
  await editor.getByLabel(/Link YouTube \(pre-wedding/).fill('https://youtu.be/dQw4w9WgXcQ');
  await step(bride, 10);
  await editor.getByRole('radio', { name: /Canon in D/ }).check();
  await editor.locator('.effect-picker .chip', { hasText: 'Cánh hoa' }).click();
  await save(bride);
  const link = pathOf(await bride.locator('#share input').first().inputValue());

  const wish = `Chúc hai bạn hạnh phúc E2E ${Date.now()}`;
  const guest = await openAs(browser, null);
  await guest.goto(link);
  await openEnvelope(guest);
  await expect(guest.getByRole('button', { name: 'Tắt nhạc nền' })).toBeVisible();   // nhạc bật khi mở phong bì
  await expect(guest.locator('.wedding-effect.effect-petals')).toHaveCount(1);       // hiệu ứng cánh hoa
  await expect(guest.locator('.story-timeline')).toContainText('Lần đầu gặp nhau');
  await expect(guest.locator('.inv-crew')).toContainText('Trần Văn Bảo');
  await guest.getByRole('button', { name: 'Phát video cưới' }).click();             // video chỉ tải khi bấm
  await expect(guest.locator('#video-box iframe')).toHaveAttribute('src', /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
  await expect(guest.getByRole('button', { name: 'Bật nhạc nền' })).toBeVisible();   // nhạc nền tự dừng khi xem video

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

  // Cô dâu: lời chúc mới tự hiện ở "Chờ duyệt" → duyệt + trả lời
  const book = bride.locator('#guestbook');
  const item = book.locator('.wish-item', { hasText: wish });
  await expect(item).toBeVisible({ timeout: 15_000 });
  await item.getByRole('button', { name: '✓ Duyệt' }).click();
  await expect(bride.locator('.toast-success', { hasText: 'Đã duyệt' })).toBeVisible();
  await book.getByRole('button', { name: /Đã duyệt/ }).click();
  const approved = book.locator('.wish-item', { hasText: wish });
  await approved.locator('summary', { hasText: 'Trả lời lời chúc' }).click();
  await approved.locator('[data-reply-text]').fill('Cảm ơn bạn thân nhé!');
  await approved.getByRole('button', { name: 'Lưu trả lời' }).click();
  await expect(bride.locator('.toast-success', { hasText: 'Đã lưu lời trả lời' })).toBeVisible();

  await other.reload();
  await openEnvelope(other);
  const shown = other.locator('.wish-card', { hasText: wish });
  await expect(shown).toBeVisible();
  await expect(shown).toContainText('Cô dâu chú rể: Cảm ơn bạn thân nhé!');

  // Dọn: xóa lời chúc vừa tạo
  await book.locator('.wish-item', { hasText: wish }).getByRole('button', { name: 'Xóa', exact: true }).click();
  await expect(book.locator('.wish-item', { hasText: wish })).toHaveCount(0);
});

test('bảo mật: không đọc / ghi thẳng bảng thiệp qua API; khóa mật khẩu; đếm lượt xem', async ({ browser }) => {
  requireAccounts('bride');
  test.setTimeout(120_000);
  const url = process.env.TEST_SUPABASE_URL;
  const key = process.env.TEST_SUPABASE_KEY;
  test.skip(!url || !key, 'Cần TEST_SUPABASE_URL / TEST_SUPABASE_KEY');
  const api = (path, init = {}) => fetch(`${url}${path}`, {
    ...init, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...init.headers },
  });

  // Người lạ (chỉ có khóa công khai) không liệt kê được thiệp, không chèn thẳng phản hồi / lời chúc
  const list = await api('/rest/v1/invitations?select=slug,details&limit=5');
  expect(await list.json()).toEqual([]);
  const directRsvp = await api('/rest/v1/rsvps', { method: 'POST', body: JSON.stringify({ invitation_id: '00000000-0000-0000-0000-000000000000', guest_name: 'Hacker', attending: true }) });
  expect(directRsvp.ok).toBe(false);
  const directWish = await api('/rest/v1/guestbook_entries', { method: 'POST', body: JSON.stringify({ invitation_id: '00000000-0000-0000-0000-000000000000', guest_name: 'Hacker', message: 'spam' }) });
  expect(directWish.ok).toBe(false);
  const wrongLink = await api('/rest/v1/rpc/open_invitation', { method: 'POST', body: JSON.stringify({ p_slug: 'khongcothiepnay', p_password: null }) });
  expect((await wrongLink.json()).status).toBe('not_found');

  // Khóa thiệp bằng mật khẩu
  const bride = await openAs(browser, 'bride');
  await openEditor(bride);
  await step(bride, 12);
  await bride.locator('#lock-toggle').check();
  await bride.locator('#lock-password').fill('matkhau-e2e');
  await save(bride);
  await expect(bride.locator('.share-box')).toContainText('Thiệp đang khóa bằng mật khẩu');
  const link = pathOf(await bride.locator('#share input').first().inputValue());
  const slug = new URL(link, 'http://x').searchParams.get('i');
  const leak = await api('/rest/v1/rpc/open_invitation', { method: 'POST', body: JSON.stringify({ p_slug: slug, p_password: null }) });
  const leakBody = await leak.json();
  expect(leakBody.status).toBe('locked');
  expect(leakBody.invitation.details).toBeUndefined();                              // chưa có mật khẩu: không lộ địa chỉ, tên bố mẹ

  const guest = await openAs(browser, null);
  await guest.goto(link);
  const lock = guest.locator('.inv-lock');
  await expect(lock).toContainText('Thiệp được bảo vệ');
  await lock.getByLabel('Mật khẩu thiệp').fill('sai-mat-khau');
  await lock.getByRole('button', { name: 'Mở thiệp' }).click();
  await expect(lock).toContainText('Mật khẩu chưa đúng');
  await lock.getByLabel('Mật khẩu thiệp').fill('matkhau-e2e');
  await lock.getByRole('button', { name: 'Mở thiệp' }).click();
  await openEnvelope(guest);
  await guest.reload();                                                              // nhớ mật khẩu trong phiên
  await expect(guest.getByRole('button', { name: 'Mở thiệp cưới' })).toBeVisible({ timeout: 15_000 });

  // Lượt xem: chủ thiệp thấy số lượt mở (khách vừa mở 2 lần)
  await bride.reload();
  await expect(bride.locator('#inv-stats')).toContainText('lượt mở', { timeout: 15_000 });

  // Dọn: bỏ khóa → khách mở thẳng không cần mật khẩu
  await openEditor(bride);
  await step(bride, 12);
  await bride.locator('#lock-toggle').uncheck();
  await save(bride);
  const fresh = await openAs(browser, null);
  await fresh.goto(link);
  await expect(fresh.getByRole('button', { name: 'Mở thiệp cưới' })).toBeVisible({ timeout: 15_000 });
});

test('trình soạn: thanh mục chỉ hiện 1 mục, Trước / Tiếp; Xem thử mở thiệp y như khách thấy kể cả thay đổi chưa lưu', async ({ browser }) => {
  requireAccounts('bride');
  test.setTimeout(90_000);
  const bride = await openAs(browser, 'bride');
  await openEditor(bride);
  await expect(bride.locator('.inv-step')).toHaveCount(12);
  await step(bride, 1);
  await expect(bride.locator('[data-section]:not([hidden])')).toHaveCount(1);       // mỗi lần 1 mục
  await bride.getByRole('button', { name: 'Tiếp: Cô dâu chú rể →' }).click();
  await expect(bride.locator('[data-section="2"]')).toBeVisible();
  await expect(bride.locator('[data-section="1"]')).toBeHidden();
  await expect(bride.locator('.inv-step.active')).toContainText('Cô dâu chú rể');

  // Đổi tên (chưa lưu) → Xem thử thấy ngay
  await bride.getByLabel('Họ tên chú rể').fill('Chú Rể Xem Thử');
  const [preview] = await Promise.all([
    bride.waitForEvent('popup'),
    bride.locator('.inv-toolbar').getByRole('button', { name: '👁 Xem thử' }).click(),
  ]);
  await expect(preview.locator('.preview-banner')).toContainText('Bản xem thử');
  await preview.getByRole('button', { name: 'Mở thiệp cưới' }).click();
  await expect(preview.locator('.inv-p1 .inv-cover-names')).toContainText('Thử');
  await preview.locator('#rsvp-form').getByLabel('Tên của bạn').fill('Khách thử');
  const choice = preview.locator('#rsvp-form .rsvp-choice').first();
  if (await choice.count()) await choice.click();
  await preview.locator('#rsvp-form').getByRole('button', { name: 'Gửi phản hồi' }).click();
  await expect(preview.locator('.toast')).toContainText('bản xem thử – phản hồi không được gửi');
});
