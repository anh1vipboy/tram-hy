// Server tĩnh tối giản phục vụ thư mục frontend/ cho Playwright (không cần cài thêm gói nào).
// start_server.ps1 chỉ chạy được trên Windows; file này chạy được ở mọi máy và trên CI.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../frontend');
const PORT = Number(process.env.PORT) || 4173;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  req.on('error', () => {});
  res.on('error', () => {});
  try {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) {
        if (!res.headersSent) res.writeHead(404).end('Not found');
        return;
      }
      if (!res.headersSent) {
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(data);
      }
    });
  } catch {
    if (!res.headersSent) res.writeHead(400).end('Bad request');
  }
});

server.on('clientError', (err, socket) => {
  if (err.code === 'ECONNRESET' || !socket.writable) {
    return;
  }
  try {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  } catch {}
});

process.on('uncaughtException', (err) => {
  console.error('Test server uncaught exception:', err);
});

server.listen(PORT, () => console.log(`Trạm Hỷ test server: http://localhost:${PORT}`));
