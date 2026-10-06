// Dữ liệu tĩnh cho Phòng thử váy: ảnh người mẫu, ảnh kết quả thử, quy tắc tôn dáng, tùy chọn may đo.
// Kết quả thử váy hiện là ảnh render sẵn theo (người mẫu × kiểu váy). Khi tích hợp AI thật (fashn.ai),
// phần này được thay bằng Edge Function trả ảnh – xem mục "Việc tiếp theo" trong TAI_LIEU_PHAT_TRIEN.md.

const IMG = 'assets/images/';

export const MODELS = [
  { key: 'user',   name: 'Dâu Thảo', photo: `${IMG}user_bride.png` },
  { key: 'bride1', name: 'Dâu Mai',  photo: `${IMG}bride_model_1.png` },
  { key: 'bride2', name: 'Dâu Kim',  photo: `${IMG}bride_model_2.jpg` },
  { key: 'bride3', name: 'Dâu Linh', photo: `${IMG}bride_model_3.png` },
  { key: 'bride4', name: 'Dâu Hà',   photo: `${IMG}bride_model_4.png` },
];

// Ảnh kết quả theo kiểu váy (theme trong bảng dresses)
const RENDERS = {
  user: {
    mermaid: 'user_tryon_mermaid.jpg',
    fairy: 'user_tryon_white_royal.jpg',
    royal: 'user_tryon_blue_royal.jpg',
    minimalist: 'user_tryon_satin.jpg',
    heritage: 'user_tryon_aodai.jpg',
  },
  other: {
    mermaid: 'bride_4_tryon_mermaid.jpg',
    fairy: 'bride_1_tryon_royal.jpg',
    royal: 'bride_1_tryon_royal.jpg',
    minimalist: 'bride_3_tryon_satin.jpg',
    heritage: 'user_tryon_aodai.jpg',
  },
};

export function renderImageFor(modelKey, theme) {
  const set = modelKey === 'user' ? RENDERS.user : RENDERS.other;
  return IMG + (set[theme] || set.fairy);
}

// Ảnh đại diện cho một mẫu váy: ảnh đối tác tải lên, nếu chưa có thì dùng ảnh thử váy cùng kiểu dáng
export const dressThumb = (dress) => dress.image_url || renderImageFor('user', dress.theme);

export const BODY_SHAPES = [
  { key: 'hourglass', label: 'Đồng hồ cát' },
  { key: 'pear',      label: 'Quả lê' },
  { key: 'apple',     label: 'Quả táo' },
  { key: 'petite',    label: 'Nhỏ nhắn' },
];

// Điểm hợp dáng (0–100) theo dáng người × kiểu váy – quy tắc tư vấn của stylist
const FIT_TABLE = {
  hourglass: { mermaid: 96, fairy: 90, minimalist: 93, royal: 90, heritage: 94 },
  pear:      { mermaid: 78, fairy: 95, minimalist: 84, royal: 94, heritage: 90 },
  apple:     { mermaid: 72, fairy: 90, minimalist: 82, royal: 92, heritage: 88 },
  petite:    { mermaid: 86, fairy: 80, minimalist: 95, royal: 76, heritage: 92 },
};

const SHAPE_TIPS = {
  hourglass: 'Eo thon cân đối – váy ôm hoặc đuôi cá khoe trọn đường cong.',
  pear: 'Hông nở – chân váy xòe chữ A hoặc công chúa giúp cân bằng phần dưới.',
  apple: 'Phần bụng đầy – nên chọn cổ chữ V, eo cao, chân váy xòe che khuyết điểm.',
  petite: 'Dáng nhỏ – váy tối giản, đuôi ngắn giúp không bị "nuốt" người.',
};

// BMI theo ngưỡng cho người châu Á (WHO): dùng gợi ý phom váy, lời lẽ nhẹ nhàng – chỉ để tham khảo
const BMI_LEVELS = [
  { max: 18.5, label: 'Hơi mảnh', tip: 'Váy bồng, xếp tầng hoặc tay phồng giúp dáng đầy đặn, mềm mại hơn.' },
  { max: 23, label: 'Cân đối', tip: 'Hầu hết phom váy đều hợp – cứ chọn theo phong cách bạn thích.' },
  { max: 25, label: 'Đầy đặn nhẹ', tip: 'Phom chữ A, eo cao và cổ V giúp dáng thon gọn, thanh thoát.' },
  { max: Infinity, label: 'Đầy đặn', tip: 'Phom chữ A, corset định hình eo và vải đứng phom (mikado, satin dày) tôn dáng nhất.' },
];

export function bmiInfo(height, weight) {
  const value = Math.round((weight / (height / 100) ** 2) * 10) / 10;
  return { value, ...BMI_LEVELS.find((level) => value < level.max) };
}

export function fitScore({ shape, height, heel }, theme) {
  let score = FIT_TABLE[shape]?.[theme] ?? 85;
  const tips = [SHAPE_TIPS[shape]];
  const effectiveHeight = height + heel;

  if (effectiveHeight < 158 && (theme === 'royal' || theme === 'fairy')) {
    score -= 5;
    tips.push('Váy bồng dễ làm dáng thấp hơn – nên đi giày 7–10cm.');
  }
  if (effectiveHeight >= 170 && theme === 'mermaid') {
    score += 2;
    tips.push('Chiều cao lý tưởng cho dáng đuôi cá.');
  }
  return { score: Math.max(60, Math.min(99, score)), tip: tips.join(' ') };
}

// ---------- MAY ĐO TỰ THIẾT KẾ ----------
export const BESPOKE_BASE_PRICE = 9800000;

export const BESPOKE_OPTIONS = {
  silhouette: {
    label: 'Phom váy',
    choices: [
      { key: 'aline',    label: 'Chữ A',      price: 0,       theme: 'fairy' },
      { key: 'ballgown', label: 'Công chúa',  price: 2500000, theme: 'royal' },
      { key: 'mermaid',  label: 'Đuôi cá',    price: 1800000, theme: 'mermaid' },
      { key: 'sheath',   label: 'Suông tối giản', price: 0,   theme: 'minimalist' },
      { key: 'aodai',    label: 'Áo dài cưới', price: 0,      theme: 'heritage' },
    ],
  },
  neckline: {
    label: 'Kiểu cổ',
    choices: [
      { key: 'sweetheart', label: 'Cúp ngực tim', price: 0 },
      { key: 'vneck',      label: 'Cổ chữ V',     price: 0 },
      { key: 'offshoulder', label: 'Trễ vai',     price: 500000 },
      { key: 'highneck',   label: 'Cổ cao ren',   price: 900000 },
    ],
  },
  sleeve: {
    label: 'Tay áo',
    choices: [
      { key: 'none',   label: 'Không tay', price: 0 },
      { key: 'cap',    label: 'Tay ngắn',  price: 300000 },
      { key: 'long',   label: 'Tay dài ren', price: 1200000 },
    ],
  },
  fabric: {
    label: 'Chất liệu',
    choices: [
      { key: 'tulle',     label: 'Voan Tulle',     price: 0 },
      { key: 'mikado',    label: 'Lụa Mikado Ý',   price: 2200000 },
      { key: 'chantilly', label: 'Ren Chantilly Pháp', price: 3500000 },
      { key: 'brocade',   label: 'Gấm Bảo Lộc',    price: 1500000 },
    ],
  },
};

export const BESPOKE_EXTRAS = [
  { key: 'swarovski', label: 'Đính pha lê Swarovski', price: 2000000 },
  { key: 'flower3d',  label: 'Hoa ren 3D thủ công',   price: 1200000 },
];

export const TRAIN_PRICE_PER_METER = 600000; // tính cho phần đuôi dài hơn 0.5m

export function bespokePrice(config) {
  let total = BESPOKE_BASE_PRICE;
  for (const [group, { choices }] of Object.entries(BESPOKE_OPTIONS)) {
    total += choices.find((c) => c.key === config[group])?.price ?? 0;
  }
  for (const extra of BESPOKE_EXTRAS) {
    if (config.extras.includes(extra.key)) total += extra.price;
  }
  total += Math.round(Math.max(0, config.train - 0.5) * TRAIN_PRICE_PER_METER);
  return total;
}

export function bespokeTheme(config) {
  return BESPOKE_OPTIONS.silhouette.choices.find((c) => c.key === config.silhouette)?.theme ?? 'fairy';
}

export function bespokeLabel(group, key) {
  return BESPOKE_OPTIONS[group].choices.find((c) => c.key === key)?.label ?? key;
}
