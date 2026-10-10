// Trang "Trở thành đối tác": giới thiệu + nút đăng ký tùy trạng thái tài khoản
import { initLayout } from '../core/layout.js';
import { $, $$ } from '../core/utils.js';
import { listVendors } from '../services/catalog.js';

// ---------- KHỞI CHẠY TRANG ----------
const profile = await initLayout('partner');
const ctas = $$('#partner-cta, #partner-cta-bottom');
listVendors().then((v) => { $('#vendor-count').textContent = String(v.length); }).catch(() => {});

if (profile?.role === 'admin') {
  ctas.forEach((a) => { a.style.display = 'none'; });
  $('#partner-cta-note').textContent = 'Bạn đang dùng tài khoản quản trị – duyệt hồ sơ đối tác ở mục Quản trị.';
} else if (profile) {
  // Đã đăng nhập: vào thẳng Kênh đối tác (chưa có tiệm thì hiện form mở tiệm)
  const label = profile.role === 'vendor' ? 'Vào Kênh đối tác' : 'Mở tiệm ngay';
  ctas.forEach((a) => { a.href = 'vendor-dashboard.html'; a.textContent = label; });
  if (profile.role === 'bride') $('#partner-cta-note').textContent = 'Dùng luôn tài khoản hiện tại – bạn vẫn đặt dịch vụ cho đám cưới như bình thường.';
}
