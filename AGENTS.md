# Quy tắc Thiết kế & Phát triển Dự án Trạm Hỷ (AGENTS.md)

File quy tắc này được nạp tự động ở mọi phiên làm việc để đảm bảo chất lượng giao diện, kiến trúc code và tiết kiệm token.

## 1. Quy tắc Kiến trúc & Tiết kiệm Token
- **Cấu trúc code:** Toàn bộ lệnh gọi Supabase đặt trong `frontend/js/services/`. Các file `frontend/js/pages/` chỉ xử lý giao diện và sự kiện. Không dùng `localStorage` cho dữ liệu nghiệp vụ.
- **Bảo mật XSS:** Luôn dựng giao diện động qua hàm ``html`...` `` trong `frontend/js/core/utils.js`.
- **Tiết kiệm token khi đọc/sửa:** Không quét các thư mục `legacy/`, `graphify-out/graph.json`, `graphify-out/graph.html`, và `frontend/js/vendor/` trừ khi được yêu cầu trực tiếp. Khi cần nắm cấu trúc nhanh, ưu tiên đọc `graphify-out/GRAPH_REPORT.md`.

## 2. Gu thẩm mỹ & Bố cục (Taste Skill `soft-skill` + Impeccable)
- **Tinh thần thương hiệu:** Ngành cưới hỏi (Bridal & Wedding Tech) — ấm áp, sang trọng, tinh tế (Editorial / Soft Luxury). Giữ bảng màu đỏ đô (`--brand: #9b2335`), nền kem ấm (`--bg: #faf5ef`), chữ nâu trầm (`--ink: #2a2421`).
- **Chống "mùi AI":**
  - Cấm dùng đen thuần (`#000000`) hoặc xám thuần cho chữ/viền, cấm gradient tím-xanh công nghệ.
  - Không lồng `.card` trong `.card` nhiều tầng gây rối mắt; ưu tiên phân tách bằng khoảng trắng, đường kẻ mảnh (`--line`) hoặc nền kem nhạt.
- **Typography (Typeset & Harden):**
  - Tiêu đề (`h1, h2, h3`) dùng `--font-title` (`Playfair Display`), luôn bật `text-wrap: balance` để không rớt 1 chữ lẻ xuống dòng cuối.
  - Đoạn văn (`p, .lead`) dùng `text-wrap: pretty`.
  - Mọi con số tiền tệ (`đ`), phần trăm (`%`), bộ đếm ngày và bảng ngân sách phải dùng `font-variant-numeric: tabular-nums` để thẳng cột.
  - Luôn phòng thủ tên tiếng Việt dài (tên cô dâu chú rể, tên nhà hàng, ghi chú) bằng `min-width: 0` và `overflow-wrap: anywhere` hoặc `.ellipsis`.

## 3. Luật Chuyển động & Tương tác (Emil Kowalski)
- **Hiệu năng GPU:** Chỉ tạo hiệu ứng chuyển động trên `transform` và `opacity`. Không animate `width`, `height`, `margin`, `padding` gây giật khung hình trên điện thoại.
- **Gia tốc & Thời lượng:** Luôn dùng đường cong giảm tốc tự nhiên (`cubic-bezier(0.22, 1, 0.36, 1)` hoặc `ease-out`), thời lượng giao diện từ `150ms` đến `280ms` (dưới `300ms`). Không dùng `ease-in` hay hiệu ứng nhún `bounce` lỗi thời.
- **Phản hồi xúc giác:** Nút bấm và thẻ tương tác khi nhấn (`:active`) thu nhẹ `transform: scale(0.97)` hoặc `scale(0.98)`. Hiệu ứng hover nâng thẻ chỉ bật trong `@media (hover: hover) and (pointer: fine)`.
- **Giảm chuyển động:** Luôn tôn trọng `@media (prefers-reduced-motion: reduce)`.

## 4. Chuẩn Giao diện & Tự kiểm tra (Vercel Guidelines + Playwright)
- **Khả năng tiếp cận & Cảm ứng:** Mọi nút bấm, chip, tab, liên kết phải có `:focus-visible` rõ ràng và vùng chạm tối thiểu `36px–44px` trên điện thoại; cỡ chữ ô nhập (`input, select, textarea`) trên mobile `>= 16px` để iOS không tự phóng to.
- **Hiệu năng ảnh:** Ảnh đầu trang (LCP) đặt `fetchpriority="high"`, các ảnh bên dưới đặt `loading="lazy"` và `decoding="async"`.
- **Kiểm tra trước khi hoàn tất:** Sau khi sửa giao diện, kiểm tra trên cả kích thước Desktop và Mobile (`390px`), đảm bảo không tràn ngang và không có lỗi Console.
