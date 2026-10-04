// Tiện ích dùng chung cho các bài test.
// Mọi file test import { test, expect } từ đây (không import thẳng @playwright/test)
// để trang web luôn được trỏ sang project Supabase test.
const base = require('@playwright/test');

const { expect } = base;

// Trước khi trang tải: gán biến mà frontend/js/config.js đọc để dùng database test
const test = base.test.extend({
  page: async ({ page }, use) => {
    if (process.env.TEST_SUPABASE_URL) {
      await page.addInitScript(([url, key]) => {
        window.__TRAMHY_TEST_SUPABASE__ = { url, key };
      }, [process.env.TEST_SUPABASE_URL, process.env.TEST_SUPABASE_KEY]);
    }
    await use(page);
  },
});

/** Tài khoản test theo vai trò: 'bride' | 'vendor' | 'admin' (đọc từ tests/.env) */
function account(role) {
  const key = role.toUpperCase();
  return { email: process.env[`E2E_${key}_EMAIL`], password: process.env[`E2E_${key}_PASSWORD`] };
}

const authFile = (role) => `.auth/${role}.json`;

// Bỏ qua bài test (kèm lời nhắc) nếu tests/.env chưa có đủ tài khoản cho các vai trò này
function requireAccounts(...roles) {
  const missing = roles.filter((r) => !account(r).password);
  base.test.skip(missing.length > 0, `Chưa điền mật khẩu tài khoản test (${missing.join(', ')}) trong tests/.env`);
}

/**
 * Mở thêm một "người dùng" đã đăng nhập sẵn (dùng khi 1 bài test cần nhiều vai trò cùng lúc,
 * vd cô dâu trả cọc → đối tác thấy đơn). role = null → khách chưa đăng nhập.
 * Trả về page đã trỏ sang database test.
 */
async function openAs(browser, role) {
  const context = await browser.newContext({
    baseURL: process.env.BASE_URL || 'http://localhost:4173',
    storageState: role ? authFile(role) : undefined,
    locale: 'vi-VN',
  });
  if (process.env.TEST_SUPABASE_URL) {
    await context.addInitScript(([url, key]) => {
      window.__TRAMHY_TEST_SUPABASE__ = { url, key };
    }, [process.env.TEST_SUPABASE_URL, process.env.TEST_SUPABASE_KEY]);
  }
  return context.newPage();
}

/**
 * Ghi lại lỗi JavaScript và thông báo lỗi đỏ (toast) xuất hiện trên trang.
 * Gọi ở đầu bài test, cuối bài gọi expectNoErrors().
 */
function trackErrors(page) {
  const errors = [];
  page.on('pageerror', (err) => errors.push(`Lỗi JS: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('favicon')) errors.push(`Console: ${msg.text()}`);
  });
  return {
    errors,
    async expectNoErrors() {
      const toasts = await page.locator('.toast-error').allTextContents();
      expect([...errors, ...toasts.map((t) => `Toast lỗi: ${t}`)]).toEqual([]);
    },
  };
}

/** Trang không bị tràn ngang (lỗi hay gặp trên điện thoại). */
async function expectNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'Trang rộng hơn màn hình').toBeLessThanOrEqual(1);
}

module.exports = { test, expect, account, authFile, requireAccounts, openAs, trackErrors, expectNoHorizontalOverflow };
