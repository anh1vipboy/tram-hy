// Trạng thái tự lưu kiểu Google Docs: "Đang lưu…" → "✓ Đã lưu tự động".
// Còn thay đổi chưa lưu xong mà người dùng đóng / tải lại trang → trình duyệt hỏi lại, không mất dữ liệu.
let pending = 0;
let timer;

function setStatus(state) {
  const el = document.querySelector('#save-status');
  if (!el) return;
  clearTimeout(timer);
  el.dataset.state = state;
  el.textContent = state === 'saving' ? 'Đang lưu…' : state === 'saved' ? '✓ Đã lưu tự động' : '⚠️ Chưa lưu được';
  if (state === 'saved') timer = setTimeout(() => { el.dataset.state = 'idle'; }, 4000);
}

window.addEventListener('beforeunload', (e) => {
  if (pending > 0) { e.preventDefault(); e.returnValue = ''; }
});

export async function trackSave(task) {
  pending += 1;
  setStatus('saving');
  try {
    const result = await task();
    if (pending === 1) setStatus('saved');
    return result;
  } catch (error) {
    setStatus('error');
    throw error;
  } finally {
    pending -= 1;
  }
}
