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
│   ├── tryon.html            Phòng thử váy AI + may đo tự thiết kế
│   ├── marketplace.html      Danh sách đối tác (lọc, tìm, sắp xếp)
│   ├── vendor.html           Chi tiết đối tác (?slug=tuart)
│   ├── bookings.html         Đơn của tôi: trả cọc, nghiệm thu, khiếu nại, đánh giá
│   ├── invitation.html       Thiệp cưới online + RSVP (?i=<mã thiệp> cho khách mời)
│   ├── login.html            Đăng nhập / đăng ký
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
│   └── 05_reviews_admin.sql  Đánh giá, admin gắn chủ tiệm, dọn ảnh bìa
│
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
| `vendors` | Đối tác: tên, loại, khu vực, giá từ, sao, Tích Xanh, chủ tiệm | Mọi người |
| `dresses` | Mẫu váy: thuê / may đo, kiểu, giá | Mọi người |
| `body_profiles` | Chiều cao, cân nặng, giày, dáng người | Chính chủ |
| `bookings` | Đơn đặt lịch (chung cho thuê váy, may đo, dịch vụ) | Cô dâu của đơn, chủ tiệm, admin |
| `milestones` | 3 chặng thanh toán của mỗi đơn | Như `bookings` |
| `disputes` | Khiếu nại: hoàn cọc / khách không đến | Như `bookings` |
| `reviews` | Đánh giá – chỉ đơn **đã hoàn tất** mới được viết | Mọi người |
| `invitations`, `rsvps` | Thiệp cưới và phản hồi khách mời | Thiệp: mọi người · RSVP: chủ thiệp |

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

### 4.4 Storage & Realtime
- `bride-photos` (riêng tư): ảnh cô dâu tải lên ở phòng thử, lưu theo thư mục `<user_id>/`, chỉ chính chủ đọc được.
- `dress-images`, `vendor-portfolio` (công khai): để đối tác tải ảnh váy / portfolio (chưa có giao diện).
- Realtime bật cho `bookings`, `milestones`, `disputes` → trang Đơn của tôi, Kênh đối tác, Quản trị tự cập nhật.

---

## 5. Frontend

### 5.1 Quy ước code
1. **Không gọi Supabase trong `pages/`** – mọi truy vấn viết trong `services/` (1 chỗ để sửa khi đổi database).
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
| Thiệp cưới | Có (soạn) · Không (khách mời xem qua link) | |
| Kênh đối tác | Vai trò `vendor` + được gắn với tiệm | |
| Quản trị | Vai trò `admin` | |

### 5.3 Những gì còn là DEMO (chưa thật)
- **Ảnh thử váy**: là ảnh render sẵn theo người mẫu × kiểu váy, chưa ghép AI lên ảnh thật.
- **Điểm tôn dáng**: tính theo bảng quy tắc stylist (`data/tryon-data.js`), không phải mô hình AI.
- **Thanh toán**: cô dâu bấm "Tôi đã chuyển khoản" là ghi nhận. Mã VietQR hiển thị đúng chuẩn nhưng tài khoản trong `config.js` là số giả.

---

## 6. Cách chạy

### Lần đầu (đã làm xong 01–04, còn **05**)
1. Supabase → **SQL Editor** → New query → dán `backend/supabase/05_reviews_admin.sql` → Run.
   (Nếu tạo project mới: chạy lần lượt 01 → 05.)
2. Supabase → **Authentication → Sign In / Providers → Email**: tắt *Confirm email* khi đang phát triển.
3. Chạy web:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\start_server.ps1
   ```
   Mở **http://localhost:8080**. (Phải chạy qua server, không mở file trực tiếp vì ES modules không chạy với `file://`.)

### Đưa lên mạng (Vercel) – dùng cùng database với local
1. Vercel → Project → **Settings → Build and Deployment**: Framework Preset `Other`, **Root Directory** `frontend`, các lệnh Build/Output/Install để mặc định (tắt Override) → Save.
2. Push code lên nhánh `main` trên GitHub → Vercel tự deploy (~30 giây).
3. Supabase → **Authentication → URL Configuration**:
   - **Site URL**: tên miền Vercel, vd `https://tram-hy.vercel.app`
   - **Redirect URLs**: thêm `https://tram-hy.vercel.app/**` và `http://localhost:8080/**`

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

---

## 8. Việc tiếp theo (đề xuất theo thứ tự)

| # | Việc | Nằm ở |
|---|---|---|
| 1 | Giao diện để đối tác **thêm/sửa mẫu váy, tải ảnh bìa** (bảng + bucket đã sẵn) | `frontend/` |
| 2 | Kiểm thử đầy đủ trên điện thoại thật (bản Vercel) và sửa chi tiết giao diện còn vướng | `frontend/css` |
| 3 | **Cổng thanh toán thật** (PayOS / SePay): Edge Function nhận webhook → gọi `pay_milestone` thay cho nút bấm tay | `backend/supabase/functions/` |
| 4 | **AI thử váy thật** (fashn.ai): Edge Function giữ API key, nhận ảnh từ `bride-photos`, trả ảnh kết quả | `backend/supabase/functions/` |
| 5 | **Tự xóa ảnh cô dâu sau 24 giờ** (cam kết bảo mật trong báo cáo): Scheduled Edge Function | `backend/supabase/functions/` |
| 6 | Thông báo email / Zalo khi có đơn mới, khi được giải ngân | Edge Function |

Các mục 3–6 là những việc **bắt buộc phải chạy ở server** (cần khóa bí mật hoặc chạy định kỳ). Khi làm sẽ tạo thư mục `backend/supabase/functions/`.

---

## 9. Ghi chú bảo mật
- `frontend/js/config.js` chứa **publishable key** – được phép công khai, commit lên GitHub không sao.
- **Không bao giờ** đưa vào code: mật khẩu database, `service_role` / secret key, API key của AI hay cổng thanh toán. Những key đó chỉ đặt trong *Edge Function Secrets* của Supabase.
- Vai trò `admin` chỉ đổi được bằng SQL trong Supabase – người dùng không tự nâng quyền được.
