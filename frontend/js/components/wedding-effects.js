// Hiệu ứng rơi trên thiệp (tim bay, cánh hoa, tuyết, lấp lánh) – chỉ CSS, nhẹ, không chặn thao tác bấm.
// Người dùng bật "giảm chuyển động" trong máy → không chạy hiệu ứng.
export const EFFECTS = [
  ['none', 'Không'],
  ['hearts', '💗 Tim bay'],
  ['petals', '🌸 Cánh hoa'],
  ['snow', '❄️ Tuyết'],
  ['sparkles', '✨ Lấp lánh'],
];

const GLYPHS = { hearts: ['♥', '♡', '❤'], petals: ['❀', '✿', '❁'], snow: ['❄', '❅', '❆'], sparkles: ['✦', '✧', '⋆'] };
const COUNT = 16;

/** kind: một key trong EFFECTS · accent: màu chủ đạo của mẫu thiệp. Trả về hàm dừng, hoặc null. */
export function startEffect(kind, accent = '#e399a6') {
  if (!GLYPHS[kind] || matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
  const layer = document.createElement('div');
  layer.className = `wedding-effect effect-${kind}`;
  layer.setAttribute('aria-hidden', 'true');
  layer.style.setProperty('--fx-accent', accent);
  const glyphs = GLYPHS[kind];
  for (let i = 0; i < COUNT; i += 1) {
    const p = document.createElement('span');
    p.textContent = glyphs[i % glyphs.length];
    p.style.left = `${Math.random() * 100}%`;
    p.style.fontSize = `${10 + Math.random() * 16}px`;
    p.style.opacity = String(0.45 + Math.random() * 0.45);
    p.style.setProperty('--fx-drift', `${(Math.random() - 0.5) * 120}px`);
    p.style.setProperty('--fx-spin', `${(Math.random() - 0.5) * 540}deg`);
    p.style.animationDuration = `${8 + Math.random() * 8}s`;
    p.style.animationDelay = `${-Math.random() * 14}s`;   // bắt đầu rải rác, không rơi cùng lúc
    layer.append(p);
  }
  document.body.append(layer);
  return () => layer.remove();
}
