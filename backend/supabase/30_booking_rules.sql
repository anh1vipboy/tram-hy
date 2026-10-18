-- =====================================================================
-- TRẠM HỶ – 30_BOOKING_RULES.SQL
-- Luật đặt lịch: nhà hàng tiệc tính giá THEO BÀN + chặn trùng lịch. Chạy SAU 29.
--   1. vendor_packages thêm price_unit ('package' = trọn gói | 'table' = giá mỗi bàn), min_qty / max_qty
--      (số bàn tối thiểu / tối đa của gói nhà hàng) và is_demo (gói mẫu phục vụ demo – trang tiệm hiện ghi chú).
--   2. vendors thêm halls: số sảnh tiệc của nhà hàng – mỗi sảnh nhận 1 tiệc mỗi ngày.
--   3. create_booking thêm p_quantity (số bàn, tham số CUỐI): nhà hàng bắt buộc nhập, tổng đơn = giá mỗi bàn × số bàn
--      do server tự tính (không tin số tiền gửi lên). Chặn trùng lịch ngay trong hàm:
--        - tiệm thường: 2 lịch hẹn của cùng tiệm phải cách nhau ít nhất 2 tiếng;
--        - nhà hàng: số tiệc trong 1 ngày (theo giờ Việt Nam) không vượt số sảnh.
--   4. vendor_busy_times: giờ đã có lịch của 1 tiệm (CHỈ giờ hẹn, không lộ tên / SĐT khách)
--      để hộp thoại đặt lịch báo trước cho khách, khỏi bấm xong mới biết bị trùng.
--   5. 6 nhà hàng mẫu (04_seed) đổi giá khởi điểm từ giá trọn gói sang giá mỗi bàn.
-- Đơn đã hủy / đã hoàn tiền không giữ chỗ. Chạy lại nhiều lần không lỗi.
-- =====================================================================

-- ---------- 1. GÓI DỊCH VỤ: ĐƠN VỊ GIÁ, SỐ BÀN, GÓI MẪU ----------
alter table public.vendor_packages add column if not exists price_unit text not null default 'package';
alter table public.vendor_packages add column if not exists min_qty int;      -- số bàn tối thiểu (null với gói trọn gói)
alter table public.vendor_packages add column if not exists max_qty int;      -- số bàn tối đa = sức chứa sảnh
alter table public.vendor_packages add column if not exists is_demo boolean not null default false;

-- Ràng buộc có tên riêng → xóa rồi tạo lại được khi chạy lại file.
-- CHECK bỏ qua giá trị null: gói trọn gói để trống min_qty / max_qty vẫn hợp lệ.
alter table public.vendor_packages drop constraint if exists vendor_packages_price_unit_check;
alter table public.vendor_packages add constraint vendor_packages_price_unit_check
  check (price_unit in ('package', 'table'));
alter table public.vendor_packages drop constraint if exists vendor_packages_qty_check;
alter table public.vendor_packages add constraint vendor_packages_qty_check
  check (min_qty between 1 and 300 and max_qty >= 1 and max_qty >= min_qty);

-- Quyền: policy packages_insert_owner / packages_update_owner (SQL 19) chỉ kiểm tra owns_vendor(vendor_id),
-- bảng này không dùng quyền theo từng cột → chủ tiệm ghi được các cột mới, không cần grant thêm.


-- ---------- 2. SỐ SẢNH CỦA NHÀ HÀNG ----------
alter table public.vendors add column if not exists halls smallint not null default 1;
alter table public.vendors drop constraint if exists vendors_halls_check;
alter table public.vendors add constraint vendors_halls_check check (halls between 1 and 20);
-- vendors chỉ cho chủ tiệm sửa một số cột (01_schema) → mở thêm cột halls; policy vendors_update_owner giữ đúng chủ tiệm
grant update (halls) on public.vendors to authenticated;

-- Tìm lịch của 1 tiệm theo giờ hẹn (kiểm tra trùng lịch + vendor_busy_times)
create index if not exists bookings_vendor_appointment_idx on public.bookings (vendor_id, appointment_at);


-- ---------- 3. ĐẶT LỊCH: GIÁ THEO BÀN + CHẶN TRÙNG LỊCH ----------
-- Thêm p_quantity ở CUỐI (giữ nguyên các tham số của SQL 19). Đổi danh sách tham số → phải xóa hàm cũ trước,
-- không thì 2 phiên bản cùng tồn tại và web gọi không biết chọn bản nào.
drop function if exists public.create_booking(uuid, public.booking_type, uuid, timestamptz, text, text, text, jsonb, bigint, uuid);

create or replace function public.create_booking(
  p_vendor_id       uuid,
  p_type            public.booking_type,
  p_dress_id        uuid        default null,
  p_appointment_at  timestamptz default null,
  p_contact_name    text        default null,
  p_contact_phone   text        default null,
  p_note            text        default null,
  p_details         jsonb       default '{}'::jsonb,
  p_custom_price    bigint      default null,   -- chỉ dùng cho may đo (giá do Atelier Builder tính)
  p_package_id      uuid        default null,   -- gói dịch vụ của tiệm (giá lấy từ gói, không tin giá gửi lên)
  p_quantity        int         default null    -- số bàn – bắt buộc với nhà hàng tiệc (SQL 30)
) returns public.bookings
language plpgsql security definer set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  v_vendor   public.vendors;
  v_price    bigint;                 -- đơn giá: giá gói / giá váy / giá khởi điểm (nhà hàng: giá MỖI BÀN)
  v_total    bigint;                 -- tổng đơn = đơn giá (× số bàn với nhà hàng)
  v_dress    public.dresses;
  v_package  public.vendor_packages;
  v_details  jsonb := coalesce(p_details, '{}'::jsonb);
  v_booking  public.bookings;
  v_is_venue boolean;
  v_min_qty  int := 5;               -- nhà hàng đặt chung (không chọn gói): nhận 5–300 bàn
  v_max_qty  int := 300;
  v_day      date;
  v_taken    int;
  v_pcts     int[];
  v_titles   text[];
  v_amount   bigint;
  v_sum      bigint := 0;
  i          int;
begin
  if v_uid is null then
    raise exception 'Bạn cần đăng nhập để đặt lịch';
  end if;
  if p_dress_id is not null and p_package_id is not null then
    raise exception 'Chỉ chọn một mẫu váy hoặc một gói dịch vụ';
  end if;
  if p_appointment_at is null then
    raise exception 'Bạn chọn ngày giờ hẹn giúp Trạm Hỷ nhé';
  end if;
  if p_appointment_at <= now() then
    raise exception 'Giờ hẹn này đã qua – bạn chọn một thời điểm sắp tới nhé';
  end if;

  select * into v_vendor from public.vendors where id = p_vendor_id;
  if not found then raise exception 'Không tìm thấy đối tác'; end if;
  v_is_venue := v_vendor.category = 'venue';

  -- Các khóa này do server ghi; khách tự gửi lên (sửa request) thì bỏ đi để đơn không hiện số bàn / tên gói giả
  v_details := v_details - 'tables' - 'unit_price' - 'package';

  if p_dress_id is not null then
    select * into v_dress from public.dresses where id = p_dress_id and is_active;
    if not found then raise exception 'Không tìm thấy mẫu váy'; end if;
    if v_dress.vendor_id <> p_vendor_id then raise exception 'Mẫu váy không thuộc đối tác này'; end if;
    v_price := v_dress.price;
  elsif p_package_id is not null then
    select * into v_package from public.vendor_packages where id = p_package_id and is_active;
    if not found then raise exception 'Gói dịch vụ không còn mở bán'; end if;
    if v_package.vendor_id <> p_vendor_id then raise exception 'Gói dịch vụ không thuộc đối tác này'; end if;
    v_price := v_package.price;
    -- lưu tên gói vào đơn: tiệm đổi tên / xóa gói sau này đơn vẫn ghi đúng gói khách đã đặt
    v_details := v_details || jsonb_build_object('package', jsonb_build_object('id', v_package.id, 'name', v_package.name));
    -- gói nhà hàng ghi số bàn nhận được; thiếu bên nào thì dùng mặc định 5 / 300
    v_max_qty := coalesce(v_package.max_qty, 300);
    v_min_qty := least(coalesce(v_package.min_qty, 5), v_max_qty);
  else
    v_price := v_vendor.base_price;
  end if;

  if p_type in ('bespoke_prompt', 'bespoke_image', 'bespoke_manual') then
    if p_custom_price is not null then
      if p_custom_price not between 5000000 and 50000000 then
        raise exception 'Giá may đo không hợp lệ';
      end if;
      v_price := p_custom_price;
    end if;
    v_pcts   := array[30, 40, 30];
    v_titles := array['Duyệt phác thảo 3D & mẫu vải', 'Thử rập mộc Toile', 'Nghiệm thu váy hoàn thiện'];
  else
    v_pcts   := array[30, 50, 20];
    v_titles := array['Cọc giữ lịch', 'Sau buổi thử / bấm máy', 'Nghiệm thu & hoàn tất'];
  end if;

  if v_price is null or v_price <= 0 then
    raise exception 'Đối tác chưa có giá, không thể đặt lịch';
  end if;

  -- Nhà hàng tiệc: giá là giá MỖI BÀN (cả gói lẫn đặt chung) → tổng = đơn giá × số bàn, server tự nhân
  v_total := v_price;
  if v_is_venue then
    if p_quantity is null then
      raise exception 'Bạn nhập số bàn dự kiến giúp nhà hàng nhé';
    end if;
    if p_quantity not between v_min_qty and v_max_qty then
      raise exception 'Nhà hàng nhận từ % đến % bàn – bạn chỉnh lại số bàn nhé', v_min_qty, v_max_qty;
    end if;
    v_total := v_price * p_quantity;
    v_details := v_details || jsonb_build_object('tables', p_quantity, 'unit_price', v_price);
    if p_package_id is not null then
      v_details := jsonb_set(v_details, '{package,tables}', to_jsonb(p_quantity));
    end if;
  end if;

  -- Chặn trùng lịch. Khóa theo tiệm tới hết giao dịch: 2 khách bấm đặt cùng lúc phải xếp hàng,
  -- người sau thấy đơn vừa tạo của người trước → không lọt 2 đơn trùng giờ.
  perform pg_advisory_xact_lock(hashtext(p_vendor_id::text));
  if v_is_venue then
    -- Đếm tiệc trong cùng ngày theo giờ Việt Nam (= (appointment_at at time zone 'Asia/Ho_Chi_Minh')::date,
    -- viết dạng khoảng thời gian để dùng được index vendor_id + appointment_at)
    v_day := (p_appointment_at at time zone 'Asia/Ho_Chi_Minh')::date;
    select count(*) into v_taken
      from public.bookings b
     where b.vendor_id = p_vendor_id
       and b.status not in ('cancelled', 'refunded')
       and b.appointment_at >= (v_day::timestamp at time zone 'Asia/Ho_Chi_Minh')
       and b.appointment_at <  ((v_day + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh');
    if v_taken >= v_vendor.halls then
      raise exception 'Ngày này nhà hàng đã kín sảnh – bạn chọn ngày khác nhé';
    end if;
  elsif exists (
    select 1 from public.bookings b
     where b.vendor_id = p_vendor_id
       and b.status not in ('cancelled', 'refunded')
       and b.appointment_at > p_appointment_at - interval '2 hours'
       and b.appointment_at < p_appointment_at + interval '2 hours'
  ) then
    raise exception 'Khung giờ này tiệm đã có lịch – bạn chọn giờ khác (cách ít nhất 2 tiếng) nhé';
  end if;

  insert into public.bookings (bride_id, vendor_id, dress_id, package_id, type, appointment_at, total_price,
                               contact_name, contact_phone, note, details)
  values (v_uid, p_vendor_id, p_dress_id, p_package_id, p_type, p_appointment_at, v_total,
          p_contact_name, p_contact_phone, p_note, v_details)
  returning * into v_booking;

  for i in 1..3 loop
    -- chặng cuối lấy phần còn lại để tổng luôn khớp total_price (tránh lệch do làm tròn)
    v_amount := case when i = 3 then v_total - v_sum else round(v_total * v_pcts[i] / 100.0) end;
    v_sum := v_sum + v_amount;
    insert into public.milestones (booking_id, stage, title, percent, amount)
    values (v_booking.id, i, v_titles[i], v_pcts[i], v_amount);
  end loop;

  return v_booking;
end $$;

revoke execute on function public.create_booking from public, anon;
grant execute on function public.create_booking to authenticated;


-- ---------- 4. GIỜ ĐÃ CÓ LỊCH CỦA TIỆM ----------
-- Khách (cả chưa đăng nhập) xem trước giờ nào đã kín. Chỉ trả giờ hẹn – bảng bookings vẫn kín theo RLS,
-- nên hàm chạy quyền definer và chọn đúng 1 cột. Tối đa 500 dòng mỗi lần hỏi.
create or replace function public.vendor_busy_times(p_vendor_id uuid, p_from timestamptz, p_to timestamptz)
returns table (appointment_at timestamptz)
language sql stable security definer set search_path = public as $$
  select b.appointment_at
    from public.bookings b
   where b.vendor_id = p_vendor_id
     and b.status not in ('cancelled', 'refunded')
     and b.appointment_at >= p_from
     and b.appointment_at <  p_to
   order by b.appointment_at
   limit 500;
$$;

revoke execute on function public.vendor_busy_times(uuid, timestamptz, timestamptz) from public;
grant execute on function public.vendor_busy_times(uuid, timestamptz, timestamptz) to anon, authenticated;


-- ---------- 5. NHÀ HÀNG MẪU: GIÁ TRỌN GÓI → GIÁ MỖI BÀN ----------
-- 04_seed ghi giá trọn gói (85–550 triệu); giờ base_price của nhà hàng là giá MỖI BÀN.
-- Chỉ đổi khi giá còn ≥ 20 triệu (không bàn tiệc nào giá vậy) → chạy lại không đổi nữa, không đè giá đã sửa tay.
update public.vendors v
   set base_price = p.per_table
  from (values ('trongdong',   3200000),
               ('lamourvenue', 3800000),
               ('melia',       6500000),
               ('jwmarriott',  8500000),
               ('almaz',       4200000),
               ('daewoo',      5500000)) as p(slug, per_table)
 where v.slug = p.slug and v.category = 'venue' and v.base_price >= 20000000;
