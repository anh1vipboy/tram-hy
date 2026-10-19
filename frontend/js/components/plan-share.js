// Chủ kế hoạch chia sẻ link CHỈ XEM (bố mẹ, nửa kia, wedding planner): bật / tắt, sao chép, gửi Zalo / Messenger,
// mã QR, tạo link mới (link cũ hết hiệu lực). Token do server tạo (SQL 33) – web không tự sinh.
import { html, render } from '../core/utils.js';
import { openDialog, openSheet, toast, toastError, withBusy } from '../core/ui.js';
import { getPlanShare, setPlanShare, rotatePlanShare, shareUrl } from '../services/planner.js';
import { qrCanvas, downloadCanvas, shareLink } from './qr-share.js';

const TITLE = 'Kế hoạch cưới của chúng mình';
const MESSAGE = 'Mời cả nhà xem kế hoạch cưới (ngân sách, việc cần chuẩn bị) của chúng mình trên Trạm Hỷ 💍';

export function openPlanShare() {
  openSheet({
    title: 'Chia sẻ kế hoạch cưới',
    className: 'plan-share-sheet',
    onOpen: (body) => {
      render(body, html`<div class="empty">Đang tải…</div>`);
      let state = null;

      const draw = () => {
        const link = state.token ? shareUrl(state.token) : '';
        const qr = state.enabled && link ? qrCanvas(link, { caption: 'Kế hoạch cưới – Trạm Hỷ' }) : null;
        render(body, html`
          <p class="small muted" style="margin:0">Gửi link cho bố mẹ, nửa kia hay wedding planner để mọi người cùng theo dõi
            ngân sách và việc cần chuẩn bị – không cần tài khoản.</p>
          <label class="share-switch">
            <input type="checkbox" role="switch" data-toggle ${state.enabled ? 'checked' : ''}>
            <span class="share-switch-track" aria-hidden="true"></span>
            <span><strong>Cho phép xem bằng link</strong>
              <span class="small muted">${state.enabled ? 'Đang bật – ai có link đều xem được' : 'Đang tắt – link không mở được'}</span></span>
          </label>
          ${state.enabled ? html`
            <div class="row share-link-row">
              <input class="input" value="${link}" readonly aria-label="Link xem kế hoạch" data-link>
              <button class="btn btn-dark btn-sm" type="button" data-copy>Sao chép</button>
            </div>
            <div class="share-actions">
              <button class="btn btn-primary btn-sm" type="button" data-share>📤 Gửi qua Zalo, Messenger…</button>
              <a class="btn btn-outline btn-sm" href="${link}" target="_blank" rel="noopener">Mở thử như người xem</a>
            </div>
            <div class="share-qr">
              <img src="${qr.toDataURL('image/png')}" alt="Mã QR mở kế hoạch cưới" width="120" height="120">
              <div class="stack" style="gap:6px">
                <strong class="small">Mã QR</strong>
                <span class="small muted">Bố mẹ quét bằng camera điện thoại là mở được kế hoạch.</span>
                <button class="btn btn-outline btn-sm" type="button" data-download-qr style="align-self:flex-start">⬇ Tải mã QR</button>
              </div>
            </div>` : ''}
          <div class="notice small share-note">
            👀 Người có link <b>chỉ xem</b> được ngân sách, checklist và các đơn dịch vụ (tên, số tiền, trạng thái) –
            không sửa được gì, không thấy email hay số điện thoại của bạn.
          </div>
          ${state.token ? html`
            <div class="row share-rotate">
              <span class="small muted" style="flex:1;min-width:180px">Lỡ gửi nhầm người? Tạo link mới – link cũ sẽ không mở được nữa.</span>
              <button class="btn btn-outline btn-sm" type="button" data-rotate>🔄 Tạo link mới</button>
            </div>` : ''}`);

        const toggle = body.querySelector('[data-toggle]');
        toggle.addEventListener('change', async () => {
          toggle.disabled = true;
          try {
            state = await setPlanShare(toggle.checked);
            toast(state.enabled ? 'Đã bật chia sẻ – gửi link cho người thân nhé.' : 'Đã tắt chia sẻ – link không mở được nữa.', 'success');
            draw();
          } catch (error) {
            toggle.checked = !toggle.checked;
            toggle.disabled = false;
            toastError(error);
          }
        });
        body.querySelector('[data-copy]')?.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(link);
            toast('Đã sao chép link – dán vào Zalo / Messenger để gửi.', 'success');
          } catch {
            body.querySelector('[data-link]').select();          // trình duyệt chặn clipboard → chọn sẵn để tự copy
            toast('Không sao chép được – hãy giữ vào ô link để copy.');
          }
        });
        body.querySelector('[data-share]')?.addEventListener('click', () => shareLink({ title: TITLE, text: MESSAGE, url: link })
          .then((how) => { if (how === 'copied') toast('Đã sao chép link – dán vào Zalo / Messenger để gửi.', 'success'); })
          .catch(() => toast('Không chia sẻ được – hãy bấm "Sao chép".')));
        body.querySelector('[data-download-qr]')?.addEventListener('click', () => downloadCanvas(qr, 'ma-qr-ke-hoach-cuoi.png'));
        body.querySelector('[data-rotate]')?.addEventListener('click', async (e) => {
          const button = e.currentTarget;            // sau await, e.currentTarget đã thành null
          const ok = await openDialog({
            title: 'Tạo link mới?',
            danger: true,
            confirmText: 'Tạo link mới',
            content: html`<p>Link đang gửi cho mọi người sẽ <strong>không mở được nữa</strong>. Bạn cần gửi lại link mới cho những ai vẫn được xem.</p>`,
          });
          if (!ok) return;
          await withBusy(button, async () => {
            try {
              state = await rotatePlanShare();
              toast('Đã tạo link mới – link cũ đã hết hiệu lực.', 'success');
              draw();
            } catch (error) {
              toastError(error);
            }
          });
        });
      };

      getPlanShare().then((s) => { state = s; draw(); }).catch((error) => {
        render(body, html`<div class="empty">${error.code === 'SHARE_UNAVAILABLE' ? error.message : 'Chưa tải được trạng thái chia sẻ – bạn thử lại sau nhé.'}</div>`);
        if (error.code !== 'SHARE_UNAVAILABLE') console.warn(error);
      });
    },
  });
}
