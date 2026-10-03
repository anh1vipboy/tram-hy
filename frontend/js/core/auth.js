// Đăng nhập, hồ sơ người dùng và kiểm tra quyền truy cập trang
import { sb, unwrap } from './supabase.js';

let profilePromise = null;

export async function getUser() {
  const { data } = await sb.auth.getSession();
  return data.session?.user ?? null;
}

// Hồ sơ người đang đăng nhập (kèm email), hoặc null nếu chưa đăng nhập. Chỉ tải 1 lần mỗi trang.
export function getProfile() {
  profilePromise ??= (async () => {
    const user = await getUser();
    if (!user) return null;
    const profile = unwrap(await sb.from('profiles').select('*').eq('id', user.id).single());
    return { ...profile, email: user.email };
  })();
  return profilePromise;
}

// Gọi sau khi đăng nhập/đăng ký để getProfile() đọc lại hồ sơ mới
export function clearProfileCache() {
  profilePromise = null;
}

export function loginUrl(next = currentPath()) {
  return `login.html?next=${encodeURIComponent(next)}`;
}

function currentPath() {
  return location.pathname.split('/').pop() + location.search;
}

// Chặn trang cần đăng nhập / cần vai trò. Khi chuyển hướng, trả về Promise không bao giờ xong
// để code phía sau của trang không chạy tiếp.
export async function requireAuth(roles) {
  const profile = await getProfile();
  if (!profile) {
    location.href = loginUrl();
    return new Promise(() => {});
  }
  if (roles && !roles.includes(profile.role)) {
    location.href = 'index.html';
    return new Promise(() => {});
  }
  return profile;
}

export async function signIn(email, password) {
  unwrap(await sb.auth.signInWithPassword({ email, password }));
}

// role: 'bride' hoặc 'vendor' (database không cho tự đăng ký làm admin)
export async function signUp({ email, password, fullName, phone, role }) {
  const data = unwrap(await sb.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, phone, role },
      // Link xác nhận trong email quay về đúng web nơi người dùng đăng ký (localhost hoặc tên miền thật)
      emailRedirectTo: new URL('login.html', location.href).href,
    },
  }));
  return { needsEmailConfirm: !data.session };
}

export async function signOut() {
  await sb.auth.signOut();
  location.href = 'index.html';
}

export function homeForRole(role) {
  if (role === 'vendor') return 'vendor-dashboard.html';
  if (role === 'admin') return 'admin.html';
  return 'index.html';
}
