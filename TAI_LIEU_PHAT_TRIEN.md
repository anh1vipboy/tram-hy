# TRẠM HỶ – TÀI LIỆU PHÁT TRIỂN

> Ghi lại những gì đã làm khi chuyển Trạm Hỷ từ bản demo (localStorage) sang **web chạy thật có database**.
> Cập nhật: 03/10/2026 · Người thực hiện: Phùng Đức Anh (Fullstack) cùng Claude Code

---

## 1. Tóm tắt

| Trước | Sau |
|---|---|
| 8 file HTML, ~10.700 dòng, CSS + JS viết lẫn trong HTML | 10 trang HTML ngắn + 30 file JS/CSS tách theo chức năng, ~2.900 dòng |
| Dữ liệu giả, lưu trong `localStorage` của từng trình duyệt | Dữ liệu thật trên **Supabase (PostgreSQL)**, ai cũng thấy cùng một dữ liệu |
| Không có đăng nhập | Đăng nhập / đăng ký, 3 vai trò: **Cô dâu – Đối tác – Admin** |
| Luồng đứt: đơn đặt váy không hiện ở trang đối tác | Một bảng `bookings` chung → cô dâu, đối tác, admin cùng thấy một đơn, cập nhật **realtime** |
| Ai cũng sửa được giá, trạng thái tiền (mở DevTools là xong) | Mọi thao tác tiền đi qua hàm trong database, tự kiểm tra quyền và thứ tự |
| Trang Dịch vụ trắng trơn, trang Thiệp lỗi JS, ảnh vỡ | Đã sửa hết, kiểm tra không còn lỗi console |

---

## 2. Cấu trúc thư mục

```
exe202/
├── frontend/                 ← WEB (mở bằng trình duyệt)
│   ├── index.html            Trang chủ
│   ├── tryon.html            Phòng thử váy AI dạng trò chuyện (ướm váy lên ảnh của bạn)
│   ├── thiet-ke-vay.html     Tự thiết kế váy may đo (Trạm Hỷ Atelier)
│   ├── gioi-thieu.html       Giới thiệu Trạm Hỷ (số liệu đếm thật; đội ngũ: TEAM trong js/pages/about.js; liên hệ: CONTACT trong js/config.js)
│   ├── marketplace.html      Danh sách đối tác (lọc, tìm, sắp xếp)
│   ├── vendor.html           Chi tiết đối tác (?slug=tuart)
│   ├── bookings.html         Đơn của tôi: trả cọc, nghiệm thu, khiếu nại, đánh giá
│   ├── invitation.html       Thiệp cưới online + RSVP (?i=<mã thiệp> cho khách mời)
│   ├── login.html            Đăng nhập / đăng ký
│   ├── reset-password.html   Đặt lại mật khẩu (mở từ link trong email)
│   ├── vendor-dashboard.html Kênh đối tác: Kanban đơn hàng
│   ├── admin.html            Quản trị: khiếu nại, Tích Xanh, toàn bộ đơn
│   ├── css/styles.css        Toàn bộ giao diện (1 file)
│   ├── assets/images/        Logo, ảnh người mẫu, ảnh thử váy
│   └── js/
│       ├── config.js         URL + key Supabase, tài khoản Escrow, phí sàn
│       ├── core/             Dùng chung: kết nối, đăng nhập, header, toast, hộp thoại, nhãn
│       ├── services/         TẤT CẢ lệnh gọi Supabase nằm ở đây
│       ├── components/       Khối giao diện dùng lại (hộp thoại đặt lịch, thẻ đơn)
│       ├── data/             Dữ liệu tĩnh phòng thử (ảnh, quy tắc tôn dáng, giá may đo)
│       └── pages/            Mỗi trang 1 file JS
│
├── backend/supabase/         ← DATABASE (chạy trong Supabase SQL Editor)
│   ├── 01_schema.sql         Bảng + phân quyền (RLS)
│   ├── 02_functions.sql      Nghiệp vụ: đặt lịch, Escrow 3 chặng, khiếu nại
│   ├── 03_storage_realtime.sql  Kho ảnh + realtime
│   ├── 04_seed.sql           Dữ liệu mẫu: 31 đối tác, 10 mẫu váy
│   ├── 05_reviews_admin.sql  Đánh giá, admin gắn chủ tiệm, dọn ảnh bìa
│   ├── 06_vendor_onboarding.sql  Đối tác đăng ký mở tiệm → admin duyệt
│   ├── 07_vendor_media.sql   Ảnh thực tế (portfolio) của tiệm
│   ├── 08_dress_photos.sql   Ảnh nhiều góc cho mẫu váy + sửa quyền đọc kho ảnh
│   ├── 09_fix_storage_policies.sql  Sửa quyền tải ảnh của đối tác
│   ├── 10_welcome_email.sql  Trigger gửi email chào mừng khi đăng ký bằng Google
│   ├── 11_ai_tryon.sql       Bảng đếm lượt AI + kho ảnh kết quả riêng tư
│   ├── 12_tryon_own_garment.sql  Ghi ảnh váy tự tải vào lịch sử thử AI
│   ├── 13_vendor_logo.sql    Ảnh đại diện (logo) của tiệm
│   ├── 14_rsvp_realtime.sql  Phản hồi thiệp cưới tự hiện (realtime)
│   ├── 15_demo_data.sql      Dữ liệu demo: ảnh bìa, ảnh thực tế, mẫu váy, đánh giá có bình luận
│   ├── 16_rsvp_antispam.sql  Chống spam phản hồi thiệp (trùng tên, giới hạn theo IP, chặn link)
│   ├── 17_become_partner.sql Cô dâu tự mở tiệm (Trở thành đối tác) + tài khoản nhận tiền riêng tư
│   ├── 18_notifications.sql  Chuông thông báo: bảng notifications + trigger tự tạo thông báo
│   ├── 19_vendor_packages.sql Gói dịch vụ (mẫu rạp, gói chụp, gói trang điểm, sảnh) + đặt lịch theo gói
│   ├── 20_wedding_planner.sql Kế hoạch cưới: ngân sách theo nghi lễ + checklist chuẩn bị
│   ├── 21_ai_planner.sql     Đếm lượt Trợ lý AI trong Kế hoạch cưới (20 câu / người / ngày)
│   ├── 22_invitation_templates.sql Thiệp cưới: mẫu thiệp, thông tin hai họ (details), ảnh cưới (bucket invitation-photos)
│   ├── 23_image_webp.sql     Ảnh demo trỏ về ảnh của web đổi sang .webp (nhẹ hơn ~10 lần)
│   ├── 24_guestbook.sql      Sổ lời chúc có duyệt (chống spam theo IP, thông báo, realtime); nới dung lượng details
│   ├── 25_invitation_access.sql Thiệp: chỉ mở bằng link (RPC), mật khẩu tùy chọn, lượt xem, phản hồi theo sự kiện + câu hỏi, trả lời lời chúc
│   ├── 26_invitation_media.sql Kho video thiệp tải từ máy (bucket invitation-media, 50MB)
│   ├── 27_invitation_storage_select.sql Chủ thiệp đọc được thư mục ảnh/video của mình → xóa file cũ mới có tác dụng
│   ├── 28_tryon_settings.sql Thử váy AI: app_settings (admin bật/tắt Siêu nét, hạn mức credit); tryon_jobs ghi credit, tùy chọn, lượt gửi, tin nhắn; ai_usage thêm tryon_chat
│   ├── 29_vendor_categories.sql Thêm 3 loại dịch vụ: betrothal (Tráp ăn hỏi), entertainment (MC & âm nhạc), car (Xe hoa) – file riêng vì Postgres không dùng được giá trị enum mới trong cùng lần chạy
│   ├── 30_booking_rules.sql  Nhà hàng tính giá theo bàn (gói price_unit/min_qty/max_qty, vendors.halls), create_booking tính tổng + chặn trùng lịch, RPC vendor_busy_times; cột is_demo cho gói mẫu
│   ├── 31_demo_services.sql  9 tiệm demo cho 3 loại mới + gói mẫu (is_demo) cho mọi tiệm demo không bán váy; nhà hàng demo giá theo bàn, số sảnh
│   ├── 32_welcome_email_signup.sql Email chào mừng cả cho người đăng ký bằng email (gửi lúc vừa xác nhận); bảng welcome_emails chống gửi 2 lần
│   ├── 33_plan_share.sql     Chia sẻ kế hoạch cưới bằng link chỉ xem: bảng wedding_plan_shares (không mở cho API), RPC my_plan_share / set_plan_share / rotate_plan_share (chủ kế hoạch), get_shared_plan(token) cho khách không đăng nhập
│   ├── 34_tryon_credit_hold.sql Giữ chỗ credit thử váy AI trước khi gọi API (trạng thái 'pending', RPC reserve_tryon_credits) – chống vượt hạn mức khi mở nhiều tab đồng thời
│   ├── email-templates/      Mẫu email Supabase Auth tiếng Việt (xác nhận đăng ký, đặt lại mật khẩu, đổi email, magic link) + HUONG_DAN.md cách dán
│   ├── functions/_shared/cors.ts       CORS và kiểm tra an toàn URL chung (chỉ cho SITE_URL, localhost; chống SSRF isSafeImageUrl)
│   ├── functions/excel-dong-bo/        Edge Function cấp dữ liệu đồng bộ CSV thời gian thực & lưu bản sao .xlsx
│   ├── functions/gui-email-chao-mung/  Edge Function gửi mail qua Brevo
│   ├── functions/khieu-nai-sla/        Edge Function xử lý khiếu nại, dời lịch và cơ chế bảo vệ SLA 48h/72h
│   ├── functions/thu-vay-ai/           Edge Function thử váy AI thật (FASHN hoặc Gemini)
│   ├── functions/tro-ly-thu-vay/       Edge Function trợ lý chat ở Phòng thử (Gemini model chữ)
│   ├── functions/tu-van-ngan-sach/     Edge Function AI tư vấn chia ngân sách cưới (Gemini, free tier)
│   ├── tools/xoa_tai_khoan_test.sql  Xóa tài khoản test kèm dữ liệu
│   └── tools/xoa_du_lieu_demo.sql    Xóa dữ liệu demo của file 15
│
├── tests/                    ← KIỂM THỬ TỰ ĐỘNG (Playwright) – xem mục "Kiểm thử tự động"
├── docs/                     Báo cáo, kịch bản demo, góp ý mentor (.md, .docx)
├── legacy/                   Bản demo cũ – giữ để đối chiếu, có thể xóa
├── start_server.ps1          Chạy web ở http://localhost:8080
└── TAI_LIEU_PHAT_TRIEN.md    File này
```

---

## 3. Kiến trúc

```
 Trình duyệt (frontend/)                         Supabase (backend/)
 ┌───────────────────────────┐                  ┌──────────────────────────────────┐
 │ pages/*.js  (giao diện)   │                  │ Auth      – tài khoản, phiên      │
 │      │                    │   supabase-js    │ PostgreSQL – bảng dữ liệu         │
 │      ▼                    │ ───────────────► │   RLS      – ai xem được dòng nào │
 │ services/*.js (gọi API)   │ ◄─────────────── │   Functions – nghiệp vụ tiền      │
 │      │                    │   realtime       │ Storage   – ảnh cô dâu (riêng tư) │
 │ core/supabase.js (client) │                  │ Realtime  – đẩy thay đổi về web   │
 └───────────────────────────┘                  └──────────────────────────────────┘
```

**Không có server riêng.** Supabase đóng vai trò backend (mô hình *Backend-as-a-Service*):
- Đọc dữ liệu công khai (đối tác, váy, đánh giá) → gọi thẳng bảng.
- Thay đổi tiền / trạng thái đơn → gọi **hàm SQL (RPC)** chạy trên server, người dùng không can thiệp được.
- Bảo mật nằm ở **Row Level Security**: dù ai đó sửa code JS, database vẫn chỉ trả về dữ liệu họ được phép xem.

---

## 4. Backend (Supabase)

### 4.1 Các bảng

| Bảng | Nội dung | Ai xem được |
|---|---|---|
| `profiles` | Họ tên, SĐT, vai trò (bride / vendor / admin) | Chính chủ, admin |
| `vendors` | Đối tác: tên, loại, khu vực, giá từ, sao, Tích Xanh, chủ tiệm | Tiệm đã duyệt: mọi người · Chờ duyệt/bị từ chối: chủ tiệm, admin |
| `dresses` | Mẫu váy: thuê / may đo, kiểu, giá | Mọi người |
| `body_profiles` | Chiều cao, cân nặng, giày, dáng người | Chính chủ |
| `bookings` | Đơn đặt lịch (chung cho thuê váy, may đo, dịch vụ) | Cô dâu của đơn, chủ tiệm, admin |
| `milestones` | 3 chặng thanh toán của mỗi đơn | Như `bookings` |
| `disputes` | Khiếu nại: hoàn cọc / khách không đến | Như `bookings` |
| `reviews` | Đánh giá – chỉ đơn **đã hoàn tất** mới được viết | Mọi người |
| `invitations`, `rsvps` | Thiệp cưới và phản hồi khách mời | Chủ thiệp (+ admin). Khách KHÔNG đọc bảng – mở thiệp qua hàm `open_invitation(slug)` |
| `guestbook_entries` | Lời chúc (chờ duyệt / đã duyệt / ẩn) + lời đáp của cô dâu | Chủ thiệp. Khách đọc lời đã duyệt qua `list_wishes(slug)` |
| `wedding_plans`, `budget_categories`, `budget_items`, `checklist_items` | Kế hoạch cưới (1 kế hoạch / tài khoản): danh mục, mục chi tiêu, việc cần làm | Chính chủ |

### 4.2 Escrow 3 chặng

| Loại đơn | Đợt 1 | Đợt 2 | Đợt 3 |
|---|---|---|---|
| Thuê váy / dịch vụ | 30% giữ lịch | 50% sau buổi thử / bấm máy | 20% nghiệm thu |
| May đo | 30% duyệt thiết kế & vải | 40% thử rập mộc | 30% nhận váy |

Trạng thái mỗi đợt: `locked` (chưa trả) → `paid` (Trạm Hỷ đang giữ) → `released` (đã giải ngân cho tiệm) hoặc `refunded` (hoàn cô dâu).

Trạng thái đơn: `pending` → `confirmed` (đã cọc đợt 1) → `in_progress` → `ready_for_review` → `completed`.
Nhánh phụ: `disputed` (đang khiếu nại), `cancelled`, `refunded`.

### 4.3 Các hàm nghiệp vụ (RPC)

| Hàm | Ai gọi | Làm gì |
|---|---|---|
| `create_booking` | Cô dâu | Tạo đơn, **tự tính giá từ database** và chia 3 chặng |
| `pay_milestone` | Cô dâu | Ghi nhận đã trả 1 đợt (bắt buộc trả theo thứ tự) |
| `release_milestone` | Cô dâu / admin | Nghiệm thu → giải ngân đợt đó; đủ 3 đợt → đơn hoàn tất |
| `vendor_set_status` | Chủ tiệm | Bắt đầu thực hiện / báo đã xong / từ chối đơn chưa cọc |
| `open_dispute` | Cô dâu (hoàn cọc) · Chủ tiệm (no-show) | Mở khiếu nại, khóa đơn |
| `resolve_dispute` | Admin | Hoàn tiền cô dâu hoặc xử lý cho tiệm |
| `set_vendor_verified` | Admin | Cấp / thu hồi Tích Xanh |
| `admin_link_vendor_owner` | Admin | Gắn tài khoản (theo email) làm chủ tiệm |
| `register_vendor` | Đối tác | Gửi hồ sơ mở tiệm (trạng thái *chờ duyệt*, chưa hiện với khách) |
| `resubmit_vendor` | Đối tác | Gửi lại hồ sơ sau khi bị từ chối và đã sửa |
| `admin_review_vendor` | Admin | Duyệt (tiệm lên sàn) hoặc từ chối (bắt buộc ghi lý do) |

### 4.4 Storage & Realtime
- `bride-photos` (riêng tư): ảnh cô dâu tải lên ở phòng thử, lưu theo thư mục `<user_id>/`, chỉ chính chủ đọc được.
- `dress-images`, `vendor-portfolio` (công khai): ảnh mẫu váy, logo (nén còn 512px), ảnh bìa, ảnh thực tế do đối tác tải lên ở Kênh đối tác (ảnh được nén còn ~1600px trước khi tải). Bảng `vendor_photos` lưu ảnh thực tế (tối đa 20 ảnh/tiệm), bảng `dress_photos` lưu ảnh các góc của mẫu váy (tối đa 10 ảnh/mẫu; ảnh chính vẫn là `dresses.image_url`). Hai kho này cần cả quyền đọc (SELECT) thì Storage mới ghi/xóa được – xem 08.
- Realtime (tự cập nhật, không cần F5; vẫn theo RLS – ai chỉ nhận dữ liệu của mình):
  - `bookings`, `milestones`, `disputes` → Đơn của tôi, Kênh đối tác, Quản trị (đặt lịch, cọc, nghiệm thu, khiếu nại).
  - `vendors` → admin thấy hồ sơ mở tiệm mới; đối tác thấy kết quả duyệt / Tích Xanh (SQL 06).
  - `rsvps` → cô dâu thấy khách phản hồi thiệp ngay, kèm thông báo (SQL 14).
  - Không bật cho trang khách xem (Dịch vụ cưới, trang tiệm, mẫu váy): mở trang là có bản mới nhất, bật realtime chỉ tốn tài nguyên.

---

## 5. Frontend

### 5.1 Quy ước code
1. **Không gọi Supabase trong `pages/`** – mọi truy vấn viết trong `services/` (1 chỗ để sửa khi đổi database): `catalog.js` đọc dữ liệu công khai, `shop.js` thao tác của chủ tiệm, `bookings.js` đơn hàng & Escrow, `admin.js` quản trị.
2. **Dựng HTML bằng `html\`...\``** (trong `core/utils.js`): tự escape dữ liệu, chống chèn mã độc (XSS) từ tên/ghi chú người dùng nhập.
3. **Không dùng `localStorage`** cho dữ liệu nghiệp vụ. Phiên đăng nhập do supabase-js tự quản lý.
4. Mỗi trang JS có phần `KHỞI CHẠY TRANG` ở cuối file; phần trên là hàm.
5. Thông báo dùng `toast()`, hộp thoại dùng `openDialog()` (thẻ `<dialog>` gốc, không cần thư viện).
6. Không cần build: HTML + ES modules chạy thẳng trên trình duyệt. Thư viện duy nhất: `supabase-js` (CDN).

### 5.2 Các trang và luồng

```
Trang chủ ──► Thử váy ──► [Đặt lịch] ──► Đăng nhập (nếu chưa) ──► Đơn của tôi
                                                                    │ Trả đợt 1 (VietQR)
                                                                    ▼
Kênh đối tác: Đã nhận cọc ──► Bắt đầu thực hiện ──► Báo đã xong
                                                                    │
Đơn của tôi: Nghiệm thu từng đợt ──► Hoàn tất ──► Đánh giá ─────────┘
Khiếu nại bất kỳ lúc nào ──► Quản trị phân xử (hoàn tiền / xử lý cho tiệm)
```

| Trang | Cần đăng nhập | Ghi chú |
|---|---|---|
| Trang chủ, Thử váy, Dịch vụ, Chi tiết đối tác | Không | Đặt lịch thì mới yêu cầu đăng nhập |
| Đơn của tôi | Có | |
| Kế hoạch cưới (`ke-hoach.html`) | Có (khách chưa đăng nhập thấy trang giới thiệu) | |
| Thiệp cưới | Không (thư viện mẫu) · Có (soạn) · Không (khách mời xem qua link) | |
| Kênh đối tác | Vai trò `vendor` + được gắn với tiệm | |
| Quản trị | Vai trò `admin` | |

### 5.3 Những gì còn là DEMO (chưa thật)
- **Ảnh minh họa ở trang may đo** (`thiet-ke-vay.html`): ảnh render sẵn theo người mẫu × phom váy (váy may đo chưa có ảnh thật để AI ướm). Phòng thử dùng AI thật (FASHN).
- **Điểm tôn dáng**: tính theo bảng quy tắc stylist (`data/tryon-data.js`), không phải mô hình AI.
- **Thanh toán**: cô dâu bấm "Tôi đã chuyển khoản" là ghi nhận. Mã VietQR hiển thị đúng chuẩn nhưng tài khoản trong `config.js` là số giả.

---

## 6. Cách chạy

### Lần đầu
1. Supabase → **SQL Editor** → chạy lần lượt các file `backend/supabase/01` → `06` (mỗi file 1 query mới).
   Project hiện tại đã chạy 01–08, chỉ còn **09_fix_storage_policies.sql**.
2. Supabase → **Authentication → Sign In / Providers → Email**: tắt *Confirm email* khi đang phát triển.
3. Chạy web:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\start_server.ps1
   ```
   Mở **http://localhost:8080**. (Phải chạy qua server, không mở file trực tiếp vì ES modules không chạy với `file://`.)

### Kiểm thử tự động (Playwright)
Cần Node.js 24 LTS. Lần đầu: `cd tests` → `npm install` → `npx playwright install chromium`.

| Lệnh (chạy trong `tests/`) | Tác dụng |
|---|---|
| `npm test` | Chạy toàn bộ test với frontend ở máy (tự bật server cổng 4173), trên máy tính + điện thoại (Pixel 7) |
| `npm run test:vercel` | Chạy test với bản trên Vercel |
| `npm run test:ui` | Mở giao diện xem từng bước test chạy |
| `npm run report` | Xem báo cáo, ảnh chụp + video lúc test lỗi |

Hiện có 27 bài × 2 thiết bị cho **khách chưa đăng nhập**: mọi trang mở được không lỗi JS, không tràn màn hình; trang cần đăng nhập tự chuyển sang Đăng nhập; lọc/tìm đối tác; trình xem ảnh; chọn váy, điểm tôn dáng, giá may đo; báo lỗi đăng nhập; kết quả xác nhận email.
**Nên chạy `npm test` trước mỗi lần push.** Test đọc database Supabase thật nhưng không ghi gì.

### Đưa lên mạng (Vercel) – dùng cùng database với local
1. Vercel → Project → **Settings → Build and Deployment**: Framework Preset `Other`, **Root Directory** `frontend`, các lệnh Build/Output/Install để mặc định (tắt Override) → Save.
2. Push code lên nhánh `main` trên GitHub → Vercel tự deploy (~30 giây).
3. Supabase → **Authentication → URL Configuration**:
   - **Site URL**: tên miền Vercel, vd `https://tram-hy.vercel.app`
   - **Redirect URLs**: thêm `https://tram-hy.vercel.app/**` và `http://localhost:8080/**`

### Đăng nhập Google + email chào mừng
- Nút **Tiếp tục với Google** ở trang Đăng nhập (Supabase → Authentication → Providers → Google, Client ID/Secret lấy ở Google Cloud Console; redirect URI `https://vsjdijmuvuetmhmszcrl.supabase.co/auth/v1/callback`). Tài khoản Google mới có vai trò cô dâu.
- Tài khoản **mới** tạo bằng Google → trigger (SQL 10) gọi Edge Function `gui-email-chao-mung` → gửi email chào mừng qua **Brevo** (300 mail/ngày, người gửi là Gmail đã xác minh).
- Bí mật: function dùng Supabase Secrets `BREVO_API_KEY`, `SENDER_EMAIL`, `WEBHOOK_SECRET`; database dùng Vault secret `welcome_email_secret` (phải **trùng** `WEBHOOK_SECRET`). Không có bí mật nào trong code.
- Deploy lại function sau khi sửa: trong `backend/` chạy `npx supabase functions deploy gui-email-chao-mung --project-ref vsjdijmuvuetmhmszcrl --no-verify-jwt`.
- Không nhận mail → xem Supabase → Edge Functions → Logs (403 = bí mật không khớp, 502 = Brevo từ chối) và Brevo → Transactional → Logs.

### Thử váy bằng AI thật (luồng chính)
- ⚠️ **Trước khi deploy Edge Function**: kiểm tra biên dịch – trong `backend/supabase/functions` chạy
  `npx esbuild <tên>/index.ts --format=esm --log-level=error > NUL` (không báo gì = ổn). Lỗi cú pháp làm function **không khởi động
  được** (BOOT_ERROR 503) mà test Playwright không phát hiện (test giả lập function). Sau deploy gọi thử: chưa đăng nhập phải
  trả `401 "Bạn cần đăng nhập…"`, không phải `BOOT_ERROR`.
**Giao diện trò chuyện** (`tryon.html`, giống trợ lý AI trên web FASHN). Chỉ ướm váy lên ảnh – không đổi nền, không đổi khung, không video:
khung soạn tin ở đáy có 2 ô **Ảnh của bạn** (tải lên / ảnh đã lưu / người mẫu có sẵn) và **Váy cưới** (mẫu của các tiệm có ảnh thật / ảnh váy tự tải)
→ bấm gửi (gõ thêm tin nhắn nếu muốn) → ảnh ướm thử hiện ngay trong khung chat: phóng to, **so sánh trước/sau**, tải ảnh, 1–4 ảnh để chọn,
**🎲 Thử kiểu khác** (seed mới), **📅 Đặt lịch thử váy này** (mẫu của tiệm) hoặc **✂️ Đặt may theo mẫu này** (ảnh váy tự tải → `thiet-ke-vay.html?tu=anh-vay`).
Mở lại trang: các lần ướm đã lưu hiện lại thành đoạn chat (`listTryonHistory` – bảng `tryon_jobs`, cột `batch_id`, `message`, `options.person` của SQL 28).

| Vào trang bằng | Hành vi |
|---|---|
| `tryon.html?dress=<slug>` ("Thử váy này" ở trang chủ / trang tiệm) | Chọn sẵn mẫu vào ô Váy cưới + thẻ mẫu (giá, độ tôn dáng, **📅 Đặt lịch thử váy**) |
| `tryon.html?chon-vay=1` ("Xem tất cả mẫu") | Mở sẵn bảng chọn váy |
| `tryon.html?mode=own` | Mở sẵn tab "Ảnh váy của bạn" (quay lại sau khi đăng nhập để tải ảnh váy) |

- **Trợ lý chat** (Edge Function `tro-ly-thu-vay`, Gemini model chữ – key Free tier dùng được): chỉ gọi khi người dùng **gõ chữ**. Hiểu ý →
  `action` "tryon" (ướm) hoặc "chat" (hỏi đáp / tư vấn / yêu cầu chưa hỗ trợ như đổi nền, video → từ chối nhẹ nhàng); dịch yêu cầu **cách mặc**
  (tà dài chạm đất, bỏ mũ, bỏ khăn choàng…) sang tiếng Anh → `prompt` cho Siêu nét; khách xin tư vấn → `theme` → web gợi ý vài mẫu đúng kiểu để bấm chọn.
  Giới hạn 40 tin/người/ngày (bảng `ai_usage`, kind `tryon_chat` – SQL 28). AI bận / hết lượt / lỗi mạng → trả lời theo luật đơn giản, đủ ảnh + váy thì vẫn ướm.
- **Tự thiết kế váy may đo** tách sang trang riêng `thiet-ke-vay.html` (`pages/bespoke.js`): phom, cổ, tay, vải, đuôi, phụ kiện → giá, ảnh minh họa,
  độ tôn dáng, đặt lịch 30/40/30 (Trạm Hỷ Atelier). Số đo dùng chung với Phòng thử (bảng `body_profiles`).
- **Ảnh lưu riêng tư** trong bucket `bride-photos/<user_id>/`: ảnh người `body-*.jpg` (tối đa 6) và ảnh váy `garment-*.jpg` (tối đa 10) – hằng
  `MAX_BRIDE_PHOTOS`, `MAX_GARMENT_PHOTOS` trong `services/profile.js`. Tải lên / chọn lại / xóa (nút ×) ngay trong bảng chọn. Tải ảnh cần đăng nhập.
- **"Chuẩn kích thước"**: web gửi kèm chiều cao / cân nặng / giày (sửa trong **⚙️ Tùy chỉnh → Số đo**); Siêu nét và Gemini dùng số đo trong prompt để đặt
  độ dài váy, eo đúng tỷ lệ (Tiêu chuẩn `tryon-v1.6` không nhận prompt, cần ảnh toàn thân đứng thẳng).
- **Vì sao ảnh trên web FASHN đẹp hơn?** Web FASHN dùng mô hình **Try-On Max** (`tryon-max`, FASHN khuyên dùng cho chất lượng cao): ướm được ảnh selfie,
  váy xòe phồng, giữ khung cảnh. `tryon-v1.6` (Tiêu chuẩn) rẻ và nhanh nhưng chỉ đẹp với ảnh toàn thân đứng thẳng. Muốn ảnh như FASHN → admin bật Siêu nét.
- **Nhà cung cấp AI** (Edge Function `thu-vay-ai`, chọn tự động):
  - Có secret `FASHN_API_KEY` → dùng **FASHN** (chuyên thử đồ). FASHN hết credit mà có `GEMINI_API_KEY` → tự chuyển sang Gemini (1 ảnh).
  - Không có → Gemini (`GEMINI_API_KEY`, cần bật thanh toán). Ép một bên: `TRYON_PROVIDER=fashn|gemini`.
  - AI chưa chạy được (chưa có key, hết credit, ảnh không nhận ra người/váy) → trợ lý báo rõ lý do trong khung chat, không trừ credit.
- **⚙️ Tùy chỉnh** (nút trên khung soạn tin):
  | Lựa chọn | Giá trị | Credit FASHN |
  |---|---|---|
  | Mô hình | 💎 Siêu nét (`tryon-max`, 1K – **chỉ có khi admin bật, bật thì là mặc định**) · ⚡ Tiêu chuẩn (`tryon-v1.6`) | Siêu nét: Nhanh 1 · Cân bằng 2 · Đẹp nhất 3 /ảnh; Tiêu chuẩn 1/ảnh |
  | Chất lượng | Nhanh / Cân bằng / Đẹp nhất (nhớ riêng cho từng mô hình; mặc định Siêu nét Cân bằng, Tiêu chuẩn Đẹp nhất) | Tiêu chuẩn: chỉ đổi thời gian chờ |
  | Số ảnh mỗi lần | 1–4 | × số ảnh |
  | Loại trang phục (chỉ ảnh váy tự tải), Ảnh váy là, Xóa kỹ đồ đang mặc | chỉ Tiêu chuẩn | – |
  - Tùy chọn nhớ trên máy (localStorage `tramhy.tryon-chat-options`). Giá credit tính ở cả 2 nơi, phải khớp nhau: `creditCost()` trong function và `tryonCost()` trong `services/tryon-ai.js`.
  - **Trang Quản trị → tab "Thử váy AI"**: bật/tắt Siêu nét (bật lúc review / demo rồi tắt) và hạn mức credit/người/ngày (mặc định 6). Lưu vào bảng `app_settings`
    (khóa `tryon`) qua RPC `set_tryon_settings` (chỉ admin); function đọc lại mỗi lần gọi, không cần deploy. Chưa chạy SQL 28 → tab báo rõ và khóa form.
- **Bật FASHN:** đăng ký https://app.fashn.ai → nạp credit → mục **API** tạo key → trong `backend/` chạy
  `npx supabase secrets set --project-ref vsjdijmuvuetmhmszcrl FASHN_API_KEY=<key>` (không cần deploy lại).
- Hạn mức tính theo **tổng credit/người/ngày** (giờ Việt Nam, chỉ ảnh thành công). Mỗi ảnh = 1 dòng `tryon_jobs` (`credits`, `options`, `batch_id`, `message` – SQL 28);
  ảnh kết quả ở bucket riêng tư `tryon-results`. Chưa chạy SQL 28 → Siêu nét tắt, hạn mức = secret `DAILY_LIMIT` (mặc định 6), mỗi ảnh tính 1.
- **Giữ chỗ credit (SQL 34)**: Để chống việc người dùng mở nhiều tab hoặc bấm gửi liên tục vượt hạn mức credit FASHN/Gemini trong ngày trong lúc chờ ảnh tạo xong (~130s), hàm `reserve_tryon_credits` khóa theo người dùng (advisory lock), kiểm tra tổng credit (đã dùng hôm nay + đang giữ chỗ) và ghi dòng `tryon_jobs` trạng thái `pending`. Khối `finally` tự động xóa dòng giữ chỗ khi xong (ảnh thành công ghi dòng `done` riêng; nếu lỗi thì không bị tính credit). Dòng pending quá 5 phút tự động coi như hết hạn.
- **Bảo mật ảnh & chống SSRF**: `thu-vay-ai` kiểm tra URL ảnh váy bằng `isSafeImageUrl()`, chặn đứng localhost, dải IP nội bộ và endpoint metadata của cloud (`169.254.169.254`).
- **Trợ lý chat không để khách chờ lâu**: `askGemini` trong `tro-ly-thu-vay` mỗi model chờ tối đa 10 giây, cả lượt tối đa 22 giây (`AbortSignal.timeout`), và dùng `thinkingLevel: 'low'`. Quá hạn / model quá tải (503) → chuyển model kế, hết model thì trả lời theo luật đơn giản (`ruleBased`), đủ ảnh + váy vẫn ướm ngay. Nguyên nhân sửa: log 26/10 cho thấy Gemini quá tải treo 46–150 giây (có lần Supabase cắt ở 150 giây, mã 546/504) trong khi trước đó chỉ vài giây.
- **Chống spam trợ lý chat**: `tro-ly-thu-vay` áp dụng rate limit ngắn hạn tối thiểu 2 giây giữa 2 tin nhắn của cùng tài khoản (dựa trên index của bảng `ai_usage`).
- Test (giả lập 2 Edge Function + cài đặt, không tốn credit; ảnh tải lên vẫn lưu/xóa thật trên Storage): `tryon.spec.js` (chưa đăng nhập + trang may đo),
  `flows/own-garment-tryon.spec.js`, `flows/tryon-options.spec.js`, `flows/tryon-assistant.spec.js`, `flows/tryon-history.spec.js`, `flows/bride-photos.spec.js`.
  Bài admin bật/tắt Siêu nét và `pages.spec.js` (trang không lỗi console) cần SQL 28 trên project test.
- Deploy lại 2 function: trong `backend/` chạy `npx supabase functions deploy thu-vay-ai --project-ref vsjdijmuvuetmhmszcrl`
  và `npx supabase functions deploy tro-ly-thu-vay --project-ref vsjdijmuvuetmhmszcrl`.

### Loại dịch vụ, giá theo bàn, chặn trùng lịch (SQL 29–31)
- **8 loại dịch vụ**: Váy cưới, Chụp ảnh cưới, Trang trí, Trang điểm, Nhà hàng tiệc, **Tráp ăn hỏi, MC & âm nhạc, Xe hoa** – `VENDOR_CATEGORY` + `PACKAGE_LABEL` (`core/labels.js`), biểu tượng ở `CATEGORY_CHOICES` (`components/shop-form.js`), ảnh bìa minh họa SVG ở `assets/images/covers/`. Thêm loại mới: enum `vendor_category` (file SQL riêng) + 3 chỗ trên.
- **Nhà hàng tính theo bàn**: gói có `price_unit = 'table'`, giá = giá 1 bàn 10 khách, `min_qty–max_qty` = số bàn sảnh nhận (đối tác nhập ở Kênh đối tác). Hộp đặt lịch hỏi **Số bàn**, hiện tổng + 3 đợt; database tính lại tổng (`create_booking` tham số `p_quantity`, lưu `details.tables`, `details.unit_price`). `vendors.base_price` của nhà hàng = giá bàn rẻ nhất; trang Dịch vụ lọc/sắp xếp nhà hàng theo tiệc 30 bàn.
- **Chặn trùng lịch** (trong `create_booking`, khóa theo tiệm để 2 người bấm cùng lúc không lọt): lịch hẹn phải ở tương lai; tiệm thường – 2 lịch cách nhau ≥ 2 tiếng; nhà hàng – mỗi ngày (giờ Việt Nam) tối đa `vendors.halls` tiệc. Đơn đã hủy / hoàn tiền không tính. Hộp đặt lịch gọi `vendor_busy_times` để hiện giờ đã kín và gợi ý giờ trống (chờ tối đa 8 giây, lỗi thì để database tự chặn).
- **Gói mẫu**: `vendor_packages.is_demo = true` → trang tiệm ghi "Một số gói là dữ liệu mẫu phục vụ demo". Xóa dữ liệu demo: `tools/xoa_du_lieu_demo.sql`.
- Test: `flows/booking-rules.spec.js` (nhà hàng theo bàn, kín sảnh, trùng giờ) – mỗi lần chạy tạo đơn thật trên database test; các bài đặt lịch dùng `pickFreeSlot()` (ngày giờ ngẫu nhiên) để không tự trùng lịch nhau.
- Chưa có: giao diện cho đối tác sửa số sảnh (`halls`, đã cấp quyền cột), tiêu đề 3 đợt riêng cho nhà hàng.

### Email đăng ký & chào mừng (SQL 32, email-templates/)
- Email xác nhận / đặt lại mật khẩu / đổi email / magic link: mẫu tiếng Việt ở `backend/supabase/email-templates/`, dán tay vào Supabase → Authentication → Emails → Templates (xem `HUONG_DAN.md`, gồm cả Site URL / Redirect URLs).
- Email chào mừng (Brevo, function `gui-email-chao-mung`): Google – lúc tạo tài khoản; email + mật khẩu – lúc vừa bấm link xác nhận. Bảng `welcome_emails` bảo đảm mỗi người tối đa 1 thư (Supabase tạo tài khoản Google rồi mới xác nhận trong cùng giao dịch, nên chỉ dựa vào điều kiện xác nhận sẽ gửi 2 lần).
- Font tiêu đề email dùng 'Palatino Linotype', Cambria… (Georgia trên Windows tách dấu tiếng Việt: "đế n").

### Thiết kế váy may đo – ngân sách mong muốn
- Trang `thiet-ke-vay.html` không còn hiện giá từng lựa chọn (may đo không có giá cố định). Khách chọn **ngân sách mong muốn**: 6 khoảng (Dưới 8 triệu … Trên 35 triệu) hoặc nhập số / kéo thanh 5–50 triệu.
- Đặt lịch: khoảng giá → gửi giá giữa khoảng (kẹp 5–50 triệu, giới hạn của create_booking) làm `customPrice`; `details.design.budget` (+ `budget_min`, `budget_max`) ghi nhãn khách chọn, hiện trong "Hồ sơ số đo & thiết kế" của đơn. Hộp đặt lịch ghi "Ngân sách dự kiến – giá chốt sau buổi tư vấn".
- Chưa có: chỉnh giá đơn sau buổi tư vấn (các đợt cọc tạm tính theo ngân sách dự kiến).

### Kế hoạch cưới – xuất Excel & chia sẻ (SQL 33)
- **⬇ Xuất Excel** (đầu trang Kế hoạch cưới): file `ke-hoach-cuoi-tram-hy.xlsx` gồm Tổng quan, Ngân sách (cộng từng danh mục + tổng), Checklist, Đơn Trạm Hỷ. Thư viện SheetJS CE 0.20.3 (`js/vendor/xlsx-0.20.3.mini.min.js`, Apache-2.0) chỉ tải khi bấm nút.
- **🔗 Chia sẻ**: bật/tắt link chỉ xem, sao chép, gửi Zalo/Messenger, mã QR, "Tạo link mới" (link cũ hết hiệu lực). Người xem mở `ke-hoach.html?xem=<token>` không cần đăng nhập, chỉ thấy ngân sách, checklist, đơn (tên dịch vụ, tiền, trạng thái) – không có email, số điện thoại, mã đơn. Mọi thứ đi qua RPC `get_shared_plan` (giống thiệp cưới SQL 25).
- Thẻ đếm ngày cưới (`components/plan-summary.js`): trước / đúng ngày / sau ngày cưới đều có màu chữ đọc được (lỗi cũ: `.card` đè nền gradient → chữ trắng trên nền trắng).
- Test: `flows/planner-share.spec.js` (đếm ngày, Excel, chia sẻ – phần chia sẻ cần SQL 33).

### AI tư vấn chia ngân sách cưới
- Trang chủ → **Gợi ý chia ngân sách cưới** chia 2 cột. **Trái**: nhập ngân sách, số khách, nơi tổ chức, ưu tiên, ghi chú → *✨ AI tư vấn* (hoặc *Chia nhanh theo tỷ lệ phổ biến*, không cần AI). **Phải**: bảng chia 6 hạng mục (thanh %, lý do, *Tìm đối tác →* lọc sẵn loại + mức tiền), mẹo, cảnh báo nếu ngân sách không đủ cho số khách.
- **💬 Trao đổi với AI** (dưới bảng chia): hỏi tiếp kiểu "giảm tiền tiệc, tăng chụp ảnh", "mời thêm 50 khách thì sao". Web gửi kèm bảng chia hiện tại + 8 tin nhắn gần nhất; nếu người dùng muốn đổi cách chia, AI trả bảng mới và bảng bên trên tự cập nhật. Giới hạn 15 câu hỏi mỗi lần mở trang (giữ lượt miễn phí của Gemini); AI chỉ trả lời chủ đề cưới hỏi.
- Edge Function `tu-van-ngan-sach` dùng chung secret `GEMINI_API_KEY` với thử váy, gọi **model chữ (chạy được với key Free tier)**, ép AI trả JSON đúng khuôn rồi chuẩn hóa ở server: đủ 6 mục, tổng 100%, tiền làm tròn 100.000đ, cộng lại đúng bằng ngân sách.
- Model hay bị Google báo **quá tải (503)** → function thử lại 1 lần rồi chuyển lần lượt `gemini-3.8-flash` → `gemini-3.1-flash-lite` → `gemini-3.7-flash` → `gemini-3-flash-preview`. Tất cả đều bận → web báo "AI đang quá tải" và tự hiện cách chia cố định, người dùng không bị kẹt. Muốn ưu tiên model khác: secret `GEMINI_TEXT_MODEL`.
- Khách chưa đăng nhập cũng dùng được (deploy `--no-verify-jwt`): trong `backend/` chạy `npx supabase functions deploy tu-van-ngan-sach --project-ref vsjdijmuvuetmhmszcrl --no-verify-jwt`.
- Test Playwright giả lập phản hồi của function (`page.route`) nên không tốn lượt gọi Gemini.
- Dưới bảng chia có nút **💾 Lưu thành kế hoạch cưới** → mang cách chia sang trang Kế hoạch (xem mục SQL 20–21).

### Quên mật khẩu
- Trang Đăng nhập → **Quên mật khẩu?** → nhập email → Supabase gửi link về `reset-password.html` → nhập mật khẩu mới 2 lần → tự đăng nhập và vào đúng trang theo vai trò.
- Web không cho biết email có tồn tại hay không (tránh bị dò tài khoản).
- Link chỉ dùng 1 lần; hết hạn hoặc mở sai thì trang báo rõ và dẫn về Đăng nhập để gửi lại.
- Cần `reset-password.html` nằm trong *Redirect URLs* – đã có sẵn nhờ `https://tram-hy-alpha.vercel.app/**` và `http://localhost:8080/**`.
- Nội dung email: Supabase → Authentication → Emails → Templates → **Reset Password** (có thể dịch sang tiếng Việt).

### Xác nhận email (bật *Confirm email* trong Supabase)
- Link trong email quay về `login.html?confirmed=1` **trên đúng web nơi người dùng đăng ký** → hiện "Xác nhận tài khoản thành công!" và tự đăng nhập, kể cả khi bấm link trên điện thoại khác thiết bị đăng ký (client dùng `flowType: 'implicit'`).
- Link hết hạn / đã dùng → trang báo rõ lý do.
- Đăng ký ở `localhost` thì link chỉ mở được trên chính máy tính đó. Muốn bấm link trên điện thoại → đăng ký trên bản Vercel.
- Địa chỉ quay về phải có trong *Redirect URLs*, nếu không Supabase sẽ dùng *Site URL*.

### Giao diện điện thoại
- Mọi trang 1 cột dưới 900px; danh sách váy/đối tác 2 cột dưới 560px; Kanban xếp dọc.
- Phòng thử: nút "Đặt lịch" dính đáy màn hình; chọn váy xong tự cuộn lên gương xem kết quả.
- Ô nhập cỡ chữ 16px để iPhone không tự phóng to khi bấm vào.

### Xóa tài khoản test
- Chưa có đơn: Supabase → Authentication → Users → ⋯ → Delete user.
- Đã có đơn (báo *Database error deleting user*): chạy [`backend/supabase/tools/xoa_tai_khoan_test.sql`](backend/supabase/tools/xoa_tai_khoan_test.sql) sau khi sửa danh sách email.
- Mẹo: dùng `ten+test1@gmail.com`, `ten+test2@gmail.com`… – mỗi địa chỉ là 1 tài khoản riêng nhưng thư về cùng hộp Gmail.

### Gói dịch vụ cho tiệm không bán váy (SQL 19)
- Tiệm Trang trí / Chụp ảnh / Trang điểm / Nhà hàng có nhiều **gói**, tên gọi theo loại (`PACKAGE_LABEL` trong `core/labels.js`):
  "Mẫu rạp & trang trí", "Gói chụp ảnh cưới", "Gói trang điểm", "Sảnh & thực đơn". Mỗi gói: tên, giá, giá gốc (hiện "Giảm X%"),
  mô tả, ảnh chính + tối đa 10 ảnh chi tiết; tối đa 30 gói / tiệm. Ảnh nằm ở bucket `vendor-portfolio/<vendor_id>/pkg-…`.
- Kênh đối tác: tab thứ 2 đổi tên theo loại tiệm (`components/package-manager.js`) – thêm / sửa / ẩn / xóa giống Mẫu váy.
- Trang tiệm: mục gói (thẻ + trình xem ảnh) với nút **"Đặt … này"**; khung bên phải hiện "N mẫu · từ <giá rẻ nhất>".
  `create_booking` nhận thêm `p_package_id`: **giá lấy từ gói ở server** và tên gói được lưu vào `bookings.details.package`
  (tiệm đổi tên / xóa gói thì đơn cũ vẫn đúng). Đơn hiện tên gói ở Đơn của tôi, Kênh đối tác, Quản trị.

### Kế hoạch cưới (SQL 20)
- Trang `ke-hoach.html` (`pages/planner.js`), 3 tab: **Tổng quan** (đếm ngược, 3 thẻ số liệu, việc sắp tới), **Ngân sách**
  (`components/budget-board.js`), **Checklist** (`components/checklist-board.js`). Mở thẳng tab bằng `?tab=budget|checklist`.
- Tạo kế hoạch từ mẫu `data/planner-templates.js`: phong tục **Bắc** (dạm ngõ, ăn hỏi) hoặc **Nam** (đám hỏi, rước dâu);
  nhập tổng ngân sách thì số dự kiến điền sẵn theo tỷ lệ (làm tròn 100.000đ). 25 việc checklist, hạn = ngày cưới − `days_before`.
- **Đơn đặt qua Trạm Hỷ không lưu trong kế hoạch**: lúc hiển thị, mỗi đơn (trừ đã hủy / hoàn tiền) được gắn vào danh mục đầu tiên
  có `vendor_category` trùng loại tiệm; số "đã trả" = các chặng `paid` + `released`. Nhờ vậy luôn khớp đơn thật.
- Sửa ngay trên bảng, **tự lưu khi rời ô** (`components/save-status.js` hiện "Đang lưu… / ✓ Đã lưu tự động";
  đang lưu dở mà đóng / tải lại trang thì trình duyệt hỏi lại). Kéo thả bằng `components/sortable.js` (chạy cả cảm ứng).
- Giới hạn chống lạm dụng ở server: 40 danh mục, 400 mục chi tiêu, 300 việc / kế hoạch.
- Kiểm thử: `tests/e2e/flows/planner.spec.js`.

### Tốc độ tải trang
- **Ảnh**: web dùng bản `.webp` trong `assets/images/` (ảnh gốc .jpg/.png vẫn giữ cho email, Edge Function thử váy và dữ liệu
  cũ). Thêm ảnh mới: tạo cả bản .webp (cạnh dài ≤ 1400px, chất lượng ~80). Ảnh Unsplash xin đúng cỡ khi hiển thị qua
  `sizedImage(url, width)` trong `core/utils.js` (thẻ nhỏ không tải ảnh 1200px).
- **Thư viện Supabase tự lưu**: `js/vendor/supabase-<phiên bản>.js` (1 file đóng gói bằng esbuild, không phụ thuộc CDN).
  Nâng cấp: trong thư mục tạm `npm i @supabase/supabase-js@<bản mới> esbuild`, tạo `entry.js` gồm
  `export { createClient } from '@supabase/supabase-js';` rồi
  `npx esbuild entry.js --bundle --format=esm --minify --platform=browser --outfile=<repo>/frontend/js/vendor/supabase-<bản mới>.js`;
  đổi đường dẫn import trong `core/supabase.js` và dòng `modulepreload` ở các trang .html (đổi tên file = trình duyệt tải bản mới).
- **Kết nối sớm**: mỗi trang có `preconnect` tới Google Fonts + Supabase và `modulepreload` thư viện Supabase;
  CSS Google Fonts tải không chặn (`media="print" onload`) nên code trang chạy ngay, chữ đổi sang font đẹp khi tải xong.
- **Cache** (`frontend/vercel.json`): `js/vendor/*` nhớ 1 năm (tên file có phiên bản), `assets/*` nhớ 7 ngày;
  JS/CSS của web luôn hỏi lại server (304 nếu không đổi) để sau mỗi lần deploy không bị trộn code cũ và mới.

### Thiệp cưới – quyền truy cập (SQL 25) ⚠️
- **Có link mới mở được**: bảng `invitations` chỉ chủ thiệp / admin đọc. Khách gọi `open_invitation(slug, password)` →
  `{ status: ok | locked | wrong_password | not_found, invitation }` (thiệp khóa chỉ trả tên cô dâu chú rể).
- Gửi phản hồi / lời chúc / đọc lời chúc đã duyệt **chỉ qua hàm kèm slug**: `submit_rsvp`, `submit_wish`, `list_wishes`.
  Không còn chèn thẳng vào `rsvps` / `guestbook_entries`. Trigger chống spam (16, 24) vẫn chạy bên trong.
- `invitation_by_link` KHÔNG báo lỗi khi sai link / mật khẩu mà trả mã (`OK|NOT_FOUND|LOCKED|WRONG_PASSWORD`): báo lỗi
  sẽ hủy luôn bản ghi lần thử sai trong `invitation_open_fails` → chống dò (20 lần / 15 phút / IP) mới có tác dụng.
- Mật khẩu tùy chọn (`set_invitation_password`, băm bcrypt trong `invitation_secrets`); khách nhập 1 lần, lưu sessionStorage.
- Cột `locked`, `view_count` không sửa được qua API (quyền sửa cấp theo từng cột nội dung). Lượt xem: `invitation_visits`
  (IP băm / ngày) + `invitation_stats(id)` cho chủ thiệp; chủ thiệp tự mở không tính.
- Test bảo mật: `tests/e2e/flows/invitation.spec.js` gọi thẳng REST bằng khóa công khai để chắc không đọc / ghi lén được.

### Thiệp cưới – nhiều sự kiện, câu hỏi, mừng cưới 2 bên… (lưu trong `details`)
- `details.events`: `[{ id, name, kind: le|tiec, at, place, address, main }]` – trang 2 in lễ đầu tiên, trang 3 in tiệc chính;
  cột `event_at` / `venue` tự đồng bộ theo tiệc chính (đếm ngược, chỉ đường, thông báo). Thiệp cũ chưa có danh sách →
  `weddingEvents()` (components/invitation-card.js) dựng từ giờ lễ / giờ tiệc cũ. Soạn bằng `components/invitation-lists.js`.
- `details.rsvp_questions`: `[{ id, text, type: choice|text, options, required, event_id }]` (≤ 5). `submit_rsvp` kiểm tra
  sự kiện có thật, câu bắt buộc, đáp án hợp lệ; lưu `rsvps.event_ids` + `rsvps.answers`. Chủ thiệp thấy khách theo từng
  sự kiện + thống kê câu trả lời.
- `details.gift_groom` / `gift_bride` `{ bank, account, holder }` (QR VietQR từng bên); `details.video` (mã YouTube, chỉ tải
  khi bấm, nhạc nền tự dừng); `details.wedding_party` `{ groomsmen, bridesmaids }`; `details.effect` (hearts | petals | snow |
  sparkles – `components/wedding-effects.js`, tắt khi máy bật giảm chuyển động).
- Mã QR thiệp tạo ngay trên trình duyệt (`components/qr-share.js`, thư viện `js/vendor/qrcode-generator-1.4.4.js` MIT);
  "Chia sẻ qua Zalo, Messenger…" dùng bảng chia sẻ của điện thoại (navigator.share), máy tính thì sao chép link.

### Thiệp cưới – mẫu thiệp, phong bì (SQL 22)
- Thiệp vuông 3 trang: **bìa** (tên viết tay, ảnh tròn / chữ lồng, "Trân trọng kính mời" + tên khách) · **gia đình & hôn lễ**
  (nhà trai, nhà gái, Lễ thành hôn / Lễ vu quy theo bên tổ chức, giờ lễ + **ngày âm lịch**) · **tiệc cưới** (nhà hàng,
  địa chỉ, giờ tiệc, ảnh với dòng chữ uốn cong). Vẽ bởi `components/invitation-card.js`, CSS riêng `css/invitation.css`
  (cỡ chữ theo bề rộng trang – container query – nên cùng một thiệp dùng cho ảnh nhỏ, xem trước và trang khách).
- 6 mẫu tự thiết kế trong `data/invitation-templates.js` (màu + loại họa tiết SVG + font viết tay có tiếng Việt).
  **Không sao chép mẫu / hình của web khác** – thêm mẫu mới = thêm 1 dòng (và họa tiết nếu cần).
- Âm lịch: `core/lunar.js` (thuật toán Hồ Ngọc Đức, múi giờ +7, có tháng nhuận, năm can chi).
- `invitation.html`: chưa đăng nhập (hoặc `?mau=1`) → thư viện mẫu; đăng nhập → trình soạn (`?template=` chọn sẵn);
  `?i=<slug>&to=<tên>` → khách mời: phong bì ghi "Kính gửi <tên>", chạm con dấu để mở → 3 trang thiệp, đếm ngược,
  chỉ đường (Google Maps), lưu vào Google Calendar, xác nhận tham dự, QR mừng cưới; thanh nút dưới đáy.
- Trình soạn có ô "Mời riêng từng người" → sao chép link kèm `&to=`.
- Ảnh cưới: ảnh bìa (`photo_url`) + ảnh trang tiệc (`details.photo2_url`, mặc định dùng chung ảnh bìa). Nén trên trình duyệt rồi
  tải lên `invitation-photos/<user_id>/…` (công khai); đổi / bỏ ảnh thì xóa file cũ sau khi bấm Lưu.
- Trang 3: ảnh tròn + chữ cong nằm trong luồng flex, tự co theo chỗ còn lại (tên nhà hàng dài vẫn không bị cắt).
- **Album** (≤ 12 ảnh, kéo đổi thứ tự), **chuyện tình yêu** (≤ 6 cột mốc) và **nhạc nền** lưu trong `invitations.details`
  (`album`, `story`, `music`). Khách xem album bằng trình xem ảnh chung `openPhotoGallery` (components/dress-gallery.js).
- **Nhạc nền** (`components/wedding-music.js`): 3 bản "hộp nhạc" – Canon in D, Here Comes the Bride, Ode to Joy (giai điệu
  đã hết bản quyền, trình duyệt tự chơi bằng Web Audio, không có file âm thanh) hoặc link YouTube cô dâu tự dán (phát qua
  youtube-nocookie, điều khiển bằng postMessage). Phát khi khách chạm con dấu mở phong bì; nút ♪ bật / tắt.
  Điện thoại chỉ cho phát tiếng ngay trong lúc chạm: khung YouTube được tải sẵn khi khách mở link (`prepare()`),
  lúc chạm con dấu chỉ gửi lệnh `playVideo`; hộp nhạc "mở khóa" âm thanh bằng 1 mẫu âm câm. Nút ♪ hiện trạng thái THẬT
  (trình phát báo về qua `onState`) → nếu máy vẫn chặn, nút hiện "tắt" và khách bấm 1 lần là nghe.
- **Sổ lời chúc** (SQL 24, bảng `guestbook_entries`): khách gửi → "chờ duyệt", chỉ lời chúc đã duyệt mới hiện cho mọi người
  (RLS). Chủ thiệp duyệt / ẩn / xóa ở trang soạn (mục Sổ lời chúc, có realtime + thông báo chuông). Chủ thiệp chỉ được đổi
  cột `status` (quyền theo cột), không sửa được lời của khách. Chống spam giống phản hồi: chặn link, ≤ 3 lời / tên / thiệp,
  ≤ 6 lời / IP / thiệp / giờ, IP lưu dạng băm ở `guestbook_meta`. Form "Xác nhận tham dự" vẫn có ô lời nhắn riêng (chỉ cô dâu thấy).

### AI trong Kế hoạch cưới (SQL 21 + function tu-van-ngan-sach chế độ `plan`)
- **Lưu thành kế hoạch** (trang chủ): cách chia đang xem được giữ trong `localStorage` (`savePlanDraft`, hết hạn 1 ngày) rồi mở
  `ke-hoach.html?from=ai` – chưa đăng nhập thì đăng nhập xong quay lại đúng trang. Chưa có kế hoạch → form tạo điền sẵn và
  số "Dự kiến" lấy theo cách chia AI (`spreadAllocations`: danh mục có loại tiệm nhận tiền hạng mục đó, danh mục lễ hỏi / nhẫn /
  thiệp chia nhau hạng mục "other", trong nhóm chia theo tỷ trọng mẫu). Đã có kế hoạch → hộp thoại hỏi có áp vào không
  (chỉ đổi mục chưa trả; thực tế và đơn Trạm Hỷ giữ nguyên). Cách chia nhanh (không AI) chỉ mang sang tổng tiền.
- **Tab ✨ Hỏi AI** (`components/plan-assistant.js`): Edge Function **tự đọc kế hoạch + đơn đặt của người hỏi ở server**
  (không tin số trình duyệt gửi), mỗi mục có mã ngắn i1, i2… AI trả `changes` → web hiện thẻ đề xuất: tick chọn từng mục,
  tổng trước → sau (còn vượt hay đã trong ngân sách), **Áp dụng** rồi **Hoàn tác** được. Không bấm thì không đổi gì.
  Server bỏ đề xuất cho mục đã trả / mã lạ, làm tròn 100.000đ. Nút **✨ Hỏi AI về ngân sách** và **Hỏi AI cách cân đối**
  (khi vượt ngân sách) ở tab Ngân sách mở thẳng tab này.
- **Giới hạn 20 câu / người / ngày** (giờ Việt Nam) đếm ở server bằng bảng `ai_usage`; chỉ câu trả lời thành công mới bị tính. Đồng thời có rate limit ngắn hạn tối thiểu 2 giây giữa 2 câu hỏi liên tiếp để chống gửi dồn dập.
- Deploy lại function sau khi chạy SQL 21: trong `backend/` chạy
  `npx supabase functions deploy tu-van-ngan-sach --project-ref vsjdijmuvuetmhmszcrl --no-verify-jwt`
  (chế độ `plan` tự kiểm tra đăng nhập bằng token gửi lên).

### Chuông thông báo (SQL 18)
- Chuông 🔔 cạnh avatar (máy tính: thả xuống · điện thoại: tấm trượt từ dưới lên), số chưa đọc trên chuông và
  trên tiêu đề tab "(3) …". Thông báo mới (realtime): chuông rung + toast. Bấm thông báo → đánh dấu đã đọc và
  đi thẳng tới đúng đơn (`?focus=MÃ` – đơn được cuộn tới và nháy sáng) / đúng tab Quản trị (`admin.html?tab=…`).
- **Database tự tạo** thông báo bằng trigger (`notif_*` trong `18_notifications.sql`), không phụ thuộc trang đang mở:

  | Ai | Sự kiện |
  |---|---|
  | Admin | Hồ sơ mở tiệm mới / gửi lại · Khiếu nại mới · Đối tác báo khách không đến |
  | Đối tác | Đơn mới · Khách trả cọc từng đợt · Giải ngân · Khách yêu cầu hoàn cọc · Kết quả phân xử · Hồ sơ được duyệt / cần sửa · Tích Xanh · Đánh giá mới · Đơn hoàn tất |
  | Cô dâu | Tiệm bắt đầu thực hiện · Tiệm báo xong (chờ nghiệm thu) · Đơn hoàn tất (mời đánh giá) · Tiệm hủy đơn chưa cọc · Bị báo không đến · Kết quả khiếu nại · Khách phản hồi thiệp |
- Mỗi người chỉ đọc / đánh dấu đã đọc thông báo của mình (RLS, chỉ được sửa cột `read_at`). Đơn demo (SQL 15)
  không tạo thông báo; thông báo cũ hơn 90 ngày tự dọn. Chưa chạy SQL 18 thì chuông tự ẩn.
- Giai đoạn 2 (chưa làm): email cho sự kiện quan trọng (Brevo), thông báo đẩy về điện thoại khi đã tắt web (PWA).

### Trở thành đối tác (như "Bán hàng cùng Shopee")
- **Một tài khoản cho cả mua lẫn bán.** Form đăng ký chung không còn ô chọn vai trò – ai cũng đăng ký như nhau.
  Muốn bán hàng: bấm **🏪 Trở thành đối tác** (menu tài khoản, chân trang, cuối trang chủ) → trang `/doi-tac`
  (lợi ích, quy trình 4 bước, câu hỏi thường gặp) → **Bắt đầu đăng ký**:
  chưa đăng nhập → `login?tab=signup&next=vendor-dashboard.html` (đăng ký email/Google xong vào thẳng form mở tiệm,
  kể cả khi phải bấm link xác nhận email); đã đăng nhập → vào thẳng Kênh đối tác.
- **Mở tiệm từng bước** (`components/shop-wizard.js`): ① loại dịch vụ ② thông tin tiệm ③ xem lại + đồng ý điều khoản
  (phí 10%, Escrow). Tự lưu nháp trên máy. Gửi xong (SQL 17: `register_vendor` cho phép cô dâu) tài khoản tự thành
  đối tác, vẫn đặt dịch vụ như khách.
- **Chờ duyệt**: dòng thời gian Đã gửi → Đang xét duyệt → Kết quả (realtime); bị từ chối thì hiện lý do + sửa gửi lại.
- **Sau khi duyệt**: thanh "Hoàn thiện hồ sơ" (`components/partner-checklist.js`): logo + ảnh bìa, ≥ 3 mẫu váy / ảnh thực tế,
  **tài khoản nhận tiền giải ngân** (bảng riêng tư `vendor_payouts` – chỉ chủ tiệm và admin xem), xem trước trang tiệm.

### Đối tác mới mở tiệm
1. Đối tác: Tạo tài khoản, chọn "Đối tác" → vào **Kênh đối tác** → điền form **Đăng ký mở tiệm** → Gửi.
2. Admin: **Quản trị → Duyệt đối tác** (có số hồ sơ chờ) → **Duyệt** hoặc **Từ chối** kèm lý do.
3. Đối tác thấy kết quả ngay (realtime). Bị từ chối → sửa thông tin ngay trên trang → **Sửa & gửi duyệt lại**.
4. Tiệm được duyệt mới hiện ở Dịch vụ cưới và nhận đơn. Tiệm có sẵn trong dữ liệu mẫu thì dùng nút **Gắn chủ tiệm** ở tab Đối tác.
5. Kênh đối tác có 3 tab: **Đơn hàng** · **Mẫu váy** (tiệm váy cưới: thêm/sửa/ẩn/xóa mẫu; 1 ảnh chính + tối đa 10 ảnh các góc, khách bấm vào ảnh để xem từng góc) · **Ảnh tiệm** (**logo** – hiện cạnh tên tiệm ở Dịch vụ cưới, trang tiệm, trang chủ; ảnh bìa; tối đa 20 ảnh thực tế, hiện ở trang chi tiết tiệm).

### Tạo tài khoản admin và đối tác
1. Đăng ký 2 tài khoản trên web (trang Đăng nhập → Tạo tài khoản).
2. Supabase → SQL Editor, chạy (thay email):
   ```sql
   update public.profiles set role = 'admin'
    where id = (select id from auth.users where email = 'admin@gmail.com');
   ```
3. Đăng nhập bằng admin → **Quản trị → Đối tác** → bấm **Gắn chủ tiệm** ở dòng "2H Studio" → nhập email tài khoản đối tác.

### Kịch bản kiểm thử đầy đủ (dùng 3 cửa sổ: thường / ẩn danh / trình duyệt khác)
1. **Cô dâu**: Thử váy → chọn "Váy Cưới Đuôi Cá Đính Pha Lê Royal" (2H Studio) → Đặt lịch → Đơn của tôi → Thanh toán đợt 1.
2. **Đối tác 2H Studio**: Kênh đối tác thấy đơn **tự nhảy** sang cột "Đã nhận cọc" → Bắt đầu thực hiện.
3. **Cô dâu**: Nghiệm thu đợt 1 → Thanh toán đợt 2 → Yêu cầu hoàn cọc (nhập lý do).
4. **Admin**: Quản trị → Khiếu nại → Hoàn tiền cho cô dâu → đơn chuyển "Đã hoàn tiền", đợt 2 "Đã hoàn".
5. Làm lại một đơn khác đến khi cả 3 đợt "Đã giải ngân" → đơn Hoàn tất → **Đánh giá** → sao của đối tác tăng ở trang chi tiết.
6. **Thiệp cưới**: tạo thiệp → sao chép link → mở ở cửa sổ ẩn danh → gửi phản hồi → quay lại thấy số khách.

---

## 7. Lỗi của bản cũ đã được xử lý
| Lỗi | Xử lý |
|---|---|
| `marketplace.html` thiếu dấu `}` → trang trống | Viết lại trang |
| `invitation.html` dùng biến trước khi khai báo → mất tab xem thiệp, RSVP | Viết lại trang, RSVP lưu database |
| Ảnh `user_tryon_royal.jpg` không tồn tại | Dùng `user_tryon_blue_royal.jpg` |
| Ảnh Unsplash không liên quan (bài poker, tháp Eiffel…) | Bỏ; ảnh váy dùng ảnh thử váy thật, đối tác dùng chữ viết tắt |
| `detail.html` luôn hiện TuArt cho mọi đối tác | `vendor.html?slug=` đọc đúng đối tác |
| Tỷ lệ Escrow lệch nhau giữa các trang | Thống nhất 30/50/20 (thuê) – 30/40/30 (may đo), do database quyết định |
| Chữ 10–11px khó đọc, nhiều thuật ngữ | Cỡ chữ tối thiểu 12–13px, lời văn đời thường |
| Đơn mới của tiệm bị đẩy về trang 10+ khi tiệm có nhiều đơn | `listVendorBookings` sắp xếp theo `created_at DESC` thay vì `appointment_at ASC` |
| Bấm thông báo `?focus=code` không thấy đơn ở trang 2+ | `vendor-dashboard.js` tự động tính trang và nhảy đến đúng trang chứa đơn cần highlight |
| Trợ lý AI thử váy bị treo 46–150s khi Gemini quá tải | Giới hạn timeout 10s/22s, `thinkingLevel: 'low'`, fallback sang rule-based không để khách đợi |
| Khách muốn dừng AI khi đang trả lời / đang ướm và sửa lại câu chat | Nút Gửi tự đổi thành Dừng (`⏹`) khi AI đang bận; bấm dừng sẽ hủy request (`AbortController`), phục hồi câu chat vào ô nhập kèm nút "Dùng lại" trên từng tin nhắn |

---

## 8. Việc tiếp theo (đề xuất theo thứ tự)

| # | Việc | Nằm ở |
|---|---|---|
| ✅ | Đối tác tự quản lý mẫu váy, logo, ảnh bìa, ảnh thực tế | Đã xong (SQL 07, 13) |
| 1 | **Chặn trùng lịch**: tiệm khai báo giờ làm việc, khách chỉ chọn được khung giờ còn trống | SQL + `frontend/` |
| 2 | **Trang "Tài khoản của tôi"**: sửa tên/SĐT, xem số đo (xem/xóa ảnh đã tải: đã có ở Phòng thử) | `frontend/` |
| 3 | **Thông báo email** khi có đơn mới, đã cọc, chờ nghiệm thu, khiếu nại được xử lý | Edge Function |
| 4 | **Thanh toán thật** (PayOS): webhook xác nhận chuyển khoản → gọi `pay_milestone` | Edge Function |
| ✅ | AI thử váy thật (FASHN, dự phòng Gemini) dạng trò chuyện, trợ lý chat, hạn mức credit/người/ngày, admin bật/tắt Siêu nét, nút Dừng phản hồi (`⏹`) & Dùng lại câu chat | Đã xong (SQL 11, 12, 28, 34 + function thu-vay-ai, tro-ly-thu-vay) |
| ✅ | AI tư vấn chia ngân sách cưới theo số khách, thành phố, ưu tiên | Đã xong (function tu-van-ngan-sach) |
| ✅ | Kế hoạch cưới: ngân sách theo nghi lễ, checklist, tổng quan | Đã xong (SQL 20) |
| ✅ | AI trong Kế hoạch cưới: lưu gợi ý AI thành kế hoạch, trợ lý đề xuất sửa từng mục (Áp dụng / Hoàn tác), 20 câu / ngày | Đã xong (SQL 21) |
| ✅ | Thiệp cưới: 6 mẫu thiệp 3 trang, phong bì mở thiệp, hai họ, âm lịch, ảnh cưới, link mời riêng | Đã xong (SQL 22) |
| ✅ | Thiệp cưới: album, chuyện tình yêu, sổ lời chúc có duyệt, nhạc nền | Đã xong (SQL 24) |
| ✅ | Thiệp: chỉ mở bằng link + mật khẩu tùy chọn, nhiều sự kiện, câu hỏi khi xác nhận, mừng cưới 2 bên, video, phù dâu phù rể, trả lời lời chúc, hiệu ứng, QR + chia sẻ, lượt xem | Đã xong (SQL 25) |
| 5 | **Quản lý khách mời**: danh sách khách, nhập / xuất Excel, link riêng hàng loạt, theo dõi đã mở / đã xác nhận, sổ tiền mừng | SQL + `frontend/` |
| 6 | **Tự xóa ảnh cô dâu sau 24 giờ** (cam kết bảo mật trong báo cáo) | Scheduled Edge Function |
| 7 | Đo lường hành vi (Vercel Analytics) để có số liệu cho báo cáo | `frontend/` |
| 8 | Ảnh xem trước khi chia sẻ link thiệp / tiệm qua Zalo, Facebook | `frontend/` |
| 9 | Tách project Supabase test và thật trước khi mời người dùng thật | Supabase |
| 10 | Chống spam RSVP (giới hạn số lần gửi) | SQL |

Các mục dùng **Edge Function** là việc bắt buộc chạy ở server (cần khóa bí mật hoặc chạy định kỳ) – sẽ nằm trong `backend/supabase/functions/`.

---

## 9. Ghi chú bảo mật

### Chống bot & spam
- **CAPTCHA (Cloudflare Turnstile)** cho đăng nhập / đăng ký / quên mật khẩu bằng email (Google không cần).
  Code: `components/captcha.js`, site key ở `TURNSTILE_SITE_KEY` trong `config.js` (trống = tắt).
  Bật theo đúng thứ tự: (1) tạo widget Turnstile ở Cloudflare (hostname `tram-hy-alpha.vercel.app`, `localhost`) →
  (2) điền **site key** vào `config.js`, push, chờ Vercel deploy → (3) Supabase → Authentication → Attack Protection →
  bật CAPTCHA, chọn Turnstile, dán **secret key**. Làm ngược thứ tự thì đăng nhập email sẽ lỗi cho tới khi web có site key.
  Database test không bật CAPTCHA nên Playwright không bị ảnh hưởng.
- **Phản hồi thiệp (SQL 16)**: trigger trong database làm sạch dữ liệu, mỗi tên chỉ phản hồi 1 lần / thiệp,
  tối đa 10 phản hồi / thiệp / giờ và 30 / ngày theo IP (chỉ lưu IP đã băm ở bảng `rsvp_meta`, API không đọc được),
  chặn link trong lời chúc, tối đa 1.000 phản hồi / thiệp. Web thêm ô bẫy bot ẩn và nhớ máy đã gửi phản hồi.
- `frontend/js/config.js` chứa **publishable key** – được phép công khai, commit lên GitHub không sao.
- **Không bao giờ** đưa vào code: mật khẩu database, `service_role` / secret key, API key của AI hay cổng thanh toán. Những key đó chỉ đặt trong *Edge Function Secrets* của Supabase.
- Vai trò `admin` chỉ đổi được bằng SQL trong Supabase – người dùng không tự nâng quyền được.

### Bảo mật Edge Functions & API
- **Khóa CORS theo Origin (`backend/supabase/functions/_shared/cors.ts`)**: Cả 5 Edge Functions (`thu-vay-ai`, `tro-ly-thu-vay`, `tu-van-ngan-sach`, `excel-dong-bo`, `khieu-nai-sla`) được bọc qua middleware `withCors`. Không còn dùng wildcard `Access-Control-Allow-Origin: *`, mà kiểm tra header `Origin` của trình duyệt:
  - Chỉ chấp nhận tên miền chính thức của web (mặc định `https://tramhy.id.vn`, `https://www.tramhy.id.vn`, `https://tram-hy-alpha.vercel.app`, hoặc tùy chỉnh qua `SITE_URL` / secret `ALLOWED_ORIGINS`), và môi trường chạy thử cục bộ (`localhost` / `127.0.0.1` mọi cổng).
  - Trình duyệt từ website lạ gọi lén API của người dùng đã đăng nhập sẽ tự động bị chặn đọc phản hồi (`Vary: Origin` được thiết lập đầy đủ).
  - Không ảnh hưởng các kết nối server/tool bên ngoài không qua trình duyệt (Excel, Google Sheets IMPORTDATA, webhook database, cron).
- **Giữ chỗ credit thử váy (SQL 34)**: Edge Function `thu-vay-ai` giải quyết triệt để lỗ hổng race condition (người dùng mở nhiều tab hoặc gửi dồn dập nhiều yêu cầu cùng lúc để vượt hạn mức credit FASHN/Gemini trong thời gian chờ AI ~130 giây):
  - Hàm database `reserve_tryon_credits` sử dụng `pg_advisory_xact_lock` theo id người dùng, tính tổng credit (`done` hôm nay + `pending` trong 5 phút gần nhất), nếu đủ hạn mức thì ghi một dòng tạm `status = 'pending'` với số credit của lượt.
  - Sau khi lượt kết thúc (thành công lưu ảnh xong hoặc gặp lỗi), khối `finally` tự động xóa dòng giữ chỗ `pending`. Dòng pending bị treo quá 5 phút sẽ tự động mất hiệu lực tính toán.
- **Chống tấn công SSRF khi tải ảnh váy (`isSafeImageUrl`)**: `thu-vay-ai` thẩm định mọi URL ảnh váy trước khi server fetch. Chặn đứng các URL trỏ về `localhost`, `127.0.0.1`, `0.0.0.0`, dải IP mạng riêng tư nội bộ (RFC 1918: `10.x`, `192.168.x`, `172.16-31.x`) và các địa chỉ dịch vụ đám mây nhạy cảm (AWS/GCP metadata `169.254.169.254`).
- **Chống spam liên tục (Rate limit ngắn hạn)**: `tro-ly-thu-vay` và `tu-van-ngan-sach` kiểm tra thời điểm gọi gần nhất trong bảng `ai_usage` (đã có index `ai_usage_user_day_idx`), từ chối ngay bằng mã HTTP 429 nếu 2 câu hỏi/tin nhắn cách nhau dưới 2 giây.
