// Thành phần phân trang chuẩn Soft Luxury cho Trạm Hỷ
// Dùng chung cho: Bảng đơn hàng Admin, Danh sách đối tác, Đơn Kênh đối tác, Danh sách RSVP Thiệp cưới...
import { html } from '../core/utils.js';

/**
 * Cắt mảng dữ liệu theo trang và kích thước trang.
 * Trả về thông tin phân trang và danh sách mục của trang hiện tại.
 */
export function paginate(items = [], page = 1, pageSize = 10) {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(totalItems, startIndex + pageSize);
  const pagedItems = items.slice(startIndex, endIndex);

  return {
    page: currentPage,
    pageSize,
    totalItems,
    totalPages,
    startIndex,
    endIndex,
    items: pagedItems,
  };
}

/**
 * Sinh danh sách các số trang cần hiển thị (kèm dấu ... nếu nhiều hơn 7 trang)
 */
function getPageNumbers(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, '...', totalPages];
  }
  if (currentPage >= totalPages - 3) {
    return [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }
  return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
}

/**
 * Tạo giao diện thanh phân trang
 */
export function paginationView({
  page = 1,
  pageSize = 10,
  totalItems = 0,
  totalPages = 1,
  startIndex = 0,
  endIndex = 0,
  itemLabel = 'mục',
  pageSizeOptions = [10, 20, 50],
  showSizeSelector = true,
}) {
  if (totalItems === 0) return '';

  const pages = getPageNumbers(page, totalPages);
  const from = totalItems > 0 ? startIndex + 1 : 0;
  const to = endIndex;

  return html`
    <nav class="pagination-bar" aria-label="Phân trang">
      <div class="pagination-info">
        Hiển thị <strong>${from}–${to}</strong> trên <strong>${totalItems}</strong> ${itemLabel}
      </div>

      <div class="pagination-controls">
        <button type="button" class="btn-page btn-page-nav" data-page="${page - 1}"
                ${page <= 1 ? 'disabled' : ''} aria-label="Trang trước">
          ‹ Trước
        </button>

        <div class="pagination-pages">
          ${pages.map((p) => {
            if (p === '...') {
              return html`<span class="page-ellipsis" aria-hidden="true">…</span>`;
            }
            const isCurrent = p === page;
            return html`
              <button type="button" class="btn-page ${isCurrent ? 'active' : ''}" data-page="${p}"
                      ${isCurrent ? 'aria-current="page"' : ''}>
                ${p}
              </button>`;
          })}
        </div>

        <button type="button" class="btn-page btn-page-nav" data-page="${page + 1}"
                ${page >= totalPages ? 'disabled' : ''} aria-label="Trang sau">
          Sau ›
        </button>

        ${showSizeSelector && pageSizeOptions.length > 1 ? html`
          <select class="input page-size-select" data-page-size aria-label="Số lượng mỗi trang">
            ${pageSizeOptions.map((sz) => html`
              <option value="${sz}" ${sz === pageSize ? 'selected' : ''}>${sz} / trang</option>`)}
          </select>` : ''}
      </div>
    </nav>`;
}

/**
 * Gắn sự kiện chuyển trang và đổi số lượng mỗi trang bên trong container
 */
export function bindPaginationEvents(container, { onPageChange, onPageSizeChange }) {
  if (!container) return;

  container.querySelectorAll('[data-page]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const targetPage = Number(btn.dataset.page);
      if (!Number.isNaN(targetPage) && targetPage > 0) {
        onPageChange?.(targetPage);
      }
    });
  });

  const sizeSelect = container.querySelector('[data-page-size]');
  if (sizeSelect && onPageSizeChange) {
    sizeSelect.addEventListener('change', (e) => {
      const newSize = Number(e.target.value);
      if (!Number.isNaN(newSize) && newSize > 0) {
        onPageSizeChange(newSize);
      }
    });
  }
}
