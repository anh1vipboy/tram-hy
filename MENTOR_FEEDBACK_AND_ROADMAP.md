# TRẠM HỶ (EXE201) – TỔNG HỢP GÓP Ý CỦA MENTOR & LỘ TRÌNH PHÁT TRIỂN SẢN PHẨM
*Thời gian ghi nhận: 27/09/2026 - 28/09/2026*
*Dự án: Trạm Hỷ – Nền tảng Thử Váy Cưới AR & Đặt Lịch Studio Thông Minh (EXE201 - GVHD: Đặng Trần Hiếu)*

---

## PHẦN 1: TỔNG HỢP CÁC GÓP Ý CHÍNH CỦA MENTOR (CÔ GIÁO)

### 1. Về Trải Nghiệm Thử Đồ AR (UX/UI Fitting Experience)
- **Vấn đề cô giáo chỉ ra:** Bố cục phần thử đồ AR hiện tại đang bị **rối và chiếm quá nhiều diện tích**. Người thử váy họ chỉ quan tâm lớn nhất đến **ảnh váy đã được thử trên người họ**, không muốn bị xé nhỏ sự chú ý.
- **Giải pháp Trạm Hỷ:** 
  - Chuyển sang mô hình **Studio Canvas 2 Cột (Tỉ lệ vàng 60% - 40%)**:
    - **Cột Trái (Hero Canvas 60%):** Gương thử đồ lớn toàn thân, ảnh cô dâu mặc váy to gấp đôi, rõ từng đường ren và hoa cưới; có thanh trượt so sánh Before / After trực quan.
    - **Cột Phải (Control Panel 40%):** Thu gọn phần chọn ảnh (5 avatar ảnh thật nằm ngang) và danh sách váy cưới. Bấm chạm vào váy là gương bên trái tự động chuyển đổi ngay lập tức.
  - **Menu Header cố định trên cùng (Sticky Navbar):** Tách bạch từng trang (*Trang Chủ*, *Phòng Thử Đồ AR*, *Váy Trending 2026*, *Dịch Vụ May Đo*, *Lịch Hẹn Của Tôi*), không gộp tất cả vào một trang gây ngợp.

---

### 2. Về Cơ Chế Nhập Số Đo (Chiều Cao, Cân Nặng)
- **Vấn đề cô giáo chỉ ra:** Nếu dùng AI ướm thử thì nên cho người dùng điền số đo chiều cao vào cho chuẩn xác phom dáng.
- **Giải pháp UX Thông Minh 2 Tầng (Không làm khách nản):**
  - **Tầng 1 (Khách thử đồ nhanh online):** Chỉ nhập 3 thông số cực dễ nhớ trong 5 giây:
    1. *Chiều cao (cm)* • 2. *Cân nặng (kg)* • 3. *Độ cao giày cưới (giày bệt, 5cm, 7cm, 10cm)*.
    → Hệ thống AI tự tính nhân trắc học suy ra số đo 3 vòng và Stylist AI đưa ra khuyến nghị tôn dáng (ví dụ: hack thêm 4-5cm chiều cao).
  - **Tầng 2 (Khách đặt lịch may đo / showroom):** Mở rộng form chi tiết gồm số đo 3 vòng (Ngực - Eo - Mông) và khuyết điểm muốn che (bắp tay, vai ngang, eo to).

---

### 3. Về Tích Hợp API Fashn.ai Theo "Cách Riêng Của Trạm Hỷ" (Proprietary AI)
- **Định hướng công nghệ:**
  - Không gọi API fashn.ai trần trụi (dễ bị copy), mà xây dựng quy trình 3 lớp độc quyền:
    1. **Lớp 1 (Pre-processing):** Tách nền ảnh khách, đưa vào Studio ánh sáng chuẩn 5 sao, scale tỷ lệ cơ thể theo Chiều cao/Cân nặng của khách trước khi gửi vào API.
    2. **Lớp 2 (Fashn.ai Engine):** Gọi endpoint `POST https://api.fashn.ai/v1/run` với `category: "dresses"`, `long_top: true`, `mode: "balanced"`.
    3. **Lớp 3 (Stylist Match Score):** Phân tích và xuất kèm **"Phiếu Đánh Giá Tôn Dáng" (Fit Score: 92%)** độc quyền của Trạm Hỷ.

---

### 4. Về Dịch Vụ May Đo Thiết Kế (Bespoke Bridal) & Chống "Cắt Cầu" (Disintermediation)
- **Tách 2 nhóm sản phẩm trên Web:**
  - **Nhóm 1: Váy Thuê Sẵn (Ready-to-Wear):** Giá 2.000.000đ – 6.000.000đ, sẵn tại showroom.
  - **Nhóm 2: May Đo Thiết Kế (Custom Tailored):** Giá 10.000.000đ – 30.000.000đ, cá nhân hóa họa tiết, lấy số đo riêng.
- **Quy trình May Đo kết hợp AI:**
  1. *AI Co-Design:* Khách tùy biến thiết kế trên ảnh (đổi cổ áo, tay bồng, độ dài đuôi váy).
  2. *Hồ Sơ May Đo Kỹ Thuật Số (Digital Spec Sheet):* Xuất file số đo + hình ảnh AI gửi thẳng sang xưởng may đối tác.
  3. *Bảo chứng cọc Escrow 3 chặng:* Trạm Hỷ giữ cọc, khách thử rập vải thô vừa vặn mới giải ngân cho xưởng → Đảm bảo studio không dám cắt cầu và khách hàng hoàn toàn yên tâm không bị quỵt cọc.
- **Chính sách Trạm Hỷ Care (Bảo hành bên thứ 3):**
  - Rẻ hơn tự đến tiệm 15 - 20% (voucher độc quyền).
  - Cam kết đổi váy khẩn cấp trong 2 giờ hoặc hoàn tiền 100% nếu tiệm giao váy rách/sai hẹn.

---

## PHẦN 2: TRẠNG THÁI HIỆN TẠI CỦA SOURCE CODE
- Toàn bộ mã nguồn và 13 tệp hình ảnh thực tế (5 ảnh cô dâu thật + 8 ảnh AI thử váy siêu nét) đã được **commit và push an toàn lên GitHub**:
  - **Repo:** `https://github.com/anh1vipboy/tram-hy`
  - **Branch:** `main` (Commit `f89a54a`)
- Server chạy local: `http://localhost:8080/tryon.html`
