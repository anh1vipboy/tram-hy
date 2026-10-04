// Cấu hình Playwright cho Trạm Hỷ.
//   npm test                → chạy với frontend ở máy (tự bật server cổng 4173)
//   npm run test:vercel     → chạy với bản đã deploy trên Vercel
// Lưu ý: dù chạy ở máy, web vẫn dùng database Supabase thật trong frontend/js/config.js.
const { defineConfig, devices } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'http://localhost:4173';
const isLocal = BASE_URL.includes('localhost');

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },          // dữ liệu tải từ Supabase qua mạng
  retries: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    locale: 'vi-VN',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'may-tinh', use: { ...devices['Desktop Chrome'] } },
    { name: 'dien-thoai', use: { ...devices['Pixel 7'] } },
  ],
  webServer: isLocal ? {
    command: 'node serve.js',
    url: BASE_URL,
    reuseExistingServer: true,
  } : undefined,
});
