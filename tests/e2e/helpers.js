// Tiện ích dùng chung cho các bài test
const { expect } = require('@playwright/test');

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

module.exports = { trackErrors, expectNoHorizontalOverflow };
