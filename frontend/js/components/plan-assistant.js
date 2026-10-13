// "Đám cưới của tôi" → Trợ lý AI: hỏi đáp về kế hoạch, AI đọc ngân sách + đơn đã đặt ở server.
// Đề xuất sửa số "Dự kiến" hiện thành thẻ: tick chọn từng mục → Áp dụng (có Hoàn tác). Không bấm thì không đổi gì.
import { html, render, money } from '../core/utils.js';
import { toast, toastError, withBusy } from '../core/ui.js';
import { askPlanAssistant, planAssistantRemaining, PLAN_AI_DAILY_LIMIT } from '../services/budget-ai.js';
import { applyEstimates, listBudget } from '../services/planner.js';
import { trackSave } from './save-status.js';

const FALLBACK_TEXT = {
  busy: 'AI đang quá tải, bạn thử hỏi lại sau ít phút nhé. (Câu này không bị tính lượt.)',
  'not-configured': 'Trợ lý AI chưa được bật trên hệ thống. Bạn quay lại sau nhé!',
  error: 'Mình chưa kết nối được AI, bạn thử lại sau nhé. (Câu này không bị tính lượt.)',
};

/**
 * getTotals: async () → { estimated, budget, over } – số liệu mới nhất để gợi ý câu hỏi và tính "sau khi áp dụng"
 * onApplied: gọi sau khi áp dụng / hoàn tác (trang vẽ lại tab Ngân sách)
 * Trả về { ask(question) } để nơi khác (vd cảnh báo vượt ngân sách) hỏi hộ.
 */
export function mountPlanAssistant(container, { profile, plan, getTotals, onApplied }) {
  let history = [];
  let remaining = PLAN_AI_DAILY_LIMIT;
  let asking = false;

  render(container, html`
    <section class="card stack plan-ai">
      <div class="row">
        <h3 style="margin:0">✨ Trợ lý AI kế hoạch cưới</h3>
        <span class="spacer"></span>
        <span class="badge" data-remaining></span>
      </div>
      <p class="small muted" style="margin:0">Trợ lý đọc toàn bộ ngân sách, đơn đã đặt và ngày cưới của bạn để trả lời.
        Số tiền chỉ thay đổi khi bạn bấm <strong>Áp dụng</strong>.</p>
      <div class="chat-log plan-ai-log" data-log aria-live="polite">
        <div class="msg ai">Chào bạn! Mình có thể cân đối ngân sách, chia lại chi tiết từng khoản hoặc gợi ý chỗ tiết kiệm. Bạn muốn bắt đầu từ đâu?</div>
      </div>
      <div class="chips" data-suggest></div>
      <form class="row chat-form" novalidate data-form>
        <input class="input" name="question" maxlength="400" autocomplete="off" placeholder="Hỏi về kế hoạch cưới của bạn…" aria-label="Câu hỏi cho trợ lý AI">
        <button class="btn btn-primary" type="submit">Gửi</button>
      </form>
    </section>`);

  const log = container.querySelector('[data-log]');
  const form = container.querySelector('[data-form]');
  const input = form.elements.question;

  function showRemaining() {
    const badge = container.querySelector('[data-remaining]');
    badge.textContent = remaining > 0 ? `Còn ${remaining}/${PLAN_AI_DAILY_LIMIT} câu hôm nay` : 'Hết lượt hôm nay';
    badge.className = `badge ${remaining > 0 ? 'badge-purple' : ''}`;
    input.disabled = remaining <= 0;
    form.querySelector('[type=submit]').disabled = remaining <= 0;
    if (remaining <= 0) input.placeholder = 'Bạn đã hỏi đủ 20 câu hôm nay – mai quay lại nhé!';
  }

  function addMessage(role, text) {
    const el = document.createElement('div');
    el.className = `msg ${role}`;
    el.textContent = text;
    log.append(el);
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return el;
  }

  async function renderSuggestions() {
    const t = await getTotals().catch(() => null);
    const days = plan.wedding_date ? Math.ceil((new Date(`${plan.wedding_date}T00:00:00`) - new Date()) / 86_400_000) : null;
    const list = [
      t?.over && 'Cân đối lại để không vượt ngân sách',
      `Chia lại chi tiết từng khoản cho ${plan.guests ? `${plan.guests} khách` : 'đám cưới'}${plan.city ? ` ở ${plan.city}` : ''}`,
      'Mục nào có thể tiết kiệm mà không ảnh hưởng nhiều?',
      plan.guests ? `${plan.guests} khách nên đặt bao nhiêu bàn, giá bàn bao nhiêu là hợp lý?` : 'Nên mời bao nhiêu khách với ngân sách này?',
      days > 0 && `Còn ${days} ngày, nên chi khoản nào trước?`,
    ].filter(Boolean).slice(0, 4);
    const holder = container.querySelector('[data-suggest]');
    render(holder, html`${list.map((q) => html`<button class="chip" type="button">${q}</button>`)}`);
    holder.querySelectorAll('.chip').forEach((chip) => chip.addEventListener('click', () => withBusy(chip, () => ask(chip.textContent))));
  }

  // Thẻ đề xuất: tick chọn từng mục, xem tổng trước / sau, Áp dụng → Hoàn tác
  async function addProposal(changes) {
    const t = await getTotals().catch(() => null);
    const card = document.createElement('div');
    card.className = 'ai-proposal';
    log.append(card);

    const draw = (state = 'open') => {
      const picked = changes.filter((c) => c.picked);
      const delta = picked.reduce((s, c) => s + c.to - c.from, 0);
      const after = t ? t.estimated + delta : null;
      render(card, html`
        <div class="ai-proposal-head">
          <strong>${state === 'applied' ? `✓ Đã áp dụng ${picked.length} thay đổi` : `Đề xuất điều chỉnh · ${changes.length} mục`}</strong>
        </div>
        <ul class="ai-changes">
          ${changes.map((c, i) => html`
            <li class="${c.picked ? '' : 'off'}">
              <label>
                <input type="checkbox" data-pick="${i}" ${c.picked ? 'checked' : ''} ${state === 'open' ? '' : 'disabled'}>
                <span class="ai-change-name"><strong>${c.name}</strong><span class="small muted">${c.category}${c.reason ? ` · ${c.reason}` : ''}</span></span>
              </label>
              <span class="ai-change-money"><s class="muted">${money(c.from)}</s>
                <b class="${c.to < c.from ? 'down' : 'up'}">${money(c.to)}</b></span>
            </li>`)}
        </ul>
        ${t ? html`<div class="ai-proposal-total small">
          Tổng dự kiến: <strong>${money(t.estimated)}</strong> → <strong>${money(after)}</strong>
          ${t.budget ? (after <= t.budget
            ? html`<span class="text-green">✓ trong ngân sách ${money(t.budget)}</span>`
            : html`<span class="text-red">vẫn vượt ${money(after - t.budget)}</span>`) : ''}
        </div>` : ''}
        <div class="row">
          ${state === 'open' ? html`
            <button type="button" class="btn btn-primary btn-sm" data-apply ${picked.length ? '' : 'disabled'}>Áp dụng ${picked.length} thay đổi</button>
            <button type="button" class="btn btn-light btn-sm" data-dismiss>Bỏ qua</button>`
          : state === 'applied' ? html`
            <button type="button" class="btn btn-outline btn-sm" data-undo>↶ Hoàn tác</button>
            <span class="small muted">Đã cập nhật tab Ngân sách</span>`
          : html`<span class="small muted">${state === 'undone' ? 'Đã hoàn tác – số tiền trở lại như cũ.' : 'Đã bỏ qua đề xuất này.'}</span>`}
        </div>`);

      card.querySelectorAll('[data-pick]').forEach((box) => box.addEventListener('change', () => {
        changes[Number(box.dataset.pick)].picked = box.checked;
        draw();
      }));
      card.querySelector('[data-apply]')?.addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
        try {
          // Số "trước" lấy lại từ database ngay lúc áp dụng (người dùng có thể vừa sửa tay) → Hoàn tác trả đúng số cũ
          const current = new Map((await listBudget(plan.id)).flatMap((c) => c.items).map((i) => [i.id, i.estimated]));
          for (const c of picked) if (current.has(c.id)) c.from = current.get(c.id);
          await trackSave(() => applyEstimates(picked));
          draw('applied');
          toast(`Đã áp dụng ${picked.length} thay đổi vào ngân sách.`, 'success');
          onApplied?.();
        } catch (error) { toastError(error); }
      }));
      card.querySelector('[data-dismiss]')?.addEventListener('click', () => draw('dismissed'));
      card.querySelector('[data-undo]')?.addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
        try {
          await trackSave(() => applyEstimates(picked.map((c) => ({ id: c.id, to: c.from }))));
          draw('undone');
          onApplied?.();
        } catch (error) { toastError(error); }
      }));
    };
    draw();
    card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  async function ask(question) {
    question = String(question ?? '').trim();
    if (!question || asking) return;
    if (remaining <= 0) { toastError(new Error('Bạn đã hỏi đủ 20 câu hôm nay – mai quay lại nhé!')); return; }
    asking = true;
    addMessage('user', question);
    input.value = '';
    const typing = addMessage('ai typing', 'Trợ lý đang xem kế hoạch của bạn…');
    try {
      const result = await askPlanAssistant({ question, history });
      typing.remove();
      if (result.fallback) {
        addMessage('ai', FALLBACK_TEXT[result.reason] ?? FALLBACK_TEXT.error);
        return;
      }
      remaining = result.remaining ?? remaining - 1;
      showRemaining();
      history = [...history, { role: 'user', text: question }, { role: 'ai', text: result.reply }].slice(-6);
      addMessage('ai', result.reply);
      if (result.changes?.length) await addProposal(result.changes.map((c) => ({ ...c, picked: true })));
      renderSuggestions();
    } catch (error) {
      typing.remove();
      if (error.remaining === 0) { remaining = 0; showRemaining(); }
      addMessage('ai', error.message);
    } finally {
      asking = false;
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    withBusy(form.querySelector('[type=submit]'), () => ask(input.value));
  });

  showRemaining();
  renderSuggestions();
  planAssistantRemaining(profile.id).then((n) => { remaining = n; showRemaining(); });

  return { ask, refreshSuggestions: renderSuggestions };
}
