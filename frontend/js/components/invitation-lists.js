// Trình soạn thiệp – 2 danh sách: sự kiện cưới (lễ & tiệc) và câu hỏi khi khách xác nhận tham dự.
// Danh sách được sửa trực tiếp (mảng truyền vào), mỗi lần đổi gọi onChange() để trang vẽ lại bản xem trước.
import { html, render, toLocalInput } from '../core/utils.js';

export const EVENTS_MAX = 6;
export const QUESTIONS_MAX = 5;
const uid = (prefix) => `${prefix}${Math.random().toString(36).slice(2, 8)}`;

export const EVENT_PRESETS = [
  { name: 'Lễ ăn hỏi', kind: 'le' },
  { name: 'Lễ vu quy', kind: 'le' },
  { name: 'Lễ thành hôn', kind: 'le' },
  { name: 'Tiệc nhà gái', kind: 'tiec' },
  { name: 'Tiệc nhà trai', kind: 'tiec' },
  { name: 'Tiệc cưới', kind: 'tiec' },
];
export const newEvent = (preset = {}) => ({ id: uid('ev'), name: preset.name ?? '', kind: preset.kind ?? 'tiec', at: null, place: '', address: '' });

export const QUESTION_PRESETS = [
  { text: 'Bạn có ăn chay không?', type: 'choice', options: ['Không', 'Có, ăn chay'] },
  { text: 'Bạn có cần xe đưa đón không?', type: 'choice', options: ['Không cần', 'Có, cần xe đưa đón'] },
  { text: 'Bạn đi cùng trẻ nhỏ không?', type: 'choice', options: ['Không', 'Có, 1 bé', 'Có, từ 2 bé'] },
  { text: 'Bạn muốn ngồi cùng ai?', type: 'text' },
];
export const newQuestion = (preset = {}) => ({
  id: uid('q'), text: preset.text ?? '', type: preset.type ?? 'text', options: preset.options ? [...preset.options] : [],
  required: false, event_id: '',
});

// ---------- SỰ KIỆN ----------
/** events: mảng sự kiện (sửa tại chỗ). Có đúng 1 tiệc "chính" – in trên thiệp, dùng cho đếm ngược & chỉ đường. */
export function mountEventsEditor(box, events, onChange) {
  const ensureMain = () => {
    const parties = events.filter((e) => e.kind === 'tiec');
    if (parties.length && !parties.some((e) => e.main)) parties[0].main = true;
    events.forEach((e) => { if (e.kind !== 'tiec') delete e.main; });
  };
  const draw = () => {
    ensureMain();
    render(box, html`
      <div class="stack" style="gap:10px">${events.map((e, i) => html`
        <div class="event-edit ${e.kind === 'tiec' && e.main ? 'is-main' : ''}" data-ev="${i}">
          <div class="event-edit-head">
            <span class="event-badge">${e.kind === 'le' ? '🏮 Lễ' : '🥂 Tiệc'}</span>
            <strong>${e.name || 'Sự kiện mới'}</strong>
            <span class="spacer"></span>
            <button type="button" class="btn btn-link btn-sm text-red" data-ev-remove aria-label="Xóa ${e.name || 'sự kiện'}">Xóa</button>
          </div>
          <div class="form-grid">
            <label class="field"><span>Tên sự kiện</span>
              <input class="input" data-ev-field="name" maxlength="60" value="${e.name}" placeholder="VD: Tiệc nhà gái" list="event-names"></label>
            <label class="field"><span>Loại</span>
              <select class="input" data-ev-field="kind">
                <option value="le" ${e.kind === 'le' ? 'selected' : ''}>Lễ tại tư gia</option>
                <option value="tiec" ${e.kind === 'tiec' ? 'selected' : ''}>Tiệc</option>
              </select></label>
            <label class="field full"><span>Thời gian</span>
              <input class="input" type="datetime-local" data-ev-field="at" value="${toLocalInput(e.at)}"></label>
            <label class="field"><span>Nơi tổ chức</span>
              <input class="input" data-ev-field="place" maxlength="120" value="${e.place}" placeholder="${e.kind === 'le' ? 'VD: Tư gia nhà gái' : 'VD: Nhà hàng Hoa Sen'}"></label>
            <label class="field"><span>Địa chỉ</span>
              <input class="input" data-ev-field="address" maxlength="160" value="${e.address}" placeholder="Số nhà, đường, quận, tỉnh"></label>
          </div>
          ${e.kind === 'tiec' ? html`
            <label class="same-photo"><input type="radio" name="ev_main" data-ev-main ${e.main ? 'checked' : ''}>
              Tiệc chính – in trên thiệp, dùng cho đếm ngược & chỉ đường</label>` : ''}
        </div>`)}
      </div>
      <datalist id="event-names">${EVENT_PRESETS.map((p) => html`<option value="${p.name}"></option>`)}</datalist>
      ${events.length < EVENTS_MAX ? html`
        <div class="chips">${EVENT_PRESETS.map((p, i) => html`<button type="button" class="chip" data-ev-add="${i}">＋ ${p.name}</button>`)}
          <button type="button" class="chip" data-ev-add="custom">＋ Sự kiện khác</button></div>` : html`<p class="small muted" style="margin:0">Tối đa ${EVENTS_MAX} sự kiện.</p>`}`);
  };

  box.addEventListener('input', (e) => {
    const card = e.target.closest('[data-ev]');
    const field = e.target.dataset.evField;
    if (!card || !field) return;
    const ev = events[Number(card.dataset.ev)];
    ev[field] = field === 'at' ? (e.target.value ? new Date(e.target.value).toISOString() : null) : e.target.value;
    if (field === 'name') card.querySelector('.event-edit-head strong').textContent = ev.name || 'Sự kiện mới';
    onChange();
  });
  box.addEventListener('change', (e) => {
    const card = e.target.closest('[data-ev]');
    if (!card) return;
    const ev = events[Number(card.dataset.ev)];
    if (e.target.dataset.evField === 'kind') { draw(); onChange(); }
    if (e.target.hasAttribute('data-ev-main')) {
      events.forEach((x) => { x.main = x === ev; });
      draw();
      onChange();
    }
  });
  box.addEventListener('click', (e) => {
    const add = e.target.closest('[data-ev-add]');
    if (add) {
      events.push(newEvent(add.dataset.evAdd === 'custom' ? {} : EVENT_PRESETS[Number(add.dataset.evAdd)]));
      draw();
      onChange();
      box.querySelector(`[data-ev="${events.length - 1}"] [data-ev-field="${add.dataset.evAdd === 'custom' ? 'name' : 'at'}"]`)?.focus();
      return;
    }
    const remove = e.target.closest('[data-ev-remove]');
    if (remove) {
      events.splice(Number(remove.closest('[data-ev]').dataset.ev), 1);
      draw();
      onChange();
    }
  });
  draw();
  return { refresh: draw };
}

// ---------- CÂU HỎI XÁC NHẬN THAM DỰ ----------
export function mountQuestionsEditor(box, questions, getEvents, onChange) {
  const draw = () => {
    const events = getEvents().filter((e) => e.name);
    render(box, html`
      <div class="stack" style="gap:10px">${questions.map((q, i) => html`
        <div class="event-edit" data-q="${i}">
          <div class="form-grid">
            <label class="field full"><span>Câu hỏi</span>
              <input class="input" data-q-field="text" maxlength="120" value="${q.text}" placeholder="VD: Bạn có ăn chay không?"></label>
            <label class="field"><span>Kiểu trả lời</span>
              <select class="input" data-q-field="type">
                <option value="choice" ${q.type === 'choice' ? 'selected' : ''}>Chọn 1 đáp án</option>
                <option value="text" ${q.type === 'text' ? 'selected' : ''}>Khách tự viết</option>
              </select></label>
            <label class="field"><span>Hỏi khi khách dự</span>
              <select class="input" data-q-field="event_id">
                <option value="">Mọi sự kiện</option>
                ${events.map((e) => html`<option value="${e.id}" ${q.event_id === e.id ? 'selected' : ''}>${e.name}</option>`)}
              </select></label>
            ${q.type === 'choice' ? html`
              <label class="field full"><span>Các đáp án (mỗi dòng 1 đáp án)</span>
                <textarea class="input" data-q-field="options" rows="3" maxlength="400" placeholder="Có&#10;Không">${q.options.join('\n')}</textarea></label>` : ''}
          </div>
          <div class="row" style="justify-content:space-between">
            <label class="same-photo"><input type="checkbox" data-q-field="required" ${q.required ? 'checked' : ''}> Bắt buộc trả lời</label>
            <button type="button" class="btn btn-link btn-sm text-red" data-q-remove>Xóa câu hỏi</button>
          </div>
        </div>`)}
      </div>
      ${questions.length < QUESTIONS_MAX ? html`
        <div class="chips">${QUESTION_PRESETS.map((p, i) => html`<button type="button" class="chip" data-q-add="${i}">＋ ${p.text}</button>`)}
          <button type="button" class="chip" data-q-add="custom">＋ Câu hỏi khác</button></div>` : html`<p class="small muted" style="margin:0">Tối đa ${QUESTIONS_MAX} câu hỏi.</p>`}`);
  };

  const update = (e) => {
    const card = e.target.closest('[data-q]');
    const field = e.target.dataset.qField;
    if (!card || !field) return false;
    const q = questions[Number(card.dataset.q)];
    if (field === 'required') q.required = e.target.checked;
    else if (field === 'options') q.options = e.target.value.split('\n').map((o) => o.trim()).filter(Boolean).slice(0, 8);
    else q[field] = e.target.value;
    return field;
  };
  box.addEventListener('input', (e) => { if (update(e)) onChange(); });
  box.addEventListener('change', (e) => {
    if (update(e) === 'type') {
      const q = questions[Number(e.target.closest('[data-q]').dataset.q)];
      if (q.type === 'choice' && q.options.length < 2) q.options = ['Có', 'Không'];
      draw();
    }
    onChange();
  });
  box.addEventListener('click', (e) => {
    const add = e.target.closest('[data-q-add]');
    if (add) {
      questions.push(newQuestion(add.dataset.qAdd === 'custom' ? {} : QUESTION_PRESETS[Number(add.dataset.qAdd)]));
      draw();
      onChange();
      if (add.dataset.qAdd === 'custom') box.querySelector(`[data-q="${questions.length - 1}"] [data-q-field="text"]`)?.focus();
      return;
    }
    const remove = e.target.closest('[data-q-remove]');
    if (remove) {
      questions.splice(Number(remove.closest('[data-q]').dataset.q), 1);
      draw();
      onChange();
    }
  });
  draw();
  return { refresh: draw };
}

/** Dọn dữ liệu trước khi lưu + kiểm tra; trả về { events, questions } hoặc ném lỗi tiếng Việt */
export function cleanLists(events, questions) {
  const cleanEvents = events
    .map((e) => ({ id: e.id, name: e.name.trim(), kind: e.kind === 'le' ? 'le' : 'tiec', at: e.at || null,
      place: e.place.trim(), address: e.address.trim(), ...(e.kind === 'tiec' && e.main ? { main: true } : {}) }))
    .filter((e) => e.name || e.place || e.at);
  for (const e of cleanEvents) {
    if (!e.name) throw new Error('Mỗi sự kiện cần có tên (VD: Tiệc nhà gái)');
    if (!e.at) throw new Error(`Sự kiện “${e.name}” chưa có thời gian`);
  }
  const ids = new Set(cleanEvents.map((e) => e.id));
  const cleanQuestions = questions
    .map((q) => ({ id: q.id, text: q.text.trim(), type: q.type === 'choice' ? 'choice' : 'text',
      ...(q.type === 'choice' ? { options: [...new Set(q.options)] } : {}),
      required: Boolean(q.required), ...(q.event_id && ids.has(q.event_id) ? { event_id: q.event_id } : {}) }))
    .filter((q) => q.text);
  for (const q of cleanQuestions) {
    if (q.type === 'choice' && q.options.length < 2) throw new Error(`Câu hỏi “${q.text}” cần ít nhất 2 đáp án`);
  }
  return { events: cleanEvents, questions: cleanQuestions };
}
