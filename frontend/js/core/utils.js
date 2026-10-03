// ---------- DOM ----------
export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
export const param = (name) => new URLSearchParams(location.search).get(name);

// ---------- HTML AN TOÀN ----------
// Dùng html`...` để dựng giao diện: mọi giá trị chèn vào đều được escape (chống XSS),
// trừ khi đó là kết quả của html`` khác hoặc được bọc bằng raw().
class SafeHtml {
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}

export const raw = (value) => new SafeHtml(value);

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderValue(value) {
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(renderValue).join('');
  if (value === null || value === undefined || value === false) return '';
  return escapeHtml(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((value, i) => { out += renderValue(value) + strings[i + 1]; });
  return new SafeHtml(out);
}

export function render(element, content) {
  element.innerHTML = renderValue(content);
}

// ---------- ĐỊNH DẠNG ----------
export const money = (n) => `${Number(n || 0).toLocaleString('vi-VN')}đ`;

export function dateTime(iso) {
  if (!iso) return 'Chưa hẹn';
  return new Date(iso).toLocaleString('vi-VN', {
    hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

export function date(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function debounce(fn, wait = 400) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// "Bella Bridal Atelier" → "BB" (ảnh đại diện tạm khi đối tác chưa có ảnh)
export function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

// "Váy Cưới Hà Nội" → "vay-cuoi-ha-noi" (dùng làm đường dẫn)
export function slugify(text) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export const randomSuffix = () => Math.random().toString(36).slice(2, 7);
