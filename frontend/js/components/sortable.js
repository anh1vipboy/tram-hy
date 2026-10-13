// Kéo thả sắp xếp (chuột + cảm ứng) bằng tay nắm ⠿. Thả xong gọi onEnd(danh sách id theo thứ tự mới).
// container: phần tử chứa trực tiếp các mục · item: selector mục (có data-id) · handle: selector tay nắm trong mục

export function makeSortable(container, { item, handle, onEnd }) {
  container.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest(handle);
    const row = grip?.closest(item);
    if (!row || row.parentElement !== container || e.button > 0) return;
    e.preventDefault();

    const rect = row.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const placeholder = document.createElement(row.tagName);
    placeholder.className = 'sort-placeholder';
    placeholder.style.height = `${rect.height}px`;
    row.after(placeholder);

    Object.assign(row.style, { position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, zIndex: 70 });
    row.classList.add('dragging');
    grip.setPointerCapture(e.pointerId);
    const startOrder = ids();

    const move = (ev) => {
      row.style.top = `${ev.clientY - offsetY}px`;
      // chèn chỗ trống trước mục đầu tiên có nửa trên nằm dưới con trỏ
      const siblings = [...container.querySelectorAll(`:scope > ${item}:not(.dragging)`)];
      const before = siblings.find((s) => {
        const r = s.getBoundingClientRect();
        return ev.clientY < r.top + r.height / 2;
      });
      if (before) before.before(placeholder); else container.append(placeholder);
      // gần mép màn hình → tự cuộn
      if (ev.clientY < 80) window.scrollBy(0, -12);
      else if (ev.clientY > innerHeight - 80) window.scrollBy(0, 12);
    };
    const end = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', end);
      grip.removeEventListener('pointercancel', end);
      placeholder.replaceWith(row);
      row.removeAttribute('style');
      row.classList.remove('dragging');
      row.classList.add('dropped');
      setTimeout(() => row.classList.remove('dropped'), 500);
      const order = ids();
      if (order.join() !== startOrder.join()) onEnd(order);
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
  });

  function ids() {
    return [...container.querySelectorAll(`:scope > ${item}`)].map((el) => el.dataset.id);
  }
}
