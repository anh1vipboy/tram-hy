-- =====================================================================
-- TRẠM HỶ – 01_SCHEMA.SQL
-- Bảng dữ liệu + Row Level Security (RLS)
-- Chạy file này ĐẦU TIÊN trong Supabase → SQL Editor → New query → Run
-- =====================================================================

-- ---------- 1. KIỂU DỮ LIỆU (ENUM) ----------
create type public.user_role        as enum ('bride', 'vendor', 'admin');
create type public.vendor_category  as enum ('bridal', 'studio', 'decor', 'makeup', 'venue');
create type public.dress_type       as enum ('rental', 'bespoke');
create type public.booking_type     as enum ('rental', 'bespoke_prompt', 'bespoke_image', 'bespoke_manual', 'service');
-- pending: vừa đặt, chưa cọc | confirmed: đã cọc đợt 1 | in_progress: đang thực hiện
-- ready_for_review: vendor báo xong, chờ cô dâu nghiệm thu | completed | disputed | cancelled | refunded
create type public.booking_status   as enum ('pending', 'confirmed', 'in_progress', 'ready_for_review',
                                             'completed', 'disputed', 'cancelled', 'refunded');
-- locked: chưa trả | paid: tiền đang giữ ở Escrow | released: đã giải ngân cho vendor | refunded: hoàn cho cô dâu
create type public.milestone_status as enum ('locked', 'paid', 'released', 'refunded');
create type public.dispute_status   as enum ('open', 'resolved_refund', 'resolved_vendor');


-- ---------- 2. BẢNG ----------

-- Hồ sơ người dùng (1-1 với auth.users, tự tạo bằng trigger bên dưới)
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  phone       text,
  avatar_url  text,
  role        public.user_role not null default 'bride',
  created_at  timestamptz not null default now()
);

-- Đối tác: tiệm váy, studio, decor, makeup, nhà hàng
create table public.vendors (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,                -- vd: 'tuart', '2h-studio' (dùng trên URL detail.html?vendor=tuart)
  owner_id      uuid references public.profiles(id) on delete set null,  -- tài khoản vendor quản lý tiệm
  name          text not null,
  category      public.vendor_category not null,
  district      text,
  address       text,
  base_price    bigint not null default 0 check (base_price >= 0),
  rating        numeric(2,1) not null default 0,
  review_count  int not null default 0,
  is_verified   boolean not null default false,      -- Tích Xanh (chỉ admin bật được)
  cover_url     text,
  description   text,
  created_at    timestamptz not null default now()
);

-- Mẫu váy (thuê sẵn hoặc may đo)
create table public.dresses (
  id              uuid primary key default gen_random_uuid(),
  vendor_id       uuid not null references public.vendors(id) on delete cascade,
  slug            text unique,
  name            text not null,
  type            public.dress_type not null,
  theme           text,                              -- mermaid | fairy | minimalist | royal | heritage
  price           bigint not null check (price > 0),
  original_price  bigint,
  image_url       text,
  tryon_slug      text,                              -- khớp với tham số tryon.html?dress=...
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

-- Số đo cơ thể của cô dâu (Bước 1 phòng thử)
create table public.body_profiles (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  height_cm   int check (height_cm between 130 and 200),
  weight_kg   int check (weight_kg between 30 and 150),
  heel_cm     int not null default 0,
  body_shape  text check (body_shape in ('hourglass', 'pear', 'apple', 'petite')),
  bust_cm     int,
  waist_cm    int,
  hip_cm      int,
  updated_at  timestamptz not null default now()
);

-- Đơn đặt lịch (CHUNG cho cả thuê váy, may đo và dịch vụ studio/decor/...)
create table public.bookings (
  id              uuid primary key default gen_random_uuid(),
  code            text unique not null
                  default ('BK' || to_char(now(), 'YYMMDD') || '-' || upper(substr(md5(random()::text), 1, 5))),
  bride_id        uuid not null references public.profiles(id),
  vendor_id       uuid not null references public.vendors(id),
  dress_id        uuid references public.dresses(id),
  type            public.booking_type not null,
  status          public.booking_status not null default 'pending',
  appointment_at  timestamptz,
  total_price     bigint not null check (total_price > 0),
  contact_name    text,
  contact_phone   text,
  note            text,
  details         jsonb not null default '{}'::jsonb,  -- Spec Sheet may đo: số đo, prompt, chất liệu, cổ áo...
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on public.bookings (bride_id);
create index on public.bookings (vendor_id);

-- 3 chặng thanh toán Escrow của mỗi đơn
create table public.milestones (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references public.bookings(id) on delete cascade,
  stage        smallint not null check (stage between 1 and 3),
  title        text not null,
  percent      smallint not null,
  amount       bigint not null,
  status       public.milestone_status not null default 'locked',
  paid_at      timestamptz,
  released_at  timestamptz,
  unique (booking_id, stage)
);

-- Khiếu nại: cô dâu yêu cầu hoàn cọc / studio báo khách bùng lịch (no-show)
create table public.disputes (
  id               uuid primary key default gen_random_uuid(),
  booking_id       uuid not null references public.bookings(id) on delete cascade,
  opened_by        uuid not null references public.profiles(id),
  kind             text not null check (kind in ('refund_request', 'no_show')),
  reason           text not null,
  evidence_urls    text[] not null default '{}',
  prev_status      public.booking_status not null,     -- trạng thái đơn trước khi khiếu nại
  status           public.dispute_status not null default 'open',
  resolution_note  text,
  resolved_by      uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  resolved_at      timestamptz
);
create unique index one_open_dispute_per_booking on public.disputes (booking_id) where status = 'open';

-- Đánh giá xác thực: chỉ đơn đã hoàn tất mới được đánh giá, mỗi đơn 1 lần
create table public.reviews (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid unique not null references public.bookings(id) on delete cascade,
  vendor_id   uuid not null references public.vendors(id),
  bride_id    uuid not null references public.profiles(id),
  rating      smallint not null check (rating between 1 and 5),
  content     text,
  created_at  timestamptz not null default now()
);

-- Thiệp cưới online + RSVP
create table public.invitations (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  slug          text unique not null default lower(substr(md5(random()::text), 1, 8)),
  groom_name    text not null,
  bride_name    text not null,
  event_at      timestamptz,
  venue         text,
  theme         text not null default 'gold',
  bank_code     text,
  bank_account  text,
  created_at    timestamptz not null default now()
);

create table public.rsvps (
  id             uuid primary key default gen_random_uuid(),
  invitation_id  uuid not null references public.invitations(id) on delete cascade,
  guest_name     text not null check (length(guest_name) between 1 and 100),
  attending      boolean not null,
  guest_count    smallint not null default 1 check (guest_count between 1 and 10),
  message        text check (length(message) <= 500),
  created_at     timestamptz not null default now()
);


-- ---------- 3. HÀM HỖ TRỢ + TRIGGER ----------

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.owns_vendor(p_vendor_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.vendors where id = p_vendor_id and owner_id = auth.uid());
$$;

-- Tự tạo profiles khi có người đăng ký. Chỉ cho tự chọn 'bride' hoặc 'vendor', không bao giờ 'admin'.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone, role)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone',
    case when new.raw_user_meta_data ->> 'role' = 'vendor' then 'vendor'::public.user_role
         else 'bride'::public.user_role end
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger bookings_touch before update on public.bookings
  for each row execute function public.touch_updated_at();
create trigger body_profiles_touch before update on public.body_profiles
  for each row execute function public.touch_updated_at();


-- ---------- 4. ROW LEVEL SECURITY ----------
alter table public.profiles      enable row level security;
alter table public.vendors       enable row level security;
alter table public.dresses       enable row level security;
alter table public.body_profiles enable row level security;
alter table public.bookings      enable row level security;
alter table public.milestones    enable row level security;
alter table public.disputes      enable row level security;
alter table public.reviews       enable row level security;
alter table public.invitations   enable row level security;
alter table public.rsvps         enable row level security;

-- PROFILES: xem/sửa hồ sơ của chính mình; admin xem tất cả. Không ai tự đổi được cột role.
create policy "profiles_select" on public.profiles for select
  using (id = auth.uid() or public.is_admin());
create policy "profiles_update_own" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from anon, authenticated;
grant update (full_name, phone, avatar_url) on public.profiles to authenticated;

-- VENDORS: ai cũng xem được (kể cả chưa đăng nhập). Chủ tiệm sửa thông tin tiệm, KHÔNG tự bật Tích Xanh.
create policy "vendors_select_all" on public.vendors for select using (true);
create policy "vendors_update_owner" on public.vendors for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
revoke update on public.vendors from anon, authenticated;
grant update (name, district, address, base_price, cover_url, description) on public.vendors to authenticated;

-- DRESSES: ai cũng xem váy đang bán; chủ tiệm thêm/sửa/xóa váy của tiệm mình.
create policy "dresses_select" on public.dresses for select
  using (is_active or public.owns_vendor(vendor_id) or public.is_admin());
create policy "dresses_insert_owner" on public.dresses for insert
  with check (public.owns_vendor(vendor_id));
create policy "dresses_update_owner" on public.dresses for update
  using (public.owns_vendor(vendor_id)) with check (public.owns_vendor(vendor_id));
create policy "dresses_delete_owner" on public.dresses for delete
  using (public.owns_vendor(vendor_id));

-- BODY_PROFILES: chỉ chính chủ.
create policy "body_own" on public.body_profiles for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- BOOKINGS: cô dâu thấy đơn của mình, vendor thấy đơn của tiệm mình, admin thấy tất cả.
-- KHÔNG có policy insert/update → mọi thay đổi phải đi qua hàm trong 02_functions.sql
create policy "bookings_select" on public.bookings for select
  using (bride_id = auth.uid() or public.owns_vendor(vendor_id) or public.is_admin());

-- MILESTONES: thấy được nếu thấy được booking tương ứng. Không sửa trực tiếp.
create policy "milestones_select" on public.milestones for select
  using (exists (select 1 from public.bookings b where b.id = booking_id));

-- DISPUTES: thấy được nếu thấy được booking tương ứng. Tạo/xử lý qua hàm.
create policy "disputes_select" on public.disputes for select
  using (exists (select 1 from public.bookings b where b.id = booking_id));

-- REVIEWS: ai cũng xem; cô dâu chỉ đánh giá được đơn ĐÃ HOÀN TẤT của chính mình.
create policy "reviews_select_all" on public.reviews for select using (true);
create policy "reviews_insert_verified" on public.reviews for insert
  with check (
    bride_id = auth.uid()
    and exists (
      select 1 from public.bookings b
      where b.id = booking_id and b.bride_id = auth.uid()
        and b.vendor_id = reviews.vendor_id and b.status = 'completed'
    )
  );

-- INVITATIONS: khách mời mở link xem được thiệp; chỉ chủ thiệp sửa/xóa.
create policy "inv_select_all" on public.invitations for select using (true);
create policy "inv_insert_own" on public.invitations for insert with check (owner_id = auth.uid());
create policy "inv_update_own" on public.invitations for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "inv_delete_own" on public.invitations for delete using (owner_id = auth.uid());

-- RSVPS: khách (không cần đăng nhập) gửi phản hồi; chỉ chủ thiệp xem danh sách.
create policy "rsvp_insert_anyone" on public.rsvps for insert with check (true);
create policy "rsvp_select_owner" on public.rsvps for select
  using (exists (select 1 from public.invitations i where i.id = invitation_id and i.owner_id = auth.uid()));
