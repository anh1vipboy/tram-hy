// Dịch vụ quản lý Giỏ hàng cưới (đồng bộ giữa bộ nhớ phiên & bảng public.cart_items trên Supabase)
import { sb } from '../core/supabase.js';
import { getUser } from '../core/auth.js';

const STORAGE_KEY = 'tramhy_active_cart_v1';
let memoryItems = null;
let dbAvailable = true;

function readSessionCart() {
  if (memoryItems) return memoryItems;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    memoryItems = Array.isArray(parsed) ? parsed.map(normalizeCartItem).filter((x) => x.key && x.vendorId) : [];
  } catch {
    memoryItems = [];
  }
  return memoryItems;
}

function writeSessionCart(items) {
  memoryItems = items.map(normalizeCartItem).filter((x) => x.key && x.vendorId);
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(memoryItems));
  } catch {
    // Trình duyệt chặn sessionStorage
  }
  return memoryItems;
}

function emitCartChange(items) {
  window.dispatchEvent(new CustomEvent('tramhy:cart-change', { detail: { items } }));
}

function emitCartAdded(item, items) {
  window.dispatchEvent(new CustomEvent('tramhy:cart-added', { detail: { item, items } }));
}

/** Chuẩn hóa phần tử giỏ hàng từ nguồn bất kỳ (UI hoặc dòng DB cart_items) */
export function normalizeCartItem(raw = {}) {
  const snap = raw.snapshot && typeof raw.snapshot === 'object' ? raw.snapshot : {};
  const itemType = raw.itemType || raw.item_type || snap.itemType || (raw.dressId || raw.dress_id ? 'dress' : raw.packageId || raw.package_id ? 'package' : 'vendor');
  const dressId = raw.dressId ?? raw.dress_id ?? snap.dressId ?? null;
  const packageId = raw.packageId ?? raw.package_id ?? snap.packageId ?? null;
  const vendorId = raw.vendorId ?? raw.vendor_id ?? snap.vendorId ?? '';
  const id = raw.id || dressId || packageId || vendorId;
  const key = raw.key || raw.item_key || (
    itemType === 'dress' && dressId ? `dress:${dressId}` :
    itemType === 'package' && packageId ? `pkg:${packageId}` :
    `vendor:${vendorId}`
  );
  const isVenue = Boolean(raw.isVenue ?? snap.isVenue ?? (raw.vendorCategory || snap.vendorCategory) === 'venue');
  const minQty = Number(raw.minQty ?? snap.minQty) || 5;
  const maxQty = Number(raw.maxQty ?? snap.maxQty) || 300;
  const defaultQty = isVenue ? Math.min(maxQty, Math.max(minQty, 30)) : 1;
  const rawQty = Number(raw.quantity ?? snap.quantity);
  const quantity = isVenue
    ? Math.min(maxQty, Math.max(minQty, Number.isFinite(rawQty) && rawQty > 0 ? Math.round(rawQty) : defaultQty))
    : 1;

  return {
    key,
    id,
    itemType,
    vendorId,
    vendorName: raw.vendorName ?? snap.vendorName ?? 'Đối tác Trạm Hỷ',
    vendorSlug: raw.vendorSlug ?? snap.vendorSlug ?? '',
    vendorCategory: raw.vendorCategory ?? snap.vendorCategory ?? 'bridal',
    dressId: dressId || null,
    packageId: packageId || null,
    title: raw.title ?? snap.title ?? 'Dịch vụ cưới',
    price: Number(raw.price ?? snap.price) || 0,
    originalPrice: Number(raw.originalPrice ?? snap.originalPrice) || 0,
    imageUrl: raw.imageUrl ?? snap.imageUrl ?? '',
    dressSlug: raw.dressSlug ?? snap.dressSlug ?? '',
    dressType: raw.dressType ?? snap.dressType ?? null,
    isVenue,
    minQty,
    maxQty,
    quantity,
    createdAt: raw.createdAt ?? raw.created_at ?? snap.createdAt ?? new Date().toISOString(),
  };
}

function toDbPayload(userId, item) {
  return {
    user_id: userId,
    item_key: item.key,
    item_type: item.itemType,
    vendor_id: item.vendorId,
    dress_id: item.dressId || null,
    package_id: item.packageId || null,
    quantity: item.quantity || 1,
    snapshot: {
      title: item.title,
      price: item.price,
      originalPrice: item.originalPrice,
      imageUrl: item.imageUrl,
      vendorName: item.vendorName,
      vendorSlug: item.vendorSlug,
      vendorCategory: item.vendorCategory,
      dressSlug: item.dressSlug,
      dressType: item.dressType,
      isVenue: item.isVenue,
      minQty: item.minQty,
      maxQty: item.maxQty,
    },
  };
}

async function resolveUserId(explicitUserId) {
  if (explicitUserId) return explicitUserId;
  try {
    const user = await getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

export function getCartItems() {
  return [...readSessionCart()];
}

export function getCartCount() {
  return readSessionCart().length;
}

export function isInCart(key) {
  if (!key) return false;
  return readSessionCart().some((item) => item.key === key);
}

export function itemTotalPrice(item) {
  if (!item) return 0;
  return item.isVenue ? (Number(item.price) || 0) * (Number(item.quantity) || 30) : (Number(item.price) || 0);
}

/**
 * Tải giỏ hàng từ Supabase của userId và gộp thông minh với các mục đã nhặt trong phiên trước khi đăng nhập.
 * Nếu bảng cart_items chưa được tạo trên DB hoặc mất mạng → tự động fallback êm ái về bộ nhớ phiên.
 */
export async function loadCart(userId) {
  const localItems = readSessionCart();
  const uid = await resolveUserId(userId);
  if (!uid || !dbAvailable) {
    emitCartChange(localItems);
    return localItems;
  }

  try {
    const { data, error } = await sb
      .from('cart_items')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });

    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') dbAvailable = false;
      emitCartChange(localItems);
      return localItems;
    }

    const dbItems = (data || []).map(normalizeCartItem).filter((x) => x.key && x.vendorId);
    const byKey = new Map();
    for (const item of dbItems) byKey.set(item.key, item);

    const unsyncedLocal = [];
    for (const local of localItems) {
      if (!byKey.has(local.key)) {
        byKey.set(local.key, local);
        unsyncedLocal.push(local);
      }
    }

    if (unsyncedLocal.length && dbAvailable) {
      await sb.from('cart_items').upsert(
        unsyncedLocal.map((item) => toDbPayload(uid, item)),
        { onConflict: 'user_id,item_key' },
      ).catch(() => {});
    }

    const merged = writeSessionCart([...byKey.values()]);
    emitCartChange(merged);
    return merged;
  } catch {
    emitCartChange(localItems);
    return localItems;
  }
}

export async function addToCart(rawItem) {
  const item = normalizeCartItem(rawItem);
  if (!item.key || !item.vendorId) return getCartItems();

  const current = readSessionCart();
  const existingIdx = current.findIndex((x) => x.key === item.key);
  let next;
  if (existingIdx >= 0) {
    next = [...current];
    next[existingIdx] = { ...current[existingIdx], ...item };
  } else {
    next = [item, ...current];
  }

  const saved = writeSessionCart(next);
  emitCartChange(saved);
  emitCartAdded(item, saved);

  const uid = await resolveUserId();
  if (uid && dbAvailable) {
    try {
      const { error } = await sb
        .from('cart_items')
        .upsert(toDbPayload(uid, item), { onConflict: 'user_id,item_key' });
      if (error && (error.code === '42P01' || error.code === 'PGRST205')) dbAvailable = false;
    } catch {
      // Fallback êm ái về bộ nhớ phiên
    }
  }

  return saved;
}

export async function toggleCartItem(rawItem) {
  const normalized = normalizeCartItem(rawItem);
  if (isInCart(normalized.key)) {
    const items = await removeFromCart(normalized.key);
    return { added: false, items };
  }
  const items = await addToCart(normalized);
  return { added: true, items };
}

export async function updateCartItemQuantity(key, quantity) {
  const current = readSessionCart();
  const target = current.find((x) => x.key === key);
  if (!target) return current;

  const min = target.minQty || 5;
  const max = target.maxQty || 300;
  const cleanQty = target.isVenue
    ? Math.min(max, Math.max(min, Math.round(Number(quantity) || 30)))
    : 1;

  const updatedItem = { ...target, quantity: cleanQty };
  const saved = writeSessionCart(current.map((x) => (x.key === key ? updatedItem : x)));
  emitCartChange(saved);

  const uid = await resolveUserId();
  if (uid && dbAvailable) {
    try {
      await sb
        .from('cart_items')
        .update({ quantity: cleanQty, snapshot: toDbPayload(uid, updatedItem).snapshot })
        .eq('user_id', uid)
        .eq('item_key', key);
    } catch {
      // Fallback êm ái về bộ nhớ phiên
    }
  }

  return saved;
}

export async function removeFromCart(key) {
  const current = readSessionCart();
  const saved = writeSessionCart(current.filter((x) => x.key !== key));
  emitCartChange(saved);

  const uid = await resolveUserId();
  if (uid && dbAvailable) {
    try {
      await sb.from('cart_items').delete().eq('user_id', uid).eq('item_key', key);
    } catch {
      // Fallback êm ái về bộ nhớ phiên
    }
  }

  return saved;
}

export async function clearCart() {
  const saved = writeSessionCart([]);
  emitCartChange(saved);

  const uid = await resolveUserId();
  if (uid && dbAvailable) {
    try {
      await sb.from('cart_items').delete().eq('user_id', uid);
    } catch {
      // Fallback êm ái về bộ nhớ phiên
    }
  }

  return saved;
}

export function subscribeCart(callback) {
  const handler = (e) => callback(e.detail?.items ?? getCartItems());
  window.addEventListener('tramhy:cart-change', handler);
  return () => window.removeEventListener('tramhy:cart-change', handler);
}

export function openCartDrawer() {
  window.dispatchEvent(new CustomEvent('tramhy:cart-open'));
}
