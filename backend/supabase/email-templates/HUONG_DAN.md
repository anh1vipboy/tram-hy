# Email của Trạm Hỷ – cách cài

Thư mục này có 4 mẫu email đăng nhập/đăng ký cho Supabase, cùng giao diện với email chào mừng (Edge Function `gui-email-chao-mung`):

| File | Mẫu trong Supabase | Tiêu đề (Subject) – dán y nguyên |
|---|---|---|
| `xac-nhan-dang-ky.html` | **Confirm sign up** | `Xác nhận email đăng ký Trạm Hỷ 💍` |
| `dat-lai-mat-khau.html` | **Reset password** | `Đặt lại mật khẩu Trạm Hỷ` |
| `doi-email.html` | **Change email address** | `Xác nhận đổi email Trạm Hỷ` |
| `magic-link.html` | **Magic link** | `Link đăng nhập Trạm Hỷ của bạn` |

Mẫu nào cũng có logo, nút bấm lớn, link dự phòng (khi nút không bấm được) và câu "bỏ qua email này nếu không phải bạn".
Mẫu hiển thị tốt trên Gmail (web + app, kể cả chế độ tối), Apple Mail và Outlook.

> Mẫu chỉ áp dụng cho project nào bạn **dán vào**. Có 2 project (thật `vsjdijmuvuetmhmszcrl` và test) thì muốn cả hai giống nhau phải dán ở cả hai.

---

## 1. Dán 4 mẫu email (khoảng 5 phút)

1. Vào https://supabase.com/dashboard → chọn project **Trạm Hỷ** (`vsjdijmuvuetmhmszcrl`).
2. Menu trái: **Authentication** → **Emails** → tab **Templates**.
3. Bấm mẫu **Confirm sign up**:
   - Ô **Subject**: xóa chữ cũ, dán `Xác nhận email đăng ký Trạm Hỷ 💍`.
   - Ô nội dung (**Message body** – chọn chế độ **Source** nếu có): xóa hết, mở file `xac-nhan-dang-ky.html` bằng Notepad/VS Code →
     `Ctrl+A`, `Ctrl+C` → dán vào.
     Dán **cả file** cũng được: khối chú thích `<!-- ... -->` ở đầu file không hiện trong email (Supabase tự bỏ).
   - Bấm **Save changes**.
4. Làm tương tự cho **Reset password**, **Change email address**, **Magic link** với file và tiêu đề trong bảng trên.

Không sửa các chữ trong ngoặc nhọn như `{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .NewEmail }}` – Supabase thay bằng link và email thật lúc gửi.
Ô xem trước (Preview) của Supabase có thể không hiện logo hay link thật – bình thường, cứ gửi thử (bước 4).

## 2. Kiểm tra địa chỉ web (bắt buộc – nếu sai, bấm link xác nhận sẽ không quay về Trạm Hỷ)

1. Menu trái: **Authentication** → **URL Configuration**.
2. **Site URL**: `https://tram-hy-alpha.vercel.app` → **Save**.
3. **Redirect URLs** phải có (thiếu thì bấm **Add URL**):
   - `https://tram-hy-alpha.vercel.app/**`
   - `http://localhost:8080/**` (để chạy thử trên máy)
4. Thiếu dòng `https://tram-hy-alpha.vercel.app/**` → link xác nhận / đặt lại mật khẩu sẽ về Site URL thay vì đúng trang
   `login.html?confirmed=1` / `reset-password.html`.

## 3. Thời hạn của link (để câu "hết hạn sau 1 giờ" trong email là đúng)

1. Menu trái: **Authentication** → **Sign In / Providers** → mục **Email**.
2. Xem ô **Email OTP Expiration**: `3600` giây = 1 giờ (mặc định) → giữ nguyên.
3. Nếu bạn đổi số này (vd `86400` = 24 giờ) thì sửa câu "hết hạn sau 1 giờ" trong cả 4 file rồi dán lại.

## 4. Gửi thử

1. Mở https://tram-hy-alpha.vercel.app/login.html → **Đăng ký** bằng một địa chỉ thử, vd `tenban+test1@gmail.com`
   (mỗi `+test1`, `+test2`… là một tài khoản riêng nhưng thư về cùng hộp Gmail).
2. Hộp thư nhận email **"Xác nhận email đăng ký Trạm Hỷ 💍"** giao diện mới → bấm **Xác nhận email** →
   web báo "Xác nhận tài khoản thành công!" và tự đăng nhập.
3. Vài giây sau nhận thêm **email chào mừng** (cần làm phần 5 bên dưới trước).
4. Thử **Quên mật khẩu?** ở trang Đăng nhập để xem email đặt lại mật khẩu.
5. Xong thì xóa tài khoản thử: **Authentication → Users** → ⋯ → **Delete user**.

Đăng ký báo lỗi gửi email ngay sau khi dán mẫu → mở lại mẫu vừa dán, kiểm tra không lỡ xóa/sửa chữ trong `{{ }}`.

## 5. Email chào mừng cho người đăng ký bằng email

Trước đây chỉ tài khoản **Google** mới nhận email chào mừng. Giờ người đăng ký bằng email cũng nhận – ngay khi bấm link xác nhận.

1. **SQL**: Supabase → **SQL Editor** → dán toàn bộ `backend/supabase/32_welcome_email_signup.sql` → **Run** (chạy SAU 31).
   Chạy ở project thật. Project test chạy cũng được để giống cấu trúc – không có Vault secret thì không gửi gì.
2. **Deploy lại function** (lời chào khác nhau cho Google / email, danh sách tính năng mới) – trong thư mục `backend/`:
   `npx supabase functions deploy gui-email-chao-mung --project-ref vsjdijmuvuetmhmszcrl --no-verify-jwt`
3. **Bí mật** (đã làm từ hồi SQL 10 thì thôi):
   - **Project Settings → Vault** (hoặc **Integrations → Vault**) có secret tên `welcome_email_secret`.
   - **Edge Functions → Secrets** có `BREVO_API_KEY`, `SENDER_EMAIL`, `WEBHOOK_SECRET` (`WEBHOOK_SECRET` phải **trùng** `welcome_email_secret`).

Mỗi tài khoản chỉ nhận **tối đa 1** email chào mừng (bảng `welcome_emails` ghi lại ai đã nhận). Tài khoản đã có từ trước khi chạy SQL 32
không nhận thư "muộn". Không nhận được thư → **Edge Functions → gui-email-chao-mung → Logs**
(403 = hai chuỗi bí mật không khớp, 502 = Brevo từ chối) và Brevo → **Transactional → Logs**.

## Ghi chú

- Logo trong email lấy từ `https://tram-hy-alpha.vercel.app/assets/images/logo.jpg` – đừng xóa/đổi tên file này.
  Nếu bật chặn bot trên Vercel (Firewall → Bot protection) mà logo trong Gmail bị vỡ, hãy tắt hoặc cho phép đường dẫn `/assets/`.
- Email cố ý **không** chèn họ tên người đăng ký: ai cũng có thể đăng ký bằng email người khác kèm "họ tên" lừa đảo.
- Một số hộp thư công ty (Outlook "Safe Links") tự mở link trước người dùng → người dùng bấm thấy "Link xác nhận đã hết hạn hoặc đã được dùng".
  Trang Đăng nhập đã giải thích: tài khoản thường đã được xác nhận, cứ đăng nhập.
- Muốn đổi chữ: sửa file trong thư mục này rồi dán lại vào Supabase (Supabase không tự đọc file trong repo).
