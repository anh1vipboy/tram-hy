-- =====================================================================
-- TRẠM HỶ – 16_RSVP_ANTISPAM.SQL
-- Chống spam phản hồi thiệp cưới (khách mời gửi không cần đăng nhập). Chạy SAU 15.
-- Kiểm tra nằm trong database (trigger) → gọi thẳng API bằng tool cũng không lách được.
--
--   1. Làm sạch dữ liệu: gom khoảng trắng, tên 2–80 ký tự, lời chúc không chứa link, thời gian do server đặt.
--   2. Một tên chỉ phản hồi 1 lần cho mỗi thiệp (không phân biệt hoa/thường).
--   3. Theo địa chỉ IP người gửi: tối đa 10 phản hồi / thiệp / giờ và 30 phản hồi / ngày (mọi thiệp).
--      IP chỉ lưu dạng băm ở bảng riêng rsvp_meta – không ai đọc được qua API (RLS bật, không có policy).
--   4. Mỗi thiệp tối đa 1.000 phản hồi.
-- Chạy lại nhiều lần không lỗi.
-- =====================================================================

-- IP đã băm của từng phản hồi – chỉ trigger (security definer) đọc/ghi
create table if not exists public.rsvp_meta (
  rsvp_id        uuid primary key references public.rsvps(id) on delete cascade,
  invitation_id  uuid not null references public.invitations(id) on delete cascade,
  ip_hash        text not null,
  created_at     timestamptz not null default now()
);
create index if not exists rsvp_meta_ip_idx on public.rsvp_meta (ip_hash, created_at);
alter table public.rsvp_meta enable row level security;     -- không policy nào → API không đọc được
revoke all on public.rsvp_meta from anon, authenticated;

create index if not exists rsvps_invitation_name_idx on public.rsvps (invitation_id, lower(guest_name));

-- IP người gọi (PostgREST chuyển header vào request.headers). Ưu tiên header do Cloudflare đặt (không giả được).
create or replace function public.request_ip_hash() returns text
language plpgsql stable set search_path = public as $$
declare
  v_headers json := nullif(current_setting('request.headers', true), '')::json;
  v_ip text;
begin
  if v_headers is null then return null; end if;          -- chạy trong SQL Editor: không có IP
  v_ip := coalesce(v_headers ->> 'cf-connecting-ip', v_headers ->> 'x-real-ip',
                   split_part(v_headers ->> 'x-forwarded-for', ',', 1));
  v_ip := nullif(btrim(v_ip), '');
  return case when v_ip is null then null else md5('tramhy-rsvp:' || v_ip) end;
end $$;

create or replace function public.rsvps_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ip text := public.request_ip_hash();
begin
  -- 1. Làm sạch
  new.guest_name := btrim(regexp_replace(coalesce(new.guest_name, ''), '\s+', ' ', 'g'));
  new.message    := nullif(btrim(coalesce(new.message, '')), '');
  new.created_at := now();
  if length(new.guest_name) < 2 then
    raise exception 'Vui lòng nhập tên của bạn (ít nhất 2 ký tự)';
  end if;
  if length(new.guest_name) > 80 then
    raise exception 'Tên quá dài (tối đa 80 ký tự)';
  end if;
  if new.message ~* '(https?://|www\.|\.(com|net|vn|xyz|top|info)(/|\s|$))' then
    raise exception 'Lời chúc không được chứa đường link';
  end if;

  -- 2. Mỗi tên 1 lần / thiệp
  if exists (select 1 from public.rsvps r
              where r.invitation_id = new.invitation_id and lower(r.guest_name) = lower(new.guest_name)) then
    raise exception 'Tên "%" đã gửi phản hồi cho thiệp này rồi. Muốn đổi phản hồi, bạn nhắn trực tiếp cô dâu chú rể nhé.', new.guest_name;
  end if;

  -- 4. Giới hạn tổng
  if (select count(*) from public.rsvps r where r.invitation_id = new.invitation_id) >= 1000 then
    raise exception 'Thiệp đã nhận đủ số phản hồi tối đa';
  end if;

  -- 3. Theo IP
  if v_ip is not null then
    if (select count(*) from public.rsvp_meta m
         where m.ip_hash = v_ip and m.invitation_id = new.invitation_id
           and m.created_at > now() - interval '1 hour') >= 10 then
      raise exception 'Bạn đã gửi nhiều phản hồi liên tiếp, vui lòng thử lại sau ít phút';
    end if;
    if (select count(*) from public.rsvp_meta m
         where m.ip_hash = v_ip and m.created_at > now() - interval '1 day') >= 30 then
      raise exception 'Bạn đã gửi quá nhiều phản hồi hôm nay, vui lòng thử lại vào ngày mai';
    end if;
  end if;
  return new;
end $$;

-- Ghi IP đã băm sau khi phản hồi được lưu (cần rsvp_id)
create or replace function public.rsvps_log_ip() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ip text := public.request_ip_hash();
begin
  if v_ip is not null then
    insert into public.rsvp_meta (rsvp_id, invitation_id, ip_hash) values (new.id, new.invitation_id, v_ip);
  end if;
  return new;
end $$;

drop trigger if exists rsvps_guard on public.rsvps;
create trigger rsvps_guard before insert on public.rsvps
  for each row execute function public.rsvps_guard();

drop trigger if exists rsvps_log_ip on public.rsvps;
create trigger rsvps_log_ip after insert on public.rsvps
  for each row execute function public.rsvps_log_ip();

-- Hàm nội bộ: không cho gọi trực tiếp qua API
revoke execute on function public.request_ip_hash() from public, anon, authenticated;
revoke execute on function public.rsvps_guard() from public, anon, authenticated;
revoke execute on function public.rsvps_log_ip() from public, anon, authenticated;
