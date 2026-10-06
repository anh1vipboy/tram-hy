# 💍 TRẠM HỶ – WEDDING TECH PLATFORM
> Thử váy cưới AI, may đo theo thiết kế & giữ cọc an toàn 3 chặng (Escrow)
> *Group 5 – Lớp SE1936-NET · Dự án EXE101 / EXE201 / EXE202*
> *GVHD: Cô Đoàn Thị Thanh Hương · Thầy Đặng Trần Hiếu · Mentor: Cô Bùi Mai Phương*
> *GitHub:* [anh1vipboy/tram-hy](https://github.com/anh1vipboy/tram-hy)

## Chạy web

```powershell
powershell -ExecutionPolicy Bypass -File .\start_server.ps1
```
Mở **http://localhost:8080**

Web dùng **Supabase** làm backend (database, đăng nhập, lưu ảnh, realtime). Hướng dẫn cài đặt database, tạo tài khoản admin/đối tác và kịch bản kiểm thử: xem **[TAI_LIEU_PHAT_TRIEN.md](TAI_LIEU_PHAT_TRIEN.md)**.

## Cấu trúc

| Thư mục | Nội dung |
|---|---|
| [frontend/](frontend/) | Web: HTML + CSS + JavaScript (ES modules, không cần build) |
| [backend/supabase/](backend/supabase/) | SQL tạo bảng, phân quyền, nghiệp vụ Escrow, dữ liệu mẫu |
| [docs/](docs/) | Báo cáo, kịch bản demo, góp ý mentor |
| [legacy/](legacy/) | Bản demo cũ (localStorage) – chỉ để đối chiếu |

## Tính năng

| Trang | Chức năng |
|---|---|
| Trang chủ | Mẫu váy nổi bật, chia ngân sách cưới (tỷ lệ cố định hoặc AI tư vấn), đối tác uy tín |
| Thử váy AI | Chọn người mẫu / tải ảnh, số đo, điểm tôn dáng, thuê sẵn hoặc tự thiết kế may đo |
| Dịch vụ cưới | 31 đối tác: váy cưới, chụp ảnh, trang trí, trang điểm, nhà hàng – lọc, tìm, sắp xếp |
| Chi tiết đối tác | Mẫu váy, bảng thanh toán 3 đợt, đánh giá xác thực |
| Đơn của tôi | Trả cọc qua VietQR, nghiệm thu từng đợt, yêu cầu hoàn cọc, đánh giá |
| Thiệp cưới | Soạn thiệp, link gửi khách, RSVP, QR mừng cưới |
| Kênh đối tác | Kanban đơn hàng realtime, báo tiến độ, báo khách không đến |
| Quản trị | Dòng tiền Escrow, phân xử khiếu nại, cấp Tích Xanh, gắn chủ tiệm |

## Tài liệu dự án
- [Tài liệu toàn diện & định hướng phát triển](docs/DU_AN_TRAM_HY_VA_DINH_HUONG_PHAT_TRIEN.md)
- [Góp ý mentor & lộ trình](docs/MENTOR_FEEDBACK_AND_ROADMAP.md)
- [Sitemap & tính năng](docs/Sitemap_Features.md)
- **[Kịch bản review (bản chạy thật)](docs/KICH_BAN_REVIEW.md)**
- [Kịch bản demo bản prototype cũ](docs/Kich_Ban_Demo.md)

---
*© 2026 Trạm Hỷ – Kết duyên cát hỷ, trọn vẹn niềm tin.*
