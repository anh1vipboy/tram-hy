# Nhật Ký Cập Nhật Hệ Thống Trạm Hỷ (System Changelog)

Tài liệu này ghi nhận toàn bộ các cập nhật tính năng, điều chỉnh giao diện, thống kê nghiệp vụ và các thao tác bảo trì dữ liệu theo yêu cầu.

---

## 1. Phiên làm việc: Ngày 05/11/2026

### A. Giao diện Admin Dashboard & Thống kê Người dùng Đạt chuẩn (Qualified Users)
1. **Bổ sung Thẻ KPI chuyên biệt:**
   - **Tên chỉ số:** `User Đạt chuẩn (≥ 10 phút)`: Hiển thị tỷ lệ `159/276 users` (`57,6%`).
   - Tích hợp nhãn trạng thái trực quan, bộ lọc nhanh (`Tất cả`, `Đạt chuẩn ≥ 10p`, `Dưới 10p`).
   - Bổ sung nút bấm mở popup chi tiết danh sách tài khoản đạt chuẩn, thời gian sử dụng, số phiên truy cập chuẩn học phần.
2. **Tối ưu hiển thị Responsive & Mobile 390px:**
   - Điều chỉnh font size số liệu tiền tệ với hàm `clamp(16px, 4.3vw, 20px)` và `overflow-wrap: anywhere` trong `frontend/css/styles.css`.
   - Đảm bảo thẻ `.stat` không gây tràn ngang khung hình trên màn hình di động (đạt 100% kiểm thử Playwright tự động).

### B. Dọn dẹp Cấu hình Proxy CLI (RevidAPI)
- Đã gỡ bỏ toàn bộ các biến môi trường cấu hình proxy của bên thứ ba trong Windows Registry:
  - `ANTHROPIC_AUTH_TOKEN`
  - `ANTHROPIC_DEFAULT_OPUS_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL`
  - `CLAUDE_CODE_*`, `REVIDAPI_KEY`
- Trả CLI `claude` về trạng thái nguyên bản để người dùng đăng nhập tài khoản chính chủ qua trình duyệt.

### C. Quản trị Dữ liệu Supabase & Đơn hàng Booking Test
- **Đơn mục tiêu:** `BK261026-2BB72` (Khách hàng: Nguyễn Hữu Bảo Khánh - `+84961411118`, Tiệm: Váy cưới Đức Anh, Gói: Váy cưới công chúa, Giá trị: 8.500.000đ).
- **Cơ chế xóa an toàn:** Sử dụng Transaction `BEGIN ... COMMIT` để xử lý tuần tự các bản ghi phụ thuộc ràng buộc khóa ngoại (Foreign Keys):
  - Bảng `public.disputes` (Khiếu nại)
  - Bảng `public.reviews` (Đánh giá)
  - Bảng `public.milestones` (Các chặng thanh toán Escrow 1, 2, 3)
  - Bảng `public.bookings` (Đơn đặt lịch)

### D. Đồng bộ Dữ liệu Báo cáo Tài chính (Slide XIII. Financial & Outcome Report)
- **Tổng giao dịch (GMV 100%):** 22.800.000đ (4/6 đơn hiệu lực).
- **Hoa hồng sàn dự kiến (10%):** 2.280.000đ.
- **Hoa hồng sàn thực thu (10%):** 1.385.000đ (từ 13.850.000đ giải ngân).
- **Đã chi trả Đối tác (90%):** 12.465.000đ (2 đơn hoàn tất).
- **Đang giữ hộ Escrow:** 0đ.
- **Doanh thu gói cước AI Studio:** 6.360.000đ (40 đơn đã kích hoạt trên tổng 42 đơn đăng ký).
- **KPI Người dùng:** 218 users (109% chỉ tiêu), 2.380 lượt visits, 5/5 chỉ số chuẩn web.
- **Thời gian sử dụng thực:** 176.6 giờ (10.598 phút), 1.293 phiên truy cập, 159/276 tài khoản đạt chuẩn (57,6%).

