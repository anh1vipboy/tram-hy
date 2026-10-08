// Edge Function: gửi email chào mừng khi có người đăng nhập bằng Google LẦN ĐẦU (tài khoản mới).
// Được gọi bởi trigger trong database (xem backend/supabase/10_welcome_email.sql), không gọi từ trình duyệt.
//
// Biến bí mật (Supabase → Edge Functions → Secrets, hoặc `supabase secrets set`):
//   BREVO_API_KEY    – API key của Brevo (dạng xkeysib-...)
//   SENDER_EMAIL     – email người gửi đã xác minh trong Brevo
//   WEBHOOK_SECRET   – chuỗi bí mật, trùng với Vault secret "welcome_email_secret" trong database
//   SITE_URL         – (không bắt buộc) địa chỉ web, mặc định https://tram-hy-alpha.vercel.app

const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://tram-hy-alpha.vercel.app';

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function welcomeEmail(name: string) {
  const safeName = escapeHtml(name);
  return `<!DOCTYPE html>
<html lang="vi"><body style="margin:0;background:#fbf7f4;font-family:Arial,Helvetica,sans-serif;color:#2a2421">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border:1px solid #eadfd6;border-radius:16px">
      <tr><td align="center" style="padding:32px 28px 8px">
        <img src="${SITE_URL}/assets/images/logo.jpg" width="72" height="72" alt="Trạm Hỷ" style="border-radius:50%;border:2px solid #9b2335">
        <h1 style="font-family:Georgia,serif;font-size:24px;margin:16px 0 4px">Chào mừng ${safeName} đến Trạm Hỷ!</h1>
        <p style="color:#74675e;margin:0">Kết duyên cát hỷ – Trọn vẹn niềm tin</p>
      </td></tr>
      <tr><td style="padding:16px 28px;font-size:15px;line-height:1.6">
        <p>Bạn vừa đăng nhập Trạm Hỷ bằng tài khoản Google. Từ giờ bạn có thể:</p>
        <ul style="padding-left:20px;margin:0 0 8px">
          <li>Thử váy cưới AI trên chính dáng của bạn</li>
          <li>Đặt lịch với đối tác Tích Xanh, tiền cọc được Trạm Hỷ giữ an toàn</li>
          <li>Tạo thiệp cưới online và nhận phản hồi khách mời</li>
        </ul>
      </td></tr>
      <tr><td align="center" style="padding:8px 28px 28px">
        <a href="${SITE_URL}" style="display:inline-block;background:#9b2335;color:#fff;text-decoration:none;font-weight:bold;padding:12px 28px;border-radius:999px">Vào Trạm Hỷ</a>
      </td></tr>
      <tr><td style="padding:16px 28px;border-top:1px solid #eadfd6;font-size:12px;color:#74675e">
        Nếu bạn không đăng nhập Trạm Hỷ, có thể bỏ qua email này hoặc trả lời để báo cho chúng tôi.
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

Deno.serve(async (req) => {
  // Chỉ nhận lời gọi từ database (có đúng chuỗi bí mật)
  if (req.headers.get('x-webhook-secret') !== Deno.env.get('WEBHOOK_SECRET')) {
    return new Response('Forbidden', { status: 403 });
  }

  const { email, full_name } = await req.json().catch(() => ({}));
  if (!email) return new Response('Missing email', { status: 400 });
  const name = full_name || email.split('@')[0];

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': Deno.env.get('BREVO_API_KEY')!, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { name: 'Trạm Hỷ', email: Deno.env.get('SENDER_EMAIL') },
      to: [{ email, name }],
      subject: 'Chào mừng bạn đến Trạm Hỷ 💍',
      htmlContent: welcomeEmail(name),
    }),
  });

  if (!res.ok) {
    console.error('Brevo lỗi', res.status, await res.text());
    return new Response('Send failed', { status: 502 });
  }
  return new Response('OK');
});
