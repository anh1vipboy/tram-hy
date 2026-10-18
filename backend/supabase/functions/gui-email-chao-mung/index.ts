// Edge Function: gửi email chào mừng cho tài khoản Trạm Hỷ MỚI.
// Được gọi bởi trigger trong database, không gọi từ trình duyệt:
//   - backend/supabase/32_welcome_email_signup.sql: đăng ký bằng email (lúc vừa xác nhận email) và tài khoản Google mới,
//     gửi kèm provider 'email' | 'google'. Mỗi tài khoản tối đa 1 email (bảng welcome_emails).
//   - SQL 10 cũ (chưa chạy SQL 32) chỉ gọi cho tài khoản Google và không gửi provider → coi là 'google'.
//
// Biến bí mật (Supabase → Edge Functions → Secrets, hoặc `supabase secrets set`):
//   BREVO_API_KEY    – API key của Brevo (dạng xkeysib-...)
//   SENDER_EMAIL     – email người gửi đã xác minh trong Brevo
//   WEBHOOK_SECRET   – chuỗi bí mật, trùng với Vault secret "welcome_email_secret" trong database
//   SITE_URL         – (không bắt buộc) địa chỉ web, mặc định https://tram-hy-alpha.vercel.app
//
// Giao diện cùng kiểu với email xác nhận / đặt lại mật khẩu trong backend/supabase/email-templates/.

const SITE_URL = (Deno.env.get('SITE_URL') ?? 'https://tram-hy-alpha.vercel.app').replace(/\/+$/, '');
const LOGO_URL = 'https://tram-hy-alpha.vercel.app/assets/images/logo.jpg';
const FONT = "'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SERIF = "'Palatino Linotype',Cambria,'Times New Roman',Times,serif";

type Provider = 'email' | 'google';

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

// Những gì web đang có – sửa ở đây khi thêm/bớt tính năng
const FEATURES = [
  { icon: '👗', title: 'Phòng thử váy AI', path: 'tryon.html',
    text: 'Trò chuyện với trợ lý và ướm váy cưới lên chính ảnh của bạn.' },
  { icon: '✂️', title: 'Thiết kế váy may đo', path: 'thiet-ke-vay.html',
    text: 'Tự chọn phom, cổ, tay, chất liệu – biết ngay giá tạm tính.' },
  { icon: '🛡️', title: 'Sàn dịch vụ cưới đã kiểm duyệt', path: 'marketplace.html',
    text: 'Váy cưới, chụp ảnh, trang điểm, tiệc… Tiền cọc chia 3 đợt, Trạm Hỷ giữ an toàn đến khi bạn nghiệm thu.' },
  { icon: '📒', title: 'Kế hoạch & ngân sách cưới', path: 'ke-hoach.html',
    text: 'Việc cần làm theo từng mốc, sổ ngân sách và trợ lý AI gợi ý điều chỉnh.' },
  { icon: '💌', title: 'Thiệp cưới online', path: 'invitation.html',
    text: 'Nhiều mẫu thiệp, khách xác nhận dự tiệc và gửi lời chúc qua link.' },
];

const COPY: Record<Provider, { subject: string; intro: string; notMe: string }> = {
  email: {
    subject: 'Chào mừng bạn đến Trạm Hỷ – tài khoản đã sẵn sàng 💍',
    intro: 'Bạn vừa tạo tài khoản Trạm Hỷ và xác nhận email thành công.',
    notMe: 'Nếu bạn không tạo tài khoản Trạm Hỷ, hãy trả lời email này để báo cho chúng tôi.',
  },
  google: {
    subject: 'Chào mừng bạn đến Trạm Hỷ 💍',
    intro: 'Bạn vừa tạo tài khoản Trạm Hỷ bằng tài khoản Google.',
    notMe: 'Nếu bạn không đăng nhập Trạm Hỷ bằng Google, hãy trả lời email này để báo cho chúng tôi.',
  },
};

function featureRows() {
  return FEATURES.map((f, i) => `
              <tr>
                <td width="58" valign="top" style="width:58px;padding:${i ? 14 : 0}px 0 0;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                    <td class="th-icon" width="44" height="44" align="center" valign="middle" bgcolor="#f7e7e3" style="width:44px;height:44px;background-color:#f7e7e3;border-radius:50%;font-size:21px;line-height:44px;">${f.icon}</td>
                  </tr></table>
                </td>
                <td valign="top" style="padding:${i ? 14 : 0}px 0 0;font-family:${FONT};">
                  <a href="${SITE_URL}/${f.path}" target="_blank" class="th-brand" style="font-size:15px;line-height:22px;font-weight:bold;color:#9b2335;text-decoration:none;">${f.title}</a>
                  <div class="th-muted" style="font-size:13px;line-height:20px;color:#74675e;">${f.text}</div>
                </td>
              </tr>`).join('');
}

function welcomeEmail(name: string, provider: Provider) {
  const safeName = escapeHtml(name);
  const copy = COPY[provider];
  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>Chào mừng đến Trạm Hỷ</title>
<style>
  body { margin: 0; padding: 0; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  img { border: 0; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
  @media only screen and (max-width: 480px) {
    .th-outer { padding: 20px 10px !important; }
    .th-pad { padding-left: 22px !important; padding-right: 22px !important; }
    .th-h1 { font-size: 23px !important; }
  }
</style>
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  @media (prefers-color-scheme: dark) {
    .th-page { background-color: #171311 !important; }
    .th-card { background-color: #221c1a !important; border-color: #3a2f2b !important; }
    .th-soft { background-color: #2b2321 !important; border-color: #3a2f2b !important; }
    .th-text { color: #f2e9e2 !important; }
    .th-muted { color: #bcaea4 !important; }
    .th-brand { color: #ee9aa7 !important; }
    .th-line { border-color: #3a2f2b !important; }
    .th-icon { background-color: #3d2629 !important; }
  }
</style>
</head>
<body class="th-page" style="margin:0;padding:0;background-color:#faf5ef;">
  <div style="display:none;max-height:0;max-width:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#faf5ef;opacity:0;">
    Thử váy AI, đặt dịch vụ giữ cọc an toàn, lập kế hoạch và làm thiệp cưới – tất cả ở Trạm Hỷ.&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;
  </div>
  <table role="presentation" class="th-page" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#faf5ef" style="background-color:#faf5ef;">
    <tr>
      <td class="th-outer" align="center" style="padding:32px 12px;">
        <!--[if mso]><table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
        <table role="presentation" class="th-card" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="max-width:520px;background-color:#ffffff;border:1px solid #eadfd6;border-radius:18px;border-collapse:separate;">
          <tr>
            <td class="th-soft" align="center" bgcolor="#fbf7f4" style="background-color:#fbf7f4;border-bottom:1px solid #f0e4da;border-radius:18px 18px 0 0;padding:28px 24px 22px;">
              <img src="${LOGO_URL}" width="64" height="64" alt="Trạm Hỷ" style="display:block;margin:0 auto;width:64px;height:64px;border-radius:50%;border:2px solid #9b2335;">
              <div class="th-brand" style="margin-top:12px;font-family:${SERIF};font-size:21px;line-height:26px;color:#9b2335;">Trạm Hỷ</div>
              <div class="th-muted" style="margin-top:2px;font-family:${FONT};font-size:12px;line-height:18px;color:#74675e;">Kết duyên cát hỷ – Trọn vẹn niềm tin</div>
            </td>
          </tr>
          <tr>
            <td class="th-pad" align="center" style="padding:30px 36px 4px;font-family:${FONT};">
              <div class="th-brand" style="font-size:12px;line-height:16px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#9b2335;">Chào mừng bạn</div>
              <h1 class="th-text th-h1" style="margin:10px 0 14px;font-family:${SERIF};font-size:26px;line-height:33px;font-weight:normal;color:#2a2421;">Chào mừng ${safeName} đến Trạm Hỷ!</h1>
              <p class="th-text" style="margin:0;font-size:15px;line-height:24px;color:#2a2421;">${copy.intro} Từ giờ, mọi việc chuẩn bị cho ngày cưới đều ở một nơi:</p>
            </td>
          </tr>
          <tr>
            <td class="th-pad" style="padding:24px 36px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${featureRows()}
              </table>
            </td>
          </tr>
          <tr>
            <td class="th-pad" align="center" style="padding:28px 36px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
                <tr>
                  <td align="center" bgcolor="#9b2335" style="background-color:#9b2335;border-radius:999px;mso-padding-alt:15px 44px;">
                    <a href="${SITE_URL}" target="_blank" style="display:inline-block;padding:15px 44px;font-family:${FONT};font-size:16px;line-height:20px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:999px;">Vào Trạm Hỷ</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="th-pad th-muted" align="center" style="padding:12px 36px 28px;font-family:${FONT};font-size:13px;line-height:20px;color:#74675e;">
              Thử váy AI, lập kế hoạch và làm thiệp đều miễn phí – bạn chỉ trả tiền dịch vụ theo giá tiệm niêm yết.
            </td>
          </tr>
          <tr>
            <td class="th-pad th-soft th-muted" align="center" bgcolor="#fbf7f4" style="background-color:#fbf7f4;border-top:1px solid #f0e4da;border-radius:0 0 18px 18px;padding:18px 36px 20px;font-family:${FONT};font-size:12px;line-height:18px;color:#74675e;">
              ${copy.notMe}
            </td>
          </tr>
        </table>
        <!--[if mso]></td></tr></table><![endif]-->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
          <tr>
            <td class="th-muted" align="center" style="padding:16px 12px 0;font-family:${FONT};font-size:11px;line-height:17px;color:#9a8b80;">
              Trạm Hỷ · Nền tảng cưới hỏi · <a href="${SITE_URL}" target="_blank" class="th-muted" style="color:#9a8b80;text-decoration:underline;">${SITE_URL.replace(/^https?:\/\//, '')}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// Bản chữ thuần cho ứng dụng mail không hiện HTML (giúp thư ít bị coi là spam)
function welcomeText(name: string, provider: Provider) {
  const copy = COPY[provider];
  return [
    `Chào mừng ${name} đến Trạm Hỷ!`,
    '',
    `${copy.intro} Từ giờ, mọi việc chuẩn bị cho ngày cưới đều ở một nơi:`,
    '',
    ...FEATURES.map((f) => `- ${f.title}: ${f.text} ${SITE_URL}/${f.path}`),
    '',
    `Vào Trạm Hỷ: ${SITE_URL}`,
    '',
    copy.notMe,
  ].join('\n');
}

Deno.serve(async (req) => {
  // Chỉ nhận lời gọi từ database (có đúng chuỗi bí mật)
  if (req.headers.get('x-webhook-secret') !== Deno.env.get('WEBHOOK_SECRET')) {
    return new Response('Forbidden', { status: 403 });
  }

  const { email, full_name, provider } = await req.json().catch(() => ({}));
  if (!email || typeof email !== 'string') return new Response('Missing email', { status: 400 });
  const name = String(full_name || email.split('@')[0]).trim().slice(0, 60);
  const kind: Provider = provider === 'email' ? 'email' : 'google';

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': Deno.env.get('BREVO_API_KEY')!, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { name: 'Trạm Hỷ', email: Deno.env.get('SENDER_EMAIL') },
      to: [{ email, name }],
      subject: COPY[kind].subject,
      htmlContent: welcomeEmail(name, kind),
      textContent: welcomeText(name, kind),
    }),
  });

  if (!res.ok) {
    console.error('Brevo lỗi', res.status, await res.text());
    return new Response('Send failed', { status: 502 });
  }
  return new Response('OK');
});
