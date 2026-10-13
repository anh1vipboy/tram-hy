// Kế hoạch cưới (SQL 20): ngân sách theo nghi lễ + checklist. Chỉ chủ kế hoạch đọc / sửa (RLS).
import { sb, unwrap } from '../core/supabase.js';
import { BUDGET_TEMPLATES, CHECKLIST_TEMPLATE } from '../data/planner-templates.js';

const round100k = (n) => Math.round(n / 100_000) * 100_000;

export async function getPlan(userId) {
  return unwrap(await sb.from('wedding_plans').select('*').eq('owner_id', userId).maybeSingle());
}

/** Tạo kế hoạch từ mẫu Bắc / Nam. Có tổng ngân sách → điền sẵn "Dự kiến" theo tỷ lệ mẫu. */
export async function createPlan(userId, { weddingDate, region, totalBudget, guests, city }) {
  const plan = unwrap(await sb.from('wedding_plans').insert({
    owner_id: userId, wedding_date: weddingDate || null, region, total_budget: totalBudget || 0, guests: guests || null, city: city || null,
  }).select().single());

  const template = BUDGET_TEMPLATES[region];
  const categories = unwrap(await sb.from('budget_categories').insert(template.map((c, i) => ({
    plan_id: plan.id, name: c.name, vendor_category: c.vendor, position: i,
  }))).select('id, position'));
  const byPosition = Object.fromEntries(categories.map((c) => [c.position, c.id]));

  const items = template.flatMap((c, ci) => c.items.map(([name, share], ii) => ({
    plan_id: plan.id, category_id: byPosition[ci], name, position: ii,
    estimated: totalBudget ? round100k((totalBudget * share) / 100) : 0,
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
