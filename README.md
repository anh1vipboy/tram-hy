# 💍 TRẠM HỶ (WEDDING TECH PLATFORM)
> **Nền Tảng Thử Váy Cưới Công Nghệ AR, May Đo Thiết Kế AI & Bảo Chứng Cọc 2 Chiều Hàng Đầu Việt Nam**  
> *Đơn vị phát triển: Group 5 – Lớp SE1936-NET (Dự án Khởi nghiệp EXE101 / EXE201 / EXE202)*  
> *Giảng viên hướng dẫn: Cô Đoàn Thị Thanh Hương | Thầy Đặng Trần Hiếu*  
> *Mentor: Cô Bùi Mai Phương*  
> *Kho lưu trữ GitHub:* [https://github.com/anh1vipboy/tram-hy](https://github.com/anh1vipboy/tram-hy)

---

## 📌 LIÊN KẾT TÀI LIỆU CHI TIẾT
* 📘 **Tài liệu toàn diện & Định hướng phát triển chiến lược:** [DU_AN_TRAM_HY_VA_DINH_HUONG_PHAT_TRIEN.md](DU_AN_TRAM_HY_VA_DINH_HUONG_PHAT_TRIEN.md)
* 🗺️ **Cấu trúc chức năng & Sitemap:** [Sitemap_Features.md](Sitemap_Features.md)
* 🎬 **Kịch bản Demo luồng chạy 4 bước:** [Kich_Ban_Demo.md](Kich_Ban_Demo.md)
* 👩‍🏫 **Tổng hợp góp ý của Mentor & Lộ trình:** [MENTOR_FEEDBACK_AND_ROADMAP.md](MENTOR_FEEDBACK_AND_ROADMAP.md)

---

## 🌟 GIỚI THIỆU TỔNG QUAN

**Trạm Hỷ** là nền tảng số hóa hệ sinh thái cưới hỏi toàn diện (*One-Stop Wedding Tech Marketplace*) tiên phong tại Việt Nam, giải quyết triệt để bài toán **"Bất đối xứng thông tin – Thử váy tốn sức – Rủi ro mất cọc"** của ngành cưới truyền thống.

### 🎯 3 Trụ Cột Đột Phá Của Trạm Hỷ
1. **AI Virtual Try-On Studio (Tỉ Lệ Vàng 60/40):**  
   - Gương soi toàn thân AR (*Hero Canvas 60%*) với thanh trượt so sánh Before/After, chuyển đổi 3 bối cảnh ánh sáng thực tế.
   - Cơ chế **Sticky Canvas thông minh**: Gương soi tự động trượt chạy theo màn hình khi cô dâu cuộn trang xuống chọn chi tiết và **dừng lại chuẩn xác ngay tại mép dưới của Thẻ đặt cọc Chặng 3**.
   - Thuật toán **AI Fit Score (94% - 98%)** ước lượng số đo 3 vòng từ Chiều cao, Cân nặng, Dáng người và tư vấn nhân trắc học tôn dáng.
2. **May Đo Váy Kết Hợp Thiết Kế AI (Bespoke 3-in-1 Studio):**  
   - **Prompt-to-Dress GenAI:** Nhập mô tả ý tưởng chiếc váy trong mơ (hoặc 4 chip gợi ý 1 chạm), AI quét laser và ướm trực tiếp lên cơ thể cô dâu trên gương AR.
   - **Image-to-Dress:** Bóc tách thông số kỹ thuật rập từ ảnh mạng Pinterest/Instagram với độ khả thi xưởng may đạt 98%.
   - **Atelier Builder:** Tự chọn kiểu cổ, tay áo, chất liệu lụa Mikado / ren Chantilly, độ dài đuôi váy, đính pha lê Swarovski và thêu tên/ngày cưới (Monogram).
   - Tự động xuất **Hồ Sơ May Đo Kỹ Thuật Số (Digital Spec Sheet)** có **mã QR niêm phong** đối soát chống sai lệch tại xưởng may.
3. **Bảo Chứng Cọc 2 Chiều (Bi-Directional Escrow Milestone):**  
   - Bảo vệ Cô Dâu (B2C): Khóa cọc an toàn, nghiệm thu từng chặng mới mở tiền; hoàn cọc 100% trong 2h nếu tiệm vi phạm cam kết.
   - Bảo vệ Studio (B2B): Đền bù 100% cọc nếu khách bùng kèo sát giờ (No-show).
   - Tiến độ giải ngân 3 chặng: Chặng 1 Duyệt 3D (30%) ➔ Chặng 2 Thử rập Toile (40%) ➔ Chặng 3 Nghiệm thu hoàn thiện (30%).

---

## 🗺️ BẢN ĐỒ CÁC TRANG CHỨC NĂNG

| Trang | Tệp Nguồn | Chức Năng Chính |
| :--- | :--- | :--- |
| **Trang Chủ** | [`index.html`](index.html) | Công cụ AI Budgeting Calculator, USP Canvas, Bộ sưu tập váy xu hướng, Câu chuyện thực tế |
| **Phòng Thử Váy AR** | [`tryon.html`](tryon.html) | Gương soi Sticky Canvas 60/40, May đo kết hợp thiết kế 3-in-1, Booking Modal |
| **Sàn Dịch Vụ Cưới** | [`marketplace.html`](marketplace.html) | Sàn 4 dịch vụ cốt lõi (Studio, Decor, Makeup & Váy, Nhà hàng), Bộ lọc Tích Xanh |
| **Chi Tiết Đối Tác** | [`detail.html`](detail.html) | Portfolio thực tế WYSIWYG, Bảng biểu phí Milestone Escrow, Đánh giá xác thực |
| **Lịch Hẹn & Escrow** | [`bookings.html`](bookings.html) | Quản lý song phương B2C (Cô dâu) & B2B (Studio), Timeline tiến độ 3 chặng, Trọng tài khiếu nại |
| **Tạo Thiệp & QR** | [`invitation.html`](invitation.html) | Trình tạo thiệp cưới online DIY, RSVP kiểm đếm khách cỗ, VietQR mừng cưới động |
| **Quản Lý Vendor** | [`dashboard.html`](dashboard.html) | Kanban Board quản lý đơn tiệc, ví tài chính ký quỹ, đối soát rút tiền Payout |
| **Quản Trị Hệ Thống** | [`admin.html`](admin.html) | Quản trị dòng tiền Escrow toàn sàn, thẩm định cấp Tích Xanh, giải quyết tranh chấp |

---

## 🚀 LỘ TRÌNH PHÁT TRIỂN CHIẾN LƯỢC (ROADMAP)

* **Giai đoạn 1 (Q3 - Q4/2026):** Hoàn thiện MVP, thẩm định & liên kết 50 Studio Tích Xanh tại Hà Nội.
* **Giai đoạn 2 (Q1 - Q2/2027):** Tích hợp chính thức Google Gemini 2.0 REST API sinh ảnh 3D tự động, kết nối tài khoản ảo Fintech Escrow (Virtual Account) và ra mắt Mobile App (Flutter).
* **Giai đoạn 3 (Q3/2027 - Q2/2028):** Mở rộng thị trường TP.HCM & Đà Nẵng, ra mắt sản phẩm phần cứng **Gương Thông Minh Trạm Hỷ (Smart Magic Mirror)** tại các Showroom đối tác, mở rộng 4 dịch vụ phụ (Xe cưới, MC, Trang sức, Trăng mật).
* **Giai đoạn 4 (Q3/2028 - 2029):** Trợ lý **Agentic AI Wedding Planner** tự động hóa trọn gói ngày cưới và nghiên cứu mở rộng thị trường Đông Nam Á (Thái Lan, Indonesia).

---

## 💻 HƯỚNG DẪN CHẠY DEMO LOCALHOST

```powershell
# Cách 1: Chạy script máy chủ có sẵn trong thư mục
powershell -ExecutionPolicy Bypass -File .\start_server.ps1

# Cách 2: Chạy máy chủ tĩnh Python
python -m http.server 8080
```

Truy cập trên trình duyệt: 👉 **[http://localhost:8080/index.html](http://localhost:8080/index.html)**

---
*© 2026 Trạm Hỷ Platform – Kết duyên cát hỷ, trọn vẹn niềm tin.*
