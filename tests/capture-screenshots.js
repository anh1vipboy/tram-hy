const path = require('node:path');
const http = require('node:http');
const fs = require('node:fs');
const { chromium } = require('@playwright/test');

const FRONTEND_DIR = path.resolve(__dirname, '../frontend');
const OUT_DIR = path.resolve(__dirname, '../docs/images');
const PORT = 4188;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      try {
        const urlPath = decodeURIComponent(new URL(req.url, `http://localhost:${PORT}`).pathname);
        const file = path.join(FRONTEND_DIR, urlPath === '/' ? 'index.html' : urlPath);
        if (!file.startsWith(FRONTEND_DIR)) { res.writeHead(403).end(); return; }
        fs.readFile(file, (err, data) => {
          if (err) {
            res.writeHead(404).end('Not found');
            return;
          }
          res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
          res.end(data);
        });
      } catch {
        res.writeHead(400).end('Bad request');
      }
    });
    server.listen(PORT, () => resolve(server));
  });
}

async function run() {
  const server = await startServer();
  console.log(`Server started on port ${PORT}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 950 },
    deviceScaleFactor: 2, // Hi-DPI / Retina screenshot for crystal clear report quality
  });
  const page = await context.newPage();

  // 1. Chụp ảnh Sticky Mirror Canvas (60/40) trên thiet-ke-vay.html
  console.log('Navigating to thiet-ke-vay.html...');
  await page.goto(`http://localhost:${PORT}/thiet-ke-vay.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Cuộn xuống một chút để kích hoạt hiệu ứng Sticky Mirror
  await page.evaluate(() => {
    window.scrollBy(0, 320);
  });
  await page.waitForTimeout(600);

  const mirrorPath = path.join(OUT_DIR, 'figure-1-sticky-mirror-canvas-60-40.png');
  await page.screenshot({
    path: mirrorPath,
    fullPage: false,
  });
  console.log(`Saved screenshot 1 to ${mirrorPath}`);

  // 2. Chụp ảnh Before/After Slider trên tryon.html
  console.log('Navigating to tryon.html...');
  await page.goto(`http://localhost:${PORT}/tryon.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Inject resultViewer with Before / After comparison
  await page.evaluate(async () => {
    const thread = document.getElementById('chat-thread');
    // Clear chat loading if any
    const loading = document.getElementById('chat-loading');
    if (loading) loading.remove();

    const { resultViewer } = await import('./js/components/tryon-result.js');
    const viewer = resultViewer({
      images: ['assets/images/user_tryon_mermaid.webp'],
      original: 'assets/images/user_bride.webp',
      meta: 'Tiêu chuẩn (Fast / 768p) · FASHN AI v1.6'
    });

    // Tạo message row bọc quanh viewer cho đẹp chuẩn giao diện
    const row = document.createElement('div');
    row.className = 'chat-row chat-ai';
    row.style.maxWidth = '720px';
    row.style.margin = '0 auto';

    const avatar = document.createElement('div');
    avatar.className = 'chat-avatar';
    avatar.innerText = '囍';
    row.appendChild(avatar);

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    bubble.appendChild(viewer);

    const text = document.createElement('p');
    text.className = 'msg-text';
    text.style.marginTop = '12px';
    text.innerHTML = '<strong>Đã hoàn tất ướm thử!</strong> Tỷ lệ vừa vặn (Fit Score): <strong>94% - Cực kỳ tôn dáng</strong>. Bạn có thể kéo thanh trượt trước/sau để so sánh ảnh gốc và váy cưới thực tế.';
    bubble.appendChild(text);

    row.appendChild(bubble);
    thread.appendChild(row);

    // Kích hoạt nút so sánh
    const compareBtn = viewer.querySelector('[data-compare]');
    if (compareBtn) compareBtn.click();

    // Điều chỉnh thanh trượt về giữa (50%)
    const range = viewer.querySelector('.gen-range');
    if (range) {
      range.value = 50;
      range.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });

  await page.waitForTimeout(1200);

  // Chụp cận cảnh khung chat và Before/After Slider
  const sliderElement = await page.$('.chat-row.chat-ai');
  const sliderPath = path.join(OUT_DIR, 'figure-2-before-after-slider.png');
  if (sliderElement) {
    await sliderElement.screenshot({ path: sliderPath });
  } else {
    await page.screenshot({ path: sliderPath });
  }
  console.log(`Saved screenshot 2 to ${sliderPath}`);

  await browser.close();
  server.close();
  console.log('Capture completed successfully!');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
