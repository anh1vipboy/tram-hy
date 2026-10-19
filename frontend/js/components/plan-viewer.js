// Trang xem kế hoạch cưới được chia sẻ (ke-hoach.html?xem=<token>): chỉ đọc, không cần đăng nhập.
// Dữ liệu lấy từ get_shared_plan (SQL 33) – đã lọc sẵn ở server, không có email / số điện thoại.
// Số liệu tính bằng đúng các hàm của trang chủ kế hoạch → người xem thấy y như cô dâu chú rể thấy.
import { html, render, money } from '../core/utils.js';
import { toastError, withBusy } from '../core/ui.js';
import { BOOKING_STATUS } from '../core/labels.js';
import { REGION_LABEL, CHECKLIST_STAGES } from '../data/planner-templates.js';
import { budgetTotals, bookingPaid, bookingName, linkBookings } from './budget-board.js';
import { checklistProgress, nextTasks, dueLabel, stageIndex } from './checklist-board.js';
import { countdownCard, weddingDateLabel } from './plan-summary.js';

const TABS = [['overview', 'Tổng quan'], ['budget', 'Ngân sách'], ['checklist', 'Checklist']];
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
  let tab = 'overview';
  let filter = 'all';

  function overview() {
    const t = budgetTotals(categories, bookings, plan);
    const { done, total } = checklistProgress(tasks);
    const { byCategory, unlinked } = linkBookings(categories, bookings);
    const active = [...byCategory.values()].flat().concat(unlinked);
    const upcoming = nextTasks(tasks);
    return html`
      <div class="overview-grid">
        ${countdownCard(plan, { editable: false })}
        <button type="button" class="card overview-stat" data-go="budget">
          <span class="small muted">Ngân sách</span>
          <strong>${money(t.estimated)}</strong>
          <span class="small ${t.over ? 'text-red' : 'muted'}">${t.budget ? `${pct(t.estimated, t.budget)}% của ${money(t.budget)}` : 'Chưa đặt tổng ngân sách'}</span>
          <div class="progress"><span style="width:${t.budget ? Math.min(100, (t.estimated / t.budget) * 100) : 0}%"></span></div>
          <span class="small muted">Đã trả ${money(t.paid)}</span>
        </button>
        <button type="button" class="card overview-stat" data-go="checklist">
          <span class="small muted">Việc cần chuẩn bị</span>
          <strong>${done}/${total} việc</strong>
          <span class="small muted">${pct(done, total)}% hoàn thành</span>
          <div class="progress"><span style="width:${pct(done, total)}%"></span></div>
        </button>
        <div class="card overview-stat">
          <span class="small muted">Đơn trên Trạm Hỷ</span>
          <strong>${active.length} đơn</strong>
          <span class="small muted">${active.length ? `${money(active.reduce((s, b) => s + b.total_price, 0))} · đã tính vào ngân sách` : 'Chưa đặt dịch vụ nào'}</span>
        </div>
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
          <h3 style="margin:0">Thông tin đám cưới</h3>
          <dl class="review-list">
            ${coupleNames(data.couple) ? html`<dt>Cô dâu & chú rể</dt><dd>${coupleNames(data.couple)}</dd>` : ''}
            <dt>Ngày cưới</dt><dd>${plan.wedding_date ? weddingDateLabel(plan) : 'Chưa đặt'}</dd>
            <dt>Phong tục</dt><dd>${REGION_LABEL[plan.region] ?? ''}</dd>
            <dt>Tổng ngân sách</dt><dd>${plan.total_budget ? money(plan.total_budget) : 'Chưa đặt'}</dd>
            <dt>Số khách</dt><dd>${plan.guests ? `${plan.guests} khách (~${Math.ceil(plan.guests / 10)} bàn)` : 'Chưa có'}</dd>
            <dt>Thành phố</dt><dd>${plan.city || 'Chưa có'}</dd>
          </dl>
        </section>
      </div>`;
  }

  function budget() {
    const t = budgetTotals(categories, bookings, plan);
    const { byCategory, unlinked } = linkBookings(categories, bookings);
    const groups = categories.map((c) => ({ name: c.name, items: c.items, bookings: byCategory.get(c) ?? [] }));
    if (unlinked.length) groups.push({ name: 'Dịch vụ khác đặt qua Trạm Hỷ', items: [], bookings: unlinked });
    const usePct = pct(t.estimated, t.budget);
    const paidPct = pct(t.paid, t.estimated);
    return html`
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
      </section>
      <div class="budget-categories">
        ${groups.map((g) => {
          const est = g.items.reduce((s, i) => s + i.estimated, 0) + g.bookings.reduce((s, b) => s + b.total_price, 0);
          const paid = g.items.filter((i) => i.paid).reduce((s, i) => s + (i.actual || i.estimated), 0) + g.bookings.reduce((s, b) => s + bookingPaid(b), 0);
          const count = g.items.length + g.bookings.length;
          return html`
            <details class="card view-category" open>
              <summary class="view-cat-head">
                <span class="view-cat-name">${g.name}</span>
                <span class="small muted view-cat-count">${count} mục</span>
                <span class="cat-total">${money(est)}</span>
                <span class="chevron" aria-hidden="true">⌄</span>
              </summary>
              <div class="view-cat-progress" title="Đã trả ${pct(paid, est)}%">
                <div class="progress progress-paid"><span style="width:${Math.min(100, pct(paid, est))}%"></span></div>
                <span class="small muted">Đã trả ${money(paid)}</span>
              </div>
              ${count ? html`<ul class="view-rows">
                ${g.items.map((i) => html`
                  <li class="view-row">
                    <span class="view-row-name">${i.name}</span>
                    <span class="view-money"><span>Dự kiến</span><b>${money(i.estimated)}</b></span>
                    <span class="view-money ${i.actual > i.estimated && i.estimated > 0 ? 'over' : ''}"><span>Thực tế</span><b>${i.actual ? money(i.actual) : '—'}</b></span>
                    <span class="badge ${i.paid ? 'badge-green' : ''}">${i.paid ? '✓ Đã trả' : 'Chưa trả'}</span>
                  </li>`)}
                ${g.bookings.map((b) => {
                  const bPaid = bookingPaid(b);
                  return html`
                    <li class="view-row booking-row">
                      <span class="view-row-name"><strong>🔗 ${bookingName(b)}</strong>
                        <span class="small muted">${b.vendor?.name} · đặt qua Trạm Hỷ · ${BOOKING_STATUS[b.status]?.label ?? ''}</span></span>
                      <span class="view-money"><span>Tổng</span><b>${money(b.total_price)}</b></span>
                      <span class="view-money"><span>Đã trả</span><b>${money(bPaid)}</b></span>
                      <span class="badge ${bPaid >= b.total_price ? 'badge-green' : 'badge-gold'}">${bPaid >= b.total_price ? '✓ Đủ' : `${pct(bPaid, b.total_price)}%`}</span>
                    </li>`;
                })}
              </ul>` : html`<p class="small muted view-empty">Chưa có mục chi tiêu.</p>`}
            </details>`;
        })}
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
          <span class="small">Chỉ xem – mọi thay đổi do cô dâu chú rể cập nhật.</span></div>
        <a class="btn btn-primary btn-sm" href="ke-hoach.html">Lập kế hoạch của bạn</a>
      </div>
      <div class="row planner-view-bar">
        <div class="tabs planner-tabs" role="tablist">
          ${TABS.map(([key, label]) => html`<button type="button" class="tab ${key === tab ? 'active' : ''}" role="tab"
            aria-selected="${key === tab ? 'true' : 'false'}" data-tab="${key}">${label}</button>`)}
        </div>
        <span class="spacer"></span>
        ${onExport ? html`<button type="button" class="btn btn-outline btn-sm" data-export>⬇ Tải Excel</button>` : ''}
      </div>
      <section class="planner-panel form-enter" id="panel-${tab}">
        ${tab === 'overview' ? overview() : tab === 'budget' ? budget() : checklist()}
      </section>`);
    container.querySelectorAll('[data-tab], [data-go]').forEach((el) => el.addEventListener('click', () => {
      tab = el.dataset.tab || el.dataset.go;
      draw();
      if (el.dataset.go) container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    container.querySelectorAll('[data-filter]').forEach((chip) => chip.addEventListener('click', () => { filter = chip.dataset.filter; draw(); }));
    container.querySelector('[data-export]')?.addEventListener('click', (e) => withBusy(e.currentTarget, () => onExport(data).catch(toastError)));
  }

  draw();
}
