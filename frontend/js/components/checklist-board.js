// "Đám cưới của tôi" → Checklist: việc cần làm theo mốc thời gian, hạn tự tính từ ngày cưới.
import { html, render } from '../core/utils.js';
import { openDialog, toast, toastError, withBusy } from '../core/ui.js';
import { CHECKLIST_STAGES } from '../data/planner-templates.js';
import { listChecklist, addTask, updateTask, deleteTask } from '../services/planner.js';
import { trackSave } from './save-status.js';

const DAY = 86_400_000;
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const dueDate = (plan, task) => (plan.wedding_date ? new Date(new Date(`${plan.wedding_date}T00:00:00`).getTime() - task.days_before * DAY) : null);
const fmt = (d) => d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

const stageIndex = (days) => CHECKLIST_STAGES.findIndex((s) => days >= s.from);

export const checklistProgress =(tasks) => ({ done: tasks.filter((t) => t.done).length, total: tasks.length });

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
    // "Tất cả": hiện đủ các mốc (mốc trống vẫn có nút thêm việc); lọc thì chỉ hiện mốc có việc
    const groups = CHECKLIST_STAGES.map((stage, i) => ({
      ...stage,
      index: i,
      tasks: visible.filter((t) => stageIndex(t.days_before) === i),
    })).filter((g) => filter === 'all' || g.tasks.length);

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
        <div class="chips" role="tablist">
          ${[['all', 'Tất cả'], ['todo', 'Chưa xong'], ['done', 'Đã xong']].map(([key, label]) => html`
            <button type="button" class="chip ${filter === key ? 'active' : ''}" data-filter="${key}">${label}</button>`)}
        </div>
      </section>
      ${groups.length ? groups.map((g) => html`
        <section class="task-group" data-stage="${g.index}">
          <h4>${g.label}${g.tasks.length ? html` <span class="task-group-count">${g.tasks.filter((t) => t.done).length}/${g.tasks.length}</span>` : ''}</h4>
          ${g.tasks.length ? html`<ul class="task-list">${g.tasks.map(taskRow)}</ul>` : ''}
          <div class="task-add-slot">
            <button type="button" class="task-add-btn" data-add-task>＋ Thêm công việc</button>
          </div>
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
          <span class="task-title" contenteditable="plaintext-only" spellcheck="false" role="textbox" aria-label="Tên việc" title="Bấm để sửa" data-title>${t.title}</span>
          <span class="task-due">${due.tone === 'late' ? '⏰ ' : ''}${due.text}</span>
        </div>
        ${t.link_category && !t.done ? html`<a class="btn btn-outline btn-sm" href="marketplace.html?category=${t.link_category}">Tìm đối tác →</a>` : ''}
        <button type="button" class="task-more" data-edit aria-label="Sửa việc: ${t.title}" title="Sửa tên & thời hạn">⋯</button>
        <button type="button" class="row-delete" data-delete aria-label="Xóa việc">✕</button>
      </li>`;
  }

  // Mở ô nhập ngay dưới mốc thời gian → Enter lưu (và mở ô mới để thêm tiếp), Esc / bỏ trống để đóng
  function openAddForm(group) {
    const stage = CHECKLIST_STAGES[Number(group.dataset.stage)];
    const slot = group.querySelector('.task-add-slot');
    render(slot, html`
      <form class="task-add-inline" novalidate>
        <input class="input" name="title" maxlength="160" autocomplete="off" placeholder="Tên công việc, VD: Đặt bánh cưới" aria-label="Công việc mới – ${stage.label}">
        <button class="btn btn-primary btn-sm" type="submit">Thêm</button>
        <button class="btn btn-light btn-sm" type="button" data-cancel>Hủy</button>
      </form>`);
    const form = slot.querySelector('form');
    const input = form.elements.title;
    input.focus();
    const close = () => draw();
    form.querySelector('[data-cancel]').addEventListener('click', close);
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const title = input.value.trim();
      if (!title) { close(); return; }
      withBusy(e.submitter ?? form.querySelector('[type=submit]'), async () => {
        try {
          tasks.push(await trackSave(() => addTask(plan.id, title, stage.days)));
          tasks.sort((a, b) => b.days_before - a.days_before);
          if (filter === 'done') filter = 'all';
          draw();
          openAddForm(container.querySelector(`[data-stage="${group.dataset.stage}"]`));   // thêm tiếp việc khác cùng mốc
        } catch (error) {
          toastError(error);
        }
      });
    });
  }

  // Sửa tên + thời hạn: có ngày cưới thì chọn ngày cụ thể, chưa có thì chọn "trước bao lâu"
  async function editTask(task) {
    const due = dueDate(plan, task);
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const presets = [[300, 'Trước 10 tháng'], [180, 'Trước 6 tháng'], [90, 'Trước 3 tháng'], [30, 'Trước 1 tháng'], [14, 'Trước 2 tuần'],
      [7, 'Trước 1 tuần'], [1, 'Trước 1 ngày'], [0, 'Ngày cưới'], [-7, 'Sau ngày cưới 1 tuần']];
    if (!presets.some(([d]) => d === task.days_before)) presets.push([task.days_before, dueLabel(plan, task).text]);
    const saved = await openDialog({
      title: 'Sửa công việc',
      confirmText: 'Lưu',
      content: html`
        <div class="stack">
          <label class="field"><span>Tên công việc</span>
            <textarea class="input" name="title" rows="3" maxlength="160" required>${task.title}</textarea></label>
          ${due ? html`
            <label class="field"><span>Hạn hoàn thành</span>
              <input class="input" type="date" name="due" value="${iso(due)}" required></label>
            <p class="small muted" style="margin:0">Ngày cưới: ${fmt(new Date(`${plan.wedding_date}T00:00:00`))} – việc sẽ tự chuyển sang đúng mốc thời gian.</p>`
          : html`
            <label class="field"><span>Thời hạn</span>
              <select class="input" name="days">${presets.sort((a, b) => b[0] - a[0]).map(([d, label]) => html`
                <option value="${d}" ${d === task.days_before ? 'selected' : ''}>${label}</option>`)}</select></label>`}
        </div>`,
      onConfirm: async (form) => {
        const title = form.get('title').trim().replace(/\s+/g, ' ');
        if (!title) throw new Error('Tên công việc không được để trống');
        let days = task.days_before;
        if (due) {
          const picked = form.get('due');
          if (!picked) throw new Error('Vui lòng chọn hạn hoàn thành');
          days = Math.round((new Date(`${plan.wedding_date}T00:00:00`) - new Date(`${picked}T00:00:00`)) / DAY);
        } else {
          days = Number(form.get('days'));
        }
        await trackSave(() => updateTask(task.id, { title, days_before: days }));
        return { title, days };
      },
    });
    if (saved) {
      Object.assign(task, { title: saved.title, days_before: saved.days });
      tasks.sort((a, b) => b.days_before - a.days_before);
      draw();
      toast('Đã lưu công việc.', 'success');
    }
  }

  function bind() {
    container.querySelector('[data-set-date]')?.addEventListener('click', () =>
      container.dispatchEvent(new CustomEvent('edit-plan', { bubbles: true })));
    container.querySelectorAll('[data-filter]').forEach((chip) => chip.addEventListener('click', () => { filter = chip.dataset.filter; draw(); }));

    container.querySelectorAll('[data-add-task]').forEach((btn) => btn.addEventListener('click', () => openAddForm(btn.closest('[data-stage]'))));

    container.querySelectorAll('[data-task]').forEach((row) => {
      const task = tasks.find((t) => t.id === row.dataset.task);

      // Sửa tên ngay trên dòng: Enter lưu, Esc hủy, bỏ trống thì trả lại tên cũ
      const title = row.querySelector('[data-title]');
      title.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); title.blur(); }
        if (e.key === 'Escape') { title.textContent = task.title; title.blur(); }
      });
      title.addEventListener('blur', async () => {
        const value = title.textContent.trim().replace(/\s+/g, ' ').slice(0, 160);
        if (!value || value === task.title) { title.textContent = task.title; return; }
        const old = task.title;
        task.title = value;
        title.textContent = value;
        try { await trackSave(() => updateTask(task.id, { title: value })); } catch (error) { task.title = old; title.textContent = old; toastError(error); }
      });
      row.querySelector('[data-edit]').addEventListener('click', () => editTask(task));

      row.querySelector('.task-check').addEventListener('click', async () => {
        task.done = !task.done;
        row.classList.toggle('done', task.done);
        row.classList.add('just-toggled');
        setTimeout(draw, 350);                               // để hiệu ứng tick chạy xong rồi mới vẽ lại
        try {
          await trackSave(() => updateTask(task.id, { done: task.done, done_at: task.done ? new Date().toISOString() : null }));
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
        try { await trackSave(() => deleteTask(task.id)); } catch (error) { toastError(error); reload(); }
      });
    });
  }

  await reload();
  return { reload };
}
