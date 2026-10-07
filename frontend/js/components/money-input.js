// Ô nhập số tiền VNĐ dùng chung: tự thêm dấu chấm khi gõ (150.000.000), chỉ nhận chữ số,
// kiểm tra khoảng giá trị và báo lỗi ngay dưới ô.
import { money } from '../core/utils.js';

export const MAX_MONEY = 10_000_000_000;   // 10 tỷ đồng

export function parseMoney(text) {
  const digits = String(text ?? '').replace(/\D/g, '').slice(0, 12);   // 12 chữ số đủ cho 10 tỷ
  return digits ? Number(digits) : null;
}

const formatDigits = (value) => (value === null ? '' : value.toLocaleString('vi-VN'));

/** Giá trị ban đầu cho ô tiền trong template: 1500000 → "1.500.000" */
export const moneyValue = (value) => (value ? formatDigits(Number(value)) : '');

// Mọi ô <input data-money> (form đối tác, hộp thoại…) tự thêm dấu chấm khi gõ – đọc lại bằng parseMoney()
document.addEventListener('input', (e) => {
  const input = e.target;
  if (!input.matches?.('input[data-money]')) return;
  const fromEnd = input.value.length - (input.selectionStart ?? input.value.length);
  input.value = formatDigits(parseMoney(input.value));
  const caret = Math.max(0, input.value.length - fromEnd);   // giữ con trỏ đúng chỗ khi sửa giữa số
  input.setSelectionRange?.(caret, caret);
});

/** Đọc ô tiền bắt buộc, sai thì báo lỗi rõ ràng. */
export function readMoneyField(text, label, { min = 1, max = MAX_MONEY, required = true } = {}) {
  const value = parseMoney(text);
  if (value === null) {
    if (required) throw new Error(`Vui lòng nhập ${label}`);
    return null;
  }
  if (value < min) throw new Error(`${label} tối thiểu ${money(min)}`);
  if (value > max) throw new Error(`${label} tối đa ${money(max)}`);
  return value;
}

/**
 * input:   <input> cần gắn
 * errorEl: phần tử hiện lỗi (thường là <p class="field-error">)
 * min/max: khoảng hợp lệ (mặc định 1đ → 10 tỷ)
 * onChange(value): gọi mỗi lần gõ – value = số hợp lệ, hoặc null nếu trống / sai
 * Trả về { check, set }: check() kiểm tra và trả số hợp lệ hoặc null; set(số) điền giá trị.
 */
export function bindMoneyInput(input, { errorEl, min = 1, max = MAX_MONEY, onChange } = {}) {
  input.inputMode = 'numeric';
  input.autocomplete = 'off';

  function check() {
    const value = parseMoney(input.value);
    let error = '';
    if (value === null) error = 'Vui lòng nhập số tiền';
    else if (value < min) error = `Số tiền tối thiểu là ${money(min)}`;
    else if (value > max) error = `Số tiền tối đa là ${money(max)}`;

    errorEl.textContent = error;
    errorEl.hidden = !error;
    input.setAttribute('aria-invalid', String(Boolean(error)));
    return error ? null : value;
  }

  input.addEventListener('input', () => {
    input.value = formatDigits(parseMoney(input.value));   // gõ chữ hay ký tự lạ sẽ bị bỏ
    const value = check();        // luôn kiểm tra khi gõ (viết onChange?.(check()) sẽ bỏ qua check nếu không có onChange)
    onChange?.(value);
  });

  return {
    check,
    set(value) {
      input.value = formatDigits(value);
      return check();
    },
    clearError() {
      errorEl.hidden = true;
      input.removeAttribute('aria-invalid');
    },
  };
}
