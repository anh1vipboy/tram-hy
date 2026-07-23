# 📖 KỊCH BẢN DEMO NỀN TẢNG CƯỚI BẢO CHỨNG - TRẠM HỶ

> **Tài liệu hướng dẫn trình diễn tính năng (Milestone Pay & Admin Escrow)**
> Dành cho buổi báo cáo dự án EXE101

---

## 🧭 TỔNG QUAN HỆ SINH THÁI DEMO (7 TRANG)

Hệ thống demo được tích hợp thanh điều hướng nhanh **Demo Controller** (nằm ở góc dưới bên phải) để bạn chuyển đổi vai trò dễ dàng:

1. **Trang chủ B2C (`index.html`)**: Bộ lọc ngân sách AI & Chọn danh mục dịch vụ.
2. **Chợ dịch vụ (`marketplace.html`)**: Nơi tìm kiếm đối tác có huy hiệu bảo chứng Tích Xanh.
3. **Chi tiết & Đặt cọc (`detail.html`)**: Xem hồ sơ đối tác, biểu phí và cọc giữ chỗ Đợt 1 (30%).
4. **Lịch hẹn B2C (`bookings.html`)**: Trình quản lý tiến độ 3 đợt cọc và thực hiện chuyển khoản QR.
5. **Kênh B2B Vendor (`dashboard.html`)**: Kanban quản lý tiến trình thi công và ví doanh thu của đối tác.
6. **Tạo thiệp & QR (`invitation.html`)**: Công cụ tự phục vụ tạo thiệp cưới online và QR mừng cưới tự động.
7. **Quản trị Admin (`admin.html`)**: Cổng kiểm soát dòng tiền ký quỹ Escrow toàn sàn và duyệt tích xanh đối tác.

---

## 🎭 CÁC VAI DIỄN TRONG BUỔI DEMO

Để đạt hiệu quả thuyết phục cao nhất, bạn nên demo theo luồng câu chuyện đi từ **Khách hàng** -> **Đối tác cung cấp** -> **Sàn giao dịch (Admin)**.

---

## 🎬 KỊCH BẢN CHI TIẾT (STEP-BY-STEP)

### PHẦN 1: HÀNH TRÌNH CẶP ĐÔI (B2C) - BẢO VỆ NIỀM TIN

* **Mục tiêu**: Demo khả năng tối ưu chi phí bằng AI và thiết lập bảo chứng tài chính ngay từ bước đặt lịch.

| Bước      | Hành động trên giao diện                                                                                                                                        | Lời thoại thuyết trình (Gợi ý)                                                                                                                                                                                          |
| :---------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | Mở**[1. Trang chủ B2C](index.html)**.Nhập ngân sách ví dụ: `100.000.000đ` -> Nhấn **Phân bổ ngân sách AI**.                                | *"Trạm Hỷ giúp các cặp đôi giải quyết bài toán tài chính bằng bộ lọc phân bổ ngân sách AI tối ưu theo thực tế thị trường Việt Nam (Nhà hàng 50%, Decor 20%, Studio 18%, Makeup 12%)."*        |
| **2** | Nhấp vào danh mục**Chụp ảnh (Studio)** để chuyển sang **[2. Chợ dịch vụ](marketplace.html)**.                                                  | *"Tại chợ dịch vụ, các đối tác được đánh giá tín nhiệm minh bạch. Đặc biệt, những nhà cung cấp uy tín sẽ được gắn huy hiệu **Tích Xanh Bảo Chứng** chứng nhận bởi Trạm Hỷ."*    |
| **3** | Chọn đối tác**TuArt Wedding** để mở trang **[3. Chi tiết đối tác](detail.html)**.                                                              | *"Hãy cùng xem hồ sơ của TuArt Wedding. Tại đây, khách hàng có thể lựa chọn gói dịch vụ và xem chi tiết biểu phí Milestone Pay đóng tiền theo 3 đợt tiến độ rõ ràng."*                       |
| **4** | Nhấp**Đặt cọc bảo chứng** -> Bấm **Giả lập quét QR** thanh toán Đợt 1 (30% - `3.750.000đ`). Bấm xác nhận chuyển khoản thành công. | *"Thay vì phải trả thẳng 100% rủi ro, cặp đôi chỉ cần cọc giữ chỗ Đợt 1 (30%). Khoản tiền này được chuyển vào **Ví ký quỹ bảo chứng Escrow** của sàn, cam kết giữ chỗ chắc chắn."* |
| **5** | Chuyển sang trang**[4. Lịch hẹn B2C](bookings.html)**.                                                                                                       | *"Tại trang quản lý lịch hẹn cá nhân, khách hàng có thể giám sát dòng thời gian tiến độ thi công của TuArt. Hiện tại Đợt 1 đã có tích xanh hoàn thành."*                                      |

---

### PHẦN 2: KÊNH ĐỐI TÁC (B2B VENDOR) - TỐI ƯU QUẢN LÝ

* **Mục tiêu**: Demo công cụ quản lý dự án hiệu quả cho nhà cung cấp và cách họ kích hoạt đợt thanh toán tiếp theo.

| Bước      | Hành động trên giao diện                                                                                                         | Lời thoại thuyết trình (Gợi ý)                                                                                                                                                       |
| :---------- | :------------------------------------------------------------------------------------------------------------------------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **6** | Chuyển sang**[5. Kênh B2B Vendor](dashboard.html)** (Bạn có thể mở tab ẩn danh riêng để demo song song).               | *"Phía đối tác TuArt Wedding sẽ có một Dashboard quản lý dự án chuyên nghiệp dạng Kanban để bám sát lịch trình thi công."*                                          |
| **7** | Quan sát thẻ đơn hàng của khách hàng**Nguyễn Minh Quân** đang nằm ở cột **Chuẩn bị (Đã cọc đợt 1)**. | *"Vendor thấy ngay số tiền cọc đợt 1 đã được ghi nhận trong ví bảo chứng tạm khóa của sàn, hoàn toàn yên tâm sắp xếp lịch chụp và nhân sự."*               |
| **8** | Bấm nút**Báo cáo đã chụp ảnh xong (Lên đợt 2)** trên thẻ đơn hàng.                                              | *"Sau khi hoàn thành buổi chụp ảnh thô thực tế, đối tác bấm báo cáo hoàn thành trên hệ thống để kích hoạt yêu cầu giải ngân Đợt 2 gửi tới khách hàng."* |

---

### PHẦN 3: GIẢI NGÂN ĐỢT 2 & NGHIỆM THU ĐẮT GIÁ (B2C)

* **Mục tiêu**: Trình diễn tính năng thanh toán tiến độ thông minh và cơ chế nghiệm thu kiểm soát chất lượng sản phẩm.

| Bước       | Hành động trên giao diện                                                                                                                                                                   | Lời thoại thuyết trình (Gợi ý)                                                                                                                                                                               |
| :----------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **9**  | Quay lại**[4. Lịch hẹn B2C](bookings.html)**.*(Hoặc sử dụng nút **⚡ Giả lập nhanh** ngay trên trang Lịch hẹn để đẩy trạng thái nếu không muốn chuyển tab)*. | *"Khách hàng nhận được thông báo tiến độ. Dòng thời gian Đợt 2 chuyển sang trạng thái chờ giải ngân. Khách hàng kiểm tra tiến độ chụp ảnh thô và đồng ý giải ngân Đợt 2."* |
| **10** | Bấm nút**Giải ngân Đợt 2 (50% - 6.250.000đ)** -> Xác nhận quét mã QR.                                                                                                          | *"Cặp đôi thực hiện thanh toán Đợt 2 (50%) thông qua VietQR động. Tiền tiếp tục được khóa bảo chứng để Vendor thực hiện công đoạn hậu kỳ ảnh chỉnh sửa."*                        |
| **11** | Sang trang Vendor bấm**Yêu cầu Nghiệm thu** (Hoặc bấm nút **⚡ Giả lập nhanh đợt 3** trên trang lịch hẹn).                                                            | *"Sau khi hoàn thành chỉnh sửa album ảnh, Vendor gửi yêu cầu nghiệm thu đợt cuối kèm đường link xem trước sản phẩm."*                                                                        |
| **12** | Trên trang Lịch hẹn, bấm**Nghiệm thu & Giải ngân Đợt cuối (20% - 2.500.000đ)**.                                                                                                | *"Cặp đôi kiểm tra album ảnh hoàn thiện, hài lòng với chất lượng và bấm nút Nghiệm thu & Tất toán 20% còn lại để giải phóng toàn bộ dòng tiền cho Vendor."*                         |
| **13** | Điền đánh giá**5 sao** cho TuArt Wedding.                                                                                                                                            | *"Sau khi đơn hàng hoàn tất viên mãn, hệ thống sẽ mở khóa tính năng đánh giá 5 sao để cập nhật chỉ số uy tín thực tế của đối tác trên sàn."*                                     |

---

### PHẦN 4: CỔNG QUẢN TRỊ ADMIN (PLATFORM OWNER) - QUYẾT TOÁN SÀN

* **Mục tiêu**: Chứng minh mô hình kinh doanh thu phí dịch vụ (Take rate 10%) và vai trò bảo chứng dòng tiền của sàn.

| Bước       | Hành động trên giao diện                                                                                                                                                | Lời thoại thuyết trình (Gợi ý)                                                                                                                                                                                                       |
| :----------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **14** | Chuyển sang**[7. Quản trị Admin](admin.html)**.                                                                                                                      | *"Đây là cổng quản trị của Platform Admin. Quản trị viên có cái nhìn tổng quan về tổng giao dịch (GMV), lượng tiền bảo chứng đang khóa trong ví Escrow và Doanh thu phí sàn thực tế."*                     |
| **15** | Kiểm tra bảng**Theo dõi ví ký quỹ Escrow** và bảng doanh thu.                                                                                                  | *"Khi đơn hàng của Nguyễn Minh Quân hoàn thành, hệ thống tự động giải ngân cho TuArt Wedding 90% hợp đồng (11.250.000đ) và tự động trích lại 10% phí dịch vụ sàn (1.250.000đ) về tài khoản Trạm Hỷ."* |
| **16** | Chuyển sang tab**Duyệt Tích Xanh Đối Tác**, bấm cấp tích xanh cho đối tác **Green Wedding**.                                                         | *"Bên cạnh quản lý dòng tiền, Admin cũng là nơi thẩm định kiểm duyệt hồ sơ và duyệt cấp Tích xanh bảo chứng cho đối tác đáp ứng tiêu chuẩn của sàn."*                                                    |
| **17** | Mở lại**[2. Chợ dịch vụ](marketplace.html)** để xem đối tác **Green Wedding** đã hiển thị Huy hiệu Tích xanh và nhãn danh giá *Choice 2026*. | *"Ngay lập tức ngoài chợ dịch vụ, đối tác vừa được duyệt đã hiển thị tích xanh và nhãn chất lượng uy tín, giúp tăng cơ hội tiếp cận khách hàng."*                                                       |

---

## 💡 MỘT SỐ LƯU Ý KHI THUYẾT TRÌNH (TIPS)

1. **Làm nổi bật nỗi đau thị trường (Pain Point)**: *"Hầu hết các cặp đôi trẻ đều lo lắng việc bàn giao chất lượng dịch vụ không đúng cam kết, trong khi các studio sợ bị bùng tiền đợt cuối. Trạm Hỷ ra đời để giải quyết triệt để vấn đề niềm tin này."*
2. **Nhấn mạnh từ khóa "Milestone Pay" & "Bảo chứng tài chính"**: Đây là điểm sáng độc nhất vô nhị của Trạm Hỷ so với WeddingWire hay các nền tảng liệt kê đơn thuần.
3. **Màn hình phụ hỗ trợ**: Nếu có thể, hãy nhờ một người bạn mở giao diện Vendor bằng điện thoại quét chung mạng LAN, bạn thao tác giao diện khách hàng trên máy tính để tạo hiệu ứng tương tác trực tiếp (Real-time) cực kỳ ấn tượng.
