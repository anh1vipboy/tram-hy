// Kênh đối tác → tab "Ảnh tiệm": logo, ảnh bìa, ảnh thực tế (portfolio) hiện trên trang tiệm
import { html, render, initials } from '../core/utils.js';
import { openDialog, toast, toastError } from '../core/ui.js';
import { listVendorPhotos } from '../services/catalog.js';
import { changeLogo, removeLogo, changeCover, addPortfolioPhotos, deletePortfolioPhoto } from '../services/shop.js';
import { vendorLogo } from './vendor-logo.js';

const MAX_PHOTOS = 20;

export async function mountShopMedia(container, shop) {
  let photos = [];
  let busyText = '';   // khác rỗng khi đang tải ảnh lên

  async function reload() {
    try {
      photos = await listVendorPhotos(shop.id);
    } catch (error) {
      toastError(error);
    }
    draw();
  }

  function draw() {
    const full = photos.length >= MAX_PHOTOS;
    render(container, html`
      <div class="stack">
        <section class="card stack">
          <div>
            <h2 style="margin:0">Ảnh đại diện (logo)</h2>
            <p class="muted small">Hiện cạnh tên tiệm ở Dịch vụ cưới, trang tiệm và trang chủ. Nên dùng ảnh vuông, logo nằm giữa.</p>
          </div>
          <div class="row">
            ${vendorLogo(shop, { size: 88 })}
            <label class="btn btn-outline btn-sm">
              ${shop.logo_url ? 'Đổi logo' : 'Tải logo'}
              <input type="file" accept="image/*" data-logo hidden ${busyText ? 'disabled' : ''}>
            </label>
            ${shop.logo_url ? html`<button class="btn btn-link btn-sm" type="button" data-remove-logo>Gỡ logo</button>` : ''}
          </div>
        </section>

        <section class="card stack">
          <div>
            <h2 style="margin:0">Ảnh bìa</h2>
            <p class="muted small">Hiện ở danh sách Dịch vụ cưới và đầu trang tiệm. Nên dùng ảnh ngang, rõ mặt tiền hoặc tác phẩm đẹp nhất.</p>
          </div>
          ${shop.cover_url
            ? html`<img class="cover-preview" src="${shop.cover_url}" alt="Ảnh bìa">`
            : html`<div class="cover-preview thumb-placeholder">${initials(shop.name)}</div>`}
          <label class="btn btn-outline btn-sm" style="width:fit-content">
            ${shop.cover_url ? 'Đổi ảnh bìa' : 'Tải ảnh bìa'}
            <input type="file" accept="image/*" data-cover hidden ${busyText ? 'disabled' : ''}>
          </label>
        </section>

        <section class="card stack">
          <div class="row">
            <div>
              <h2 style="margin:0">Ảnh thực tế <span class="muted small">(${photos.length}/${MAX_PHOTOS})</span></h2>
              <p class="muted small">Ảnh chụp thật, không chỉnh sửa quá đà – khách tin tưởng hơn khi thấy sản phẩm thật.</p>
            </div>
            <span class="spacer"></span>
            ${full ? html`<span class="small muted">Đã đủ ${MAX_PHOTOS} ảnh</span>` : html`
              <label class="btn btn-primary btn-sm">
                + Thêm ảnh
                <input type="file" accept="image/*" multiple data-photos hidden ${busyText ? 'disabled' : ''}>
              </label>`}
          </div>
          ${busyText ? html`<div class="notice">${busyText}</div>` : ''}
          ${photos.length
            ? html`<div class="photo-grid">${photos.map((p) => html`
                <figure class="photo" data-photo="${p.id}">
                  <img src="${p.url}" alt="" loading="lazy">
                  <button class="btn btn-danger btn-sm" type="button" data-delete-photo aria-label="Xóa ảnh">✕</button>
                </figure>`)}</div>`
            : html`<div class="empty">Chưa có ảnh thực tế nào.</div>`}
        </section>
      </div>`);

    container.querySelector('[data-logo]')?.addEventListener('change', (e) => upload(
      'Đang tải logo…',
      async () => { shop.logo_url = await changeLogo(shop, e.target.files[0]); },
      'Đã cập nhật logo.',
    ));
    container.querySelector('[data-remove-logo]')?.addEventListener('click', () => upload(
      'Đang gỡ logo…',
      async () => { await removeLogo(shop); shop.logo_url = null; },
      'Đã gỡ logo.',
    ));
    container.querySelector('[data-cover]')?.addEventListener('change', (e) => upload(
      'Đang tải ảnh bìa…',
      async () => { shop.cover_url = await changeCover(shop, e.target.files[0]); },
      'Đã cập nhật ảnh bìa.',
    ));
    container.querySelector('[data-photos]')?.addEventListener('change', (e) => {
      const files = [...e.target.files].slice(0, MAX_PHOTOS - photos.length);
      upload(`Đang tải ${files.length} ảnh…`, () => addPortfolioPhotos(shop.id, files), `Đã thêm ${files.length} ảnh.`);
    });
    container.querySelectorAll('[data-delete-photo]').forEach((btn) => {
      const photo = photos.find((p) => p.id === btn.closest('[data-photo]').dataset.photo);
      btn.addEventListener('click', () => removePhoto(photo));
    });
  }

  async function upload(progressText, task, successText) {
    busyText = progressText;
    draw();
    try {
      await task();
      toast(successText, 'success');
    } catch (error) {
      toastError(error);
    } finally {
      busyText = '';
      await reload();
    }
  }

  async function removePhoto(photo) {
    const done = await openDialog({
      title: 'Xóa ảnh này?',
      confirmText: 'Xóa ảnh',
      danger: true,
      content: html`<img src="${photo.url}" alt="" style="max-height:200px;margin:0 auto;border-radius:10px">`,
      onConfirm: () => deletePortfolioPhoto(photo),
    });
    if (done) { toast('Đã xóa ảnh.', 'success'); reload(); }
  }

  await reload();
}
