// CAPTCHA chống bot bằng Cloudflare Turnstile – Supabase Auth kiểm tra token ở server.
// Chế độ "interaction-only": người dùng thật thường không phải bấm gì; chỉ hiện ô xác minh khi nghi ngờ.
// TURNSTILE_SITE_KEY trống → tắt (getToken trả undefined, Supabase không đòi token khi chưa bật CAPTCHA).
import { TURNSTILE_SITE_KEY } from '../config.js';

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

/** Gắn ô xác minh vào container. Trả về { getToken(), reset() } – mỗi token chỉ dùng được 1 lần. */
export function mountCaptcha(container) {
  if (!captchaEnabled) return { getToken: async () => undefined, reset() {} };

  let token = null;
  let waiting = [];
  let widgetId = null;
  const ready = loadTurnstile().then((turnstile) => {
    widgetId = turnstile.render(container, {
      sitekey: TURNSTILE_SITE_KEY,
      appearance: 'interaction-only',
      theme: 'light',
      language: 'auto',
      callback: (t) => { token = t; waiting.forEach((w) => w.resolve(t)); waiting = []; },
      'expired-callback': () => { token = null; },
      'error-callback': () => { token = null; },
    });
  });

  return {
    async getToken() {
      await ready;
      if (token) return token;
      return new Promise((resolve, reject) => {
        const waiter = { resolve, reject };
        waiting.push(waiter);
        setTimeout(() => {
          waiting = waiting.filter((w) => w !== waiter);
          reject(new Error('Đang xác minh bạn không phải robot – nếu thấy ô xác minh, hãy bấm vào rồi thử lại'));
        }, 20000);
      });
    },
    reset() {
      token = null;
      if (widgetId !== null) window.turnstile?.reset(widgetId);
    },
  };
}
