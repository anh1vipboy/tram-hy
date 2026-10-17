// Mở lại Phòng thử: các lần ướm đã lưu (bảng tryon_jobs, SQL 28) hiện lại thành đoạn chat – ảnh người, ảnh váy,
// tin nhắn đã gửi và ảnh kết quả. Dữ liệu tryon_jobs + link ảnh riêng tư được giả lập (database test không có
// Edge Function thật để tạo ảnh).
const path = require('node:path');
const { test, expect, openAs, requireAccounts } = require('../helpers');

const IMAGE = path.resolve(__dirname, '../../../frontend/assets/images/bride_3_tryon_satin.jpg');

async function dressWithPhoto() {
  const res = await fetch(`${process.env.TEST_SUPABASE_URL}/rest/v1/dresses?select=id,name&is_active=eq.true&image_url=not.is.null&limit=1`, {
    headers: { apikey: process.env.TEST_SUPABASE_KEY },
  });
  return (await res.json())[0];
}

test('các lần ướm đã lưu hiện lại thành tin nhắn khi mở lại trang', async ({ browser }) => {
  requireAccounts('bride');
  const dress = await dressWithPhoto();
  test.skip(!dress, 'Database test chưa có mẫu váy nào có ảnh thật');
  const bride = await openAs(browser, 'bride');

  // Mới nhất trước – lần 1 (cũ): ảnh của bạn + váy tự tải, có tin nhắn; lần 2 (mới): người mẫu + mẫu của tiệm, 2 ảnh
  const rows = [
    { id: 'j3', batch_id: 'b2', result_path: 'u/r3.jpg', dress_id: dress.id, garment_path: null, message: null,
      options: { model: 'max', person: 'sample:bride2' }, created_at: '2026-10-18T03:00:02Z' },
    { id: 'j2', batch_id: 'b2', result_path: 'u/r2.jpg', dress_id: dress.id, garment_path: null, message: null,
      options: { model: 'max', person: 'sample:bride2' }, created_at: '2026-10-18T03:00:01Z' },
    { id: 'j1', batch_id: 'b1', result_path: 'u/r1.jpg', dress_id: null, garment_path: 'u/garment-1.jpg', message: 'tà váy dài chạm đất',
      options: { model: 'standard', person: 'u/body-1.jpg' }, created_at: '2026-10-17T09:30:00Z' },
  ];
  await bride.route('**/rest/v1/tryon_jobs*', (route) => {
    const url = route.request().url();
    const body = url.includes('result_path') ? rows : [];          // còn lại: đếm credit hôm nay
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  // Link tạm cho file riêng tư: trả link giả cho mọi đường dẫn, mở link đó thì trả ảnh mẫu trong máy
  await bride.route('**/storage/v1/object/sign/**', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ path: IMAGE, contentType: 'image/jpeg' });
    const bucket = new URL(route.request().url()).pathname.split('/').pop();
    const { paths } = route.request().postDataJSON();
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify(paths.map((p) => ({ path: p, signedURL: `/object/sign/${bucket}/${p}?token=t`, error: null }))),
    });
  });

  await bride.goto('/tryon.html');
  const history = bride.locator('.chat-history');
  await expect(history.locator('.msg-row.user')).toHaveCount(2, { timeout: 30_000 });
  await expect(bride.getByText('Chào bạn quay lại!')).toBeVisible();

  // Lần cũ ở trên: ảnh của bạn + váy tự tải + tin nhắn, 1 ảnh kết quả
  const first = history.locator('.msg-row.user').first();
  await expect(first.locator('figcaption')).toHaveText(['Ảnh của bạn', 'Váy bạn tải lên']);
  await expect(first.locator('.msg-bubble')).toHaveText('tà váy dài chạm đất');
  await expect(history.locator('.gen').first().locator('.gen-meta')).toHaveText('Tiêu chuẩn');

  // Lần mới ở dưới: người mẫu + mẫu của tiệm, 2 ảnh kết quả theo đúng thứ tự
  const second = history.locator('.msg-row.user').nth(1);
  await expect(second.locator('figcaption')).toHaveText(['Dâu Kim', dress.name]);
  const gen = history.locator('.gen').nth(1);
  await expect(gen.locator('.gen-meta')).toHaveText('Siêu nét · 2 ảnh');
  await expect(gen.locator('.gen-thumbs button')).toHaveCount(2);
  await expect(gen.locator('.gen-main')).toHaveAttribute('src', /tryon-results\/u\/r2\.jpg/);
  await expect(bride.locator('#history-more')).toHaveCount(0);       // ít hơn 1 trang → không có "xem thêm"
  await bride.context().close();
});
