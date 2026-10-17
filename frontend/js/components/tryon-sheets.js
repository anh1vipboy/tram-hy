// Các tấm chọn ở Phòng thử váy AI: "Ảnh của bạn", "Váy cưới", "Tùy chỉnh" (chất lượng ảnh + số đo).
// Trang tryon.js giữ dữ liệu; các tấm này chỉ vẽ và báo lại lựa chọn qua callback.
import { $, html, render, money, sizedImage } from '../core/utils.js';
import { DRESS_THEME } from '../core/labels.js';
import { openSheet } from '../core/ui.js';
import { MODELS, BODY_SHAPES, bmiInfo } from '../data/tryon-data.js';

const ACCEPT = 'image/jpeg,image/png,image/webp';

// Ô ảnh trong lưới chọn; removable → nút × xóa ảnh đã lưu
const tile = ({ key, photo, name, sub = '', price = null, active, removable = false }) => html`
  <div class="pick-tile ${active ? 'active' : ''}">
    <button type="button" class="pick-main" data-pick="${key}" aria-pressed="${active ? 'true' : 'false'}">
      <img src="${photo}" alt="" loading="lazy">
      <span class="pick-name">${name}</span>
      ${sub ? html`<span class="pick-sub">${sub}</span>` : ''}
      ${price !== null ? html`<span class="pick-price">${money(price)}</span>` : ''}
    </button>
    ${removable ? html`<button type="button" class="pick-remove" data-remove="${key}" aria-label="Xóa ảnh" title="Xóa ảnh">×</button>` : ''}
  </div>`;

// Ô tải ảnh lên (đã đăng nhập) hoặc mời đăng nhập
const uploadTile = ({ loggedIn, loginHref, icon, title, hint }) => (loggedIn
  ? html`<label class="upload-tile">
      <input type="file" accept="${ACCEPT}" hidden data-upload>
      <span class="upload-icon" aria-hidden="true">${icon}</span>
      <span class="upload-text"><strong>${title}</strong><small>${hint}</small></span>
    </label>`
  : html`<a class="upload-tile" href="${loginHref}">
      <span class="upload-icon" aria-hidden="true">🔑</span>
      <span class="upload-text"><strong>Đăng nhập để tải ảnh lên</strong><small>Ảnh được lưu riêng tư – chỉ bạn xem được</small></span>
    </a>`);

// Gắn sự kiện chung: chọn ảnh, xóa ảnh (vẽ lại sau khi xóa), tải ảnh lên (đóng tấm)
function bindTiles(root, { onPick, onDelete, onUpload, close, redraw }) {
  root.addEventListener('click', async (e) => {
    const remove = e.target.closest('[data-remove]');
    if (remove) {
      if (await onDelete(remove.dataset.remove)) redraw();
      return;
    }
    const pick = e.target.closest('[data-pick]');
    if (pick) {
      close();
      onPick(pick.dataset.pick);
    }
  });
  root.addEventListener('change', (e) => {
    if (!e.target.matches('[data-upload]')) return;
    const file = e.target.files[0];
    if (!file) return;
    close();
    onUpload(file);
  });
}

/**
 * Tấm "Ảnh của bạn": tải ảnh lên, ảnh đã lưu (xóa được), người mẫu có sẵn.
 * onPick(key): key = đường dẫn ảnh đã lưu hoặc "sample:<mã người mẫu>". onDelete(path) → true nếu đã xóa.
 */
export function openPersonSheet({ loggedIn, loginHref, getPhotos, max, selectedKey, onPick, onDelete, onUpload }) {
  openSheet({
    title: 'Ảnh của bạn',
    className: 'pick-sheet',
    onOpen: (body, close) => {
      const draw = () => {
        const photos = getPhotos();
        render(body, html`
          ${uploadTile({ loggedIn, loginHref, icon: '📷', title: 'Tải ảnh của bạn lên',
            hint: 'Ảnh rõ mặt, đủ sáng; đứng thẳng thấy toàn thân là đẹp nhất' })}
          ${photos.length ? html`
            <h4 class="sheet-label">Ảnh đã lưu <span>${photos.length}/${max} · chỉ bạn xem được</span></h4>
            <div class="pick-grid">
              ${photos.map((p) => tile({ key: p.path, photo: p.url, name: 'Ảnh của bạn', active: p.path === selectedKey, removable: true }))}
            </div>` : ''}
          <h4 class="sheet-label">Hoặc dùng người mẫu có sẵn</h4>
          <div class="pick-grid">
            ${MODELS.map((m) => tile({ key: `sample:${m.key}`, photo: m.photo, name: m.name, active: `sample:${m.key}` === selectedKey }))}
          </div>`);
      };
      bindTiles(body, { onPick, onDelete, onUpload, close, redraw: draw });
      draw();
    },
  });
}

/**
 * Tấm "Váy cưới": tab Mẫu của các tiệm (lọc theo kiểu) | Ảnh váy của bạn (tải lên, xóa được).
 * onPickDress(id) cho mẫu của tiệm; onPickGarment(path) cho ảnh váy đã lưu.
 */
export function openDressSheet({
  tab = 'catalog', loggedIn, loginHref, dresses, getGarments, max, selectedKey,
  onPickDress, onPickGarment, onDelete, onUpload,
}) {
  let current = tab;
  let theme = 'all';
  openSheet({
    title: 'Chọn váy cưới',
    className: 'pick-sheet',
    onOpen: (body, close) => {
      const draw = () => {
        const garments = getGarments();
        const list = dresses.filter((d) => theme === 'all' || d.theme === theme);
        render(body, html`
          <div class="tabs sheet-tabs" role="tablist">
            <button class="tab ${current === 'catalog' ? 'active' : ''}" type="button" role="tab" data-tab="catalog"
                    aria-selected="${current === 'catalog'}">Mẫu của các tiệm</button>
            <button class="tab ${current === 'own' ? 'active' : ''}" type="button" role="tab" data-tab="own"
                    aria-selected="${current === 'own'}">Ảnh váy của bạn</button>
          </div>
          ${current === 'catalog' ? html`
            <div class="chips sheet-filter">
              ${[['all', 'Tất cả'], ...Object.entries(DRESS_THEME)].map(([key, label]) => html`
                <button class="chip ${key === theme ? 'active' : ''}" type="button" data-theme="${key}">${label}</button>`)}
            </div>
            ${list.length ? html`
              <div class="pick-grid dresses">
                ${list.map((d) => tile({
                  key: `dress:${d.id}`, photo: sizedImage(d.image_url, 360), name: d.name, sub: d.vendor.name,
                  price: d.price, active: `dress:${d.id}` === selectedKey,
                }))}
              </div>` : html`<p class="muted">Chưa có mẫu váy kiểu này có ảnh thật để ướm thử.</p>`}`
          : html`
            ${uploadTile({ loggedIn, loginHref, icon: '👗', title: 'Tải ảnh váy lên',
              hint: 'Váy thấy trên mạng hay ở tiệm – ảnh rõ nét, thấy trọn chiếc váy' })}
            ${garments.length ? html`
              <h4 class="sheet-label">Ảnh váy đã lưu <span>${garments.length}/${max} · chỉ bạn xem được</span></h4>
              <div class="pick-grid">
                ${garments.map((g, i) => tile({ key: g.path, photo: g.url, name: `Váy ${garments.length - i}`,
                  active: g.path === selectedKey, removable: true }))}
              </div>` : html`<p class="small muted">Chưa có ảnh váy nào – tải ảnh lên để AI ướm chiếc váy đó lên ảnh của bạn.</p>`}`}`);
      };
      body.addEventListener('click', (e) => {
        const tabButton = e.target.closest('[data-tab]');
        const themeChip = e.target.closest('[data-theme]');
        if (tabButton) current = tabButton.dataset.tab;
        if (themeChip) theme = themeChip.dataset.theme;
        if (tabButton || themeChip) draw();
      });
      bindTiles(body, {
        onPick: (key) => (key.startsWith('dress:') ? onPickDress(key.slice(6)) : onPickGarment(key)),
        onDelete, onUpload, close, redraw: draw,
      });
      draw();
    },
  });
}

// ---------- TÙY CHỈNH ----------
const MODEL_CHOICES = [['max', '💎 Siêu nét'], ['standard', '⚡ Tiêu chuẩn']];
const QUALITY_CHOICES = [['fast', 'Nhanh'], ['balanced', 'Cân bằng'], ['quality', 'Đẹp nhất']];
export const QUALITY_SECONDS = { fast: 6, balanced: 10, quality: 17 };     // thời gian chờ ước tính 1 ảnh (Tiêu chuẩn)
const CATEGORY_CHOICES = [['one-pieces', 'Váy liền'], ['tops', 'Áo'], ['bottoms', 'Chân váy / quần'], ['auto', 'AI tự nhận']];
const PHOTO_TYPE_CHOICES = [['auto', 'AI tự nhận'], ['flat-lay', 'Váy trải phẳng'], ['model', 'Người mẫu đang mặc']];

/**
 * Tấm "Tùy chỉnh": mô hình (Siêu nét chỉ khi admin bật), chất lượng, số ảnh, lựa chọn riêng của Tiêu chuẩn, số đo.
 * getOptions() → tùy chọn đang có hiệu lực; setOption(key, value); cost(options) → credit; body: số đo (sửa trực tiếp).
 */
export function openSettingsSheet({ maxEnabled, ownGarment, getOptions, setOption, cost, remaining, body, loggedIn, onBodyChange }) {
  openSheet({
    title: 'Tùy chỉnh ướm thử',
    className: 'settings-sheet',
    onOpen: (root) => {
      render(root, html`
        <section class="opts"></section>
        <section class="measure">
          <h4 class="sheet-label">Số đo của bạn <span>giúp AI đặt độ dài váy và tính độ tôn dáng</span></h4>
          <label class="field"><span>Chiều cao: <strong id="height-value"></strong> cm</span>
            <input type="range" id="height" min="140" max="185"></label>
          <label class="field"><span>Cân nặng: <strong id="weight-value"></strong> kg</span>
            <input type="range" id="weight" min="38" max="90"></label>
          <p class="bmi small" id="bmi" aria-live="polite"></p>
          <label class="field"><span>Giày cưới</span>
            <select class="input" id="heel">
              <option value="0">Giày bệt</option>
              <option value="5">Cao 5cm</option>
              <option value="7">Cao 7cm</option>
              <option value="10">Cao 10cm</option>
            </select>
          </label>
          <div class="field"><span>Dáng người</span><div class="chips" id="shapes"></div></div>
          <p class="small muted" style="margin:0">${loggedIn ? 'Số đo được tự lưu vào tài khoản của bạn.' : 'Đăng nhập để lưu số đo cho lần sau.'}</p>
        </section>`);

      const opts = $('.opts', root);
      const group = (title, key, choices, value, note = '') => html`
        <div class="opt-group">
          <span class="sheet-label">${title}</span>
          <div class="chips">
            ${choices.map(([v, label]) => html`
              <button class="chip ${v === value ? 'active' : ''}" type="button" data-opt="${key}" data-value="${v}">${label}</button>`)}
          </div>
          ${note ? html`<span class="opt-note">${note}</span>` : ''}
        </div>`;

      const drawOptions = () => {
        const o = getOptions();
        const max = o.model === 'max';
        const qualityLabel = ([v, label]) => [v, max ? `${label} · ${cost({ ...o, quality: v, samples: 1 })} credit` : `${label} · ~${QUALITY_SECONDS[v]} giây`];
        render(opts, html`
          ${maxEnabled ? group('Mô hình AI', 'model', MODEL_CHOICES, o.model, max
            ? 'Siêu nét: ảnh đẹp, chất vải tự nhiên – 1–3 credit mỗi ảnh, nhận ghi chú cách mặc trong tin nhắn.'
            : 'Tiêu chuẩn: nhanh, 1 credit mỗi ảnh – hợp với ảnh đứng thẳng thấy toàn thân.') : ''}
          ${group('Chất lượng', 'quality', QUALITY_CHOICES.map(qualityLabel), o.quality)}
          ${group('Số ảnh mỗi lần', 'samples', [1, 2, 3, 4].map((n) => [String(n), `${n} ảnh`]), String(o.samples),
            'Nhiều ảnh = nhiều kiểu để chọn ảnh ưng nhất.')}
          ${max ? '' : html`
            ${ownGarment ? group('Loại trang phục', 'category', CATEGORY_CHOICES, o.category) : ''}
            ${group('Ảnh váy là', 'photoType', PHOTO_TYPE_CHOICES, o.photoType)}
            <label class="opt-check">
              <input type="checkbox" data-clean ${o.cleanOriginal ? 'checked' : ''}>
              <span>Xóa kỹ đồ đang mặc <small>– bật khi áo/váy cũ còn lộ ra trên ảnh</small></span>
            </label>`}
          <p class="opt-total">Mỗi lần ướm: <strong>${cost(o)} credit</strong>${remaining !== null
            ? ` · hôm nay còn ${remaining} credit` : ''}</p>`);
      };
      opts.addEventListener('click', (e) => {
        const chip = e.target.closest('[data-opt]');
        if (!chip) return;
        setOption(chip.dataset.opt, chip.dataset.opt === 'samples' ? Number(chip.dataset.value) : chip.dataset.value);
        drawOptions();
      });
      opts.addEventListener('change', (e) => {
        if (!e.target.matches('[data-clean]')) return;
        setOption('cleanOriginal', e.target.checked);
        drawOptions();
      });

      // Số đo: không vẽ lại thanh trượt khi kéo (vẽ lại sẽ làm rơi thao tác kéo) – chỉ cập nhật chữ
      const drawMeasure = () => {
        $('#height-value', root).textContent = body.height;
        $('#weight-value', root).textContent = body.weight;
        const bmi = bmiInfo(body.height, body.weight);
        render($('#bmi', root), html`BMI <strong>${bmi.value.toLocaleString('vi-VN')}</strong> · ${bmi.label}
          <span class="muted">– ${bmi.tip}</span>`);
        render($('#shapes', root), BODY_SHAPES.map((s) => html`
          <button class="chip ${s.key === body.shape ? 'active' : ''}" type="button" data-shape="${s.key}">${s.label}</button>`));
      };
      $('#height', root).value = body.height;
      $('#weight', root).value = body.weight;
      $('#heel', root).value = String(body.heel);
      for (const key of ['height', 'weight']) {
        $(`#${key}`, root).addEventListener('input', (e) => {
          body[key] = Number(e.target.value);
          drawMeasure();
          onBodyChange();
        });
      }
      $('#heel', root).addEventListener('change', (e) => {
        body.heel = Number(e.target.value);
        onBodyChange();
      });
      $('#shapes', root).addEventListener('click', (e) => {
        const chip = e.target.closest('[data-shape]');
        if (!chip) return;
        body.shape = chip.dataset.shape;
        drawMeasure();
        onBodyChange();
      });

      drawOptions();
      drawMeasure();
    },
  });
}
