# KỊCH BẢN REVIEW – TRẠM HỶ (bản chạy thật trên Supabase)

> Web: **https://tram-hy-alpha.vercel.app** · Thời lượng: **~12 phút** · Thay thế `Kich_Ban_Demo.md` (bản prototype cũ).
> Mỗi bước: **Bấm gì** → **Thấy gì** → *Nói gì*. Mục "Nếu lỗi" để xử lý nhanh khi demo trục trặc.

---

## A. CHUẨN BỊ (làm trước buổi review 1 ngày)

### Tài khoản (trên database thật – project Tram_hy)
| Vai trò | Dùng để | Kiểm tra |
|---|---|---|
| **Cô dâu** | Đặt lịch, trả cọc, thiệp cưới | Đăng nhập được, có sẵn số điện thoại trong hồ sơ |
| **Đối tác** | Kênh đối tác, mẫu váy, ảnh tiệm | Đã gắn với 1 tiệm **váy cưới** đã duyệt, tiệm có **ảnh bìa + 2–3 mẫu váy có ảnh thật** |
| **Admin** | Duyệt đối tác, xử lý khiếu nại | Vào được trang Quản trị |

- **Đổi tên tiệm test** cho đẹp (Kênh đối tác → Sửa thông tin tiệm), vd *"Bellis Atelier"* thay cho tên thử nghiệm.
- Chuẩn bị sẵn **1 tài khoản đối tác chưa có tiệm** để demo luồng mở tiệm (đăng ký trước, tránh chờ email lúc demo).
- Xóa bớt đơn/khiếu nại thử nghiệm cũ nếu muốn màn hình gọn (dùng `backend/supabase/tools/xoa_tai_khoan_test.sql` cho tài khoản test).

### Máy trình chiếu
- **Tắt Cloudflare WARP / VPN** (tránh Supabase/Google chặn).
- Mở sẵn **3 cửa sổ trình duyệt** (thường / ẩn danh / trình duyệt khác), mỗi cửa sổ đăng nhập 1 vai trò, xếp **cạnh nhau** để thấy realtime:
  1. **Cô dâu** – tab Trang chủ
  2. **Đối tác** – tab Kênh đối tác
  3. **Admin** – tab Quản trị
- Bấm **Ctrl+F5** ở cả 3 cửa sổ để chắc chắn là bản mới nhất.
- Mở sẵn **VS Code** với Terminal ở `D:\exe202\tests` (cho phần kỹ thuật) và file `graphify-out/graph.html`.
- Điện thoại mở sẵn web (demo giao diện mobile + mở link thiệp).

### Chạy kiểm tra lần cuối (sáng hôm review)
```powershell
cd D:\exe202\tests
npm test          # phải thấy toàn bộ "passed"
```

---

## B. KỊCH BẢN (12 phút)

### 0. Mở đầu – vấn đề & giải pháp (1 phút)
*"Cô dâu Việt hay gặp 3 vấn đề: thử váy mệt mỏi, ảnh mạng khác thực tế, và sợ mất cọc. Trạm Hỷ giải quyết bằng: thử váy trên chính dáng mình, sàn đối tác được xác minh, và tiền cọc giữ qua 3 đợt – chỉ đến tay tiệm khi cô dâu nghiệm thu."*

### 1. Trang chủ (1 phút) – cửa sổ Cô dâu
| Bấm | Thấy | Nói |
|---|---|---|
| Kéo xuống **Mẫu váy được thử nhiều** → bấm vào ảnh 1 mẫu | Trình xem ảnh nhiều góc, vuốt/bấm mũi tên | *"Ảnh thật do tiệm đăng, xem được nhiều góc."* |
| **Gợi ý chia ngân sách** → gõ `150000000` | Tự thành `150.000.000`, chia 5 hạng mục | *"Nhập tổng ngân sách, hệ thống gợi ý mức chi từng hạng mục."* |
| Gõ `5000000` → Chia | Báo đỏ *"tối thiểu 10.000.000đ"* | *"Có kiểm tra dữ liệu đầu vào."* |
| Bấm **Tìm đối tác →** ở dòng Chụp ảnh | Sang Dịch vụ cưới, đã lọc sẵn loại + ngân sách | |

### 2. Dịch vụ cưới (1 phút)
| Bấm | Thấy | Nói |
|---|---|---|
| Tick **Chỉ đối tác Tích Xanh** | Chỉ còn tiệm đã xác minh | *"Tích Xanh do Trạm Hỷ cấp sau khi xác minh."* |
| **Ngân sách tối đa → Tự nhập số tiền…** → gõ `20000000` | Danh sách lọc theo giá | |
| Bấm **Xem chi tiết** 1 tiệm váy | Trang tiệm: ảnh bìa, **ảnh thực tế**, mẫu váy, **đánh giá xác thực** | *"Chỉ khách có đơn hoàn tất mới được đánh giá – không có đánh giá ảo."* |

### 3. Phòng thử váy (2 phút)
| Bấm | Thấy | Nói |
|---|---|---|
| Chọn 1 người mẫu → chỉnh **chiều cao, cân nặng, dáng người** | Điểm **độ tôn dáng** + lời khuyên stylist thay đổi theo | *"Số đo được lưu vào tài khoản."* |
| Chọn mẫu váy | Gương đổi ảnh (nhãn *Minh họa*) | |
| Bấm **✨ Ướm thử bằng AI thật** | AI ghép váy lên ảnh **hoặc** báo *"AI thử váy thật chưa được bật"* | *"Hệ thống đã tích hợp AI ghép váy (Gemini, sẵn sàng chuyển FASHN), giới hạn 5 lượt/người/ngày để kiểm soát chi phí. Đang chờ kích hoạt thanh toán API – khi chưa bật, web tự dùng ảnh minh họa, không báo lỗi."* |
| Tab **Tự thiết kế may đo** → chọn phom, chất liệu, đuôi váy | Giá tự tính, 3 đợt **30/40/30** | *"May đo có lộ trình cọc riêng: duyệt thiết kế → thử rập → nhận váy."* |
| (Điện thoại) mở trang này | Nút **Đặt lịch** dính đáy màn hình | *"Giao diện tối ưu cho điện thoại."* |

### 4. Đặt lịch + Escrow 3 đợt (3 phút) – ⭐ phần quan trọng nhất
Xếp **cửa sổ Cô dâu** và **cửa sổ Đối tác** cạnh nhau.

| # | Cửa sổ | Bấm | Thấy | Nói |
|---|---|---|---|---|
| 1 | Cô dâu | Phòng thử → chọn mẫu của tiệm đối tác → **Đặt lịch thử váy** → chọn ngày giờ → **Xác nhận** | Sang **Đơn của tôi**, đơn mới *Chờ đặt cọc* | |
| 2 | Đối tác | (không bấm gì) | Đơn **tự xuất hiện** ở cột *Chờ khách đặt cọc* | *"Realtime – tiệm thấy đơn ngay, không cần tải lại."* |
| 3 | Cô dâu | **Thanh toán** đợt 1 | Mã **VietQR** đúng số tiền + nội dung | *"Tiền chuyển vào tài khoản bảo chứng của Trạm Hỷ, chưa tới tay tiệm."* |
| 4 | Cô dâu | **Tôi đã chuyển khoản** | Đợt 1: *Trạm Hỷ đang giữ* | *"Bản demo xác nhận bằng nút; bản thật nối cổng thanh toán PayOS tự xác nhận."* |
| 5 | Đối tác | (tự cập nhật) → **Bắt đầu thực hiện** | Đơn sang *Đang thực hiện* | |
| 6 | Cô dâu | **Nghiệm thu** đợt 1 → **Đồng ý giải ngân** | Đợt 1: *Đã giải ngân* | *"Chỉ khi cô dâu hài lòng, tiền mới chuyển cho tiệm."* |
| 7 | Cô dâu | Thử bấm trả **đợt 3** | Không có nút – phải trả đúng thứ tự | *"Mọi quy tắc tiền nằm trong database, sửa code trình duyệt cũng không vượt qua được."* |

### 5. Khiếu nại & trọng tài (1,5 phút) – thêm cửa sổ Admin
| Cửa sổ | Bấm | Thấy | Nói |
|---|---|---|---|
| Cô dâu | Trả đợt 2 → **Yêu cầu hoàn cọc** → nhập lý do | Đơn *Đang khiếu nại*, tiền bị khóa | *"Tiệm sai cam kết → cô dâu khiếu nại, tiền đang giữ bị khóa."* |
| Admin | Tab **Khiếu nại** → **Hoàn tiền cho cô dâu** → ghi chú | Khiếu nại biến mất | *"Trạm Hỷ làm trọng tài trung lập."* |
| Cô dâu | Tải lại | *Đã hoàn tiền*: đợt 1 vẫn giải ngân, đợt 2 hoàn về cô dâu | *"Bảo vệ 2 chiều: tiệm cũng được đền bù nếu khách bùng lịch (nút Khách không đến)."* |

### 6. Đối tác mở tiệm & admin duyệt (1,5 phút)
| Cửa sổ | Bấm | Thấy |
|---|---|---|
| Đối tác **chưa có tiệm** (đã đăng nhập sẵn) | Điền **Đăng ký mở tiệm** → Gửi | *Hồ sơ đang chờ duyệt* – khách chưa thấy tiệm |
| Admin | Tab **Duyệt đối tác** (có số đếm) → **Duyệt** | Hồ sơ biến mất |
| Đối tác | (tự cập nhật) | Hiện **Kênh đối tác** với tab Đơn hàng / Mẫu váy / Ảnh tiệm |
| Đối tác (tiệm có sẵn) | Tab **Mẫu váy → Thêm mẫu**: ảnh chính + vài ảnh góc | Thẻ váy có nhãn *"N ảnh"* |

*"Đối tác tự quản lý sản phẩm, ảnh được nén tự động trước khi tải lên."*

### 7. Thiệp cưới & RSVP (1 phút)
| Bấm | Thấy |
|---|---|
| Cô dâu → **Thiệp cưới** → điền tên, ngày, ngân hàng → **Lưu** | Xem trước thiệp + **QR mừng cưới** |
| **Sao chép link** → mở trên **điện thoại** | Khách mời (không cần đăng nhập) gửi phản hồi |
| Quay lại máy tính, tải lại | Thấy tên khách + số người sẽ đến |

### 8. Phần kỹ thuật (1 phút) – nếu giảng viên quan tâm
- **Kiến trúc:** HTML/JS thuần (Vercel) + **Supabase** (PostgreSQL, Auth, Storage, Realtime, Edge Functions). Nghiệp vụ tiền viết bằng hàm SQL, phân quyền bằng **Row Level Security**.
- **Đăng nhập:** email + xác nhận, **Google**, quên mật khẩu; email chào mừng qua Edge Function + Brevo.
- **Kiểm thử tự động:** chạy `npm run test:ui` → chọn bài *escrow-journey* → Playwright tự đóng 3 vai trò đi hết luồng tiền trên **database test riêng**.
- **Sơ đồ kiến trúc code:** mở `graphify-out/graph.html`.

### 9. Kết (30 giây)
*"Bước tiếp theo: kích hoạt AI thử váy, nối cổng thanh toán PayOS, thông báo email cho đối tác, và chạy thử với 5–10 tiệm thật ở Hà Nội."*

---

## C. NẾU LỖI GIỮA CHỪNG
| Tình huống | Xử lý nhanh |
|---|---|
| Trang trắng / không tải dữ liệu | Ctrl+F5; kiểm tra đã tắt VPN; mở lại bằng cửa sổ khác |
| Đối tác không thấy đơn tự nhảy | Bấm **F5** ở cửa sổ đối tác (realtime đôi khi chậm vài giây) – nói *"thường thì tự cập nhật"* rồi đi tiếp |
| Báo "Bạn không có quyền với đơn này" | Đang đăng nhập nhầm vai trò ở cửa sổ đó |
| Nút AI báo "chưa được bật" | Đúng như kịch bản – giải thích cơ chế tự quay về ảnh minh họa |
| Không thấy mẫu váy của tiệm đối tác | Kiểm tra mẫu đang **Mở bán** (không bị Ẩn) và tiệm đã được **duyệt** |
| Mất mạng | Chuyển sang chạy `npm run test:ui` (vẫn cần mạng tới Supabase) hoặc trình bày bằng ảnh chụp chuẩn bị sẵn |

**Mẹo:** chụp sẵn ảnh màn hình từng bước quan trọng (bước 4, 5, 6) làm phương án dự phòng.
