# 🗺️ CẤU TRÚC CHỨC NĂNG & TÍNH NĂNG CHI TIẾT (SITEMAP & FEATURES) - TRẠM HỶ
> **Nền tảng bảo chứng công nghệ cưới hỏi hàng đầu Việt Nam - Phiên bản MVP 4 dịch vụ**

---

## 🎯 ĐỊNH VỊ CHIẾN LƯỢC & USP (UNIQUE SELLING POINT)
Trạm Hỷ định vị là nền tảng kết nối cô dâu chú rể với các nhà cung cấp dịch vụ cưới hỏi uy tín, giải quyết triệt để bài toán **"NIỀM TIN & RỦI RO MẤT CỌC"** mà các Wedding Directory truyền thống đang bỏ ngỏ.

* **Điểm yếu của đối thủ**: Chỉ liệt kê thông tin (Directory listing), giao dịch thanh toán diễn ra tự do bên ngoài ➔ Khách hàng dễ bị lừa đảo, Vendor dễ bị bùng tiền đợt cuối, chất lượng thực tế không như cam kết.
* **USP độc quyền của Trạm Hỷ**:
  1. **AI Budgeting**: Tự động phân rã ngân sách tổng vừa khít theo tỷ lệ thị trường.
  2. **Milestone Payment (Escrow)**: Thanh toán bảo chứng chia làm 3 đợt tiến độ (30% cọc giữ lịch ➔ 50% thi công thực tế ➔ 20% nghiệm thu sản phẩm). Tiền được giữ an toàn ở cổng trung gian trước khi giải ngân cho Vendor.

---

## 🧭 PHẦN 1: GIAO DIỆN KHÁCH HÀNG (DÂU RỂ - B2C)
*Thiết kế lãng mạn theo phong cách Pinterest nhưng luồng thao tác đơn giản, bảo mật cao như Airbnb/Shopee.*

### 1. Trang Chủ (`index.html`)
* **Hero Banner tích hợp AI**: Thanh công cụ tìm kiếm thông minh.
  * *Đầu vào*: Tổng ngân sách (VD: 150 triệu) + Địa điểm (Hà Nội) + Phong cách (Minimalism).
  * *Đầu ra (AI Budget Result)*: Phân rã tự động và đề xuất gói chi phí cho **4 dịch vụ cốt lõi** (Nhà hàng, Decor, Studio, Makeup) sao cho tổng chi phí khớp chính xác 150 triệu.
* **Top Vendors (Huy hiệu Tích Xanh)**: Trình bày lưới Grid hiển thị các đối tác uy tín cao đã được kiểm duyệt chất lượng.
* **Real Wedding Stories**: Đánh giá và câu chuyện thành công từ các cặp đôi đã hoàn thành lễ cưới qua sàn.

### 2. Chợ Dịch Vụ Cưới (`marketplace.html`)
* **MVP 4 Dịch vụ Cốt lõi**: Giao diện hiển thị trực quan 4 danh mục chính:
  1. 📸 **Studio ảnh cưới**
  2. 🎀 **Trang trí (Decor)**
  3. 👗 **Makeup & Váy cưới**
  4. 🍽️ **Nhà hàng tiệc cưới**
  *(Các dịch vụ phụ như Xe cưới, MC sẽ được dán nhãn "Coming soon" ở giai đoạn 2).*
* **Bộ lọc thông minh (Smart Filters)**: Lọc theo địa điểm, khoảng giá dự chi, xếp hạng đánh giá sao, và tùy chọn lọc nhanh "Chỉ hiện Vendor có Tích xanh".
* **Thẻ thông tin ngắn (Vendor Card)**: Ảnh bìa sắc nét, tên thương hiệu, giá khởi điểm, đánh giá sao kèm lượt review, và ký hiệu bảo chứng.

### 3. Chi Tiết Đối Tác (`detail.html`)
* **Portfolio thực tế (WYSIWYG)**: Album lưới ảnh chụp cam thường, phản ánh chân thực năng lực của đối tác (không dùng ảnh photoshop quá đà).
* **Bảng biểu phí Milestone Pay**: Thể hiện minh bạch 3 đợt thanh toán (30% - 50% - 20%) kèm nút **Đặt lịch cọc bảo chứng**.
* **Đánh giá xác thực (Verified Reviews)**: Chỉ cho phép các tài khoản có mã đặt chỗ (Booking ID) đã giao dịch thành công viết đánh giá.

### 4. Lịch Hẹn Nhà Cung Cấp (`bookings.html`)
* **Timeline tiến độ thi công**: Bản đồ hiển thị rõ nét trạng thái thực hiện (Đã cọc đợt 1 ➔ Đang thi công ➔ Đã bàn giao sản phẩm ➔ Nghiệm thu).
* **Cổng thanh toán QR động**: Tự động tạo mã QR thanh toán trung gian cho Đợt 2 và Đợt 3 phù hợp với ngân sách từng đợt của gói.
* **Nút bấm Nghiệm thu & Khiếu nại**: Khách hàng kiểm duyệt chất lượng sản phẩm trước khi quyết toán tiền đợt cuối.

### 5. Tạo Thiệp & QR (`invitation.html`)
* **Trình tạo thiệp cưới online (DIY)**: Nhập thông tin, tạo thiệp cưới tự động với nhiều template màu sắc sang trọng.
* **RSVP & Thống kê khách mời**: Form để khách mời xác nhận số lượng tham gia trực tiếp trên thiệp.
* **QR mừng cưới tự động**: Tích hợp mã VietQR động nhận tiền mừng cưới trực tiếp về tài khoản ngân hàng của cô dâu chú rể.

---

## 🏢 PHẦN 2: GIAO DIỆN NHÀ CUNG CẤP (VENDOR DASHBOARD - B2B)
*Giao diện tối giản, tập trung vào quản lý lịch trình, số liệu tài chính và bảo chứng.*

### 1. Quản Lý Tiến Độ Đơn Hàng (Kanban Board - `dashboard.html`)
* **Bảng điều phối trạng thái**:
  * *Cột 1*: **Chờ duyệt** (Đơn mới đặt chỗ).
  * *Cột 2*: **Đã nhận cọc đợt 1** (Đã khóa 30% tiền cọc bảo chứng).
  * *Cột 3*: **Đang thi công** (Vendor chụp hình hoặc dựng rạp).
  * *Cột 4*: **Chờ nghiệm thu đợt cuối** (Đã bàn giao ảnh thô/Drive).
* **Nút kích hoạt tiến độ**: Cho phép Vendor gửi thông báo "Đã thi công xong" hoặc "Yêu cầu nghiệm thu" trực tiếp tới tài khoản khách hàng.

### 2. Ví Tài Chính & Đối Soát (Milestone & Payout)
* **Thông số ví**:
  * *Tổng doanh thu*: Tổng giá trị các đơn hàng.
  * *Tạm khóa (Escrow)*: Tiền cọc đang được sàn khóa bảo vệ.
  * *Thực nhận (Payout)*: Số tiền đã được giải phóng về ví sau khi nghiệm thu (đã khấu trừ 10% phí sàn).
* **Bảng đối soát giao dịch**: Chi tiết từng khoản trừ hoa hồng của nền tảng (take-rate 10%).

---

## 👑 PHẦN 3: GIAO DIỆN QUẢN TRỊ (ADMIN TRẠM HỶ - `admin.html`)

### 1. Giám Sát Dòng Tiền & Quyết Toán Escrow
* **Ví Escrow toàn sàn**: Thống kê tổng số tiền của tất cả các cặp đôi đang được khóa tạm thời trên hệ thống.
* **Bảng lệnh giải ngân (Payout queue)**: Duyệt lệnh chuyển tiền tự động từ ví ký quỹ về tài khoản ngân hàng của Vendor khi cặp đôi bấm "Nghiệm thu thành công".

### 2. Trọng Tài Tranh Chấp & Duyệt Tích Xanh
* **Duyệt Tích Xanh**: Xem hồ sơ đăng ký của Vendor, so sánh hình ảnh thực tế thi công với ảnh mẫu quảng cáo trước khi quyết định cấp huy hiệu Tích xanh.
* **Cơ chế Trọng tài (Dispute Center)**: Xử lý các khiếu nại phát sinh nếu cặp đôi bấm "Không nghiệm thu" do sản phẩm lỗi hoặc Vendor chậm tiến độ.
