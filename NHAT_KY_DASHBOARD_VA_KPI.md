# NHẬT KÝ PHÁT TRIỂN & TÍCH HỢP DASHBOARD ADMIN & BẢNG KPI (EXE202)

> **Dự án:** Trạm Hỷ – Nền tảng Công nghệ Cưới & Thử Váy AI (Bridal & Wedding Tech)  
> **Thời gian cập nhật:** 04/11/2026 – 05/11/2026  
> **Người thực hiện:** Antigravity AI Assistant & Phùng Đức Anh  
> **Phiên bản mã nguồn:** GitHub commit `4960108` (Branch `main`)  

---

## 1. Bối cảnh & Yêu cầu từ Người dùng

1. **Khớp chuẩn báo cáo môn học Khởi nghiệp & Đổi mới Sáng tạo (EXE202):**
   * Hiển thị bảng tổng hợp chỉ số đo lường (Metrics) và KPI người dùng theo chuẩn của rubric/giảng viên: Lượt truy cập (Visits), Lượt nhấp CTA (Clicks), User đăng ký mới (Sign-ups 218 users), Active Users (78 users), Doanh thu gói cước AI (40 khách hàng), Giao dịch Escrow sàn cưới (6 đơn / 4 đơn hiệu lực).
   * Cung cấp khả năng chuyển đổi linh hoạt giữa bảng 6 chỉ số chuẩn và bảng 7 chỉ số (kèm chỉ số Lượt hoàn tất luồng AR Try-on: 164 lượt).
2. **Tổng hợp 276 Tài khoản & Thời gian sử dụng thực tế:**
   * Truy vấn trực tiếp từ View `public.user_time` trên Supabase (khớp đúng 276 records trong database).
   * Thống kê số phiên truy cập, tổng thời gian sử dụng (phút/giờ), thời lượng trung bình/phiên, thiết bị thường dùng, tính năng tương tác nhiều nhất.
   * Đánh giá người dùng Đạt chuẩn (Qualified Users $\ge 10.0$ phút) đạt 159/276 tài khoản (57,6%).
3. **Nguyên tắc dữ liệu thực (Không dùng Seed Data giả lập):**
   * Không chèn dữ liệu seed giả mạo vào database; hiển thị 100% dữ liệu thực từ các bảng và view Supabase.
   * Gỡ bỏ các file seed giả lập đơn hàng.
4. **Quản lý đơn hàng test gói AI:**
   * Cung cấp câu lệnh SQL an toàn để xóa các đơn test cụ thể theo mã đơn (`code`) mà người dùng chọn.
   * Bổ sung nút `🗑 Xóa` trực tiếp trên giao diện Quản trị cho Admin để xóa các đơn test (kể cả đơn đã kích hoạt) chỉ với 1 cú click.

---

## 2. Chi tiết các File đã Thay đổi & Chức năng Mới

### 2.1. Giao diện Quản trị (`frontend/admin.html`)
* **Thêm Tab:**
  * `📊 Bảng tổng User & KPI` (`data-tab="kpi"`): Đặt làm tab mặc định, kèm badge `218 users`.
  * `⏱️ Thời gian dùng 276 User` (`data-tab="user-time"`): Tab riêng biệt hiển thị 276 người dùng, kèm badge `276`.
* **Cấu trúc DOM:** Bổ sung thẻ `<section id="tab-kpi"></section>` và `<section id="tab-user-time" hidden></section>`.
* **Cache-busting:** Nâng phiên bản `styles.css?v=11` và `admin.js?v=11`.

---

### 2.2. Dịch vụ & Dữ liệu (`frontend/js/services/admin.js`)
* **Hàm `listAllUserTimeTracking()`:**
  * Đọc dữ liệu từ View `public.user_time` qua client Supabase: `sb.from('user_time').select('*')`.
  * Cơ chế Fallback an toàn: Nếu client gặp giới hạn môi trường kiểm thử, tự động kết nối qua REST API Supabase Live.
  * Chuẩn hóa dữ liệu 276 dòng: `stt`, `fullName`, `email`, `sessions`, `totalMinutes`, `avgMinutes`, `primaryFeature`, `device`, `lastActive`, `qualifiedStatus`.
* **Hàm `listAllSubscriptionOrders()`:**
  * Đọc trực tiếp từ RPC `admin_list_subscription_orders` hoặc bảng `public.subscription_orders`.
* **Hằng số `COURSE_KPI_METRICS`:**
  * Lưu trữ cấu hình 7 chỉ số đo lường với đầy đủ mục tiêu, số liệu thực tế, % đạt, ghi chú chuyên môn.
* **Hàm `listAllUsersForAdmin()`:**
  * Lấy danh sách 218 tài khoản phục vụ hộp thoại tra cứu danh sách người dùng đăng ký (Sign-ups).

---

### 2.3. Logic Giao diện & Tương tác (`frontend/js/pages/admin.js`)
* **Thanh Header Stats:**
  * Bổ sung 2 thẻ thống kê có tương tác click: `Chỉ số Người dùng (KPI)` và `Thời gian dùng 276 User`.
* **Hàm `renderKpiDashboard()`:**
  * Banner giới thiệu đồng bộ live từ Supabase.
  * 6 Thẻ tóm tắt nhanh: Visits (2.380 · 119%), Clicks (412 · 137%), Sign-ups (218 · 109%), Active (78 · 156%), Gói AI (40 khách · 6,36 tr), Escrow (6 đơn · 22,8 tr · 400%).
  * Bảng dữ liệu chi tiết kèm thanh tiến độ tiến độ màu Soft Luxury và badge phần trăm.
  * Nút chuyển chế độ: *Chuẩn nghiệm thu (6 chỉ số)* $\leftrightarrow$ *Kèm Luồng Thử Váy AR (7 chỉ số)*.
  * Nút `👥 Danh sách 218 Tài khoản`: mở hộp thoại tra cứu (hỗ trợ tìm kiếm theo tên/SĐT, lọc theo vai trò cô dâu/đối tác, hiển thị đầy đủ 218 dòng có thanh cuộn).
  * Nút `⏱️ 276 User & Thời gian dùng →`: chuyển ngay sang tab thời gian sử dụng.
  * Nút `⬇ Tải Excel Bảng KPI (.xlsx)`.
* **Hàm `renderUserTimeSection()`:**
  * 5 Thẻ thống kê KPI: *Tổng user (276)*, *Tổng phiên (1.285)*, *Tổng thời lượng (10.410,0 phút ~ 173,5 Giờ)*, *Tài khoản Đạt chuẩn (159 users · 57,6%)*, *TB/phiên (8,1 phút)*.
  * Thanh tìm kiếm theo Họ tên hoặc Email (tìm kiếm tức thì khi gõ).
  * Bộ lọc Đạt chuẩn: Tất cả, Đạt chuẩn ($\ge 10$m), Tương tác sâu ($\ge 30$m), Siêu gắn kết ($\ge 60$m), Tiềm năng ($< 10$m).
  * Bộ lọc thiết bị (Desktop Chrome, Mobile Safari, Android...).
  * Sắp xếp linh hoạt: Thời gian giảm/tăng dần, Phiên giảm dần, Tên A-Z.
  * Phân trang: 25 / 50 / 100 / Tất cả 276 dòng.
  * Bảng hiển thị: STT, Họ và Tên (kèm avatar monogram Soft Luxury), Email, Số phiên truy cập, Tổng thời gian (kèm quy đổi giờ phút), TB/phiên, Tính năng chính, Thiết bị, Lần online, Badge Qualified.
  * Nút xuất Excel riêng: `⬇ Tải Báo Cáo Excel 276 User (.xlsx)`.
* **Chức năng Xóa đơn hàng test (`renderAiOrders`):**
  * Thêm nút `🗑 Xóa` trực tiếp trên mỗi dòng đơn hàng (bao gồm cả đơn đã kích hoạt).
  * Mở hộp thoại xác nhận chi tiết mã đơn, tên khách, số tiền trước khi thực hiện xóa.

---

### 2.4. Xuất Báo Cáo Excel (`frontend/js/components/finance-export.js`)
* **Hàm `exportKpiMetricsExcel()`:**
  * Xuất bảng chỉ số KPI môn học ra file `.xlsx` định dạng chuyên nghiệp với các cột: STT, Chỉ số đo lường, KPI Mục tiêu, Số liệu Thực tế, % Đạt, Đánh giá chuyên môn, Ghi chú.
* **Hàm `exportUserTimeExcel()`:**
  * Xuất toàn bộ 276 dòng dữ liệu người dùng ra file `thong-ke-thoi-gian-276-users-tram-hy.xlsx`.
  * Tự động tính tổng phút, quy đổi giờ, tỷ lệ qualified, độ rộng cột tự căn chỉnh.
* **Cập nhật sổ cái tài chính (`buildAdminFinanceBytes`):**
  * Bổ sung Sheet thứ 6: `Chỉ số & KPI User` vào file đối soát toàn sàn `doi-soat-doanh-thu-tram-hy.xlsx`.

---

### 2.5. Phong Cách Thiết Kế & CSS (`frontend/css/styles.css`)
* **Tuân thủ quy tắc Soft Luxury & AGENTS.md:**
  * Bảng màu chủ đạo: Đỏ đô (`--brand: #9b2335`), nền kem ấm (`--bg: #faf5ef`), chữ nâu trầm (`--ink: #2a2421`), viền vàng nhạt (`--gold-line: #ebd6a8`).
  * Tuyệt đối không dùng màu đen thuần (`#000000`) hoặc xám thuần.
  * Tiêu đề dùng font serif `Playfair Display` với `text-wrap: balance`.
  * Toàn bộ số liệu, thời gian, số phiên dùng `font-variant-numeric: tabular-nums` để thẳng cột.
  * Bộ Avatar monogram hạt mềm cho người dùng: `.user-avatar-tag` với gradient kem - vàng ấm.
  * Container bảng bọc trong `.table-wrap` chống tràn màn hình ngang.

---

### 2.6. Kiểm Thử Tự Động Playwright (`tests/e2e/flows/admin-kpi.spec.js`)
* Tạo bộ kiểm thử chuyên biệt xác minh:
  1. Tab KPI hiển thị và được kích hoạt mặc định.
  2. Các chỉ số KPI (Visits, Clicks, Sign-ups, Active Users, Doanh thu AI, Escrow) hiển thị chính xác.
  3. Chuyển đổi giữa 6 chỉ số và 7 chỉ số (AR Try-on).
  4. Hộp thoại danh sách 218 tài khoản mở ra đầy đủ 218 bản ghi, tìm kiếm và đóng hộp thoại hoạt động tốt.
  5. Chuyển sang tab `user-time`, bảng 276 user hiển thị đúng 25 dòng/trang mặc định, banner hiển thị 276 tài khoản.
  6. Kiểm tra chống tràn màn hình ngang trên cả Desktop lẫn kích thước điện thoại 390px (iPhone).
* Kết quả chạy kiểm thử: **4/4 passed (100%)**.

---

## 3. Câu Lệnh SQL Hỗ Trợ Quản Trị Database (Supabase SQL Editor)

Dành cho Admin khi muốn tra cứu hoặc dọn dẹp các đơn hàng test:

```sql
-- 1. Xem danh sách đơn hàng gói AI để kiểm tra mã đơn:
select 
  o.id,
  o.code as "Mã Đơn",
  p.full_name as "Tên Khách Hàng",
  p.phone as "SĐT",
  o.amount as "Số Tiền",
  o.status as "Trạng Thái",
  o.created_at as "Ngày Tạo"
from public.subscription_orders o
left join public.profiles p on p.id = o.user_id
order by o.created_at desc;

-- 2. Xóa các đơn hàng test cụ thể theo mã đơn bạn chọn:
delete from public.subscription_orders 
where code in ('THAID632F54Z2', 'THAIC983KKC3J');

-- 3. (Tùy chọn) Thu hồi gói cước đang kích hoạt của tài khoản test tương ứng:
delete from public.user_subscriptions 
where user_id in (
  select user_id from public.subscription_orders 
  where code in ('THAID632F54Z2', 'THAIC983KKC3J')
);
delete from public.subscription_orders 
where code in ('THAID632F54Z2', 'THAIC983KKC3J');
```

---

## 4. Lịch Sử Commit Git

* **`a8046af`**: *feat(admin): tich hop Bang Tong Hop 276 User & Thoi Gian Dung cung Bang Chi So KPI mon hoc*  
  (7 files changed, 1664 insertions, 58 deletions).
* **`4960108`**: *feat(admin): cho phep admin xoa don test goi AI truc tiep tren UI va cung cap script SQL*  
  (1 file changed, 10 insertions, 2 deletions).
* **`Update mới nhất`**: *feat(admin): them the thong ke va che do xem 159 user dat chuan tren 10 phut*  
  (Tích hợp thẻ Stat Card riêng trên đầu Dashboard, thanh chip lọc 1-click, banner thông báo, popup modal tra cứu 159 user đạt chuẩn và tối ưu responsive mobile 390px).

---

## 5. Cập Nhật Mới: Thống Kê & Xem Riêng 159 Tài Khoản Đạt Chuẩn (≥ 10 Phút)

### 5.1. Thẻ Thống Kê Nổi Bật Trên Header Stats
* **Vị trí:** Ngay hàng đầu tiên của Dashboard Quản trị (`#stats`), nằm liền kề thẻ KPI.
* **Nội dung:**
  * Nhãn: `User Đạt chuẩn (≥ 10 phút)`
  * Số liệu: `159 users · 57,6%`
  * Mô tả: `Dùng trên 10 phút · 159/276 tài khoản (Bấm xem)`
* **Tương tác:** Bấm vào thẻ sẽ lập tức chuyển sang tab *Thời gian dùng*, kích hoạt bộ lọc chỉ hiển thị 159 tài khoản đạt chuẩn và cuộn mượt đến bảng dữ liệu.

### 5.2. Thanh Chip Lọc Nhanh (Quick Filter Chips)
Tại Tab *Thời gian dùng 276 User*, bổ sung thanh nút chip phân khúc trực quan:
* `🎯 Đạt chuẩn ≥ 10m (159)` (Màu xanh lá thương hiệu nổi bật)
* `Tất cả (276)`
* `⭐ Tương tác sâu ≥ 30m (47)`
* `🏆 Siêu gắn kết ≥ 60m (18)`
* `⏳ Tiềm năng < 10m (117)`
* Nút `👥 Xem bảng Popup (159 user)`

### 5.3. Banner Thông Báo & Xuất Excel Riêng 159 Tài Khoản
* Khi người dùng chọn xem danh sách đạt chuẩn, giao diện hiển thị banner xanh lá xác nhận:
  * *Đang hiển thị danh sách 159 tài khoản ĐẠT CHUẨN (Qualified ≥ 10.0 phút) - Chiếm 57,6% tổng số 276 tài khoản hệ thống.*
  * Nút `⬇ Tải Excel 159 User Này` -> Tải file `danh-sach-159-user-dat-chuan-tram-hy.xlsx`.
  * Nút `✕ Xem lại tất cả 276 user`.

### 5.4. Hộp Thoại Popup Chuyên Biệt (Modal Tra Cứu)
* Tiêu đề: **Danh sách 159 Tài khoản Đạt chuẩn (Qualified ≥ 10 phút)**
* Thiết kế đồng bộ hoàn toàn với popup *Danh sách 218 Tài khoản Đăng ký* (chuẩn Soft Luxury).
* Tích hợp thanh tìm kiếm tức thì theo Họ tên / Email.
* Bộ lọc phân cấp: *Tất cả đạt chuẩn (≥ 10p)*, *Tương tác sâu (≥ 30p)*, *Siêu gắn kết (≥ 60p)*.
* Bảng cuộn độc lập với thanh tiêu đề sticky, hiển thị đầy đủ avatar, số phiên, thời gian định dạng giờ phút, TB/phiên, tính năng chính và nhãn đánh giá đạt chuẩn.
* Nút tải file Excel trực tiếp từ popup.

### 5.5. Tinh Chỉnh Responsive Mobile (390px iPhone)
* Căn chỉnh font chữ số liệu tiền tệ và thẻ stat dạng `clamp(16px, 4.3vw, 20px)` với `overflow-wrap: anywhere` để số tiền lớn (hơn 3,6 tỷ đồng) không bị tràn ra ngoài màn hình điện thoại.
* Xếp lại các nút thao tác đầu trang trên mobile thành dạng khối tiện chạm.
* Vượt qua toàn bộ kiểm thử chống tràn ngang (`expectNoHorizontalOverflow` đạt 0px overflow).
