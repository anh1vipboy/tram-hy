// Cấu hình Playwright cho Trạm Hỷ.
//   npm test                → chạy với frontend ở máy (tự bật server cổng 4173)
//   npm run test:vercel     → chạy với bản đã deploy trên Vercel
//
// Database: nếu tests/.env có TEST_SUPABASE_URL thì web được trỏ sang project Supabase TEST
// (xem frontend/js/config.js), không đụng dữ liệu thật. Không có .env thì dùng database thật,
// và chỉ chạy được các bài không cần đăng nhập.
const fs = require('node:fs');
const { defineConfig, devices } = require('@playwright/test');

if (fs.existsSync(`${__dirname}/.env`)) process.loadEnvFile(`${__dirname}/.env`);

const BASE_URL = process.env.BASE_URL || 'http://localhost:4173';
const isLocal = BASE_URL.includes('localhost');
const LOGGED_IN_FLOWS = /flows[\\/]/;      // các bài cần đăng nhập, ghi dữ liệu vào database test

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
    // 1. Đăng nhập sẵn 3 vai trò → .auth/*.json
    { name: 'dang-nhap', testMatch: /auth\.setup\.js/ },
    // 2. Máy tính: tất cả bài test
    { name: 'may-tinh', use: { ...devices['Desktop Chrome'] }, dependencies: ['dang-nhap'] },
    // 3. Điện thoại: các bài không cần đăng nhập (luồng ghi dữ liệu chỉ chạy 1 lần trên máy tính)
    { name: 'dien-thoai', use: { ...devices['Pixel 7'] }, testIgnore: LOGGED_IN_FLOWS },
  ],
  webServer: isLocal ? {
    command: 'node serve.js',
    url: BASE_URL,
    reuseExistingServer: true,
  } : undefined,
});
