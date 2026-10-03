// Kênh đối tác → tab "Mẫu váy": thêm / sửa / ẩn / xóa mẫu váy của tiệm
import { html, render, money } from '../core/utils.js';
import { badge, DRESS_THEME } from '../core/labels.js';
import { openDialog, toast, toastError, withBusy } from '../core/ui.js';
import { listShopDresses, saveDress, setDressActive, deleteDress } from '../services/shop.js';
import { dressThumb } from '../data/tryon-data.js';

export async function mountDressManager(container, shop) {
  let dresses = [];

  async function reload() {
    try {
      dresses = await listShopDresses(shop.id);
      draw();
    } catch (error) {
      toastError(error);
    }
  }

  function draw() {
    render(container, html`
      <div class="section-head">
        <div>
          <h2 style="margin:0">Mẫu váy của tiệm</h2>
          <p>Mẫu "Đang bán" hiện ở Phòng thử váy và trang tiệm. Chọn đúng kiểu váy để ảnh thử váy AI khớp dáng.</p>
        </div>
        <button class="btn btn-primary" type="button" data-add>+ Thêm mẫu váy</button>
      </div>
      ${dresses.length
        ? html`<div class="grid">${dresses.map(dressCard)}</div>`
        : html`<div class="empty">Tiệm chưa có mẫu váy nào. Bấm "Thêm mẫu váy" để đăng mẫu đầu tiên.</div>`}`);

    container.querySelector('[data-add]').addEventListener('click', () => edit(null));
    container.querySelectorAll('[data-dress]').forEach((el) => {
      const dress = dresses.find((d) => d.id === el.dataset.dress);
      el.querySelector('[data-edit]').addEventListener('click', () => edit(dress));
      el.querySelector('[data-delete]').addEventListener('click', () => remove(dress));
      const toggle = el.querySelector('[data-toggle]');
      toggle.addEventListener('click', () => withBusy(toggle, async () => {
        try {
          await setDressActive(dress.id, !dress.is_active);
          toast(dress.is_active ? 'Đã ẩn mẫu váy.' : 'Mẫu váy đã mở bán lại.', 'success');
          await reload();
        } catch (error) {
          toastError(error);
        }
      }));
    });
  }

  function dressCard(d) {
    return html`
      <article class="card item-card" data-dress="${d.id}" style="${d.is_active ? '' : 'opacity:.6'}">
        <img class="thumb" src="${dressThumb(d)}" alt="${d.name}" loading="lazy">
        <div class="body">
          <div class="row">${badge(DRESS_THEME[d.theme] ?? d.theme, 'gold')}
            ${d.type === 'bespoke' ? badge('May đo', 'purple') : badge('Thuê')}
            ${d.is_active ? badge('Đang bán', 'green') : badge('Đã ẩn')}</div>
          <h3>${d.name}</h3>
          <div class="price">${money(d.price)}</div>
          ${d.image_url ? '' : html`<div class="small muted">Chưa có ảnh thật – đang dùng ảnh minh họa</div>`}
          <div class="row">
            <button class="btn btn-outline btn-sm" type="button" data-edit>Sửa</button>
            <button class="btn btn-outline btn-sm" type="button" data-toggle>${d.is_active ? 'Ẩn' : 'Mở bán'}</button>
            <button class="btn btn-danger btn-sm" type="button" data-delete>Xóa</button>
          </div>
        </div>
      </article>`;
  }

  async function edit(dress) {
    const done = await openDialog({
      title: dress ? 'Sửa mẫu váy' : 'Thêm mẫu váy',
      confirmText: dress ? 'Lưu' : 'Thêm mẫu',
      content: html`
        <div class="form-grid">
          <label class="field full"><span>Tên mẫu váy</span>
            <input class="input" name="name" value="${dress?.name || ''}" required maxlength="120"></label>
          <label class="field"><span>Hình thức</span>
            <select class="input" name="type">
              <option value="rental" ${dress?.type !== 'bespoke' ? 'selected' : ''}>Cho thuê</option>
              <option value="bespoke" ${dress?.type === 'bespoke' ? 'selected' : ''}>May đo</option>
            </select></label>
          <label class="field"><span>Kiểu váy</span>
            <select class="input" name="theme">
              ${Object.entries(DRESS_THEME).map(([key, label]) => html`
                <option value="${key}" ${key === dress?.theme ? 'selected' : ''}>${label}</option>`)}
            </select></label>
          <label class="field"><span>Giá (VNĐ)</span>
            <input class="input" type="number" name="price" value="${dress?.price || ''}" required min="100000" step="50000"></label>
          <label class="field"><span>Giá gốc trước giảm (không bắt buộc)</span>
            <input class="input" type="number" name="originalPrice" value="${dress?.original_price || ''}" min="0" step="50000"></label>
          <label class="field full"><span>Ảnh mẫu váy ${dress?.image_url ? '(chọn ảnh mới để thay)' : ''}</span>
            <input class="input" type="file" name="image" accept="image/*"></label>
          ${dress?.image_url ? html`<img src="${dress.image_url}" alt="" class="full" style="max-height:160px;width:auto;border-radius:10px">` : ''}
        </div>`,
      onConfirm: (form) => {
        const price = Number(form.get('price'));
        const originalPrice = Number(form.get('originalPrice')) || null;
        if (originalPrice && originalPrice <= price) throw new Error('Giá gốc phải cao hơn giá bán');
        return saveDress(shop.id, dress, {
          name: form.get('name').trim(),
          type: form.get('type'),
          theme: form.get('theme'),
          price,
          originalPrice,
          imageFile: form.get('image'),
        });
      },
    });
    if (done) { toast(dress ? 'Đã lưu mẫu váy.' : 'Đã thêm mẫu váy.', 'success'); reload(); }
  }

  async function remove(dress) {
    const done = await openDialog({
      title: `Xóa "${dress.name}"?`,
      confirmText: 'Xóa mẫu',
      danger: true,
      content: html`<p>Mẫu váy và ảnh sẽ bị xóa vĩnh viễn. Nếu chỉ muốn tạm ngừng bán, hãy bấm "Ẩn".</p>`,
      onConfirm: () => deleteDress(dress),
    });
    if (done) { toast('Đã xóa mẫu váy.', 'success'); reload(); }
  }

  await reload();
}
