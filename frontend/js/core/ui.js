// Thông báo nhỏ (toast) và hộp thoại dùng chung
import { html, render } from './utils.js';

export function toast(message, type = 'info') {
  let host = document.querySelector('.toast-host');
  if (!host) {
    host = document.createElement('div');
    host.className = 'toast-host';
    host.setAttribute('role', 'status');
    document.body.append(host);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  host.append(el);
  setTimeout(() => el.remove(), 3800);
}

export const toastError = (error) => toast(error?.message || String(error), 'error');

/**
 * Mở hộp thoại và chờ người dùng bấm.
 * - content: html`` – nếu có ô nhập (input/select/textarea có name), kết quả trả về là FormData.
 *   Không đặt thẻ <form> trong content: hộp thoại đã là một form.
 * - onConfirm(result): chạy khi bấm xác nhận; ném lỗi thì hộp thoại giữ nguyên và báo lỗi.
 * - onOpen(dialogEl): chạy ngay sau khi hộp thoại hiện ra – để gắn sự kiện cho nội dung bên trong.
 * Trả về Promise: kết quả onConfirm (hoặc true/FormData), hoặc null nếu hủy.
 */
export function openDialog({ title, content, confirmText = 'Xác nhận', cancelText = 'Hủy', danger = false, onConfirm, onOpen }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'modal';
  render(dialog, html`
    <form method="dialog" class="dialog-form">
      <div class="modal-head"><h3>${title}</h3></div>
      <div class="modal-body">${content}</div>
      <div class="modal-foot">
        ${cancelText ? html`<button type="button" class="btn btn-outline" data-cancel>${cancelText}</button>` : ''}
        ${confirmText ? html`<button type="submit" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm>${confirmText}</button>` : ''}
      </div>
    </form>`);
  document.body.append(dialog);

  return new Promise((resolve) => {
    const form = dialog.querySelector('form');
    const confirmBtn = dialog.querySelector('[data-confirm]');
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      dialog.close();
      dialog.remove();
      resolve(value);
    };

    dialog.querySelector('[data-cancel]')?.addEventListener('click', () => finish(null));
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); finish(null); });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const data = new FormData(form);
      const result = [...data.keys()].length ? data : true;
      if (!onConfirm) return finish(result);
      confirmBtn.disabled = true;
      try {
        const value = await onConfirm(result);
        finish(value ?? result);
      } catch (error) {
        toastError(error);
        confirmBtn.disabled = false;
      }
    });

    dialog.showModal();
    onOpen?.(dialog);
  });
}

// Khóa nút trong lúc chờ xử lý để tránh bấm 2 lần
export async function withBusy(button, task) {
  button.disabled = true;
  try {
    return await task();
  } finally {
    button.disabled = false;
  }
}
