-- =====================================================================
-- TRẠM HỶ – 24_GUESTBOOK.SQL
-- Thiệp cưới (tiếp): sổ lời chúc có duyệt + chỗ cho album / chuyện tình yêu / nhạc nền. Chạy SAU 23.
--   1. guestbook_entries: khách (không cần đăng nhập) gửi lời chúc → trạng thái "chờ duyệt".
--      Chỉ lời chúc ĐÃ DUYỆT mới hiện cho mọi người; chủ thiệp xem hết, duyệt / ẩn / xóa.
--   2. Chống spam như phản hồi thiệp (16): làm sạch, chặn link, giới hạn theo IP đã băm (bảng guestbook_meta, không ai đọc được).
--   3. Chủ thiệp nhận thông báo chuông + danh sách tự cập nhật (realtime).
--   4. Album, chuyện tình yêu, nhạc nền lưu trong invitations.details → nới giới hạn dung lượng cột details.
-- Chạy lại nhiều lần không lỗi.
-- =====================================================================

alter table public.invitations drop constraint if exists invitations_details_check;
alter table public.invitations add constraint invitations_details_check
  check (jsonb_typeof(details) = 'object' and pg_column_size(details) <= 20000);

create table if not exists public.guestbook_entries (
  id             uuid primary key default gen_random_uuid(),
  invitation_id  uuid not null references public.invitations(id) on delete cascade,
  guest_name     text not null check (length(guest_name) between 2 and 80),
  message        text not null check (length(message) between 2 and 500),
  status         text not null default 'pending' check (status in ('pending', 'approved', 'hidden')),
  created_at     timestamptz not null default now()
);
create index if not exists guestbook_invitation_idx on public.guestbook_entries (invitation_id, status, created_at desc);

alter table public.guestbook_entries enable row level security;

-- Ai cũng gửi được (khách mời không đăng nhập); trigger bên dưới ép trạng thái "chờ duyệt"
drop policy if exists "guestbook_insert_any" on public.guestbook_entries;
create policy "guestbook_insert_any" on public.guestbook_entries for insert to anon, authenticated
  with check (status = 'pending');
-- Mọi người thấy lời chúc đã duyệt; chủ thiệp thấy hết
drop policy if exists "guestbook_select" on public.guestbook_entries;
create policy "guestbook_select" on public.guestbook_entries for select using (
  status = 'approved'
  or exists (select 1 from public.invitations i where i.id = invitation_id and i.owner_id = auth.uid()));
drop policy if exists "guestbook_update_owner" on public.guestbook_entries;
create policy "guestbook_update_owner" on public.guestbook_entries for update
  using (exists (select 1 from public.invitations i where i.id = invitation_id and i.owner_id = auth.uid()))
  with check (exists (select 1 from public.invitations i where i.id = invitation_id and i.owner_id = auth.uid()));
drop policy if exists "guestbook_delete_owner" on public.guestbook_entries;
create policy "guestbook_delete_owner" on public.guestbook_entries for delete
  using (exists (select 1 from public.invitations i where i.id = invitation_id and i.owner_id = auth.uid()));

-- Chủ thiệp chỉ được đổi trạng thái, không sửa lời của khách
revoke update on public.guestbook_entries from anon, authenticated;
grant update (status) on public.guestbook_entries to authenticated;

-- IP đã băm của từng lời chúc – chỉ trigger đọc/ghi
create table if not exists public.guestbook_meta (
  entry_id       uuid primary key references public.guestbook_entries(id) on delete cascade,
  invitation_id  uuid not null references public.invitations(id) on delete cascade,
  ip_hash        text not null,
  created_at     timestamptz not null default now()
);
create index if not exists guestbook_meta_ip_idx on public.guestbook_meta (ip_hash, created_at);
alter table public.guestbook_meta enable row level security;
revoke all on public.guestbook_meta from anon, authenticated;

create or replace function public.guestbook_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ip text := public.request_ip_hash();
begin
  new.guest_name := btrim(regexp_replace(coalesce(new.guest_name, ''), '\s+', ' ', 'g'));
  new.message    := btrim(regexp_replace(coalesce(new.message, ''), '[ \t]+', ' ', 'g'));
  new.status     := 'pending';
  new.created_at := now();
  if length(new.guest_name) < 2 then raise exception 'Vui lòng nhập tên của bạn (ít nhất 2 ký tự)'; end if;
  if length(new.guest_name) > 80 then raise exception 'Tên quá dài (tối đa 80 ký tự)'; end if;
  if length(new.message) < 2 then raise exception 'Bạn chưa viết lời chúc'; end if;
  if length(new.message) > 500 then raise exception 'Lời chúc tối đa 500 ký tự'; end if;
  if new.message ~* '(https?://|www\.|\.(com|net|vn|xyz|top|info)(/|\s|$))' then
    raise exception 'Lời chúc không được chứa đường link';
  end if;
  if (select count(*) from public.guestbook_entries g
       where g.invitation_id = new.invitation_id and lower(g.guest_name) = lower(new.guest_name)) >= 3 then
    raise exception 'Bạn đã gửi đủ 3 lời chúc cho thiệp này rồi – cảm ơn bạn nhiều!';
  end if;
  if (select count(*) from public.guestbook_entries g where g.invitation_id = new.invitation_id) >= 1000 then
    raise exception 'Sổ lời chúc đã đầy';
  end if;
  if v_ip is not null then
    if (select count(*) from public.guestbook_meta m
         where m.ip_hash = v_ip and m.invitation_id = new.invitation_id and m.created_at > now() - interval '1 hour') >= 6 then
      raise exception 'Bạn đã gửi nhiều lời chúc liên tiếp, vui lòng thử lại sau ít phút';
    end if;
    if (select count(*) from public.guestbook_meta m
         where m.ip_hash = v_ip and m.created_at > now() - interval '1 day') >= 30 then
      raise exception 'Bạn đã gửi quá nhiều lời chúc hôm nay, vui lòng thử lại vào ngày mai';
    end if;
  end if;
  return new;
end $$;

create or replace function public.guestbook_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ip text := public.request_ip_hash();
  v_owner uuid;
begin
  if v_ip is not null then
    insert into public.guestbook_meta (entry_id, invitation_id, ip_hash) values (new.id, new.invitation_id, v_ip);
  end if;
  select owner_id into v_owner from public.invitations where id = new.invitation_id;
  perform public.notify(v_owner, 'guestbook_new', '💬', new.guest_name || ' gửi lời chúc – chờ bạn duyệt',
    '“' || left(new.message, 160) || '”', 'invitation.html#guestbook');
  return new;
end $$;

drop trigger if exists guestbook_guard on public.guestbook_entries;
create trigger guestbook_guard before insert on public.guestbook_entries
  for each row execute function public.guestbook_guard();
drop trigger if exists guestbook_after_insert on public.guestbook_entries;
create trigger guestbook_after_insert after insert on public.guestbook_entries
  for each row execute function public.guestbook_after_insert();

revoke execute on function public.guestbook_guard() from public, anon, authenticated;
revoke execute on function public.guestbook_after_insert() from public, anon, authenticated;

-- Chủ thiệp thấy lời chúc mới ngay (realtime)
do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'guestbook_entries') then
    alter publication supabase_realtime add table public.guestbook_entries;
  end if;
end $$;
