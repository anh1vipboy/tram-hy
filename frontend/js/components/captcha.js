// CAPTCHA chống bot bằng Cloudflare Turnstile – Supabase Auth kiểm tra token ở server.
// Ô xác minh luôn hiện (đặt ngay trên nút gửi), có trạng thái: đang tải → đã xác minh / hết hạn / lỗi.
// TURNSTILE_SITE_KEY trống → tắt (getToken trả undefined, Supabase không đòi token khi chưa bật CAPTCHA).
import { TURNSTILE_SITE_KEY } from '../config.js';
import { html, render } from '../core/utils.js';

export const captchaEnabled = Boolean(TURNSTILE_SITE_KEY);
let scriptPromise = null;

function loadTurnstile() {
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => resolve(window.turnstile);
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Không tải được bước xác minh chống bot – kiểm tra mạng (tắt VPN nếu có) rồi tải lại trang'));
    };
    document.head.append(script);
  });
  return scriptPromise;
}

const STATUS = {
  loading:  'Đang thiết lập kết nối an toàn…',
  interactive: 'Bấm vào ô phía trên để xác minh bạn là người thật',
  verified: '✓ Đã xác minh bạn là người thật',
  expired:  'Phiên xác minh đã hết hạn – đang xác minh lại…',
  error:    'Chưa xác minh được – hãy bấm vào ô phía trên hoặc tải lại trang',
};

/**
 * Gắn ô xác minh vào container (lần đầu gọi getToken/show mới vẽ – form đang ẩn thì chưa tốn tài nguyên).
 * Trả về { show(), getToken(), reset() } – mỗi token chỉ dùng được 1 lần.
 */
export function mountCaptcha(container) {
  if (!captchaEnabled) {
    container.hidden = true;
    return { show: async () => {}, getToken: async () => undefined, reset() {} };
  }

  let token = null;
  let waiting = [];
  let widgetId = null;
  let ready = null;

  render(container, html`
    <div class="captcha-widget"></div>
    <div class="captcha-status"><span class="captcha-dot" aria-hidden="true"></span>
      <span data-status>${STATUS.loading}</span></div>`);
  const setState = (state) => {
    container.dataset.state = state;
    container.querySelector('[data-status]').textContent = STATUS[state];
  };
  setState('loading');

  function show() {
    ready ??= loadTurnstile().then((turnstile) => {
      widgetId = turnstile.render(container.querySelector('.captcha-widget'), {
        sitekey: TURNSTILE_SITE_KEY,
        appearance: 'always',
        size: 'flexible',
        theme: 'light',
        language: 'vi',
        callback: (t) => {
          token = t;
          setState('verified');
          waiting.forEach((w) => w.resolve(t));
          waiting = [];
        },
        'before-interactive-callback': () => setState('interactive'),   // Cloudflare cần người dùng bấm ô
        'expired-callback': () => { token = null; setState('expired'); },
        'error-callback': () => { token = null; setState('error'); },
      });
    }).catch((error) => {
      setState('error');
      throw error;
    });
    return ready;
  }

  return {
    show,
    async getToken() {
      await show();
      if (token) return token;
      return new Promise((resolve, reject) => {
        const waiter = { resolve, reject };
        waiting.push(waiter);
        setTimeout(() => {
          waiting = waiting.filter((w) => w !== waiter);
          reject(new Error('Vui lòng bấm vào ô "Xác minh bạn là người thật" phía trên rồi thử lại'));
        }, 20000);
      });
    },
    reset() {
      token = null;
      if (widgetId !== null) {
        setState('loading');
        window.turnstile?.reset(widgetId);
      }
    },
  };
}
