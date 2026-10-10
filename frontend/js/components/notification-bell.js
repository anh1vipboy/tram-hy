// Chuông thông báo ở header (máy tính: thả xuống · điện thoại: tấm trượt từ dưới lên).
// Số chưa đọc trên chuông + trên tiêu đề tab "(3) …", thông báo mới thì chuông rung + hiện toast, bấm để đi đúng chỗ.
import { html, render } from '../core/utils.js';
import { toast } from '../core/ui.js';
import {
  listNotifications, countUnread, markRead, markAllRead, subscribeNotifications,
} from '../services/notifications.js';

const baseTitle = document.title.replace(/^\(\d+\+?\)\s*/, '');

/** "vừa xong", "5 phút trước", "hôm qua", "12/10" */
function timeAgo(iso) {
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  if (seconds < 60) return 'vừa xong';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} phút trước`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} giờ trước`;
  if (seconds < 172800) return 'hôm qua';
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} ngày trước`;
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

/**
 * button: nút chuông trong header · onOpen: đóng các menu khác khi chuông mở
 * Trả về { close() } để layout đóng chuông khi mở menu tài khoản.
 */
export function mountNotificationBell(button, profile, { onOpen } = {}) {
  let items = [];
  let unread = 0;
  let loaded = false;
  let available = true;            // chưa chạy SQL 18 → ẩn chuông, không báo lỗi

  const panel = document.createElement('div');
  panel.className = 'notif-panel';
  panel.id = 'notif-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Thông báo');
  panel.hidden = true;
  document.body.append(panel);
  button.setAttribute('aria-controls', 'notif-panel');

  function updateBadge() {
    const badge = button.querySelector('.notif-badge');
    badge.textContent = unread > 99 ? '99+' : String(unread);
    badge.hidden = unread === 0;
    button.setAttribute('aria-label', unread ? `Thông báo – ${unread} chưa đọc` : 'Thông báo');
    document.title = unread ? `(${unread > 99 ? '99+' : unread}) ${baseTitle}` : baseTitle;
  }

  function draw() {
    render(panel, html`
      <div class="notif-head">
        <strong>Thông báo</strong>
        <span class="spacer"></span>
        ${unread ? html`<button type="button" class="btn btn-link btn-sm" data-read-all>Đánh dấu đã đọc tất cả</button>` : ''}
        <button type="button" class="notif-close" data-close aria-label="Đóng">✕</button>
      </div>
      <div class="notif-list">
        ${!loaded ? html`${[0, 1, 2].map(() => html`<div class="notif-skeleton"><span></span><div><i></i><i></i></div></div>`)}`
          : !items.length ? html`
            <div class="notif-empty">
              <div class="notif-empty-icon" aria-hidden="true">🔔</div>
              <strong>Chưa có thông báo nào</strong>
              <span class="small muted">${emptyHint(profile.role)}</span>
            </div>`
          : items.map((n) => html`
            <a class="notif-item ${n.read_at ? '' : 'unread'}" href="${n.link || '#'}" data-id="${n.id}">
              <span class="notif-icon" aria-hidden="true">${n.icon}</span>
              <span class="notif-text">
                <strong>${n.title}</strong>
                ${n.body ? html`<span class="notif-body">${n.body}</span>` : ''}
                <span class="notif-time">${timeAgo(n.created_at)}</span>
              </span>
              ${n.read_at ? '' : html`<span class="notif-dot" aria-label="Chưa đọc"></span>`}
            </a>`)}
      </div>`);

    panel.querySelector('[data-close]').addEventListener('click', () => setOpen(false));
    panel.querySelector('[data-read-all]')?.addEventListener('click', async () => {
      const now = new Date().toISOString();
      items = items.map((n) => ({ ...n, read_at: n.read_at ?? now }));
      unread = 0;
      updateBadge();
      draw();
      await markAllRead().catch(() => {});
    });
    panel.querySelectorAll('[data-id]').forEach((a) => a.addEventListener('click', async (e) => {
      e.preventDefault();
      const n = items.find((x) => x.id === a.dataset.id);
      if (!n.read_at) {
        n.read_at = new Date().toISOString();
        unread = Math.max(0, unread - 1);
        updateBadge();
        a.classList.remove('unread');
        // Đánh dấu đã đọc xong rồi mới chuyển trang (rời trang ngay thì yêu cầu bị hủy) – chờ tối đa 0,8 giây
        await Promise.race([markRead(n.id).catch(() => {}), new Promise((r) => setTimeout(r, 800))]);
      }
      if (n.link) location.href = n.link;
    }));
  }

  async function load() {
    try {
      [items, unread] = await Promise.all([listNotifications(), countUnread()]);
      loaded = true;
    } catch {
      available = false;
      button.hidden = true;
      return;
    }
    updateBadge();
    if (!panel.hidden) draw();
  }

  function setOpen(open) {
    if (open) onOpen?.();
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('notif-open', open);
    if (open) {
      draw();
      if (!loaded) load();
      panel.querySelector('.notif-list')?.scrollTo({ top: 0 });
    }
  }

  button.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(panel.hidden);
  });
  document.addEventListener('click', (e) => {
    if (!panel.hidden && !panel.contains(e.target) && !button.contains(e.target)) setOpen(false);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) setOpen(false); });

  // Thông báo mới (realtime): thêm lên đầu, tăng số, rung chuông, hiện toast
  subscribeNotifications(profile.id, (n) => {
    if (!available || items.some((x) => x.id === n.id)) return;
    items = [n, ...items].slice(0, 50);
    unread += 1;
    updateBadge();
    if (!panel.hidden) draw();
    button.classList.remove('ring');
    void button.offsetWidth;               // chạy lại hiệu ứng rung
    button.classList.add('ring');
    toast(`${n.icon} ${n.title}`, 'info');
  });

  // Quay lại tab sau một lúc: làm mới (phòng lỡ sự kiện khi máy ngủ / mất mạng)
  document.addEventListener('visibilitychange', () => { if (!document.hidden && available) load(); });

  load();
  return { close: () => setOpen(false) };
}

function emptyHint(role) {
  if (role === 'admin') return 'Hồ sơ mở tiệm mới và khiếu nại sẽ hiện ở đây.';
  if (role === 'vendor') return 'Đơn mới, tiền cọc, giải ngân và đánh giá sẽ hiện ở đây.';
  return 'Cập nhật về đơn đặt lịch, nghiệm thu và phản hồi thiệp cưới sẽ hiện ở đây.';
}
