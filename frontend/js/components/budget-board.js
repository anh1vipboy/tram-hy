// "Đám cưới của tôi" → Ngân sách: danh mục theo nghi lễ, mục chi tiêu sửa ngay trên bảng, kéo thả sắp xếp,
// 2 vòng tròn (dự kiến / ngân sách, đã trả / dự kiến) và đơn đặt qua Trạm Hỷ tự hiện đúng danh mục.
import { html, render, money } from '../core/utils.js';
import { openDialog, toast, toastError } from '../core/ui.js';
import { BOOKING_TYPE } from '../core/labels.js';
import { moneyValue, parseMoney } from './money-input.js';
import { makeSortable } from './sortable.js';
import { trackSave } from './save-status.js';
import {
  listBudget, addCategory, updateCategory, deleteCategory, addItem, updateItem, deleteItem, savePositions,
} from '../services/planner.js';

const ACTIVE_BOOKING = (b) => !['cancelled', 'refunded'].includes(b.status);
const bookingPaid = (b) => b.milestones.filter((m) => ['paid', 'released'].includes(m.status)).reduce((s, m) => s + m.amount, 0);
const bookingName = (b) => b.dress?.name || b.details?.package?.name || BOOKING_TYPE[b.type];
const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** Tổng hợp số liệu – dùng cho bảng ngân sách và tab Tổng quan */
export function budgetTotals(categories, bookings, plan) {
  const active = bookings.filter(ACTIVE_BOOKING);
  const items = categories.flatMap((c) => c.items);
  const estimated = items.reduce((s, i) => s + i.estimated, 0) + active.reduce((s, b) => s + b.total_price, 0);
  const paid = items.filter((i) => i.paid).reduce((s, i) => s + (i.actual || i.estimated), 0) + active.reduce((s, b) => s + bookingPaid(b), 0);
  return {
    estimated, paid,
    itemCount: items.length + active.length,
    paidCount: items.filter((i) => i.paid).length + active.filter((b) => bookingPaid(b) >= b.total_price).length,
    budget: plan.total_budget,
    over: plan.total_budget > 0 && estimated > plan.total_budget,
  };
}

export async function mountBudgetBoard(container, plan, { bookings = [], onChange } = {}) {
  let categories = [];
  const collapsed = new Set();
  const active = bookings.filter(ACTIVE_BOOKING);

  // Đơn Trạm Hỷ thuộc danh mục đầu tiên cùng loại tiệm
  const bookingsOf = (category) => {
    if (!category.vendor_category) return [];
    const first = categories.find((c) => c.vendor_category === category.vendor_category);
    return first?.id === category.id ? active.filter((b) => b.vendor?.category === category.vendor_category) : [];
  };
  const categoryTotals = (c) => {
    const linked = bookingsOf(c);
    return {
      estimated: c.items.reduce((s, i) => s + i.estimated, 0) + linked.reduce((s, b) => s + b.total_price, 0),
      actual: c.items.reduce((s, i) => s + i.actual, 0) + linked.reduce((s, b) => s + bookingPaid(b), 0),
    };
  };

  async function reload() {
    try {
      categories = await listBudget(plan.id);
      draw();
    } catch (error) {
      toastError(error);
    }
  }

  function summary() {
    const t = budgetTotals(categories, bookings, plan);
    const usePct = pct(t.estimated, t.budget);
    const paidPct = pct(t.paid, t.estimated);
    return html`
      <section class="card budget-summary">
        <div class="ring-stat">
          <div class="ring" style="--p:${Math.min(usePct, 100)};--c:${t.over ? 'var(--red)' : '#e0a800'}"><span>${usePct}%</span></div>
          <div><span class="small muted">Số mục cần chi: ${t.itemCount}</span>
            <strong class="ring-label" style="color:${t.over ? 'var(--red)' : '#b88400'}">Chi phí dự kiến</strong>
            <span class="ring-value">${money(t.estimated)}</span></div>
        </div>
        <div class="ring-stat">
          <div class="ring" style="--p:${Math.min(paidPct, 100)};--c:var(--green)"><span>${paidPct}%</span></div>
          <div><span class="small muted">Đã thanh toán: ${t.paidCount} mục</span>
            <strong class="ring-label" style="color:var(--green)">Đã thanh toán</strong>
            <span class="ring-value">${money(t.paid)}</span></div>
        </div>
        <div class="budget-summary-actions">
          <button type="button" class="budget-total" data-edit-budget>
            Ngân sách: <strong>${t.budget ? money(t.budget) : 'chưa đặt'}</strong> <span aria-hidden="true">✎</span></button>
          <button type="button" class="btn btn-outline btn-sm budget-ai-btn" data-ask-ai="">✨ Hỏi AI về ngân sách</button>
        </div>
        ${t.over ? html`<div class="notice notice-error small budget-warning">
          <span>⚠️ Dự kiến đang vượt ngân sách <b>${money(t.estimated - t.budget)}</b> – cân nhắc giảm bớt mục chưa đặt cọc.</span>
          <button type="button" class="btn btn-sm budget-warning-ai" data-ask-ai="Cân đối lại để không vượt ngân sách">✨ Hỏi AI cách cân đối</button></div>` : ''}
      </section>`;
  }

  function itemRow(i) {
    const over = i.actual > 0 && i.estimated > 0 && i.actual > i.estimated;
    return html`
      <li class="budget-row" data-id="${i.id}" data-item="${i.id}">
        <button type="button" class="drag-handle" aria-label="Kéo để sắp xếp">⠿</button>
        <input class="cell-name" value="${i.name}" maxlength="120" aria-label="Tên mục chi tiêu" data-field="name">
        <label class="cell-money cell-est"><span>Dự kiến</span>
          <input data-money inputmode="numeric" value="${moneyValue(i.estimated)}" placeholder="0" data-field="estimated" aria-label="Chi phí dự kiến"></label>
        <label class="cell-money cell-act ${over ? 'over' : ''}"><span>Thực tế</span>
          <input data-money inputmode="numeric" value="${moneyValue(i.actual)}" placeholder="0" data-field="actual" aria-label="Chi phí thực tế"></label>
        <button type="button" class="paid-toggle ${i.paid ? 'on' : ''}" data-paid aria-pressed="${i.paid ? 'true' : 'false'}"
          title="${i.paid ? 'Đã thanh toán – bấm để bỏ' : 'Đánh dấu đã thanh toán'}">${i.paid ? '✓ Đã trả' : 'Chưa trả'}</button>
        <button type="button" class="row-delete" data-delete-item aria-label="Xóa mục">✕</button>
      </li>`;
  }

  function bookingRow(b) {
    const paid = bookingPaid(b);
    return html`
      <li class="budget-row booking-row">
        <span class="drag-handle ghost" aria-hidden="true">🔗</span>
        <span class="cell-name"><strong>${bookingName(b)}</strong><span class="small muted"> · ${b.vendor.name} · đặt qua Trạm Hỷ</span></span>
        <span class="cell-money cell-est"><span>Dự kiến</span><b>${money(b.total_price)}</b></span>
        <span class="cell-money cell-act"><span>Đã trả</span><b>${money(paid)}</b></span>
        <a class="paid-toggle ${paid >= b.total_price ? 'on' : ''}" href="bookings.html?focus=${b.code}">${paid >= b.total_price ? '✓ Đủ' : 'Xem đơn'}</a>
        <span></span>
      </li>`;
  }

  function categoryCard(c) {
    const t = categoryTotals(c);
    const isCollapsed = collapsed.has(c.id);
    return html`
      <section class="card budget-category ${isCollapsed ? 'collapsed' : ''}" data-id="${c.id}" data-category="${c.id}">
        <header class="budget-cat-head">
          <button type="button" class="drag-handle" aria-label="Kéo để sắp xếp danh mục">⠿</button>
          <input class="cat-name" value="${c.name}" maxlength="80" aria-label="Tên danh mục" data-cat-name>
          <span class="cat-total">${money(t.estimated)}</span>
          ${c.vendor_category ? html`<a class="btn btn-outline btn-sm cat-find"
            href="marketplace.html?category=${c.vendor_category}${t.estimated ? `&max=${t.estimated}` : ''}">Tìm đối tác →</a>` : ''}
          <button type="button" class="icon-btn" data-delete-cat aria-label="Xóa danh mục">🗑</button>
          <button type="button" class="icon-btn chevron" data-collapse aria-expanded="${isCollapsed ? 'false' : 'true'}" aria-label="Thu gọn / mở rộng">⌄</button>
        </header>
        <div class="budget-cat-body">
          <div class="budget-cols" aria-hidden="true"><span>Mục chi tiêu</span><span>Chi phí dự kiến</span><span>Chi phí thực tế</span><span></span></div>
          <ul class="budget-rows" data-rows="${c.id}">${c.items.map(itemRow)}</ul>
          ${bookingsOf(c).length ? html`<ul class="budget-rows linked">${bookingsOf(c).map(bookingRow)}</ul>` : ''}
          <button type="button" class="add-row" data-add-item>+ Thêm mục chi tiêu</button>
          <div class="budget-cat-foot"><span>Tổng</span><b>${money(t.estimated)}</b><b>${money(t.actual)}</b></div>
        </div>
      </section>`;
  }

  function draw() {
    render(container, html`
      ${summary()}
      <div class="budget-categories" id="budget-categories">${categories.map(categoryCard)}</div>
      <button type="button" class="btn btn-primary btn-block btn-lg" data-add-cat>+ Thêm danh mục chi tiêu</button>`);
    bind();
    onChange?.(categories);
  }

  // Sửa số / bật tắt "đã trả" chỉ cập nhật tổng (không vẽ lại cả bảng → không mất con trỏ đang nhập)
  function refreshTotals() {
    const fresh = summary();
    const holder = document.createElement('div');
    render(holder, fresh);
    container.querySelector('.budget-summary').replaceWith(holder.firstElementChild);
    container.querySelector('[data-edit-budget]').addEventListener('click', editBudget);
    for (const c of categories) {
      const card = container.querySelector(`[data-category="${c.id}"]`);
      const t = categoryTotals(c);
      card.querySelector('.cat-total').textContent = money(t.estimated);
      const [e, a] = card.querySelectorAll('.budget-cat-foot b');
      e.textContent = money(t.estimated);
      a.textContent = money(t.actual);
    }
    onChange?.(categories);
  }

  async function save(task, rollback) {
    try {
      await trackSave(task);
    } catch (error) {
      toastError(error);
      rollback?.();
      draw();
    }
  }

  // Nút "Hỏi AI" nằm trong khung tổng (bị vẽ lại khi sửa số) → bắt sự kiện ở container, gắn 1 lần
  if (!container.dataset.askAiBound) {   // bảng có thể được mount lại trên cùng container
    container.dataset.askAiBound = '1';
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-ask-ai]');
      if (btn) container.dispatchEvent(new CustomEvent('ask-ai', { bubbles: true, detail: { question: btn.dataset.askAi } }));
    });
  }

  function bind() {
    container.querySelector('[data-edit-budget]').addEventListener('click', editBudget);
    container.querySelector('[data-add-cat]').addEventListener('click', addNewCategory);

    makeSortable(container.querySelector('#budget-categories'), {
      item: '.budget-category', handle: '.budget-cat-head .drag-handle',
      onEnd: (order) => {
        categories.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
        save(() => savePositions('budget_categories', order.map((id, position) => ({ id, position }))));
      },
    });

    for (const card of container.querySelectorAll('[data-category]')) {
      const category = categories.find((c) => c.id === card.dataset.category);

      card.querySelector('[data-collapse]').addEventListener('click', () => {
        if (collapsed.has(category.id)) collapsed.delete(category.id); else collapsed.add(category.id);
        card.classList.toggle('collapsed');
        card.querySelector('[data-collapse]').setAttribute('aria-expanded', String(!collapsed.has(category.id)));
      });
      card.querySelector('[data-cat-name]').addEventListener('change', (e) => {
        const name = e.target.value.trim();
        if (!name) { e.target.value = category.name; return; }
        const old = category.name;
        category.name = name;
        save(() => updateCategory(category.id, { name }), () => { category.name = old; });
      });
      card.querySelector('[data-delete-cat]').addEventListener('click', () => removeCategory(category));
      card.querySelector('[data-add-item]').addEventListener('click', () => addNewItem(category));

      const rows = card.querySelector(`[data-rows="${category.id}"]`);
      makeSortable(rows, {
        item: '.budget-row', handle: '.drag-handle',
        onEnd: (order) => {
          category.items.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
          save(() => savePositions('budget_items', order.map((id, position) => ({ id, position }))));
        },
      });

      for (const row of rows.querySelectorAll('[data-item]')) {
        const item = category.items.find((i) => i.id === row.dataset.item);
        row.querySelectorAll('[data-field]').forEach((input) => input.addEventListener('change', () => {
          const field = input.dataset.field;
          const value = field === 'name' ? input.value.trim() : (parseMoney(input.value) ?? 0);
          if (field === 'name' && !value) { input.value = item.name; return; }
          if (field !== 'name' && value > 10_000_000_000) { toastError(new Error('Số tiền tối đa 10 tỷ')); input.value = moneyValue(item[field]); return; }
          const old = item[field];
          item[field] = value;
          if (field === 'actual') row.querySelector('[data-field="actual"]').closest('.cell-money')
            .classList.toggle('over', item.actual > 0 && item.estimated > 0 && item.actual > item.estimated);
          refreshTotals();
          save(() => updateItem(item.id, { [field]: value }), () => { item[field] = old; });
        }));
        row.querySelector('[data-paid]').addEventListener('click', (e) => {
          item.paid = !item.paid;
          const btn = e.currentTarget;
          btn.classList.toggle('on', item.paid);
          btn.setAttribute('aria-pressed', String(item.paid));
          btn.textContent = item.paid ? '✓ Đã trả' : 'Chưa trả';
          btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop');
          refreshTotals();
          save(() => updateItem(item.id, { paid: item.paid }), () => { item.paid = !item.paid; });
        });
        row.querySelector('[data-delete-item]').addEventListener('click', async () => {
          category.items = category.items.filter((i) => i.id !== item.id);
          row.classList.add('removing');
          setTimeout(draw, 200);
          save(() => deleteItem(item.id), () => category.items.push(item));
          toast(`Đã xóa "${item.name}".`);
        });
      }
    }
  }

  async function addNewItem(category) {
    try {
      const item = await trackSave(() => addItem(plan.id, category.id, 'Mục mới', category.items.length));
      category.items.push(item);
      collapsed.delete(category.id);
      draw();
      const input = container.querySelector(`[data-item="${item.id}"] [data-field="name"]`);
      input.focus();
      input.select();
    } catch (error) {
      toastError(error);
    }
  }

  async function addNewCategory() {
    const done = await openDialog({
      title: 'Thêm danh mục chi tiêu',
      confirmText: 'Thêm danh mục',
      content: html`<label class="field"><span>Tên danh mục</span>
        <input class="input" name="name" required maxlength="80" placeholder="VD: Tuần trăng mật, Lễ vu quy…"></label>`,
      onConfirm: (form) => addCategory(plan.id, form.get('name').trim(), categories.length),
    });
    if (done) {
      categories.push({ ...done, items: [] });
      draw();
      container.querySelector(`[data-category="${done.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  async function removeCategory(category) {
    const ok = await openDialog({
      title: `Xóa danh mục "${category.name}"?`,
      danger: true,
      confirmText: 'Xóa danh mục',
      content: html`<p>Danh mục và <strong>${category.items.length} mục chi tiêu</strong> bên trong sẽ bị xóa.
        ${bookingsOf(category).length ? ' Đơn đặt qua Trạm Hỷ không bị ảnh hưởng.' : ''}</p>`,
      onConfirm: () => deleteCategory(category.id),
    });
    if (ok) {
      categories = categories.filter((c) => c.id !== category.id);
      draw();
      toast('Đã xóa danh mục.', 'success');
    }
  }

  async function editBudget() {
    container.dispatchEvent(new CustomEvent('edit-plan', { bubbles: true }));
  }

  await reload();
  return { reload };
}
