// Banner trang chủ: ảnh tự đổi sau mỗi vài giây, nút ‹ › + chấm chuyển ảnh, vuốt trên điện thoại.
// Dừng khi rê chuột / chạm vào, khi tab bị ẩn, và không tự chạy nếu người dùng bật "giảm chuyển động".
import { html, render } from '../core/utils.js';

const SLIDES = [
  { src: 'assets/images/user_tryon_mermaid.jpg',     label: 'Váy đuôi cá' },
  { src: 'assets/images/user_tryon_white_royal.jpg', label: 'Váy công chúa' },
  { src: 'assets/images/user_tryon_satin.jpg',       label: 'Váy satin tối giản' },
  { src: 'assets/images/user_tryon_aodai.jpg',       label: 'Áo dài cưới' },
  { src: 'assets/images/user_tryon_blue_royal.jpg',  label: 'Váy công chúa xanh' },
];
const INTERVAL_MS = 5000;

export function mountHeroSlider(root) {
  let index = 0;
  let timer = null;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  render(root, html`
    ${SLIDES.map((s, i) => html`
      <img class="slide ${i === 0 ? 'active' : ''}" src="${s.src}" alt="Cô dâu thử ${s.label.toLowerCase()} trên Trạm Hỷ"
           loading="${i === 0 ? 'eager' : 'lazy'}" aria-hidden="${i === 0 ? 'false' : 'true'}">`)}
    <span class="slide-label" aria-live="polite">${SLIDES[0].label}</span>
    <button type="button" class="slide-nav prev" data-step="-1" aria-label="Ảnh trước">‹</button>
    <button type="button" class="slide-nav next" data-step="1" aria-label="Ảnh sau">›</button>
    <div class="slide-dots">
      ${SLIDES.map((s, i) => html`
        <button type="button" class="${i === 0 ? 'active' : ''}" data-go="${i}" aria-label="Xem ${s.label}"></button>`)}
    </div>`);

  const slides = [...root.querySelectorAll('.slide')];
  const dots = [...root.querySelectorAll('[data-go]')];

  function show(next) {
    index = (next + SLIDES.length) % SLIDES.length;
    slides.forEach((img, i) => {
      img.classList.toggle('active', i === index);
      img.setAttribute('aria-hidden', String(i !== index));
    });
    dots.forEach((d, i) => d.classList.toggle('active', i === index));
    root.querySelector('.slide-label').textContent = SLIDES[index].label;
  }

  const stop = () => { clearInterval(timer); timer = null; };
  const start = () => {
    if (reduceMotion || timer) return;
    timer = setInterval(() => show(index + 1), INTERVAL_MS);
  };
  // Người dùng bấm chuyển ảnh → đếm lại từ đầu để ảnh vừa chọn không bị đổi ngay
  const userGo = (next) => { stop(); show(next); start(); };

  root.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => userGo(index + Number(b.dataset.step))));
  dots.forEach((d) => d.addEventListener('click', () => userGo(Number(d.dataset.go))));

  root.addEventListener('mouseenter', stop);
  root.addEventListener('mouseleave', start);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

  // Vuốt ngang trên điện thoại
  let touchX = null;
  root.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; stop(); }, { passive: true });
  root.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - (touchX ?? 0);
    if (touchX !== null && Math.abs(dx) > 40) show(index + (dx < 0 ? 1 : -1));
    touchX = null;
    start();
  });

  start();
}
