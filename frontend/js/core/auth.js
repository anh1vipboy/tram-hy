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
      // Link xác nhận trong email quay về đúng web nơi người dùng đăng ký (localhost hoặc tên miền thật).
      // Địa chỉ này phải nằm trong Authentication → URL Configuration → Redirect URLs của Supabase.
      emailRedirectTo: new URL('login.html?confirmed=1', location.href).href,
    },
  }));
  return { needsEmailConfirm: !data.session };
}

// Đăng nhập bằng Google: chuyển sang trang Google, xong quay về login.html (giữ ?next= để về đúng trang đang dở).
// Tài khoản Google mới tự được tạo với vai trò cô dâu; họ tên lấy từ Google.
export async function signInWithGoogle(next) {
  const back = new URL('login.html', location.href);
  if (next) back.searchParams.set('next', next);
  unwrap(await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: back.href } }));
}

// Lỗi Supabase Auth (tiếng Anh) → câu tiếng Việt. Khớp theo đầu câu vì một số lỗi có số giây thay đổi.
const AUTH_ERRORS = [
  ['Invalid login credentials', 'Sai email hoặc mật khẩu'],
  ['Email not confirmed', 'Email chưa được xác nhận – hãy bấm link trong email Trạm Hỷ gửi bạn'],
  ['User already registered', 'Email này đã có tài khoản – hãy đăng nhập'],
  ['email rate limit exceeded', 'Hệ thống đang gửi quá nhiều email, vui lòng thử lại sau ít phút'],
  ['For security purposes, you can only request this after', 'Vui lòng đợi khoảng 1 phút rồi thử gửi lại'],
  ['New password should be different', 'Mật khẩu mới phải khác mật khẩu cũ'],
  ['Password should be at least', 'Mật khẩu phải có ít nhất 6 ký tự'],
  ['Auth session missing', 'Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn – hãy gửi lại link mới'],
  ['Unsupported provider', 'Đăng nhập bằng Google chưa được bật – vui lòng dùng email và mật khẩu'],
];

export function friendlyAuthError(error) {
  const match = AUTH_ERRORS.find(([english]) => error?.message?.startsWith(english));
  return new Error(match ? match[1] : error?.message || String(error));
}

// Quên mật khẩu: Supabase gửi email có link về trang reset-password.html (phải nằm trong Redirect URLs).
// Supabase không báo email có tồn tại hay không – tránh lộ danh sách tài khoản.
export async function requestPasswordReset(email) {
  unwrap(await sb.auth.resetPasswordForEmail(email, {
    redirectTo: new URL('reset-password.html', location.href).href,
  }));
}

// Đặt mật khẩu mới – chỉ dùng được khi đang có phiên (vào từ link đặt lại mật khẩu hoặc đã đăng nhập)
export async function updatePassword(password) {
  unwrap(await sb.auth.updateUser({ password }));
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
