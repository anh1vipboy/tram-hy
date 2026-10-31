// Service đo lường và theo dõi thời gian sử dụng thực tế của người dùng (Session & Time Tracker)
import { sb } from '../core/supabase.js';

const SESSION_KEY = 'tramhy_active_session_v1';
let heartbeatTimer = null;

function detectDevice() {
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return 'Mobile Safari (iOS)';
  if (/Android/.test(ua)) return 'Mobile Chrome (Android)';
  if (/Macintosh/.test(ua)) return 'Desktop Safari (macOS)';
  return 'Desktop Chrome (Windows)';
}

function detectFeature(pageName) {
  if (['tryon', 'bespoke'].includes(pageName)) return 'Phòng Thử Váy AI & Thiết Kế';
  if (['planner'].includes(pageName)) return 'Kế Hoạch & Ngân Sách Cưới';
  if (['marketplace', 'vendor'].includes(pageName)) return 'Sàn Dịch Vụ Cưới (Marketplace)';
  if (['invitation'].includes(pageName)) return 'Thiệp Cưới Số & Mừng Cưới QR';
  return 'Trang Chủ & Khám Phá';
}

/**
 * Khởi động bộ đếm thời gian sử dụng khi người dùng đăng nhập
 * Tự động ghi nhận thời gian bắt đầu, thời gian kết thúc, trang ghé thăm và thiết bị
 */
export function startUserSessionTracking(profile, activePage) {
  if (!profile?.id || activePage === 'login') return;

  try {
    let sessionData = null;
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      sessionData = JSON.parse(raw);
    }

    const now = Date.now();
    const currentPath = location.pathname.split('/').pop() || 'index.html';

    if (!sessionData || sessionData.userId !== profile.id) {
      sessionData = {
        sessionId: crypto.randomUUID ? crypto.randomUUID() : `sess_${now}_${Math.random().toString(36).slice(2, 7)}`,
        userId: profile.id,
        email: profile.email || `${profile.id.slice(0, 8)}@tramhy.vn`,
        fullName: profile.full_name || 'Người dùng Trạm Hỷ',
        startTime: now,
        lastActive: now,
        pages: [currentPath],
        device: detectDevice(),
        primaryFeature: detectFeature(activePage),
      };
    } else {
      if (!sessionData.pages.includes(currentPath)) {
        sessionData.pages.push(currentPath);
      }
      sessionData.lastActive = now;
      sessionData.primaryFeature = detectFeature(activePage);
    }

    sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));

    // Đồng bộ lên Supabase mỗi 45s hoặc khi đóng trang
    const syncSessionToDb = async () => {
      try {
        const durationSec = Math.max(15, Math.round((Date.now() - sessionData.startTime) / 1000));
        await sb.from('user_sessions').upsert({
          id: sessionData.sessionId,
          user_id: sessionData.userId,
          email: sessionData.email,
          full_name: sessionData.fullName,
          session_start: new Date(sessionData.startTime).toISOString(),
          session_end: new Date().toISOString(),
          duration_seconds: durationSec,
          device: sessionData.device,
          pages_visited: sessionData.pages,
          primary_feature: sessionData.primaryFeature,
          actions_count: sessionData.pages.length * 3,
        }, { onConflict: 'id' });
      } catch {
        // Im lặng nếu mạng yếu hoặc bảng chưa chạy migration
      }
    };

    // Đồng bộ lần đầu khi tải trang
    syncSessionToDb();

    // Định kỳ gửi nhịp tim ghi nhận thời gian
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(syncSessionToDb, 45000);

    // Đồng bộ khi người dùng chuyển tab hoặc đóng trình duyệt
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') syncSessionToDb();
    });
    window.addEventListener('pagehide', syncSessionToDb);

  } catch {
    // Không làm ảnh hưởng đến trải nghiệm của người dùng
  }
}
