// Trang xem kế hoạch cưới được chia sẻ (ke-hoach.html?xem=<token>): chỉ đọc, không cần đăng nhập.
// Dữ liệu lấy từ get_shared_plan (SQL 33) – đã lọc sẵn ở server, không có email / số điện thoại.
// Số liệu tính bằng đúng các hàm của trang chủ kế hoạch → người xem thấy y như cô dâu chú rể thấy.
import { html, render, money, param } from '../core/utils.js';
import { openDialog, toast, toastError, withBusy } from '../core/ui.js';
import { BOOKING_STATUS, VENDOR_CATEGORY, badge } from '../core/labels.js';
import { REGION_LABEL, CHECKLIST_STAGES } from '../data/planner-templates.js';
import { parseCategoryParty } from '../services/planner.js';
import { budgetTotals, partyTotals, bookingPaid, bookingName, linkBookings } from './budget-board.js';
import { checklistProgress, nextTasks, dueLabel, stageIndex } from './checklist-board.js';
import { countdownCard, weddingDateLabel } from './plan-summary.js';
import { shareLink } from './qr-share.js';

const TABS = [
  ['overview',  'Tổng quan'],
  ['budget',    'Ngân sách'],
  ['checklist', 'Checklist'],
  ['services',  '🏪 Dịch vụ đã chọn'],
];
const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

export const coupleNames = (couple) => (couple?.groom_name && couple?.bride_name ? `${couple.bride_name} & ${couple.groom_name}` : '');

/** Lời nhắn khi link không mở được */
export function renderShareError(container, status) {
  const text = status === 'disabled'
    ? ['Kế hoạch đang tạm ẩn', 'Cô dâu chú rể đã tạm tắt chia sẻ kế hoạch này. Bạn nhắn họ bật lại nhé.']
    : ['Link không còn hiệu lực', 'Link có thể đã gõ sai, hoặc cô dâu chú rể đã tạo link mới. Bạn xin lại link mới nhất nhé.'];
  render(container, html`
    <section class="card share-error">
      <span class="share-error-icon" aria-hidden="true">${status === 'disabled' ? '🙈' : '🔗'}</span>
      <h2>${text[0]}</h2>
      <p class="muted">${text[1]}</p>
      <a class="btn btn-primary" href="ke-hoach.html">Lập kế hoạch cưới của bạn – miễn phí</a>
    </section>`);
}

/**
 * Vẽ kế hoạch chỉ xem. data = { plan, couple, categories, checklist, bookings }.
 * onExport(data) – bấm "Tải Excel" (trang gọi tải thư viện Excel khi cần).
 */
export function mountSharedPlan(container, data, { onExport } = {}) {
  const { plan, categories, bookings } = data;
  const tasks = data.checklist;
  const hideMoney = param('an_tien') === '1';
  const initialParty = ['groom', 'bride', 'both'].includes(param('ben')) ? param('ben') : 'all';
  let tab = 'overview';
  let filter = 'all';
  let partyFilter = initialParty;

  const fmtMoney = (n) => (hideMoney ? '🔒 Đã ẩn' : money(n));

  async function openFeedbackDialog(topic) {
    await openDialog({
      title: `💬 Góp ý mục: ${topic}`,
      confirmText: '📤 Gửi qua Zalo / Sao chép',
      content: html`
        <div class="stack">
          <p class="small muted" style="margin:0">Nhập lời nhắn hoặc góp ý của bạn để gửi nhanh cho cô dâu chú rể qua Zalo / Messenger:</p>
          <label class="field"><span>Nội dung góp ý</span>
            <textarea class="input" name="note" required placeholder="VD: Nhớ đặt dư thêm 2 bàn dự phòng cho họ hàng ở xa nhé…"></textarea>
          </label>
        </div>`,
      onConfirm: async (form) => {
        const note = form.get('note').trim();
        const names = coupleNames(data.couple) || 'Cô dâu & Chú rể';
        const text = `💌 Góp ý Kế hoạch cưới (${names})\n📌 Mục: ${topic}\n💬 Nội dung: ${note}\n🔗 Xem tại: ${location.href}`;
        try {
          const how = await shareLink({ title: `Góp ý kế hoạch cưới – ${topic}`, text, url: location.href });
          if (how === 'copied') toast('Đã sao chép nội dung góp ý – bạn dán vào Zalo gửi cho cô dâu chú rể nhé!', 'success');
        } catch {
          await navigator.clipboard?.writeText(text).catch(() => {});
          toast('Đã sao chép lời góp ý vào bộ nhớ tạm!', 'success');
        }
        return true;
      },
    });
  }

  function overview() {
    const t = budgetTotals(categories, bookings, plan);
    const { done, total } = checklistProgress(tasks);
    const { byCategory, unlinked } = linkBookings(categories, bookings);
    const active = [...byCategory.values()].flat().concat(unlinked);
    const upcoming = nextTasks(tasks);
    const paidPct = pct(t.paid, t.estimated);
    return html`
      <div class="overview-grid">
        ${countdownCard(plan, { editable: false })}
        <button type="button" class="card overview-stat" data-go="budget">
          <span class="small muted">Ngân sách</span>
          <strong>${hideMoney ? `${t.paidCount}/${t.itemCount} mục` : money(t.estimated)}</strong>
          <span class="small ${!hideMoney && t.over ? 'text-red' : 'muted'}">${hideMoney ? `Tiến độ thanh toán ${paidPct}%` : (t.budget ? `${pct(t.estimated, t.budget)}% của ${money(t.budget)}` : 'Chưa đặt tổng ngân sách')}</span>
          <div class="progress"><span style="width:${hideMoney ? paidPct : (t.budget ? Math.min(100, (t.estimated / t.budget) * 100) : 0)}%"></span></div>
          <span class="small muted">${hideMoney ? 'Bấm để xem các hạng mục' : `Đã trả ${money(t.paid)}`}</span>
        </button>
        <button type="button" class="card overview-stat" data-go="checklist">
          <span class="small muted">Việc cần chuẩn bị</span>
          <strong>${done}/${total} việc</strong>
          <span class="small muted">${pct(done, total)}% hoàn thành</span>
          <div class="progress"><span style="width:${pct(done, total)}%"></span></div>
        </button>
        <button type="button" class="card overview-stat" data-go="services">
          <span class="small muted">Đơn trên Trạm Hỷ</span>
          <strong>${active.length} dịch vụ</strong>
          <span class="small muted">${active.length ? (hideMoney ? 'Bấm để xem các dịch vụ đã chọn →' : `${money(active.reduce((s, b) => s + b.total_price, 0))} · đã tính vào ngân sách`) : 'Chưa đặt dịch vụ nào'}</span>
        </button>
      </div>
      <div class="grid-2" style="margin-top:16px;align-items:start">
        <section class="card stack">
          <div class="row"><h3 style="margin:0">Việc sắp tới</h3><span class="spacer"></span>
            <button type="button" class="btn btn-link btn-sm" data-go="checklist">Xem tất cả →</button></div>
          ${upcoming.length ? html`<ul class="next-tasks">${upcoming.map((task) => {
            const due = dueLabel(plan, task);
            return html`<li class="${due.tone}"><span class="dot"></span><div><strong>${task.title}</strong><span class="small muted">${due.text}</span></div></li>`;
          })}</ul>` : html`<p class="muted">Đã xong hết việc chuẩn bị 🎉</p>`}
        </section>
        <section class="card stack">
          <div class="row">
            <h3 style="margin:0">Thông tin đám cưới</h3>
            <span class="spacer"></span>
            <button type="button" class="btn btn-outline btn-sm" data-feedback="Tổng quan kế hoạch cưới">💬 Góp ý</button>
          </div>
          <dl class="review-list">
            ${coupleNames(data.couple) ? html`<dt>Cô dâu & chú rể</dt><dd>${coupleNames(data.couple)}</dd>` : ''}
            <dt>Ngày cưới</dt><dd>${plan.wedding_date ? weddingDateLabel(plan) : 'Chưa đặt'}</dd>
            <dt>Phong tục</dt><dd>${REGION_LABEL[plan.region] ?? ''}</dd>
            ${!hideMoney ? html`<dt>Tổng ngân sách</dt><dd>${plan.total_budget ? money(plan.total_budget) : 'Chưa đặt'}</dd>` : ''}
            <dt>Số khách</dt><dd>${plan.guests ? `${plan.guests} khách (~${Math.ceil(plan.guests / 10)} bàn)` : 'Chưa có'}</dd>
            <dt>Thành phố</dt><dd>${plan.city || 'Chưa có'}</dd>
          </dl>
        </section>
      </div>`;
  }

  function budget() {
    const t = budgetTotals(categories, bookings, plan);
    const pt = partyTotals(categories, bookings);
    const { byCategory, unlinked } = linkBookings(categories, bookings);
    const groups = categories.map((c) => {
      const p = parseCategoryParty(c.name);
      return { rawName: c.name, name: p.name, party: p.party, partyBadge: p.badge, items: c.items, bookings: byCategory.get(c) ?? [] };
    });
    if (unlinked.length) groups.push({ rawName: 'Dịch vụ khác', name: 'Dịch vụ khác đặt qua Trạm Hỷ', party: 'both', partyBadge: '💑 Chung', items: [], bookings: unlinked });
    const filteredGroups = groups.filter((g) => partyFilter === 'all' || g.party === partyFilter || g.party === 'both');
    const usePct = pct(t.estimated, t.budget);
    const paidPct = pct(t.paid, t.estimated);
    return html`
      ${!hideMoney ? html`
        <section class="card budget-summary">
          <div class="ring-stat">
            <div class="ring" style="--p:${Math.min(usePct, 100)};--c:${t.over ? 'var(--red)' : '#e0a800'}"><span>${usePct}%</span></div>
            <div><span class="small muted">${t.budget ? `Ngân sách ${money(t.budget)}` : 'Chưa đặt tổng ngân sách'}</span>
              <strong class="ring-label" style="color:${t.over ? 'var(--red)' : '#b88400'}">Chi phí dự kiến</strong>
              <span class="ring-value">${money(t.estimated)}</span></div>
          </div>
          <div class="ring-stat">
            <div class="ring" style="--p:${Math.min(paidPct, 100)};--c:var(--green)"><span>${paidPct}%</span></div>
            <div><span class="small muted">Đã thanh toán: ${t.paidCount}/${t.itemCount} mục</span>
              <strong class="ring-label" style="color:var(--green)">Đã thanh toán</strong>
              <span class="ring-value">${money(t.paid)}</span></div>
          </div>
          ${t.over ? html`<div class="notice notice-error small budget-warning">⚠️ Dự kiến đang vượt ngân sách <b>${money(t.estimated - t.budget)}</b></div>` : ''}
        </section>` : html`
        <div class="notice small" style="margin-bottom:14px">
          🔒 Cô dâu chú rể đang bật chế độ <b>Ẩn số tiền chi tiết</b> – bạn vẫn theo dõi được đầy đủ các hạng mục và tiến độ chuẩn bị.
        </div>`}
      <div class="budget-party-bar">
        <div class="chips">
          ${[
            ['all',   'Tất cả hai bên', null],
            ['both',  '💑 Hai vợ chồng', !hideMoney ? pt.both.estimated : null],
            ['groom', '🤵 Nhà Trai & Chung', !hideMoney ? pt.groom.estimated : null],
            ['bride', '👰 Nhà Gái & Chung', !hideMoney ? pt.bride.estimated : null],
          ].map(([key, label, amount]) => html`
            <button type="button" class="chip ${partyFilter === key ? 'active' : ''}" data-party-filter="${key}">
              <span>${label}</span>
              ${amount !== null ? html`<b class="party-chip-amount">${money(amount)}</b>` : ''}
            </button>`)}
        </div>
      </div>
      <div class="budget-categories">
        ${filteredGroups.map((g) => {
          const est = g.items.reduce((s, i) => s + i.estimated, 0) + g.bookings.reduce((s, b) => s + b.total_price, 0);
          const paid = g.items.filter((i) => i.paid).reduce((s, i) => s + (i.actual || i.estimated), 0) + g.bookings.reduce((s, b) => s + bookingPaid(b), 0);
          const count = g.items.length + g.bookings.length;
          return html`
            <details class="card view-category" open>
              <summary class="view-cat-head">
                <span class="view-cat-name">${g.name}</span>
                <span class="party-pill party-${g.party}">${g.partyBadge}</span>
                <span class="small muted view-cat-count">${count} mục</span>
                ${!hideMoney ? html`<span class="cat-total">${money(est)}</span>` : ''}
                <span class="chevron" aria-hidden="true">⌄</span>
              </summary>
              <div class="view-cat-progress" title="Đã trả ${pct(paid, est)}%">
                <div class="progress progress-paid"><span style="width:${Math.min(100, pct(paid, est))}%"></span></div>
                <span class="small muted">${hideMoney ? `Tiến độ ${pct(paid, est)}%` : `Đã trả ${money(paid)}`}</span>
                <button type="button" class="btn btn-link btn-sm" style="margin-left:auto" data-feedback="${g.name}">💬 Góp ý mục này</button>
              </div>
              ${count ? html`<ul class="view-rows">
                ${g.items.map((i) => html`
                  <li class="view-row">
                    <span class="view-row-name">${i.name}</span>
                    ${!hideMoney ? html`
                      <span class="view-money"><span>Dự kiến</span><b>${money(i.estimated)}</b></span>
                      <span class="view-money ${i.actual > i.estimated && i.estimated > 0 ? 'over' : ''}"><span>Thực tế</span><b>${i.actual ? money(i.actual) : '—'}</b></span>
                    ` : html`<span></span><span></span>`}
                    <span class="badge ${i.paid ? 'badge-green' : ''}">${i.paid ? '✓ Đã trả' : 'Chưa trả'}</span>
                  </li>`)}
                ${g.bookings.map((b) => {
                  const bPaid = bookingPaid(b);
                  return html`
                    <li class="view-row booking-row">
                      <span class="view-row-name"><strong>🔗 ${bookingName(b)}</strong>
                        <span class="small muted">${b.vendor?.name} · đặt qua Trạm Hỷ · ${BOOKING_STATUS[b.status]?.label ?? ''}</span></span>
                      ${!hideMoney ? html`
                        <span class="view-money"><span>Tổng</span><b>${money(b.total_price)}</b></span>
                        <span class="view-money"><span>Đã trả</span><b>${money(bPaid)}</b></span>
                      ` : html`<span></span><span></span>`}
                      <span class="badge ${bPaid >= b.total_price ? 'badge-green' : 'badge-gold'}">${bPaid >= b.total_price ? '✓ Đủ' : `${pct(bPaid, b.total_price)}%`}</span>
                    </li>`;
                })}
              </ul>` : html`<p class="small muted view-empty">Chưa có mục chi tiêu.</p>`}
            </details>`;
        })}
      </div>`;
  }

  function services() {
    const { byCategory, unlinked } = linkBookings(categories, bookings);
    const active = [...byCategory.values()].flat().concat(unlinked);
    if (!active.length) {
      return html`
        <div class="empty stack" style="align-items:center;gap:10px">
          <p style="margin:0">Cô dâu chú rể chưa đặt đơn dịch vụ nào trên Trạm Hỷ.</p>
          <a class="btn btn-outline btn-sm" href="marketplace.html">Khám phá Dịch vụ cưới &amp; Mẫu váy →</a>
        </div>`;
    }
    return html`
      <div class="stack" style="gap:14px">
        <div class="result-bar">
          <span class="result-count-text">Cô dâu chú rể đã chọn <strong>${active.length}</strong> dịch vụ bảo chứng trên Trạm Hỷ</span>
          <a class="result-switch-pill" href="marketplace.html"><span>Xem thêm Dịch vụ cưới</span><span class="arrow">→</span></a>
        </div>
        <div class="grid">
          ${active.map((b) => {
            const paid = bookingPaid(b);
            const paidPct = pct(paid, b.total_price);
            return html`
              <article class="card stack" style="justify-content:space-between">
                <div class="stack" style="gap:6px">
                  <div class="row">
                    ${badge(VENDOR_CATEGORY[b.vendor?.category] ?? 'Dịch vụ cưới', 'gold')}
                    ${badge(BOOKING_STATUS[b.status]?.label ?? b.status, b.status === 'completed' ? 'green' : 'blue')}
                  </div>
                  <h3 style="margin:2px 0 0;font-size:17px">${bookingName(b)}</h3>
                  <div class="small muted">🏪 <strong>${b.vendor?.name ?? 'Đối tác Trạm Hỷ'}</strong></div>
                  ${b.appointment_at ? html`<div class="small muted">📅 Lịch hẹn: ${new Date(b.appointment_at).toLocaleString('vi-VN')}</div>` : ''}
                  ${!hideMoney ? html`
                    <div class="row" style="justify-content:space-between;margin-top:4px">
                      <span class="small muted">Tổng: <strong class="price">${money(b.total_price)}</strong></span>
                      <span class="small muted">Đã cọc: <strong>${money(paid)}</strong> (${paidPct}%)</span>
                    </div>` : html`<div class="small muted">Tiến độ thanh toán: <strong>${paidPct}%</strong></div>`}
                  <div class="progress"><span style="width:${Math.min(100, paidPct)}%"></span></div>
                </div>
                <div class="row" style="margin-top:8px">
                  ${b.vendor?.slug ? html`<a class="btn btn-outline btn-sm" style="flex:1" href="vendor.html?slug=${b.vendor.slug}">Xem tiệm</a>` : ''}
                  <button type="button" class="btn btn-link btn-sm" data-feedback="${bookingName(b)} (${b.vendor?.name ?? ''})">💬 Góp ý</button>
                </div>
              </article>`;
          })}
        </div>
      </div>`;
  }

  function checklist() {
    const { done, total } = checklistProgress(tasks);
    const percent = pct(done, total);
    const visible = tasks.filter((t) => filter === 'all' || (filter === 'todo' ? !t.done : t.done));
    const groups = CHECKLIST_STAGES.map((stage, i) => ({ ...stage, tasks: visible.filter((t) => stageIndex(t.days_before) === i) }))
      .filter((g) => g.tasks.length);
    return html`
      <section class="card stack checklist-head">
        <div class="row">
          <div><h3 style="margin:0">Việc cần chuẩn bị</h3>
            <p class="small muted" style="margin:2px 0 0">${done}/${total} việc đã xong</p></div>
          <span class="spacer"></span>
          <strong class="checklist-percent">${percent}%</strong>
        </div>
        <div class="progress"><span style="width:${percent}%"></span></div>
        <div class="chips">
          ${[['all', 'Tất cả'], ['todo', 'Chưa xong'], ['done', 'Đã xong']].map(([key, label]) => html`
            <button type="button" class="chip ${filter === key ? 'active' : ''}" data-filter="${key}" aria-pressed="${filter === key ? 'true' : 'false'}">${label}</button>`)}
        </div>
      </section>
      ${groups.length ? groups.map((g) => html`
        <section class="task-group">
          <h4>${g.label} <span class="task-group-count">${g.tasks.filter((t) => t.done).length}/${g.tasks.length}</span></h4>
          <ul class="task-list">${g.tasks.map((t) => {
            const due = dueLabel(plan, t);
            return html`
              <li class="task view-task ${t.done ? 'done' : ''} ${due.tone}">
                <span class="task-check" role="img" aria-label="${t.done ? 'Đã xong' : 'Chưa xong'}"></span>
                <div class="task-text">
                  <span class="task-title">${t.title}</span>
                  <span class="task-due">${due.tone === 'late' ? '⏰ ' : ''}${due.text}</span>
                </div>
              </li>`;
          })}</ul>
        </section>`) : html`<div class="empty">${filter === 'done' ? 'Chưa có việc nào xong.' : 'Đã xong hết việc chuẩn bị 🎉'}</div>`}`;
  }

  function draw() {
    render(container, html`
      <div class="share-banner" role="note">
        <span class="share-banner-icon" aria-hidden="true">👀</span>
        <div><strong>Bạn đang xem kế hoạch cưới được chia sẻ</strong>
          <span class="small">Chỉ xem – bạn có thể bấm <b>💬 Góp ý</b> ở từng mục để gửi lời nhắn cho cô dâu chú rể.</span></div>
        <a class="btn btn-primary btn-sm" href="ke-hoach.html">Lập kế hoạch của bạn</a>
      </div>
      <div class="row planner-view-bar">
        <div class="tabs planner-tabs" role="tablist">
          ${TABS.map(([key, label]) => html`<button type="button" class="tab ${key === tab ? 'active' : ''}" role="tab"
            aria-selected="${key === tab ? 'true' : 'false'}" data-tab="${key}">${label}</button>`)}
        </div>
        <span class="spacer"></span>
        <div class="row" style="gap:8px">
          <button type="button" class="btn btn-outline btn-sm" data-print>🖨️ Bản In / PDF</button>
          ${onExport && !hideMoney ? html`<button type="button" class="btn btn-outline btn-sm" data-export>⬇ Tải Excel</button>` : ''}
        </div>
      </div>
      <section class="planner-panel form-enter" id="panel-${tab}">
        ${tab === 'overview' ? overview() : tab === 'budget' ? budget() : tab === 'services' ? services() : checklist()}
      </section>`);
    container.querySelectorAll('[data-tab], [data-go]').forEach((el) => el.addEventListener('click', () => {
      tab = el.dataset.tab || el.dataset.go;
      draw();
      if (el.dataset.go) container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    container.querySelectorAll('[data-filter]').forEach((chip) => chip.addEventListener('click', () => { filter = chip.dataset.filter; draw(); }));
    container.querySelectorAll('[data-party-filter]').forEach((chip) => chip.addEventListener('click', () => { partyFilter = chip.dataset.partyFilter; draw(); }));
    container.querySelectorAll('[data-feedback]').forEach((btn) => btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openFeedbackDialog(btn.dataset.feedback);
    }));
    container.querySelector('[data-print]')?.addEventListener('click', () => window.print());
    container.querySelector('[data-export]')?.addEventListener('click', (e) => withBusy(e.currentTarget, () => onExport(data).catch(toastError)));
  }

  draw();
}
