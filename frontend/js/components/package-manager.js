// Kênh đối tác → tab gói dịch vụ (tiệm không bán váy): "Mẫu rạp & trang trí", "Gói chụp", "Gói trang điểm", "Sảnh & thực đơn".
// Thêm / sửa / ẩn / xóa gói: tên, giá, giá gốc, mô tả, ảnh chính + tối đa 10 ảnh chi tiết.
import { html, render } from '../core/utils.js';
import { badge, priceTag, packageLabel } from '../core/labels.js';
import { openDialog, toast, toastError, withBusy } from '../core/ui.js';
import { listShopPackages, savePackage, setPackageActive, deletePackage, MAX_PACKAGE_PHOTOS } from '../services/shop.js';
import { packageThumbButton, bindPackageGalleries } from './package-card.js';
import { moneyValue, readMoneyField } from './money-input.js';
import { CATEGORY_CHOICES } from './shop-form.js';

export async function mountPackageManager(container, shop) {
  const label = packageLabel(shop.category);
  const icon = CATEGORY_CHOICES[shop.category]?.icon ?? '✨';
  let packages = [];

  async function reload() {
    try {
      packages = await listShopPackages(shop.id);
      draw();
    } catch (error) {
      render(container, html`<div class="empty">Chưa mở được mục ${label.section.toLowerCase()} – Trạm Hỷ đang cập nhật hệ thống, vui lòng thử lại sau.</div>`);
      console.warn(error);
    }
  }

  function draw() {
    render(container, html`
      <div class="section-head">
        <div>
          <h2 style="margin:0">${label.section}</h2>
          <p>Mỗi ${label.item} có giá riêng – khách xem ảnh và bấm "Đặt ${label.item} này" ngay trên trang tiệm. ${label.item[0].toUpperCase() + label.item.slice(1)} "Đang bán" mới hiện với khách.</p>
        </div>
        <button class="btn btn-primary" type="button" data-add>${label.add}</button>
      </div>
      ${packages.length
        ? html`<div class="grid">${packages.map(card)}</div>`
        : html`<div class="empty stack" style="align-items:center">
            <span style="font-size:36px">${icon}</span>
            <strong>Chưa có ${label.item} nào</strong>
            <span class="small muted">${label.hint}</span>
            <button class="btn btn-primary btn-sm" type="button" data-add-empty>${label.add}</button>
          </div>`}`);

    container.querySelector('[data-add]').addEventListener('click', () => edit(null));
    container.querySelector('[data-add-empty]')?.addEventListener('click', () => edit(null));
    bindPackageGalleries(container, packages, () => ({ subtitle: shop.name }));
    container.querySelectorAll('[data-package]').forEach((el) => {
      const pkg = packages.find((p) => p.id === el.dataset.package);
      el.querySelector('[data-edit]').addEventListener('click', () => edit(pkg));
      el.querySelector('[data-delete]').addEventListener('click', () => remove(pkg));
      const toggle = el.querySelector('[data-toggle]');
      toggle.addEventListener('click', () => withBusy(toggle, async () => {
        try {
          await setPackageActive(pkg.id, !pkg.is_active);
          toast(pkg.is_active ? `Đã ẩn ${label.item}.` : `Đã mở bán lại ${label.item}.`, 'success');
          await reload();
        } catch (error) {
          toastError(error);
        }
      }));
    });
  }

  function card(p) {
    return html`
      <article class="card item-card" data-package="${p.id}" style="${p.is_active ? '' : 'opacity:.6'}">
        ${packageThumbButton(p, icon)}
        <div class="body">
          <div class="row">${p.is_active ? badge('Đang bán', 'green') : badge('Đã ẩn')}</div>
          <h3>${p.name}</h3>
          <div>${priceTag(p)}</div>
          ${p.description ? html`<div class="small muted package-desc">${p.description}</div>` : ''}
          ${p.image_url ? '' : html`<div class="small muted">Chưa có ảnh chính – khách sẽ ít chú ý hơn</div>`}
          <div class="row">
            <button class="btn btn-outline btn-sm" type="button" data-edit>Sửa</button>
            <button class="btn btn-outline btn-sm" type="button" data-toggle>${p.is_active ? 'Ẩn' : 'Mở bán'}</button>
            <button class="btn btn-danger btn-sm" type="button" data-delete>Xóa</button>
          </div>
        </div>
      </article>`;
  }

  async function edit(pkg) {
    const removePhotoIds = new Set();
    const done = await openDialog({
      title: pkg ? `Sửa ${label.item}` : label.add.replace('+ ', ''),
      confirmText: pkg ? 'Lưu' : `Thêm ${label.item}`,
      content: html`
        <div class="form-grid">
          <label class="field full"><span>Tên ${label.item}</span>
            <input class="input" name="name" value="${pkg?.name || ''}" required maxlength="120" placeholder="${label.hint}"></label>
          <label class="field"><span>Giá (VNĐ)</span>
            <input class="input" name="price" data-money inputmode="numeric" autocomplete="off" placeholder="VD: 25.000.000"
              value="${moneyValue(pkg?.price)}" required></label>
          <label class="field"><span>Giá gốc trước giảm (không bắt buộc)</span>
            <input class="input" name="originalPrice" data-money inputmode="numeric" autocomplete="off"
              value="${moneyValue(pkg?.original_price)}"></label>
          <label class="field full"><span>Mô tả – gồm những gì, phù hợp bao nhiêu khách… (không bắt buộc)</span>
            <textarea class="input" name="description" maxlength="1500" rows="4"
              placeholder="VD: Cổng hoa lụa 3m, lối đi 8 trụ hoa, backdrop sân khấu, bàn gallery; phù hợp sảnh 20–40 bàn.">${pkg?.description || ''}</textarea></label>
          <div class="field full"><span>Ảnh chính – hiện ở ngoài để thu hút khách ${pkg?.image_url ? '(chọn ảnh mới để thay)' : ''}</span>
            ${pkg?.image_url ? html`<img src="${pkg.image_url}" alt="" style="max-height:160px;width:auto;border-radius:10px">` : ''}
            <input class="input" type="file" name="image" accept="image/*"></div>
          <div class="field full"><span>Ảnh chi tiết (góc khác, cận cảnh…) – tối đa ${MAX_PACKAGE_PHOTOS} ảnh</span>
            ${pkg?.photos.length ? html`
              <div class="photo-grid" style="grid-template-columns:repeat(auto-fill,minmax(80px,1fr))">
                ${pkg.photos.map((ph) => html`
                  <figure class="photo" data-photo="${ph.id}">
                    <img src="${ph.url}" alt="">
                    <button class="btn btn-danger btn-sm" type="button" data-toggle-remove aria-label="Xóa ảnh">✕</button>
                  </figure>`)}
              </div>
              <span class="small muted" data-remove-note hidden></span>` : ''}
            <input class="input" type="file" name="photos" accept="image/*" multiple></div>
        </div>`,
      // Bấm ✕ chỉ đánh dấu ảnh sẽ xóa; bấm Lưu mới xóa thật (bấm Hủy thì giữ nguyên)
      onOpen: (dialogEl) => {
        dialogEl.querySelectorAll('[data-toggle-remove]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const figure = btn.closest('[data-photo]');
            const id = figure.dataset.photo;
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
        return savePackage(shop.id, pkg, {
          name: form.get('name').trim(),
          price,
          originalPrice,
          description: form.get('description').trim(),
          imageFile: form.get('image'),
          photoFiles: form.getAll('photos').filter((f) => f.size > 0),
          removePhotoIds: [...removePhotoIds],
        });
      },
    });
    if (done) { toast(pkg ? `Đã lưu ${label.item}.` : `Đã thêm ${label.item}.`, 'success'); reload(); }
  }

  async function remove(pkg) {
    const done = await openDialog({
      title: `Xóa "${pkg.name}"?`,
      confirmText: `Xóa ${label.item}`,
      danger: true,
      content: html`<p>${label.item[0].toUpperCase() + label.item.slice(1)} và ảnh sẽ bị xóa vĩnh viễn (đơn khách đã đặt vẫn giữ tên ${label.item}). Nếu chỉ muốn tạm ngừng bán, hãy bấm "Ẩn".</p>`,
      onConfirm: () => deletePackage(pkg),
    });
    if (done) { toast(`Đã xóa ${label.item}.`, 'success'); reload(); }
  }

  await reload();
}
