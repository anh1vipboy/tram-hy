# Nhật Ký Tính Năng: Xem Trước & Trải Nghiệm Thử Váy AI (Trạm Hỷ)

Tài liệu này ghi lại toàn bộ quá trình thiết kế, triển khai kỹ thuật và tối ưu trải nghiệm người dùng (UX/UI) cho phân hệ **Phòng thử váy AI** (`tryon.html` / `tryon.js`) của Trạm Hỷ.

---

## 1. Mục Tiêu & Yêu Cầu Phát Triển

1. **Rê chuột vào mẫu váy (Hover Preview Slideshow):**
   - Khi người dùng rê chuột vào bất kỳ mẫu váy nào trong danh sách "Chọn váy cưới", hiển thị một bảng dialog/popover nhỏ tự động chuyển mượt các ảnh góc chụp thực tế của mẫu váy đó.
   - Hiển thị tên mẫu, tiệm, giá, điểm tôn dáng và nhãn số ảnh thật.
   - Tự động đóng khi chuột rời đi hoặc cuộn danh sách.

2. **Bấm vào mẫu váy để mở Bảng lớn xem chi tiết (Dress Detail Modal):**
   - Người dùng bấm vào thẻ váy sẽ **không chọn ngay**, mà mở bảng to để ngắm kỹ chi tiết các góc chụp của váy.
   - Hỗ trợ duyệt ảnh lớn, bấm ảnh thu nhỏ (thumbnails), phím mũi tên `←` `→` và vuốt cảm ứng trên điện thoại.
   - **Chân bảng lớn chỉ có đúng 2 nút hành động:**
     - Nút phụ: `← Xem mẫu khác` → Đóng bảng chi tiết lớn, giữ nguyên danh sách và bộ lọc váy.
     - Nút chính (Primary CTA): `✨ Chọn thử mẫu váy này` → Bấm nút này mới chính thức nạp váy vào khung chat thử váy AI.
     - *Bỏ hoàn toàn nút Đặt lịch thử tại tiệm theo yêu cầu.*

3. **Tối ưu hóa giao diện Mobile (Đưa váy làm trọng tâm số 1):**
   - Trên màn hình điện thoại, ảnh váy phải chiếm phần lớn màn hình (> 55% viewport `54dvh`).
   - Sử dụng `object-fit: contain` trên nền tối sang trọng (`radial-gradient`) để hiển thị trọn vẹn 100% chiều dài chiếc váy (từ voan cài đầu đến đuôi váy xòe rộng), không bị cắt cụt eo hay cúp ngực.
   - Chuyển các huy hiệu và nút đóng `✕` thành lớp phủ mờ kính (Glassmorphism Overlay) trực tiếp trên ảnh.
   - Tinh gọn khu vực thông tin (Tên, Tiệm, Giá, Thẻ tư vấn dáng AI mỏng nhẹ), loại bỏ text thừa.
   - Cố định 2 nút hành động ở đáy màn hình (Sticky Bottom Actions), vừa vặn trọn vẹn màn hình iPhone/Android không cần cuộn trang.

4. **Quản lý danh sách người mẫu có sẵn:**
   - Xóa bỏ ảnh mẫu số 1 (`user` - "Dâu Thảo") khỏi danh sách người mẫu mặc định, giữ lại 4 người mẫu chuẩn: Dâu Mai, Dâu Kim, Dâu Linh, Dâu Hà.

---

## 2. Chi Tiết Kỹ Thuật & Kiến Trúc Triển Khai

### 2.1. Nâng cấp nạp dữ liệu ảnh góc chụp (`frontend/js/services/catalog.js`)
- Mở rộng trường truy vấn `DRESS_FIELDS` từ `photos:dress_photos(count)` thành `photos:dress_photos(id, url)` để nạp sẵn danh sách URL ảnh thực tế vào bộ nhớ đệm `sessionStorage`.
- Cập nhật tiền tố cache sang `tramhy.catalog.v2.` để làm mới dữ liệu cho toàn bộ người dùng ngay lập tức.
- Thao tác chuyển ảnh góc chụp khi hover hay click mở modal diễn ra tức thì (`0ms`), không phát sinh request phụ.

### 2.2. Trình điều khiển Hover Slideshow & Detail Modal (`frontend/js/components/tryon-sheets.js`)
- **`bindDressHoverPopover(body, dialogEl, dresses, userBody)`:**
  - Lắng nghe sự kiện `pointerover` trên `.pick-tile[data-dress-id]` với độ trễ `140ms` (debounced chống nháy khi lướt chuột nhanh).
  - Khởi tạo phần tử nổi `.dress-hover-popover` đặt trong cùng Top Layer của `<dialog>` (`position: fixed`) để không bị cắt xén bởi `overflow` của thân sheet.
  - Tự động chuyển ảnh mỗi `1100ms`, cập nhật thanh chấm (`dots`) và bộ đếm ảnh.
  - Tự động hủy slideshow và ẩn popover khi di chuột ra ngoài, cuộn trang (`scroll`), chạm màn hình (`pointerdown`) hoặc đóng sheet.
  - Chỉ kích hoạt trên thiết bị có chuột (`matchMedia('(hover: hover) and (pointer: fine)')`).

- **`openDressPreviewModal(dress, { userBody, onConfirmPick })`:**
  - Mở hộp thoại modal `<dialog class="modal dress-detail-modal" closedby="any">` bằng `dialog.showModal()`.
  - Hỗ trợ chuyển ảnh mượt bằng `ArrowLeft`/`ArrowRight`, bấm nút `‹` `›`, bấm trực tiếp vào thumbnails hoặc vuốt chạm cảm ứng (`touchstart`/`touchend`).
  - Hỗ trợ light-dismiss (bấm backdrop bên ngoài để đóng) theo chuẩn Modern Web Dialog (`closedby="any"` kết hợp script fallback).
  - Khi bấm `[data-confirm-pick]`: đóng cả modal chi tiết và sheet chọn váy, gọi `onPickDress(dress.id)` để đưa váy vào ô soạn tin thử váy AI.

### 2.3. Thiết kế giao diện & Tối ưu hóa Mobile (`frontend/css/tryon.css`)
- **Chuẩn màu sắc & Typography:** Tuân thủ triệt để `AGENTS.md` (Màu đỏ đô `--brand: #9b2335`, Nền kem ấm `--bg: #faf5ef`, Chữ nâu trầm `--ink: #2a2421`, Số tiền dạng `font-variant-numeric: tabular-nums`).
- **Giao diện Desktop (Màn hình lớn):**
  - Layout 2 cột cân đối (`350px 1fr`, chiều cao `min-height: 520px`).
  - Cột trái: Khung ảnh nền radial gradient tối tôn vinh sắc trắng của váy cưới, thanh thumbnail nằm ngay dưới ảnh.
  - Cột phải: Thông tin chi tiết, giá tiền, tư vấn dáng người và 2 nút hành động.
- **Tối ưu hóa Giao diện Mobile (`@media (max-width: 680px)`):**
  - Khung ảnh chiếm **54dvh** (hơn nửa màn hình điện thoại).
  - `object-fit: contain` giúp toàn bộ thân váy từ khăn voan, eo, đến đuôi váy xòe rộng được hiển thị trọn vẹn 100%.
  - Nút đóng `✕` và các tag (`🔥 Hot`, `-18%`, kiểu dáng) chuyển thành lớp phủ nổi mờ kính (`.detail-overlay-top`) với `backdrop-filter: blur(8px)`.
  - Hàng ảnh thu nhỏ (`thumbnails`) dạng thanh nổi mỏng ở đáy khung ảnh.
  - Phần text bên dưới thu gọn: Tên váy và Giá thuê nằm cùng hàng ngang thoáng mắt, thẻ tư vấn AI mỏng nhẹ.
  - Hai nút `← Xem mẫu khác` và `✨ Chọn thử mẫu váy này` cố định ở đáy màn hình, chiều cao `>= 42px` chuẩn cảm ứng iOS/Android.

### 2.4. Danh sách người mẫu có sẵn (`frontend/js/data/tryon-data.js`)
- Đã gỡ bỏ người mẫu `user` ("Dâu Thảo") khỏi mảng `MODELS`.
- Danh sách hiện tại gồm 4 người mẫu:
  1. `bride1`: **Dâu Mai**
  2. `bride2`: **Dâu Kim**
  3. `bride3`: **Dâu Linh**
  4. `bride4`: **Dâu Hà**

---

## 3. Danh Sách Các File Mã Nguồn Đã Chỉnh Sửa

| File | Nội dung thay đổi |
| :--- | :--- |
| `frontend/js/data/tryon-data.js` | Gỡ bỏ người mẫu "Dâu Thảo" khỏi `MODELS`. |
| `frontend/js/services/catalog.js` | Truy vấn `photos:dress_photos(id, url)` và đổi tiền tố cache `v2`. |
| `frontend/js/components/tryon-sheets.js` | Thêm logic Hover Slideshow Popover, Bảng chi tiết lớn `openDressPreviewModal`, kết nối sự kiện chọn váy 2 bước. |
| `frontend/css/tryon.css` | Thiết kế CSS cho `.dress-hover-popover`, `.dress-detail-modal`, tối ưu hóa mobile chiếm 54dvh, overlay glassmorphism và sticky CTA. |
| `frontend/tryon.html` | Bump phiên bản asset `?v=20261106` để kích hoạt nạp file mới trên trình duyệt người dùng. |
| `frontend/js/pages/tryon.js` | Bump import version `tryon-sheets.js?v=5`. |
| `tests/e2e/tryon.spec.js` | Cập nhật và bổ sung bộ test tự động Playwright kiểm thử hover popover, bảng lớn chi tiết và số lượng người mẫu. |

---

## 4. Kết Quả Kiểm Thử Tự Động (Playwright E2E)

Hệ thống đã chạy kiểm thử tự động toàn diện trên cả môi trường **Desktop (Chrome)** và **Mobile (Pixel 7 / iPhone Viewport)**:
- Test case: `rê chuột hiện bảng nhỏ tự chuyển ảnh & bấm vào mở bảng lớn 2 nút (không có nút đặt lịch)`: **PASSED (100%)**.
- Test case: `chưa đăng nhập: tải ảnh lên mời đăng nhập, người mẫu có sẵn vẫn chọn được` (kiểm tra 4 người mẫu): **PASSED (100%)**.
- Không phát sinh lỗi console, không tràn ngang (`overflow-x`), thời gian chuyển cảnh dưới `280ms`.
