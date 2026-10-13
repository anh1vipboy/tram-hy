// Ô mật khẩu: nút 👁 hiện / ẩn ký tự, thanh độ mạnh + danh sách điều kiện tự tick khi gõ.
// Dùng ở trang Đăng nhập / Tạo tài khoản và Đặt lại mật khẩu.

const EYE = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M10.6 5.1A9.8 9.8 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.7 3.6M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18"/></svg>';

/** Gắn nút hiện / ẩn cho mọi ô mật khẩu trong root (ô phải nằm trong .input-wrap) */
export function enhancePasswordInputs(root = document) {
  root.querySelectorAll('input[type=password]:not([data-eye])').forEach((input) => {
    input.dataset.eye = '1';
    const wrap = input.closest('.input-wrap');
    if (!wrap) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'eye-toggle';
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', 'Xem ký tự đã nhập');   // không chứa chữ "mật khẩu" để nhãn ô nhập vẫn duy nhất
    button.innerHTML = EYE;
    button.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      button.setAttribute('aria-pressed', String(show));
      button.setAttribute('aria-label', show ? 'Che ký tự đã nhập' : 'Xem ký tự đã nhập');
      button.innerHTML = show ? EYE_OFF : EYE;
      button.classList.remove('pop');
      void button.offsetWidth;
      button.classList.add('pop');
      // giữ con trỏ ở cuối để gõ tiếp
      input.focus({ preventScroll: true });
      const end = input.value.length;
      input.setSelectionRange?.(end, end);
    });
    wrap.append(button);
  });
}

// Điều kiện mật khẩu mới: 2 điều kiện đầu bắt buộc, 2 điều kiện sau giúp mật khẩu mạnh hơn
export const PASSWORD_RULES = [
  { key: 'length', label: 'Ít nhất 8 ký tự', required: true, test: (v) => v.length >= 8 },
  { key: 'mix', label: 'Có cả chữ và số', required: true, test: (v) => /\p{L}/u.test(v) && /\d/.test(v) },
  { key: 'case', label: 'Có chữ hoa và chữ thường', test: (v) => /\p{Lu}/u.test(v) && /\p{Ll}/u.test(v) },
  { key: 'special', label: 'Có ký tự đặc biệt (!@#…)', test: (v) => /[^\p{L}\d\s]/u.test(v) },
];

const LEVELS = ['', 'Yếu', 'Trung bình', 'Khá', 'Mạnh'];

/** 0–4: số điều kiện đạt (dài từ 12 ký tự được cộng thêm, tối đa 4) */
export function passwordScore(value) {
  if (!value) return 0;
  const passed = PASSWORD_RULES.filter((r) => r.test(value)).length;
  return Math.min(4, passed + (value.length >= 12 ? 1 : 0));
}

/** Lỗi đầu tiên của mật khẩu mới ('' nếu hợp lệ) */
export function passwordProblem(value) {
  if (!value) return 'Vui lòng nhập mật khẩu';
  const failed = PASSWORD_RULES.find((r) => r.required && !r.test(value));
  return failed ? `Mật khẩu cần ${failed.label.toLowerCase()}` : '';
}

/** Thanh độ mạnh + danh sách điều kiện, cập nhật khi gõ. meter: phần tử rỗng đặt dưới ô mật khẩu */
export function bindPasswordMeter(input, meter) {
  meter.classList.add('pw-meter');
  meter.innerHTML = `
    <div class="pw-bars" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    <span class="pw-level" aria-live="polite"></span>
    <ul class="pw-rules">${PASSWORD_RULES.map((r) => `<li data-rule="${r.key}"><span>${r.label}${r.required ? '' : ' <em>(nên có)</em>'}</span></li>`).join('')}</ul>`;
  const update = () => {
    const value = input.value;
    const score = passwordScore(value);
    meter.dataset.level = String(score);
    meter.querySelector('.pw-level').textContent = value ? `Độ mạnh: ${LEVELS[score] || 'Rất yếu'}` : '';
    for (const rule of PASSWORD_RULES) {
      meter.querySelector(`[data-rule="${rule.key}"]`).classList.toggle('ok', rule.test(value));
    }
  };
  input.addEventListener('input', update);
  update();
}
