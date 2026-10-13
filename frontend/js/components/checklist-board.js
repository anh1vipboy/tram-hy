// "Đám cưới của tôi" → Checklist: việc cần làm theo mốc thời gian, hạn tự tính từ ngày cưới.
import { html, render } from '../core/utils.js';
import { toast, toastError, withBusy } from '../core/ui.js';
import { CHECKLIST_STAGES } from '../data/planner-templates.js';
import { listChecklist, addTask, updateTask, deleteTask } from '../services/planner.js';

const DAY = 86_400_000;
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const dueDate = (plan, task) => (plan.wedding_date ? new Date(new Date(`${plan.wedding_date}T00:00:00`).getTime() - task.days_before * DAY) : null);
const fmt = (d) => d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

export const checklistProgress = (tasks) => ({ done: tasks.filter((t) => t.done).length, total: tasks.length });

/** Việc chưa xong gần nhất (cho tab Tổng quan) */
export function nextTasks(tasks, count = 3) {
  return tasks.filter((t) => !t.done).sort((a, b) => b.days_before - a.days_before).slice(0, count);
}

/** Nhãn hạn: "15/03/2027 · còn 20 ngày" / "Quá hạn 3 ngày" / "Trước 6 tháng" khi chưa có ngày cưới */
export function dueLabel(plan, task) {
  const due = dueDate(plan, task);
  if (!due) {
    if (task.days_before > 0) return { text: task.days_before >= 60 ? `Trước ${Math.round(task.days_before / 30)} tháng` : `Trước ${task.days_before} ngày`, tone: '' };
    return { text: task.days_before === 0 ? 'Ngày cưới' : `Sau cưới ${-task.days_before} ngày`, tone: '' };
  }
  const diff = Math.round((due - today()) / DAY);
  if (task.done) return { text: fmt(due), tone: 'done' };
  if (diff < 0) return { text: `${fmt(due)} · quá hạn ${-diff} ngày`, tone: 'late' };
  if (diff === 0) return { text: 'Hôm nay', tone: 'soon' };
  return { text: `${fmt(due)} · còn ${diff} ngày`, tone: diff <= 14 ? 'soon' : '' };
}

export async function mountChecklistBoard(container, plan, { onChange } = {}) {
  let tasks = [];
  let filter = 'all';

  async function reload() {
    try {
      tasks = await listChecklist(plan.id);
      draw();
    } catch (error) {
      toastError(error);
    }
  }

  function draw() {
    const { done, total } = checklistProgress(tasks);
    const percent = total ? Math.round((done / total) * 100) : 0;
    const visible = tasks.filter((t) => filter === 'all' || (filter === 'todo' ? !t.done : t.done));
    const groups = CHECKLIST_STAGES.map((stage, i) => ({
      ...stage,
      tasks: visible.filter((t) => t.days_before >= stage.from && (i === 0 || t.days_before < CHECKLIST_STAGES[i - 1].from)),
    })).filter((g) => g.tasks.length);

    render(container, html`
      <section class="card stack checklist-head">
        <div class="row">
          <div><h3 style="margin:0">Việc cần chuẩn bị</h3>
            <p class="small muted" style="margin:2px 0 0">${done}/${total} việc đã xong
              ${plan.wedding_date ? '' : html` · <button type="button" class="btn-link btn-sm" data-set-date>Đặt ngày cưới để tính hạn</button>`}</p></div>
          <span class="spacer"></span>
          <strong class="checklist-percent">${percent}%</strong>
        </div>
        <div class="progress"><span style="width:${percent}%"></span></div>
        <form class="task-add" data-add novalidate>
          <input class="input" name="title" maxlength="160" placeholder="Thêm việc của riêng bạn, VD: Đặt bánh cưới" aria-label="Việc mới">
          <select class="input" name="days" aria-label="Thời hạn">
            <option value="180">Trước 6 tháng</option><option value="90">Trước 3 tháng</option><option value="30" selected>Trước 1 tháng</option>
            <option value="7">Trước 1 tuần</option><option value="1">Trước 1 ngày</option><option value="-7">Sau ngày cưới</option>
          </select>
          <button class="btn btn-primary" type="submit">Thêm</button>
        </form>
        <div class="chips" role="tablist">
          ${[['all', 'Tất cả'], ['todo', 'Chưa xong'], ['done', 'Đã xong']].map(([key, label]) => html`
            <button type="button" class="chip ${filter === key ? 'active' : ''}" data-filter="${key}">${label}</button>`)}
        </div>
      </section>
      ${groups.length ? groups.map((g) => html`
        <section class="task-group">
          <h4>${g.label}</h4>
          <ul class="task-list">${g.tasks.map(taskRow)}</ul>
        </section>`) : html`<div class="empty">${filter === 'done' ? 'Chưa có việc nào xong – cố lên nhé!' : 'Tuyệt vời, bạn đã xong hết việc! 🎉'}</div>`}`);
    bind();
    onChange?.(tasks);
  }

  function taskRow(t) {
    const due = dueLabel(plan, t);
    return html`
      <li class="task ${t.done ? 'done' : ''} ${due.tone}" data-task="${t.id}">
        <button type="button" class="task-check" role="checkbox" aria-checked="${t.done ? 'true' : 'false'}" aria-label="Đánh dấu xong: ${t.title}"></button>
        <div class="task-text">
          <span class="task-title">${t.title}</span>
          <span class="task-due">${due.tone === 'late' ? '⏰ ' : ''}${due.text}</span>
        </div>
        ${t.link_category && !t.done ? html`<a class="btn btn-outline btn-sm" href="marketplace.html?category=${t.link_category}">Tìm đối tác →</a>` : ''}
        <button type="button" class="row-delete" data-delete aria-label="Xóa việc">✕</button>
      </li>`;
  }

  function bind() {
    container.querySelector('[data-set-date]')?.addEventListener('click', () =>
      container.dispatchEvent(new CustomEvent('edit-plan', { bubbles: true })));
    container.querySelectorAll('[data-filter]').forEach((chip) => chip.addEventListener('click', () => { filter = chip.dataset.filter; draw(); }));

    container.querySelector('[data-add]').addEventListener('submit', (e) => {
      e.preventDefault();
      const form = new FormData(e.target);
      const title = form.get('title').trim();
      if (!title) { e.target.elements.title.focus(); return; }
      withBusy(e.submitter, async () => {
        try {
          tasks.push(await addTask(plan.id, title, Number(form.get('days'))));
          tasks.sort((a, b) => b.days_before - a.days_before);
          filter = filter === 'done' ? 'all' : filter;
          draw();
          toast('Đã thêm việc.', 'success');
        } catch (error) {
          toastError(error);
        }
      });
    });

    container.querySelectorAll('[data-task]').forEach((row) => {
      const task = tasks.find((t) => t.id === row.dataset.task);
      row.querySelector('.task-check').addEventListener('click', async () => {
        task.done = !task.done;
        row.classList.toggle('done', task.done);
        row.classList.add('just-toggled');
        setTimeout(draw, 350);                               // để hiệu ứng tick chạy xong rồi mới vẽ lại
        try {
          await updateTask(task.id, { done: task.done, done_at: task.done ? new Date().toISOString() : null });
          if (task.done && checklistProgress(tasks).done === tasks.length) toast('🎉 Bạn đã hoàn thành mọi việc chuẩn bị!', 'success');
        } catch (error) {
          task.done = !task.done;
          toastError(error);
          draw();
        }
      });
      row.querySelector('[data-delete]').addEventListener('click', async () => {
        tasks = tasks.filter((t) => t.id !== task.id);
        draw();
        try { await deleteTask(task.id); } catch (error) { toastError(error); reload(); }
      });
    });
  }

  await reload();
  return { reload };
}
