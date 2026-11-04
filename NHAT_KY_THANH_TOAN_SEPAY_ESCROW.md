# NHẬT KÝ TÍCH HỢP THANH TOÁN TỰ ĐỘNG SEPAY VIETQR & BẢO CHỨNG ESCROW TRẠM HỶ

> **Dự án:** Trạm Hỷ – Nền tảng Công nghệ Cưới & Thử Váy AI (Bridal & Wedding Tech)  
> **Thời gian thực hiện:** 31/10/2026 – 05/11/2026  
> **Người thực hiện:** Phùng Đức Anh (Fullstack) cùng Antigravity AI Assistant  
> **Hệ thống ngân hàng:** TPBank · Số tài khoản: `0355521617` · Chủ tài khoản: `PHUNG DUC ANH`  
> **Dịch vụ Webhook:** SePay.vn (tích hợp trực tiếp vào Supabase Edge Functions)  

---

## 1. Tóm tắt Kết quả Thực hiện

| Hạng mục | Trước khi làm | Sau khi hoàn thành |
|---|---|---|
| **Kích hoạt Gói cước AI** | Admin thấy log đơn hàng nhưng người dùng vẫn ở gói Khởi Điểm do lỗi phân quyền `is_admin()`. | Tự động kích hoạt 100% qua Database Trigger `trg_on_subscription_order_paid` + cơ chế tự lành (self-healing) trong `get_my_subscription()`. |
| **Thanh toán Cọc & Escrow** | Bản demo: hiện pop-up đơn giản với nút *"Tôi đã chuyển khoản"* và dòng chữ *(Bản demo: bấm xác nhận...)*. | Modal VietQR Realtime chuẩn **Soft Luxury**, radar quét biến động số dư, đồng hồ 15:00, tự động nhận diện thanh toán qua SePay Webhook. |
| **Xử lý Webhook Ngân hàng** | Edge Function `sepay-webhook` chỉ đón gói AI (`THAI...`). | Tự động phân loại 2 luồng: Gói cước AI (`THAI...`) & Tiền cọc/chặng hợp đồng Escrow (`BK... D1/D2/D3`). |
| **Phản hồi Trình duyệt** | Người dùng phải bấm F5 để thấy thay đổi trạng thái. | Bắt sự kiện Supabase Realtime qua kênh `postgres_changes`, tự động nổ pháo hoa Confetti 🎉 và cập nhật trạng thái đơn thành `confirmed` (Đã xác nhận). |
| **Server Local Dev** | `start_server.ps1` bị treo khi gặp yêu cầu HTTP `HEAD` (`curl -I`). | Bổ sung xử lý `HEAD` chuẩn HTTP, phản hồi 200 OK ngay lập tức. |

---

## 2. Chi tiết các Lỗi & Giải pháp Kỹ thuật

### 2.1. Sửa lỗi Gói cước AI: Admin có log nhưng khách hàng vẫn ở "Khởi Điểm"
* **Nguyên nhân gốc rễ (Root Cause):**  
  Khi SePay gửi webhook báo khách đã chuyển khoản thành công, Edge Function `sepay-webhook` (chạy bằng `SUPABASE_SERVICE_ROLE_KEY`) gọi RPC `admin_confirm_subscription_order`. Tuy nhiên, hàm này kiểm tra điều kiện `public.is_admin()`. Vì Edge Function không có phiên đăng nhập của người dùng (`auth.uid() = null`), `is_admin()` trả về `false`, khiến đơn hàng chỉ cập nhật trạng thái `subscription_orders.status = 'paid'` mà **không thể thêm bản ghi mới vào bảng `user_subscriptions`**.
* **Giải pháp khắc phục ([40_fix_subscription_auto_activation.sql](file:///d:/exe202/backend/supabase/40_fix_subscription_auto_activation.sql)):**
  1. Tạo hàm trigger `public.on_subscription_order_paid()` với quyền `security definer`.
  2. Đăng ký trigger `trg_on_subscription_order_paid` trên bảng `subscription_orders`: Ngay khi một đơn hàng chuyển sang `status = 'paid'`, database tự động tính thời hạn gói (30 hoặc 60 ngày), cấp hạn mức credit (60 hoặc 150/ngày) và ghi vào `user_subscriptions`.
  3. Nâng cấp hàm `public.get_my_subscription()` với cơ chế **Self-healing (Tự bù gói)**: Nếu vì bất kỳ lý do mạng nào mà `user_subscriptions` chưa có bản ghi nhưng khách đã có đơn `paid`, hàm sẽ tự động kích hoạt gói ngay khi khách mở trang web.
  4. Cập nhật `frontend/js/services/subscription.js` bổ sung kiểm tra fallback qua `subscription_orders`.

---

### 2.2. Nâng cấp Thanh toán Đặt cọc Escrow thành Thanh toán Thật (VietQR + SePay)

#### A. Database Migration ([41_booking_payment_realtime.sql](file:///d:/exe202/backend/supabase/41_booking_payment_realtime.sql))
* Kích hoạt `replica identity full` cho cả 2 bảng `milestones` và `bookings` để Supabase Realtime gửi toàn bộ dữ liệu dòng khi có lệnh `UPDATE`.
* Tạo hàm RPC hệ thống `public.system_pay_milestone(p_booking_id uuid, p_stage int, p_transaction_id text)`:
  * Kiểm tra tính toàn vẹn của đơn hàng và thứ tự các đợt thanh toán (đợt 1 $\rightarrow$ đợt 2 $\rightarrow$ đợt 3).
  * Chuyển trạng thái milestone từ `locked` $\rightarrow$ `paid`, gán `paid_at = now()`.
  * Nếu là đợt 1 và đơn đang `pending`, tự động nâng trạng thái đơn hàng sang **`confirmed` (Đã xác nhận)**.
  * Ghi nhận mã giao dịch ngân hàng vào `bookings.details->'sepay_transactions'`.

#### B. Nâng cấp Edge Function ([sepay-webhook/index.ts](file:///d:/exe202/backend/supabase/functions/sepay-webhook/index.ts))
* **Cơ chế phân luồng nội dung chuyển khoản thông minh:**
  * Chuẩn hóa chuỗi (bỏ dấu cách, dấu gạch nối, chuyển thành chữ in hoa).
  * Bắt mã đơn Booking dạng `BK(\d{6})[-_\s]?([A-Z0-9]{5})` (ví dụ: `BK261103-540EC` hoặc `BK261103540EC`).
  * Trích xuất đợt thanh toán: Bắt ký tự `D1`, `D2`, `D3`, `DOT 1`, `STAGE 1`. Nếu khách không ghi số đợt, hệ thống tự động suy luận đợt đang chờ (`locked`) gần nhất hoặc khớp theo số tiền.
* **Kiểm tra số tiền chuyển:**
  * So khớp `transferAmount >= targetMilestone.amount`. Nếu chuyển thiếu, ghi log cảnh báo và không giải phóng chặng cọc.
* **Kích hoạt tức thì:** Gọi `system_pay_milestone` với Service Role, trả về HTTP 200 OK cho SePay trong $< 1$ giây.
* **Bảo toàn luồng cũ:** Vẫn xử lý trọn vẹn cho các đơn gói AI `THAI...`.

#### C. Giao diện Thanh toán Realtime Soft Luxury ([escrow-modal.js](file:///d:/exe202/frontend/js/components/escrow-modal.js) & [styles.css](file:///d:/exe202/frontend/css/styles.css))
* Thay thế hoàn toàn hộp thoại demo cũ bằng modal thiết kế chuẩn gu ngành cưới (Bridal Editorial):
  * **VietQR động:** Tạo ảnh QR chuẩn NAPAS247 từ API `img.vietqr.io` với đầy đủ số tiền và cú pháp chuyển khoản `${booking.code} D${stage}`.
  * **Hiệu ứng Radar Pulse:** Biểu tượng sóng radar chuyển động mượt mà bằng CSS GPU transform/opacity với dòng chữ *"Đang tự động nhận diện thanh toán qua SePay..."*.
  * **Đồng hồ đếm ngược:** Đếm ngược chính xác 15 phút (`15:00`) với định dạng font số thẳng hàng (`tabular-nums`).
  * **Nút sao chép thông tin:** Sao chép 1 chạm cho Số tài khoản, Số tiền, Nội dung chuyển khoản.
  * **Kênh Realtime WebSocket:** Lắng nghe trực tiếp bảng `milestones` theo `booking_id`. Khi có tín hiệu `paid` từ SePay:
    * Dừng đồng hồ đếm ngược.
    * Kích hoạt hiệu ứng bắn pháo hoa Confetti 🎉.
    * Hiển thị màn hình thành công: Giải thích rõ tiền đã được Trạm Hỷ bảo chứng an toàn 100% trong Escrow, tiệm dịch vụ đã nhận thông báo chuẩn bị.
    * Tự động cập nhật lại danh sách đơn mà không cần người dùng tải lại trang.
  * **Cơ chế Fallback an toàn:**
    * Polling ngầm mỗi 4 giây phòng trường hợp mạng khách hàng chặn kết nối WebSocket.
    * Nút *"Đã chuyển tiền nhưng chưa thấy cập nhật? Bấm vào đây để kiểm tra lại"*.

---

## 3. Cấu hình Webhook trên Cổng SePay (Đã kết nối thành công)

Thông tin cấu hình tại bảng điều khiển [my.sepay.vn](https://my.sepay.vn):

* **Tài khoản ngân hàng liên kết:** TPBank `0355521617` - PHUNG DUC ANH (Trạng thái: *Đã kết nối API*).
* **Tên Webhook:** `tram-hy`
* **URL nhận Webhook:** `https://vsjdijmuvuetmhmszcrl.supabase.co/functions/v1/sepay-webhook`
* **Loại giao dịch:** Tiền vào (in)
* **Định dạng dữ liệu:** JSON (`application/json`)
* **Tự động gửi lại khi server trả lỗi:** Bật (tối đa 7 lần)
* **Tài khoản áp dụng:** Tất cả tài khoản đã liên kết
* **Dùng để xác thực thanh toán:** Bật
* **Phương thức xác thực:** Không xác thực (mặc định) / Có hỗ trợ API Key nếu cấu hình secret

---

## 4. Danh sách các File Code Đã Thêm Mới & Chỉnh Sửa

| Đường dẫn file | Thao tác | Mô tả chi tiết |
|---|---|---|
| `backend/supabase/40_fix_subscription_auto_activation.sql` | **Tạo mới** | Trigger tự kích hoạt `user_subscriptions` khi đơn `paid` + hàm `get_my_subscription()` tự sửa lỗi. |
| `backend/supabase/41_booking_payment_realtime.sql` | **Tạo mới** | Bật replica identity full cho `milestones` & `bookings`, tạo RPC `system_pay_milestone`. |
| `backend/supabase/functions/sepay-webhook/index.ts` | **Cập nhật** | Thêm bộ bóc tách mã booking `BK... D[123]`, xác thực số tiền và gọi `system_pay_milestone`. |
| `frontend/js/components/escrow-modal.js` | **Tạo mới** | Component Modal VietQR Escrow Realtime, radar pulse, countdown 15:00, pháo hoa Confetti 🎉. |
| `frontend/css/styles.css` | **Cập nhật** | Thêm CSS Soft Luxury cho QR checkout, radar sweep, countdown pill, và confetti particles. |
| `frontend/js/pages/bookings.js` | **Cập nhật** | Thay thế `ACTIONS.pay` gọi sang `openEscrowPaymentModal` thay cho dialog demo cũ. |
| `frontend/bookings.html` | **Cập nhật** | Nâng phiên bản cache buster `styles.css?v=9` và `bookings.js?v=9`. |
| `start_server.ps1` | **Cập nhật** | Bổ sung xử lý HTTP `HEAD` để server local không bị treo khi kiểm tra kết nối. |

---

## 5. Quy trình Kiểm thử Thực tế (Verification)

1. **Kiểm thử Webhook Gói cước AI:**
   * Gửi payload mô phỏng SePay: `content: "THAI 149K XXXX"`, `transferAmount: 149000`.
   * Kết quả: Đơn cước cập nhật `paid`, tài khoản được cấp quyền gói *Nàng Thơ Rạng Rỡ* trong `user_subscriptions` ngay lập tức.
2. **Kiểm thử Webhook Booking Escrow:**
   * Gửi payload chuyển thiếu tiền: `content: "BK261103-540EC D1"`, `transferAmount: 10000` $\rightarrow$ Webhook từ chối với thông báo *"Số tiền chuyển chưa đủ cho đợt thanh toán (cần 750000)"*.
   * Gửi payload không dấu gạch nối: `content: "BK261103540ECD1"`, `transferAmount: 750000` $\rightarrow$ Webhook nhận diện chính xác booking `BK261103-540EC`, đợt 1, cập nhật milestone thành `paid` và nâng đơn sang `confirmed`.
   * Gửi payload đợt đã thanh toán $\rightarrow$ Webhook trả về thông báo *"Đợt này đã được thanh toán trước đó"*, không bị lỗi trùng lặp.
3. **Kiểm thử Giao diện Người dùng:**
   * Mở `http://localhost:8080/bookings.html`.
   * Bấm "Thanh toán" đợt 1: Modal VietQR Escrow mở ra, đếm ngược 15:00 hoạt động, mã QR tạo đúng STK TPBank và số tiền 750.000đ.
   * Sao chép STK và Nội dung CK hoạt động tốt qua Clipboard API.
