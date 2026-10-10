// Sau khi tiệm được duyệt: "Hoàn thiện hồ sơ" kiểu các sàn lớn – thanh % + việc cần làm để bắt đầu nhận đơn.
import { html, render } from '../core/utils.js';
import { openDialog, toast, toastError } from '../core/ui.js';
import { BANKS, bankName } from '../data/banks.js';
import { listVendorPhotos } from '../services/catalog.js';
import { listShopDresses, listShopPackages, getPayout, savePayout } from '../services/shop.js';
import { packageLabel } from '../core/labels.js';

const MIN_ITEMS = 3;
const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, value); } catch { /* bỏ qua */ } };

/** goTo(panel): mở tab Mẫu váy / Ảnh tiệm của Kênh đối tác */
export async function mountPartnerChecklist(container, shop, { goTo }) {
  const previewKey = `tramhy-previewed-${shop.id}`;
  const hiddenKey = `tramhy-checklist-hidden-${shop.id}`;
  const isBridal = shop.category === 'bridal';
  let payout = null;
  let itemCount = 0;

  async function loadData() {
    try {
      [payout, itemCount] = await Promise.all([
        getPayout(shop.id).catch(() => null),          // chưa chạy SQL 17 → coi như chưa có
        isBridal ? listShopDresses(shop.id).then((d) => d.length)
          : listShopPackages(shop.id).then((p) => p.length).catch(() => listVendorPhotos(shop.id).then((ph) => ph.length)),
      ]);
    } catch (error) {
      toastError(error);
    }
  }

  function draw() {
    const items = [
      { done: Boolean(shop.logo_url && shop.cover_url), title: 'Tải logo và ảnh bìa',
        hint: 'Khách nhận ra tiệm của bạn ngay ở danh sách Dịch vụ cưới.', action: 'Tải ảnh', go: 'media' },
      { done: itemCount >= MIN_ITEMS,
        title: isBridal ? `Đăng ít nhất ${MIN_ITEMS} mẫu váy (${itemCount}/${MIN_ITEMS})`
          : `Đăng ít nhất ${MIN_ITEMS} ${packageLabel(shop.category).item} – ${packageLabel(shop.category).section.toLowerCase()} (${itemCount}/${MIN_ITEMS})`,
        hint: isBridal ? 'Mẫu váy có ảnh thật sẽ được khách ướm thử bằng AI.' : 'Mỗi gói có giá và ảnh riêng – khách chọn đúng gói và đặt ngay.',
        action: isBridal ? 'Thêm mẫu váy' : packageLabel(shop.category).add.replace('+ ', ''), go: 'dresses' },
      { done: Boolean(payout), title: 'Tài khoản nhận tiền giải ngân',
        hint: payout ? `${bankName(payout.bank_code)} · •••• ${payout.account_no.slice(-4)} · ${payout.account_name}`
                     : 'Trạm Hỷ chuyển tiền vào tài khoản này sau mỗi đợt khách nghiệm thu.',
        action: payout ? 'Sửa' : 'Thêm tài khoản', payout: true },
      { done: Boolean(read(previewKey)), title: 'Xem trang tiệm như khách thấy',
        hint: 'Kiểm tra ảnh, giá, giới thiệu trước khi khách vào xem.', action: 'Xem trang tiệm', preview: true },
    ];
    const doneCount = items.filter((i) => i.done).length;
    const percent = Math.round((doneCount / items.length) * 100);

    if (percent === 100 && read(hiddenKey)) {
      render(container, '');
      return;
    }
    render(container, html`
      <section class="card stack checklist ${percent === 100 ? 'is-complete' : ''}">
        <div class="row">
          <div>
            <h3 style="margin:0">${percent === 100 ? '🎉 Hồ sơ tiệm đã hoàn thiện!' : 'Hoàn thiện hồ sơ để bắt đầu nhận đơn'}</h3>
            <p class="small muted" style="margin:2px 0 0">${doneCount}/${items.length} việc đã xong</p>
          </div>
          <span class="spacer"></span>
          <strong class="checklist-percent">${percent}%</strong>
          ${percent === 100 ? html`<button class="btn btn-link btn-sm" type="button" data-hide>Ẩn</button>` : ''}
        </div>
        <div class="progress" role="progressbar" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100">
          <span style="width:${percent}%"></span></div>
        <ul class="checklist-items">
          ${items.map((item, i) => html`
            <li class="${item.done ? 'done' : ''}">
              <span class="check" aria-hidden="true">${item.done ? '✓' : ''}</span>
              <div class="text"><strong>${item.title}</strong><div class="small muted">${item.hint}</div></div>
              ${item.preview
                ? html`<a class="btn btn-outline btn-sm" href="vendor.html?slug=${shop.slug}" target="_blank" rel="noopener" data-preview>${item.action}</a>`
                : (!item.done || item.payout) ? html`<button class="btn ${item.done ? 'btn-outline' : 'btn-primary'} btn-sm" type="button" data-item="${i}">${item.action}</button>` : ''}
            </li>`)}
        </ul>
      </section>`);

    container.querySelector('[data-hide]')?.addEventListener('click', () => { write(hiddenKey, '1'); draw(); });
    container.querySelector('[data-preview]')?.addEventListener('click', () => { write(previewKey, '1'); setTimeout(draw, 300); });
    container.querySelectorAll('[data-item]').forEach((btn) => btn.addEventListener('click', () => {
      const item = items[Number(btn.dataset.item)];
      if (item.payout) editPayout();
      else goTo(item.go);
    }));
  }

  async function editPayout() {
    const saved = await openDialog({
      title: 'Tài khoản nhận tiền giải ngân',
      confirmText: 'Lưu tài khoản',
      content: html`
        <p class="small muted" style="margin-top:0">Chỉ bạn và Trạm Hỷ xem được. Tên chủ tài khoản phải trùng với tên trên thẻ / ứng dụng ngân hàng.</p>
        <div class="form-grid">
          <label class="field full"><span>Ngân hàng</span>
            <select class="input" name="bankCode">${BANKS.map(([code, name]) => html`
              <option value="${code}" ${code === payout?.bank_code ? 'selected' : ''}>${name}</option>`)}</select></label>
          <label class="field"><span>Số tài khoản</span>
            <input class="input" name="accountNo" inputmode="numeric" required pattern="[0-9 ]{6,24}"
              value="${payout?.account_no ?? ''}" autocomplete="off"></label>
          <label class="field"><span>Tên chủ tài khoản</span>
            <input class="input" name="accountName" required maxlength="80" placeholder="VD: NGUYEN VAN A"
              value="${payout?.account_name ?? ''}" style="text-transform:uppercase"></label>
        </div>`,
      onConfirm: (form) => savePayout(shop.id, {
        bankCode: form.get('bankCode'),
        accountNo: form.get('accountNo').replace(/\s/g, ''),
        accountName: form.get('accountName').trim(),
      }),
    });
    if (saved) {
      payout = saved;
      toast('Đã lưu tài khoản nhận tiền.', 'success');
      draw();
    }
  }

  await loadData();
  draw();
  return { refresh: async () => { await loadData(); draw(); } };
}
