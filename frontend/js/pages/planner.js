// Trang "Đám cưới của tôi" (ke-hoach.html): Tổng quan · Ngân sách · Checklist · Trợ lý AI
// + Xuất Excel, Chia sẻ link chỉ xem. ke-hoach.html?xem=<token> → trang xem kế hoạch được chia sẻ (không cần đăng nhập).
import { initLayout } from '../core/layout.js';
import { loginUrl } from '../core/auth.js';
import { $, $$, html, render, money, param } from '../core/utils.js';
import { openDialog, toast, toastError, withBusy } from '../core/ui.js';
import { getPlan, createPlan, updatePlan, deletePlan, readPlanDraft, spreadAllocations, applyEstimates } from '../services/planner.js';
import { listMyBookings } from '../services/bookings.js';
import { REGION_LABEL } from '../data/planner-templates.js';
import { moneyValue, readMoneyField } from '../components/money-input.js';
import { mountBudgetBoard, budgetTotals } from '../components/budget-board.js';
import { mountChecklistBoard, checklistProgress, nextTasks, dueLabel } from '../components/checklist-board.js';
import { listBudget, listChecklist } from '../services/planner.js';
import { mountPlanAssistant } from '../components/plan-assistant.js';
import { trackSave } from '../components/save-status.js';
import { countdownCard, daysToWedding, weddingDateLabel } from '../components/plan-summary.js';
import { exportPlanExcel, buildPlanExcelBytes } from '../components/plan-export.js';
import { autoSyncCloudExcel, openCloudExcelSyncDialog } from '../components/finance-export.js';
import { openPlanShare } from '../components/plan-share.js';
import { mountSharedPlan, renderShareError, coupleNames } from '../components/plan-viewer.js';
import { getSharedPlan } from '../services/planner.js';
import { getMyInvitation } from '../services/invitations.js';

const root = $('#planner-root');
const TABS = [['overview', 'Tổng quan'], ['budget', 'Ngân sách'], ['checklist', 'Checklist'], ['ai', '✨ Hỏi AI']];
let profile = null;
let plan = null;
let bookings = [];
let tab = new URLSearchParams(location.search).get('tab') || 'overview';
let mounted = {};
let budgetBoard = null;   // Promise<{ reload }>
let assistant = null;     // { ask }
const fromAi = new URLSearchParams(location.search).get('from') === 'ai';
const shareToken = param('xem');   // link chia sẻ chỉ xem

// ---------- CHƯA ĐĂNG NHẬP ----------
function renderGuest() {
  render(root, html`
    <section class="card planner-intro">
      <div class="planner-intro-grid">
        ${[['💰', 'Ngân sách theo nghi lễ', 'Dạm ngõ, ăn hỏi, cưới, tiệc… có sẵn hơn 30 mục, tự chia theo tổng ngân sách.'],
           ['✅', 'Checklist chuẩn bị', 'Việc cần làm theo mốc thời gian, tự tính hạn từ ngày cưới.'],
           ['🔗', 'Gắn với đơn Trạm Hỷ', 'Đặt dịch vụ trên Trạm Hỷ là số tiền tự vào ngân sách.'],
           ['📊', 'Theo dõi trực quan', 'Biết ngay đã dự kiến bao nhiêu, đã trả bao nhiêu, còn bao nhiêu ngày.']]
          .map(([icon, title, text]) => html`<div class="planner-feature"><span>${icon}</span><strong>${title}</strong><p class="small muted">${text}</p></div>`)}
      </div>
      ${readPlanDraft() ? html`<div class="notice small">✨ Cách chia ngân sách bạn vừa xem đã được giữ lại – đăng nhập là lưu ngay vào kế hoạch.</div>` : ''}
      <a class="btn btn-primary btn-lg" href="${loginUrl(`ke-hoach.html${fromAi ? '?from=ai' : ''}`)}">Đăng nhập để lập kế hoạch – miễn phí</a>
    </section>`);
}

const AI_GROUP_LABEL = { venue: 'Tiệc', studio: 'Ảnh', bridal: 'Váy', decor: 'Trang trí', makeup: 'Trang điểm', other: 'Lễ hỏi, nhẫn, thiệp & khác' };
const draftSummary = (draft) => draft.allocations.map((a) => `${AI_GROUP_LABEL[a.category] ?? a.category} ${money(a.amount)}`).join(' · ');

// ---------- CHƯA CÓ KẾ HOẠCH: tạo nhanh ----------
function renderCreate() {
  const draft = readPlanDraft();   // mang sang từ "Gợi ý chia ngân sách" ở trang chủ
  render(root, html`
    <form class="card stack planner-create" novalidate>
      <div><h2 style="margin:0">Bắt đầu kế hoạch cưới</h2>
        <p class="muted" style="margin:4px 0 0">Mất 30 giây – Trạm Hỷ tạo sẵn danh mục chi tiêu và việc cần làm, bạn chỉ việc chỉnh theo ý mình.</p></div>
      ${draft ? html`<div class="notice small planner-draft">
        <strong>${draft.allocations.length ? '✨ Dùng cách chia AI bạn vừa xem ở trang chủ' : '✨ Đã điền sẵn thông tin bạn vừa nhập ở trang chủ'}</strong>
        ${draft.allocations.length ? html`<span class="muted">${draftSummary(draft)}</span>` : ''}
      </div>` : ''}
      <div class="form-grid">
        <label class="field"><span>Ngày cưới (dự kiến)</span><input class="input" type="date" name="weddingDate"></label>
        <label class="field"><span>Tổng ngân sách</span>
          <input class="input" name="totalBudget" data-money inputmode="numeric" placeholder="VD: 300.000.000" value="${draft ? moneyValue(draft.total) : ''}"></label>
        <label class="field"><span>Số khách mời dự kiến</span><input class="input" type="number" name="guests" min="10" max="5000" step="10" placeholder="VD: 300" value="${draft?.guests ?? ''}"></label>
        <label class="field"><span>Thành phố</span><input class="input" name="city" maxlength="60" placeholder="VD: Hà Nội" value="${draft?.city ?? ''}"></label>
      </div>
      <fieldset class="field region-picker"><legend>Phong tục cưới hỏi</legend>
        <div class="row">
          ${Object.entries(REGION_LABEL).map(([key, label], i) => html`
            <label class="region-option"><input type="radio" name="region" value="${key}" ${i === 0 ? 'checked' : ''}><span>${label}</span></label>`)}
        </div>
      </fieldset>
      <button class="btn btn-primary btn-lg" type="submit">Tạo kế hoạch cưới</button>
      <p class="small muted" style="margin:0">Có tổng ngân sách thì Trạm Hỷ điền sẵn số dự kiến cho từng mục theo tỷ lệ phổ biến.</p>
    </form>`);

  root.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    withBusy(e.submitter, async () => {
      try {
        const totalBudget = readMoneyField(form.get('totalBudget'), 'Tổng ngân sách', { min: 10_000_000, required: false }) ?? 0;
        // Đổi tổng ngân sách so với lúc AI chia → co giãn cách chia theo tỷ lệ
        const allocations = draft?.allocations.length && totalBudget
          ? draft.allocations.map((a) => ({ ...a, amount: Math.round((a.amount * totalBudget) / draft.total) }))
          : undefined;
        plan = await createPlan(profile.id, {
          weddingDate: form.get('weddingDate') || null,
          region: form.get('region'),
          totalBudget,
          guests: Number(form.get('guests')) || null,
          city: form.get('city').trim(),
          allocations,
        });
        readPlanDraft({ remove: true });
        toast('Đã tạo kế hoạch cưới! Hãy chỉnh từng mục cho đúng với đám cưới của bạn.', 'success');
        tab = 'budget';
        renderPlan();
      } catch (error) {
        toastError(error);
      }
    });
  });
}

// ---------- CÓ KẾ HOẠCH ----------
function renderPlan() {
  updateHeader();
  render(root, html`
    <div class="tabs planner-tabs" role="tablist">
      ${TABS.map(([key, label]) => html`<button type="button" class="tab ${key === tab ? 'active' : ''}" role="tab" data-tab="${key}">${label}</button>`)}
      <a class="tab" href="invitation.html">Thiệp cưới ↗</a>
    </div>
    ${TABS.map(([key]) => html`<section class="planner-panel" id="panel-${key}" ${key === tab ? '' : 'hidden'}></section>`)}`);
  mounted = {};
  budgetBoard = null;
  assistant = null;
  $$('[data-tab]').forEach((btn) => btn.addEventListener('click', () => showTab(btn.dataset.tab)));
  showTab(tab);
}

const currentTotals = async () => budgetTotals(await listBudget(plan.id), bookings, plan);

function mountAssistant() {
  assistant = mountPlanAssistant($('#panel-ai'), {
    profile,
    plan,
    getTotals: currentTotals,
    onApplied: () => budgetBoard?.then((board) => board.reload()),   // tab Ngân sách cập nhật số mới
  });
}

// Đã có kế hoạch mà vừa bấm "Lưu thành kế hoạch" ở trang chủ → hỏi có áp cách chia AI vào kế hoạch hiện tại không
async function offerDraft() {
  const draft = readPlanDraft({ remove: true });
  if (!draft) return;
  if (!draft.allocations.length) { toast('Bạn đã có kế hoạch cưới – tiếp tục chỉnh ở đây nhé.'); return; }
  const categories = await listBudget(plan.id);
  const rows = categories.flatMap((c) => c.items.filter((i) => !i.paid)
    .map((i) => ({ key: i.id, group: c.vendor_category, weight: i.estimated || 1, item: i })));
  const amounts = spreadAllocations(rows, draft.allocations);
  const changes = rows.filter((r) => amounts.has(r.key) && amounts.get(r.key) !== r.item.estimated)
    .map((r) => ({ id: r.key, to: amounts.get(r.key) }));
  const ok = await openDialog({
    title: 'Áp dụng cách chia AI vào kế hoạch?',
    confirmText: `Áp dụng (${changes.length} mục)`,
    content: html`
      <p>Bạn đã có kế hoạch cưới. Trạm Hỷ sẽ chia lại số <strong>Dự kiến</strong> của các mục chưa trả theo cách chia AI vừa xem:</p>
      <p class="small muted">${draftSummary(draft)}</p>
      <p class="small">Tổng ngân sách sẽ là <strong>${money(draft.total)}</strong>. Số thực tế, mục đã trả và đơn Trạm Hỷ giữ nguyên.</p>`,
    onConfirm: async () => {
      await trackSave(() => applyEstimates(changes));
      plan = await updatePlan(plan.id, { total_budget: draft.total, ...(draft.guests ? { guests: draft.guests } : {}) });
      return true;
    },
  });
  if (ok) {
    toast('Đã áp dụng cách chia AI vào kế hoạch.', 'success');
    tab = 'budget';
    renderPlan();
  }
}

function showTab(name) {
  tab = name;
  history.replaceState(null, '', `ke-hoach.html${name === 'overview' ? '' : `?tab=${name}`}`);
  $$('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  TABS.forEach(([key]) => { $(`#panel-${key}`).hidden = key !== name; });
  const panel = $(`#panel-${name}`);
  panel.classList.remove('form-enter'); void panel.offsetWidth; panel.classList.add('form-enter');
  if (name === 'overview') renderOverview();          // tổng quan luôn tính lại số mới nhất
  if (name === 'budget' && !mounted.budget) { mounted.budget = true; budgetBoard = mountBudgetBoard(panel, plan, { bookings }); }
  if (name === 'checklist' && !mounted.checklist) { mounted.checklist = true; mountChecklistBoard(panel, plan); }
  if (name === 'ai') {
    if (!mounted.ai) { mounted.ai = true; mountAssistant(); } else assistant.refreshSuggestions();   // gợi ý theo số mới nhất
  }
}

async function renderOverview() {
  const panel = $('#panel-overview');
  render(panel, html`<div class="empty">Đang tổng hợp…</div>`);
  try {
    const [categories, tasks] = await Promise.all([listBudget(plan.id), listChecklist(plan.id)]);
    const t = budgetTotals(categories, bookings, plan);
    const { done, total } = checklistProgress(tasks);
    const activeBookings = bookings.filter((b) => !['cancelled', 'refunded'].includes(b.status));
    render(panel, html`
      <div class="overview-grid">
        ${countdownCard(plan)}
        <a class="card overview-stat" href="ke-hoach.html?tab=budget" data-go="budget">
          <span class="small muted">Ngân sách</span>
          <strong>${money(t.estimated)}</strong>
          <span class="small ${t.over ? 'text-red' : 'muted'}">${t.budget ? `${Math.round((t.estimated / t.budget) * 100)}% của ${money(t.budget)}` : 'Chưa đặt tổng ngân sách'}</span>
          <div class="progress"><span style="width:${t.budget ? Math.min(100, (t.estimated / t.budget) * 100) : 0}%"></span></div>
          <span class="small muted">Đã trả ${money(t.paid)}</span>
        </a>
        <a class="card overview-stat" href="ke-hoach.html?tab=checklist" data-go="checklist">
          <span class="small muted">Việc cần chuẩn bị</span>
          <strong>${done}/${total} việc</strong>
          <span class="small muted">${total ? Math.round((done / total) * 100) : 0}% hoàn thành</span>
          <div class="progress"><span style="width:${total ? (done / total) * 100 : 0}%"></span></div>
        </a>
        <a class="card overview-stat" href="bookings.html">
          <span class="small muted">Đơn trên Trạm Hỷ</span>
          <strong>${activeBookings.length} đơn</strong>
          <span class="small muted">${activeBookings.length ? `${money(activeBookings.reduce((s, b) => s + b.total_price, 0))} · tự cộng vào ngân sách` : 'Chưa đặt dịch vụ nào'}</span>
        </a>
      </div>
      <div class="grid-2" style="margin-top:16px;align-items:start">
        <section class="card stack">
          <div class="row"><h3 style="margin:0">Việc sắp tới</h3><span class="spacer"></span>
            <button type="button" class="btn btn-link btn-sm" data-go-btn="checklist">Xem tất cả →</button></div>
          ${nextTasks(tasks).length ? html`<ul class="next-tasks">${nextTasks(tasks).map((task) => {
            const due = dueLabel(plan, task);
            return html`<li class="${due.tone}"><span class="dot"></span><div><strong>${task.title}</strong><span class="small muted">${due.text}</span></div>
              ${task.link_category ? html`<a class="small" href="marketplace.html?category=${task.link_category}">Tìm đối tác →</a>` : ''}</li>`;
          })}</ul>` : html`<p class="muted">Bạn đã xong hết việc chuẩn bị 🎉</p>`}
        </section>
        <section class="card stack">
          <div class="row"><h3 style="margin:0">Thông tin đám cưới</h3><span class="spacer"></span>
            <button type="button" class="btn btn-outline btn-sm" data-edit>Sửa</button></div>
          <dl class="review-list">
            <dt>Ngày cưới</dt><dd>${plan.wedding_date ? new Date(`${plan.wedding_date}T00:00:00`).toLocaleDateString('vi-VN') : 'Chưa đặt'}</dd>
            <dt>Phong tục</dt><dd>${REGION_LABEL[plan.region]}</dd>
            <dt>Tổng ngân sách</dt><dd>${plan.total_budget ? money(plan.total_budget) : 'Chưa đặt'}</dd>
            <dt>Số khách</dt><dd>${plan.guests ? `${plan.guests} khách (~${Math.ceil(plan.guests / 10)} bàn)` : 'Chưa có'}</dd>
            <dt>Thành phố</dt><dd>${plan.city || 'Chưa có'}</dd>
          </dl>
          <button type="button" class="btn btn-link btn-sm text-red" data-reset style="align-self:flex-start">Làm lại kế hoạch từ đầu</button>
        </section>
      </div>`);
    panel.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', editPlan));
    panel.querySelector('[data-reset]').addEventListener('click', resetPlan);
    panel.querySelectorAll('[data-go], [data-go-btn]').forEach((el) => el.addEventListener('click', (e) => {
      e.preventDefault();
      showTab(el.dataset.go || el.dataset.goBtn);
    }));
  } catch (error) {
    render(panel, html`<div class="empty">Không tải được kế hoạch.</div>`);
    toastError(error);
  }
}

function updateHeader() {
  $('#planner-title').textContent = 'Kế hoạch cưới của bạn';
  const days = daysToWedding(plan);
  $('#planner-subtitle').textContent = days > 0 ? `Còn ${days} ngày nữa là đến ngày cưới – cùng chuẩn bị thật chu đáo nhé!`
    : days === 0 ? 'Hôm nay là ngày trọng đại – chúc hai bạn thật nhiều hạnh phúc!'
    : days < 0 ? 'Chúc mừng hai bạn đã về chung một nhà! Kế hoạch vẫn ở đây để theo dõi các khoản còn lại.'
    : 'Ngân sách, việc cần làm và các đơn đặt dịch vụ – tất cả ở một nơi.';
  renderActions();
}

// Nút Chia sẻ + Bản In / PDF + Cloud Excel + Xuất Excel trên đầu trang: áp dụng cho cả kế hoạch nên đặt ngoài các tab
function renderActions() {
  const box = $('#planner-actions');
  render(box, html`
    <button type="button" class="btn btn-outline btn-sm" data-share-plan>🔗 Chia sẻ</button>
    <button type="button" class="btn btn-outline btn-sm" data-print-plan>🖨️ Bản In / PDF</button>
    <button type="button" class="btn btn-outline btn-sm" data-cloud-plan>☁️ File Excel Cloud</button>
    <button type="button" class="btn btn-primary btn-sm" data-export-plan>⬇ Tải Excel (.xlsx)</button>`);
  box.hidden = false;
  box.querySelector('[data-share-plan]').addEventListener('click', openPlanShare);
  box.querySelector('[data-print-plan]').addEventListener('click', () => window.print());
  box.querySelector('[data-cloud-plan]').addEventListener('click', openOwnPlanCloudSync);
  box.querySelector('[data-export-plan]').addEventListener('click', (e) => withBusy(e.currentTarget, exportOwnPlan));
}

async function fetchFullPlanExportData() {
  const [categories, tasks, invitation] = await Promise.all([
    listBudget(plan.id), listChecklist(plan.id), getMyInvitation(profile.id).catch(() => null),
  ]);
  return { plan, couple: invitation, categories, tasks, bookings };
}

function openOwnPlanCloudSync() {
  openCloudExcelSyncDialog({
    scope: 'plan',
    title: '☁️ File Excel Cloud Cố Định – Kế Hoạch Cưới Của Bạn',
    getBytes: async () => buildPlanExcelBytes(await fetchFullPlanExportData()),
    onDownloadLocal: exportOwnPlan,
  });
}

async function exportOwnPlan() {
  try {
    const data = await fetchFullPlanExportData();
    await exportPlanExcel(data);
    toast('Đã tải file Excel kế hoạch cưới.', 'success');
  } catch (error) {
    toastError(error);
  }
}

async function editPlan() {
  const saved = await openDialog({
    title: 'Thông tin đám cưới',
    confirmText: 'Lưu',
    content: html`
      <div class="form-grid">
        <label class="field"><span>Ngày cưới</span><input class="input" type="date" name="weddingDate" value="${plan.wedding_date || ''}"></label>
        <label class="field"><span>Tổng ngân sách</span>
          <input class="input" name="totalBudget" data-money inputmode="numeric" value="${moneyValue(plan.total_budget)}" placeholder="VD: 300.000.000"></label>
        <label class="field"><span>Số khách mời</span><input class="input" type="number" name="guests" min="0" max="5000" step="10" value="${plan.guests || ''}"></label>
        <label class="field"><span>Thành phố</span><input class="input" name="city" maxlength="60" value="${plan.city || ''}"></label>
      </div>`,
    onConfirm: (form) => updatePlan(plan.id, {
      wedding_date: form.get('weddingDate') || null,
      total_budget: readMoneyField(form.get('totalBudget'), 'Tổng ngân sách', { required: false }) ?? 0,
      guests: Number(form.get('guests')) || null,
      city: form.get('city').trim() || null,
    }),
  });
  if (saved) {
    plan = saved;
    toast('Đã lưu thông tin đám cưới.', 'success');
    renderPlan();
  }
}

async function resetPlan() {
  const ok = await openDialog({
    title: 'Làm lại kế hoạch từ đầu?',
    danger: true,
    confirmText: 'Xóa & làm lại',
    content: html`<p>Toàn bộ danh mục chi tiêu và checklist sẽ bị xóa. Đơn đặt dịch vụ trên Trạm Hỷ <strong>không bị ảnh hưởng</strong>.</p>`,
    onConfirm: () => deletePlan(plan.id),
  });
  if (ok) {
    plan = null;
    $('#planner-title').textContent = 'Kế hoạch cưới';
    $('#planner-actions').hidden = true;
    renderCreate();
  }
}

// Bảng ngân sách / checklist gửi sự kiện này khi bấm "Ngân sách: …" hoặc "Đặt ngày cưới"
root.addEventListener('edit-plan', editPlan);
// Nút "✨ Hỏi AI" ở tab Ngân sách → mở tab Trợ lý AI (có câu hỏi sẵn thì hỏi luôn)
root.addEventListener('ask-ai', (e) => {
  showTab('ai');
  const question = e.detail?.question;
  if (question) assistant.ask(question);
  else $('#panel-ai input[name=question]')?.focus();
});

// ---------- XEM KẾ HOẠCH ĐƯỢC CHIA SẺ (?xem=token) ----------
async function renderShared() {
  // Link riêng tư: không cho công cụ tìm kiếm lập chỉ mục nếu lỡ bị đăng công khai
  document.head.append(Object.assign(document.createElement('meta'), { name: 'robots', content: 'noindex, nofollow' }));
  $('#save-status').hidden = true;
  $('#planner-title').textContent = 'Kế hoạch cưới được chia sẻ';
  $('.planner .eyebrow').textContent = 'Chỉ xem';
  try {
    const data = await getSharedPlan(shareToken);
    if (data?.status !== 'ok') {
      $('#planner-subtitle').textContent = 'Không mở được kế hoạch từ link này.';
      renderShareError(root, data?.status);
      return;
    }
    const names = coupleNames(data.couple);
    $('#planner-title').textContent = names ? `Kế hoạch cưới của ${names}` : 'Kế hoạch cưới được chia sẻ';
    document.title = `${$('#planner-title').textContent} – Trạm Hỷ`;
    $('#planner-subtitle').textContent = [data.plan.wedding_date ? `Ngày cưới ${weddingDateLabel(data.plan)}` : '', data.plan.city]
      .filter(Boolean).join(' · ') || 'Ngân sách và việc cần chuẩn bị của cô dâu chú rể.';
    mountSharedPlan(root, data, {
      onExport: async (shared) => {
        await exportPlanExcel({ plan: shared.plan, couple: shared.couple, categories: shared.categories, tasks: shared.checklist, bookings: shared.bookings });
        toast('Đã tải file Excel kế hoạch cưới.', 'success');
      },
    });
  } catch (error) {
    render(root, html`<div class="empty">${error.code === 'SHARE_UNAVAILABLE' ? error.message : 'Chưa mở được kế hoạch – bạn kiểm tra kết nối mạng rồi tải lại trang nhé.'}</div>`);
    console.warn(error);
  }
}

// ---------- KHỞI CHẠY TRANG ----------
profile = await initLayout('planner');
if (shareToken) {
  await renderShared();
} else if (!profile) {
  renderGuest();
} else {
  try {
    [plan, bookings] = await Promise.all([getPlan(profile.id), listMyBookings(profile.id).catch(() => [])]);
    if (plan) {
      renderPlan();
      autoSyncCloudExcel('plan', async () => buildPlanExcelBytes(await fetchFullPlanExportData()));
      if (fromAi) offerDraft().catch(toastError);
    } else {
      renderCreate();
    }
  } catch (error) {
    render(root, html`<div class="empty">Chưa mở được Kế hoạch cưới – Trạm Hỷ đang cập nhật hệ thống, vui lòng thử lại sau.</div>`);
    console.warn(error);
  }
}
