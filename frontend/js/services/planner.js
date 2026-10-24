// Kế hoạch cưới (SQL 20): ngân sách theo nghi lễ + checklist. Chỉ chủ kế hoạch đọc / sửa (RLS).
import { sb, unwrap } from '../core/supabase.js';
import { BUDGET_TEMPLATES, CHECKLIST_TEMPLATE } from '../data/planner-templates.js';

const round100k = (n) => Math.round(n / 100_000) * 100_000;

/**
 * Cách chia 6 hạng mục của AI ở trang chủ ({ category, amount }) → số "Dự kiến" cho từng mục kế hoạch.
 * Danh mục có loại tiệm (venue, studio…) nhận tiền của hạng mục đó; danh mục không có loại tiệm (lễ hỏi, nhẫn, thiệp…)
 * chia nhau hạng mục "other". Trong một nhóm, tiền chia theo tỷ trọng hiện có (weight) – mục cuối nhận phần lẻ.
 * rows: [{ key, group, weight }] → Map key → số tiền
 */
export function spreadAllocations(rows, allocations) {
  const result = new Map();
  for (const { category, amount } of allocations) {
    const group = rows.filter((r) => (r.group || 'other') === category);
    if (!group.length) continue;
    const weights = group.map((r) => Math.max(0, Number(r.weight) || 0));
    const sum = weights.reduce((a, b) => a + b, 0);
    let given = 0;
    group.forEach((r, i) => {
      const value = i === group.length - 1
        ? Math.max(0, amount - given)
        : round100k(amount * (sum ? weights[i] / sum : 1 / group.length));
      given += value;
      result.set(r.key, value);
    });
  }
  return result;
}

export async function getPlan(userId) {
  return unwrap(await sb.from('wedding_plans').select('*').eq('owner_id', userId).maybeSingle());
}

/** Tạo kế hoạch từ mẫu Bắc / Nam. Có tổng ngân sách → điền sẵn "Dự kiến" theo tỷ lệ mẫu. */
export async function createPlan(userId, { weddingDate, region, totalBudget, guests, city, allocations }) {
  const plan = unwrap(await sb.from('wedding_plans').insert({
    owner_id: userId, wedding_date: weddingDate || null, region, total_budget: totalBudget || 0, guests: guests || null, city: city || null,
  }).select().single());

  const template = BUDGET_TEMPLATES[region];
  const categories = unwrap(await sb.from('budget_categories').insert(template.map((c, i) => ({
    plan_id: plan.id, name: c.name, vendor_category: c.vendor, position: i,
  }))).select('id, position'));
  const byPosition = Object.fromEntries(categories.map((c) => [c.position, c.id]));

  // Có cách chia từ AI trang chủ → dùng số của AI; không thì chia theo tỷ lệ mẫu
  const fromAi = allocations?.length ? spreadAllocations(template.flatMap((c, ci) => c.items.map(([, share], ii) => ({
    key: `${ci}-${ii}`, group: c.vendor, weight: share,
  }))), allocations) : null;
  const items = template.flatMap((c, ci) => c.items.map(([name, share], ii) => ({
    plan_id: plan.id, category_id: byPosition[ci], name, position: ii,
    estimated: fromAi?.get(`${ci}-${ii}`) ?? (totalBudget ? round100k((totalBudget * share) / 100) : 0),
  })));
  unwrap(await sb.from('budget_items').insert(items));

  unwrap(await sb.from('checklist_items').insert(CHECKLIST_TEMPLATE.map((t, i) => ({
    plan_id: plan.id, title: typeof t.title === 'string' ? t.title : t.title[region],
    days_before: t.days, link_category: t.vendor ?? null, position: i,
  }))));
  return plan;
}

export async function updatePlan(planId, patch) {
  return unwrap(await sb.from('wedding_plans').update(patch).eq('id', planId).select().single());
}

export async function deletePlan(planId) {
  unwrap(await sb.from('wedding_plans').delete().eq('id', planId));
}

// ---------- NGÂN SÁCH ----------
export async function listBudget(planId) {
  const categories = unwrap(await sb.from('budget_categories')
    .select('id, name, vendor_category, position, items:budget_items(id, name, estimated, actual, paid, position, category_id)')
    .eq('plan_id', planId).order('position'));
  for (const c of categories) c.items.sort((a, b) => a.position - b.position);
  return categories;
}

export async function addCategory(planId, name, position) {
  return unwrap(await sb.from('budget_categories').insert({ plan_id: planId, name, position }).select().single());
}
export async function updateCategory(id, patch) {
  unwrap(await sb.from('budget_categories').update(patch).eq('id', id));
}
export async function deleteCategory(id) {
  unwrap(await sb.from('budget_categories').delete().eq('id', id));
}

export async function addItem(planId, categoryId, name, position) {
  return unwrap(await sb.from('budget_items').insert({ plan_id: planId, category_id: categoryId, name, position }).select().single());
}
export async function updateItem(id, patch) {
  unwrap(await sb.from('budget_items').update(patch).eq('id', id));
}
/** Áp dụng nhiều số "Dự kiến" mới cùng lúc (đề xuất của trợ lý AI): [{ id, to }] */
export async function applyEstimates(changes) {
  const results = await Promise.all(changes.map(({ id, to }) => sb.from('budget_items').update({ estimated: to }).eq('id', id)));
  const failed = results.find((r) => r.error);
  if (failed) unwrap(failed);
}

export async function deleteItem(id) {
  unwrap(await sb.from('budget_items').delete().eq('id', id));
}

/** Lưu thứ tự mới (kéo thả): rows = [{ id, position, category_id? }] */
export async function savePositions(table, rows) {
  await Promise.all(rows.map(({ id, ...patch }) => sb.from(table).update(patch).eq('id', id).then(unwrap)));
}

// ---------- CHECKLIST ----------
export async function listChecklist(planId) {
  return unwrap(await sb.from('checklist_items').select('*').eq('plan_id', planId)
    .order('days_before', { ascending: false }).order('position'));
}
export async function addTask(planId, title, daysBefore) {
  return unwrap(await sb.from('checklist_items').insert({ plan_id: planId, title, days_before: daysBefore }).select().single());
}
export async function updateTask(id, patch) {
  unwrap(await sb.from('checklist_items').update(patch).eq('id', id));
}
export async function deleteTask(id) {
  unwrap(await sb.from('checklist_items').delete().eq('id', id));
}

// ---------- CHIA SẺ CHỈ XEM (SQL 33) ----------
// Token nằm trong bảng không ai đọc trực tiếp được – mọi việc qua hàm ở server.
// Database chưa chạy SQL 33 (chưa có hàm → PGRST202) → báo câu dễ hiểu thay vì lỗi kỹ thuật.
async function shareRpc(name, args) {
  const { data, error } = await sb.rpc(name, args);
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') {
      throw Object.assign(new Error('Tính năng chia sẻ kế hoạch đang được cập nhật – bạn thử lại sau ít phút nhé'), { code: 'SHARE_UNAVAILABLE' });
    }
    throw new Error(error.message);
  }
  return data;
}

/** Trạng thái chia sẻ của chủ kế hoạch: { enabled, token, created_at } */
export const getPlanShare = () => shareRpc('my_plan_share');
/** Bật / tắt link xem. Tắt rồi bật lại dùng lại link cũ. */
export const setPlanShare = (enabled) => shareRpc('set_plan_share', { p_enabled: enabled });
/** Tạo link mới – link cũ hết hiệu lực ngay */
export const rotatePlanShare = () => shareRpc('rotate_plan_share');
/** Người xem mở link: { status: 'ok' | 'not_found' | 'disabled', plan, couple, categories, checklist, bookings } */
export const getSharedPlan = (token) => shareRpc('get_shared_plan', { p_token: token });
export const shareUrl = (token, opts = {}) => {
  const url = new URL(`ke-hoach.html?xem=${encodeURIComponent(token)}`, location.href);
  if (opts.hideMoney) url.searchParams.set('an_tien', '1');
  if (opts.party && opts.party !== 'all') url.searchParams.set('ben', opts.party);
  return url.href;
};

// ---------- PHÂN BỔ BÊN PHỤ TRÁCH (CHUNG / NHÀ TRAI / NHÀ GÁI) ----------
export const PARTY_META = {
  both:  { key: 'both',  label: 'Hai vợ chồng', short: 'Chung',    badge: '💑 Chung',    next: 'groom' },
  groom: { key: 'groom', label: 'Nhà Trai',     short: 'Nhà Trai', badge: '🤵 Nhà Trai', next: 'bride' },
  bride: { key: 'bride', label: 'Nhà Gái',      short: 'Nhà Gái',  badge: '👰 Nhà Gái',  next: 'both'  },
};

const PARTY_PREFIX = { groom: '[NT] ', bride: '[NG] ', both: '[CH] ' };

export function parseCategoryParty(rawName = '') {
  const str = String(rawName || '').trim();
  if (str.startsWith('[NT] ')) return { name: str.slice(5).trim(), party: 'groom', ...PARTY_META.groom };
  if (str.startsWith('[NG] ')) return { name: str.slice(5).trim(), party: 'bride', ...PARTY_META.bride };
  if (str.startsWith('[CH] ')) return { name: str.slice(5).trim(), party: 'both',  ...PARTY_META.both };
  if (/nhà trai|sính lễ|dạm ngõ|ăn hỏi|tráp|rước dâu|xe hoa/i.test(str)) {
    return { name: str, party: 'groom', ...PARTY_META.groom };
  }
  if (/nhà gái|lại mặt|vu quy|báo hỷ nhà gái/i.test(str)) {
    return { name: str, party: 'bride', ...PARTY_META.bride };
  }
  return { name: str, party: 'both', ...PARTY_META.both };
}

export function formatCategoryParty(cleanName, party = 'both') {
  const clean = parseCategoryParty(cleanName).name;
  return `${PARTY_PREFIX[party] ?? ''}${clean}`;
}

/**
 * Ghim 1 mẫu váy / gói dịch vụ / đối tác từ trang Dịch vụ cưới thẳng vào bảng Ngân sách dự kiến của Kế hoạch cưới.
 * Trả về { plan, category, item, createdPlan }.
 */
export async function addServiceToPlanBudget(userId, { vendorCategory, categoryTitle, itemName, price }) {
  let plan = await getPlan(userId);
  let createdPlan = false;
  if (!plan) {
    plan = await createPlan(userId, {
      weddingDate: null,
      region: 'north',
      totalBudget: 300_000_000,
      guests: 200,
      city: 'Hà Nội',
    });
    createdPlan = true;
  }
  const categories = await listBudget(plan.id);
  let targetCat = categories.find((c) => c.vendor_category === vendorCategory);
  if (!targetCat) {
    const pos = categories.length;
    targetCat = unwrap(await sb.from('budget_categories').insert({
      plan_id: plan.id,
      name: categoryTitle || 'Dịch vụ cưới',
      vendor_category: vendorCategory || null,
      position: pos,
    }).select().single());
    targetCat.items = [];
  }
  const existing = (targetCat.items || []).find((i) => i.name.toLowerCase() === itemName.toLowerCase());
  if (existing) {
    await updateItem(existing.id, { estimated: Math.round(Number(price) || 0) });
    return { plan, category: targetCat, item: { ...existing, estimated: Math.round(Number(price) || 0) }, updated: true, createdPlan };
  }
  const pos = (targetCat.items || []).length;
  const item = unwrap(await sb.from('budget_items').insert({
    plan_id: plan.id,
    category_id: targetCat.id,
    name: itemName.slice(0, 120),
    estimated: Math.round(Number(price) || 0),
    position: pos,
  }).select().single());
  return { plan, category: targetCat, item, updated: false, createdPlan };
}

// ---------- Cách chia AI ở trang chủ → mang sang trang Kế hoạch (qua cả bước đăng nhập) ----------
const DRAFT_KEY = 'tramhy:plan-from-ai';

export function savePlanDraft(draft) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, savedAt: Date.now() })); } catch { /* trình duyệt chặn lưu */ }
}

/** Đọc bản nháp (hết hạn sau 1 ngày); remove = true thì xóa luôn */
export function readPlanDraft({ remove = false } = {}) {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (remove) localStorage.removeItem(DRAFT_KEY);
    return draft && Date.now() - draft.savedAt < 86_400_000 && Array.isArray(draft.allocations) ? draft : null;
  } catch {
    return null;
  }
}
