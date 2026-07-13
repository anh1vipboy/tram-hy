# 📖 KỊCH BẢN TRÌNH DIỄN & THUYẾT TRÌNH DEMO - TRẠM HỶ
> **Nền tảng Bảo chứng Công nghệ Cưới hỏi hàng đầu Việt Nam**
> *Tài liệu chuẩn bị cho buổi báo cáo dự án EXE101*

---

## 🧭 PHẦN 1: BẢN ĐỒ PHÂN VAI & CÁC TRANG CẦN MỞ
Để buổi demo diễn ra trơn tru nhất, bạn nên mở sẵn **7 trang** sau trên trình duyệt (có thể mở 2 cửa sổ song song: một bên của Khách hàng, một bên của Vendor/Admin để chuyển tab linh hoạt):

### Khung nhìn Cặp đôi (B2C):
1. **Trang chủ** (`index.html`): [http://localhost:8000/index.html](http://localhost:8000/index.html)
2. **Dịch vụ cưới hỏi** (`marketplace.html`): [http://localhost:8000/marketplace.html](http://localhost:8000/marketplace.html)
3. **Chi tiết & Đặt cọc** (`detail.html`): [http://localhost:8000/detail.html](http://localhost:8000/detail.html)
4. **Lịch hẹn nhà cung cấp** (`bookings.html`): [http://localhost:8000/bookings.html](http://localhost:8000/bookings.html)
5. **Tạo thiệp & QR** (`invitation.html`): [http://localhost:8000/invitation.html](http://localhost:8000/invitation.html)

### Khung nhìn Nhà cung cấp & Sàn (B2B/Admin):
6. **Kênh Nhà cung cấp** (`dashboard.html`): [http://localhost:8000/dashboard.html](http://localhost:8000/dashboard.html)
7. **Quản trị Admin** (`admin.html`): [http://localhost:8000/admin.html](http://localhost:8000/admin.html)

> 💡 **Mẹo Demo**: Sử dụng thanh **Demo Controller** màu vàng ở góc dưới bên phải mỗi trang để chuyển nhanh giữa các bước giả lập trạng thái mà không cần tải lại trang thủ công.

---

## 🎬 KỊCH BẢN CHI TIẾT TỪNG BƯỚC (STEP-BY-STEP)

### LUỒNG 1: HÀNH TRÌNH KHÁCH HÀNG - LẬP KẾ HOẠCH & ĐẶT LỊCH BẢO CHỨNG (B2C)
* **Mục tiêu**: Chứng minh khả năng tối ưu hóa tài chính của Trạm Hỷ bằng AI và thiết lập cơ chế bảo chứng tiền đặt cọc.

| Bước | Thao tác trên giao diện | Lời thoại thuyết trình mẫu (Gợi ý) |
| :--- | :--- | :--- |
| **1** | Mở **Trang chủ** (`index.html`).<br>Nhập vào ô ngân sách: **`150.000.000`** -> Nhấn **Phân bổ ngân sách AI**. | *"Chào Ban Giám khảo, đây là Trang chủ của Trạm Hỷ. Hầu hết cặp đôi trẻ gặp khó khăn lớn nhất là không biết phân bổ ngân sách cưới thế nào cho hợp lý. Với Trạm Hỷ, chỉ cần nhập tổng ngân sách dự kiến, trợ lý AI sẽ lập tức tính toán tỷ lệ phân bổ tối ưu theo thực tế thị trường (Ví dụ: Nhà hàng 50%, Chụp ảnh 18%, Decor 20%, Makeup 12%)."* |
| **2** | Nhấp vào danh mục **Studio (Chụp ảnh)** trên kết quả phân bổ để chuyển hướng sang trang **Dịch vụ cưới hỏi** (`marketplace.html`). | *"Khi cặp đôi muốn tìm kiếm nhà cung cấp chụp ảnh, hệ thống sẽ đưa họ đến chợ dịch vụ cưới hỏi. Tại đây, danh sách các đối tác uy tín được hiển thị rõ ràng. Nổi bật nhất là các đối tác có **Huy hiệu Tích Xanh Bảo Chứng** từ Trạm Hỷ - cam kết thi công đúng chất lượng."* |
| **3** | Click vào đối tác **TuArt Wedding** để mở trang **Chi tiết & Đặt cọc** (`detail.html`). | *"Chúng ta cùng xem hồ sơ của đối tác TuArt Wedding. Thay vì thanh toán trực tiếp 100% rủi ro cho studio, Trạm Hỷ mang đến giải pháp **Milestone Pay** - chia nhỏ thanh toán theo 3 đợt tiến độ rõ ràng: Đợt 1 cọc giữ chỗ 30%, Đợt 2 thi công chụp ảnh 50%, và Đợt 3 nghiệm thu tất toán 20%."* |
| **4** | Nhấp nút **Thanh toán cọc Đợt 1 bằng QR** -> Hiện Pop-up QR giả lập -> Nhấn xác nhận quét QR thành công. | *"Cặp đôi tiến hành quét mã VietQR động để thanh toán Đợt 1 (3.750.000đ). Dòng tiền này **chưa chuyển ngay cho TuArt**, mà được chuyển vào **Ví ký quỹ bảo chứng Escrow** do Trạm Hỷ kiểm soát nhằm đảm bảo quyền lợi cho cả hai bên."* |
| **5** | Click vào trang **Lịch hẹn nhà cung cấp** (`bookings.html`) để xem trạng thái đơn hàng. | *"Tại trang quản lý lịch hẹn của khách hàng, đợt cọc đầu tiên đã chuyển màu xanh lá biểu thị đã cọc bảo chứng thành công. Hệ thống tự động chuyển lịch trình sang giai đoạn chuẩn bị thi công."* |

---

### LUỒNG 2: KÊNH VENDOR - NHẬN ĐƠN & TRIỂN KHAI THI CÔNG (B2B)
* **Mục tiêu**: Chứng minh công cụ số hóa giúp nhà cung cấp quản lý tiến độ thi công chuyên nghiệp.

| Bước | Thao tác trên giao diện | Lời thoại thuyết trình mẫu (Gợi ý) |
| :--- | :--- | :--- |
| **6** | Mở trang **Kênh Nhà cung cấp** (`dashboard.html`). | *"Bây giờ, chúng ta hãy đóng vai là đối tác TuArt Wedding để truy cập vào trang quản lý công việc của nhà cung cấp."* |
| **7** | Xem bảng Kanban, thẻ đơn hàng của khách hàng **Nguyễn Minh Quân** nằm ở cột **Đã cọc Đợt 1**. | *"Tại Dashboard của TuArt, đơn hàng của anh Nguyễn Minh Quân đã hiển thị ở cột Đã cọc đợt 1. TuArt nhìn thấy rõ số tiền cọc đã được sàn bảo chứng an toàn, từ đó an tâm chuẩn bị trang phục, máy ảnh và ekip làm việc mà không sợ khách bùng lịch."* |
| **8** | Bấm nút **Báo cáo đã chụp ảnh xong (Lên đợt 2)** trên thẻ đơn hàng của Quân. | *"Sau khi hoàn thành buổi chụp hình thực tế tại studio, TuArt bấm xác nhận hoàn thành đợt thi công trên hệ thống để gửi yêu cầu giải ngân Đợt 2 kèm ảnh thô cho khách hàng phê duyệt."* |

---

### LUỒNG 3: GIẢI NGÂN ĐỢT 2 & NGHIỆM THU TẤT TOÁN ĐỢT 3 (B2C)
* **Mục tiêu**: Trình diễn mô hình Escrow Milestone Pay kiểm soát chất lượng sản phẩm cuối cùng.

| Bước | Thao tác trên giao diện | Lời thoại thuyết trình mẫu (Gợi ý) |
| :--- | :--- | :--- |
| **9** | Quay lại trang **Lịch hẹn nhà cung cấp** (`bookings.html`). *(Hoặc dùng Demo Controller nhảy nhanh trạng thái đợt 2)*. | *"Quay trở lại khung nhìn của khách hàng Nguyễn Minh Quân. Anh Quân nhận được thông báo tiến độ Đợt 2 là chờ giải ngân. Anh Quân kiểm tra tệp ảnh thô đã chụp, đồng ý với chất lượng thực tế."* |
| **10** | Nhấn **Giải ngân Đợt 2 (50%)** -> Xác nhận quét mã thanh toán QR giả lập. | *"Anh Quân quét QR thanh toán Đợt 2 trị giá 6.250.000đ. Tiền tiếp tục được chuyển tạm khóa ở sàn Escrow. TuArt Wedding nhận được thông báo giải ngân đợt 2 sẽ bắt đầu tiến hành thiết kế album in và chỉnh sửa hậu kỳ."* |
| **11** | Mô phỏng Vendor hoàn thành hậu kỳ và gửi yêu cầu nghiệm thu (Hoặc bấm nút **⚡ Giả lập nhanh đợt 3** trên trang lịch hẹn). | *"Sau khi thiết kế xong album ảnh cuối cùng, TuArt gửi sản phẩm và kích hoạt yêu cầu nghiệm thu đợt cuối cùng."* |
| **12** | Nhấn **Nghiệm thu & Giải ngân Đợt cuối (20%)** -> Xác nhận quét QR Đợt 3 -> Hiện Pop-up đánh giá 5 sao. | *"Đây là bước đắt giá nhất của Trạm Hỷ: **Nghiệm thu**. Cặp đôi kiểm tra album ảnh hoàn chỉnh, hài lòng với chất lượng và bấm nút Nghiệm thu & Giải ngân 20% còn lại. Lúc này, Trạm Hỷ mới giải phóng toàn bộ số tiền đang giữ để thanh toán cho TuArt và mở cổng cho khách hàng đánh giá 5 sao để tích lũy điểm uy tín."* |

---

### LUỒNG 4: QUẢN TRỊ ADMIN - ESCROW & DOANH THU SÀN
* **Mục tiêu**: Chứng minh dòng doanh thu take-rate 10% thực tế và vai trò điều tiết dòng tiền của sàn.

| Bước | Thao tác trên giao diện | Lời thoại thuyết trình mẫu (Gợi ý) |
| :--- | :--- | :--- |
| **13** | Chuyển sang trang **Quản trị Admin** (`admin.html`). | *"Cuối cùng là Cổng Quản trị của Admin Trạm Hỷ. Đây là nơi kiểm soát dòng tiền ký quỹ Escrow của toàn bộ các giao dịch trên sàn."* |
| **14** | Chỉ vào các ô chỉ số: **Tổng giao dịch (GMV)**, **Tiền ký quỹ tạm khóa**, và **Doanh thu phí sàn**. | *"Doanh thu của Trạm Hỷ đến từ phí dịch vụ sàn (Take-rate 10%). Khi đơn hàng của Nguyễn Minh Quân hoàn tất nghiệm thu, hệ thống tự động trích 10% phí sàn (1.250.000đ) về tài khoản Trạm Hỷ, và giải ngân 90% còn lại (11.250.000đ) cho ví của TuArt Wedding."* |
| **15** | Nhấp sang Tab **Xét Duyệt Tích Xanh** -> Bấm **Duyệt cấp** cho *Green Wedding*. | *"Admin cũng là nơi thẩm định chất lượng và cấp Tích xanh bảo chứng cho đối tác mới để kích hoạt họ trên chợ dịch vụ."* |
| **16** | Quay lại trang **Dịch vụ cưới hỏi** (`marketplace.html`) để xem *Green Wedding* đã hiển thị huy hiệu tích xanh. | *"Ngày lập tức ngoài chợ dịch vụ, Green Wedding đã được cập nhật tích xanh và nhãn Choice 2026, giúp tăng tính minh bạch cho khách hàng lựa chọn."* |

---

## 🙋‍♂️ BỘ CÂU HỎI Q&A DỰ KIẾN TỪ BAN GIÁM KHẢO (ĐẶC BIỆT QUAN TRỌNG)

### Câu hỏi 1: Dòng tiền ký quỹ Escrow được giữ ở đâu? Sàn có tự ý chi tiêu được không?
* **Cách trả lời thuyết phục**: *"Dòng tiền ký quỹ Escrow được giữ tại một tài khoản chuyên biệt của sàn liên kết trực tiếp với ngân hàng đối tác (phương thức tài khoản định danh ảo Virtual Account). Tiền này chỉ được giải phóng tự động khi hệ thống ghi nhận chữ ký xác nhận tiến độ (Milestone approval) từ phía khách hàng hoặc qua cổng tích hợp API kiểm tra. Trạm Hỷ không tự ý sử dụng dòng tiền này cho các hoạt động tài chính khác nhằm đảm bảo đúng tính pháp lý của mô hình Escrow bảo chứng."*

### Câu hỏi 2: Nếu có tranh chấp xảy ra (ví dụ: Khách bảo ảnh xấu không chịu nghiệm thu, Vendor bảo đã làm đúng cam kết), sàn giải quyết như thế nào?
* **Cách trả lời thuyết phục**: *"Trạm Hỷ đóng vai trò là Trọng tài trung gian bảo chứng. Trong hợp đồng điện tử ký kết ban đầu có điều khoản nghiệm thu rõ ràng (ví dụ chụp bao nhiêu file, sửa bao nhiêu tấm). Nếu xảy ra tranh chấp không đạt thỏa thuận, sàn sẽ tạm đóng đóng băng đợt thanh toán đó. Ban thẩm định của Trạm Hỷ sẽ đối chiếu file bàn giao với cam kết hợp đồng. Nếu lỗi thuộc về nhà cung cấp, tiền sẽ được hoàn trả cho khách hàng theo tỷ lệ đền bù cam kết; nếu khách hàng cố tình bùng tiền khi sản phẩm đạt chuẩn, sàn sẽ thực hiện giải ngân bảo vệ Vendor sau thời hạn đối soát tối đa 14 ngày."*

### Câu hỏi 3: Giá trị cốt lõi của Trạm Hỷ so với các trang tin tức hay chợ cưới truyền thống (như Marry.vn, WeddingWire) là gì?
* **Cách trả lời thuyết phục**: *"Các nền tảng hiện nay chỉ dừng lại ở mức **liệt kê danh bạ quảng cáo (Directory listing)**, thu tiền quảng cáo của Vendor nên họ không kiểm soát được chất lượng thi công thực tế, dẫn đến tình trạng đem con bỏ chợ. Trạm Hỷ giải quyết triệt để nỗi đau này bằng **Bảo chứng dòng tiền (Milestone Escrow)**. Khách hàng nắm đằng chuôi tài chính, Vendor yên tâm thi công vì tiền đã cọc bảo chứng ở sàn. Chúng tôi kinh doanh dựa trên sự tin cậy thông qua phí dịch vụ sàn (take-rate 10%) chứ không chỉ bán vị trí quảng cáo."*
