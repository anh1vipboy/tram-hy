// Kênh đối tác → tab "Mẫu váy": thêm / sửa / ẩn / xóa mẫu váy của tiệm
import { html, render, money } from '../core/utils.js';
import { badge, priceTag, DRESS_THEME } from '../core/labels.js';
import { openDialog, toast, toastError, withBusy } from '../core/ui.js';
import { listShopDresses, saveDress, setDressActive, deleteDress, MAX_DRESS_ANGLE_PHOTOS } from '../services/shop.js';
import { dressThumbButton, bindDressGalleries } from './dress-gallery.js';
import { moneyValue, readMoneyField } from './money-input.js';

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
    bindDressGalleries(container, dresses);
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
        ${dressThumbButton(d)}
        <div class="body">
          <div class="row">${badge(DRESS_THEME[d.theme] ?? d.theme, 'gold')}
            ${d.type === 'bespoke' ? badge('May đo', 'purple') : badge('Thuê')}
            ${d.is_active ? badge('Đang bán', 'green') : badge('Đã ẩn')}</div>
          <h3>${d.name}</h3>
          <div>${priceTag(d)}</div>
          ${d.image_url ? '' : html`<div class="small muted">Chưa có ảnh chính – đang dùng ảnh minh họa</div>`}
          <div class="row">
            <button class="btn btn-outline btn-sm" type="button" data-edit>Sửa</button>
            <button class="btn btn-outline btn-sm" type="button" data-toggle>${d.is_active ? 'Ẩn' : 'Mở bán'}</button>
            <button class="btn btn-danger btn-sm" type="button" data-delete>Xóa</button>
          </div>
        </div>
      </article>`;
  }

  async function edit(dress) {
    const removePhotoIds = new Set();
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
            <input class="input" name="price" data-money inputmode="numeric" autocomplete="off" placeholder="VD: 3.500.000"
              value="${moneyValue(dress?.price)}" required></label>
          <label class="field"><span>Giá gốc trước giảm (không bắt buộc)</span>
            <input class="input" name="originalPrice" data-money inputmode="numeric" autocomplete="off"
              value="${moneyValue(dress?.original_price)}"></label>
          <div class="field full"><span>Ảnh chính – hiện ở ngoài danh sách để thu hút khách
              ${dress?.image_url ? '(chọn ảnh mới để thay)' : ''}</span>
            ${dress?.image_url ? html`<img src="${dress.image_url}" alt="" style="max-height:160px;width:auto;border-radius:10px">` : ''}
            <input class="input" type="file" name="image" accept="image/*"></div>
          <div class="field full"><span>Ảnh các góc (trước, sau, cận chi tiết…) – tối đa ${MAX_DRESS_ANGLE_PHOTOS} ảnh</span>
            ${dress?.photos.length ? html`
              <div class="photo-grid" style="grid-template-columns:repeat(auto-fill,minmax(80px,1fr))">
                ${dress.photos.map((p) => html`
                  <figure class="photo" data-angle="${p.id}">
                    <img src="${p.url}" alt="">
                    <button class="btn btn-danger btn-sm" type="button" data-toggle-remove aria-label="Xóa ảnh">✕</button>
                  </figure>`)}
              </div>
              <span class="small muted" data-remove-note hidden></span>` : ''}
            <input class="input" type="file" name="angles" accept="image/*" multiple></div>
        </div>`,
      // Bấm ✕ chỉ đánh dấu ảnh sẽ xóa; bấm Lưu mới xóa thật (bấm Hủy thì giữ nguyên)
      onOpen: (dialogEl) => {
        dialogEl.querySelectorAll('[data-toggle-remove]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const figure = btn.closest('[data-angle]');
            const id = figure.dataset.angle;
            if (removePhotoIds.has(id)) removePhotoIds.delete(id); else removePhotoIds.add(id);
            figure.style.opacity = removePhotoIds.has(id) ? '.3' : '';
            btn.textContent = removePhotoIds.has(id) ? '↺' : '✕';
            const note = dialogEl.querySelector('[data-remove-note]');
            note.hidden = !removePhotoIds.size;
            note.textContent = `${removePhotoIds.size} ảnh sẽ bị xóa khi bấm Lưu`;
          });
        });
      },
      onConfirm: (form) => {
        const price = readMoneyField(form.get('price'), 'Giá', { min: 100_000 });
        const originalPrice = readMoneyField(form.get('originalPrice'), 'Giá gốc', { required: false });
        if (originalPrice && originalPrice <= price) throw new Error('Giá gốc phải cao hơn giá bán');
        return saveDress(shop.id, dress, {
          name: form.get('name').trim(),
          type: form.get('type'),
          theme: form.get('theme'),
          price,
          originalPrice,
          imageFile: form.get('image'),
          angleFiles: form.getAll('angles').filter((f) => f.size > 0),
          removePhotoIds: [...removePhotoIds],
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
