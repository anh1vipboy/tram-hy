-- =====================================================================
-- TRẠM HỶ – 25_INVITATION_ACCESS.SQL
-- Thiệp cưới: "có link mới mở được" + mật khẩu tùy chọn + đếm lượt xem + nhiều sự kiện / câu hỏi khi xác nhận
-- + cô dâu trả lời lời chúc. Chạy SAU 24. Chạy lại nhiều lần không lỗi.
--
-- TRƯỚC: ai cũng đọc được cả bảng invitations qua API (địa chỉ, tên bố mẹ, số tài khoản của MỌI thiệp) và gửi
--        phản hồi / lời chúc vào thiệp bất kỳ chỉ cần biết id.
-- SAU:   - Bảng invitations: chỉ chủ thiệp + admin đọc trực tiếp. Khách mở thiệp bằng hàm open_invitation(slug)
--          → phải có ĐÚNG link (slug). Không còn cách liệt kê thiệp của người khác.
--        - Phản hồi (rsvps) và lời chúc (guestbook_entries) chỉ gửi được qua hàm submit_rsvp / submit_wish kèm slug.
--          Mọi kiểm tra chống spam cũ (trigger 16, 24) vẫn chạy.
--        - Lời chúc đã duyệt đọc qua list_wishes(slug) – không đọc hàng loạt theo id được nữa.
--        - Mật khẩu là TÙY CHỌN (mặc định tắt, khách không phải làm gì thêm). Lưu dạng băm bcrypt, không ai đọc được.
--        - Dò link / mật khẩu sai quá 20 lần / 15 phút / IP → tạm chặn.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- 1. THIỆP: khóa đọc trực tiếp ----------
alter table public.invitations add column if not exists locked boolean not null default false;
alter table public.invitations add column if not exists view_count bigint not null default 0;
-- link thiệp mới dài hơn (12 ký tự) – thiệp cũ giữ nguyên link
alter table public.invitations alter column slug set default lower(substr(md5(random()::text || clock_timestamp()::text), 1, 12));

drop policy if exists "inv_select_all" on public.invitations;
drop policy if exists "inv_select_own" on public.invitations;
create policy "inv_select_own" on public.invitations for select
  using (owner_id = auth.uid() or public.is_admin());
-- Khóa / mở và lượt xem chỉ đổi qua hàm (không sửa tay qua API): bỏ quyền sửa cả bảng, cấp lại từng cột nội dung.
-- (Thu hồi riêng 1 cột không có tác dụng khi role đang có quyền sửa cả bảng.)
revoke update on public.invitations from anon, authenticated;
grant update (groom_name, bride_name, event_at, venue, theme, bank_code, bank_account, template, details, photo_url)
  on public.invitations to authenticated;

-- Mật khẩu (băm) – không policy nào → API không đọc được
create table if not exists public.invitation_secrets (
  invitation_id  uuid primary key references public.invitations(id) on delete cascade,
  password_hash  text not null,
  updated_at     timestamptz not null default now()
);
alter table public.invitation_secrets enable row level security;
revoke all on public.invitation_secrets from anon, authenticated;

-- Người xem (IP đã băm) theo ngày → "bao nhiêu người đã xem"
create table if not exists public.invitation_visits (
  invitation_id  uuid not null references public.invitations(id) on delete cascade,
  visitor        text not null,
  day            date not null,
  primary key (invitation_id, visitor, day)
);
alter table public.invitation_visits enable row level security;
revoke all on public.invitation_visits from anon, authenticated;

-- Lần mở sai (link sai / mật khẩu sai) theo IP → chống dò
create table if not exists public.invitation_open_fails (
  ip_hash  text not null,
  at       timestamptz not null default now()
);
create index if not exists invitation_open_fails_idx on public.invitation_open_fails (ip_hash, at);
alter table public.invitation_open_fails enable row level security;
revoke all on public.invitation_open_fails from anon, authenticated;

-- Kiểm tra quyền mở 1 thiệp (dùng chung cho mở thiệp / phản hồi / lời chúc).
-- KHÔNG báo lỗi khi sai link / sai mật khẩu (báo lỗi sẽ hủy luôn bản ghi "lần thử sai" → không chống dò được);
-- trả về code: OK | NOT_FOUND | LOCKED | WRONG_PASSWORD. Chỉ báo lỗi khi bị tạm chặn vì thử quá nhiều.
drop function if exists public.invitation_by_link(text, text);
create or replace function public.invitation_by_link(p_slug text, p_password text, out inv public.invitations, out code text)
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_ip text := public.request_ip_hash();
  v_hash text;
begin
  code := 'OK';
  if v_ip is not null and (select count(*) from public.invitation_open_fails
                            where ip_hash = v_ip and at > now() - interval '15 minutes') >= 20 then
    raise exception 'Bạn thử quá nhiều lần, vui lòng đợi 15 phút rồi mở lại thiệp';
  end if;
  select * into inv from public.invitations where slug = lower(btrim(coalesce(p_slug, '')));
  if not found then
    inv := null;
    code := 'NOT_FOUND';
  elsif inv.locked and inv.owner_id is distinct from auth.uid() then
    if coalesce(p_password, '') = '' then
      code := 'LOCKED';
    else
      select password_hash into v_hash from public.invitation_secrets where invitation_id = inv.id;
      if v_hash is null or v_hash <> crypt(p_password, v_hash) then code := 'WRONG_PASSWORD'; end if;
    end if;
  end if;
  if code in ('NOT_FOUND', 'WRONG_PASSWORD') and v_ip is not null then
    insert into public.invitation_open_fails (ip_hash) values (v_ip);
  end if;
  delete from public.invitation_open_fails where at < now() - interval '1 day';   -- dọn nhẹ
end $$;

-- Lời nhắn tiếng Việt cho từng mã
create or replace function public.invitation_access_message(p_code text) returns text
language sql immutable as $$
  select case p_code
    when 'NOT_FOUND' then 'Thiệp không tồn tại hoặc đã bị xóa'
    when 'LOCKED' then 'Thiệp được bảo vệ bằng mật khẩu'
    when 'WRONG_PASSWORD' then 'Mật khẩu chưa đúng'
    else 'Không mở được thiệp' end
$$;

-- Khách mở thiệp. Thiệp khóa mà chưa có / sai mật khẩu → trả trạng thái + tên cô dâu chú rể (để hiện màn nhập mật khẩu).
create or replace function public.open_invitation(p_slug text, p_password text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_ip text := public.request_ip_hash();
begin
  select * into r from public.invitation_by_link(p_slug, p_password);
  if r.code = 'NOT_FOUND' then
    return jsonb_build_object('status', 'not_found');
  elsif r.code <> 'OK' then
    return jsonb_build_object('status', lower(r.code), 'invitation', jsonb_build_object(
      'groom_name', (r.inv).groom_name, 'bride_name', (r.inv).bride_name, 'template', (r.inv).template, 'theme', (r.inv).theme));
  end if;
  -- Lượt xem: không tính chủ thiệp tự xem
  if (r.inv).owner_id is distinct from auth.uid() then
    update public.invitations set view_count = view_count + 1 where id = (r.inv).id;
    insert into public.invitation_visits (invitation_id, visitor, day)
    values ((r.inv).id, coalesce(v_ip, 'khong-ro'), (now() at time zone 'Asia/Ho_Chi_Minh')::date)
    on conflict do nothing;
  end if;
  return jsonb_build_object('status', 'ok', 'invitation', to_jsonb(r.inv) - 'owner_id' - 'view_count');
end $$;

-- Chủ thiệp đặt / bỏ mật khẩu (rỗng = bỏ khóa)
create or replace function public.set_invitation_password(p_invitation uuid, p_password text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (select 1 from public.invitations where id = p_invitation and owner_id = auth.uid()) then
    raise exception 'Bạn không có quyền với thiệp này';
  end if;
  if coalesce(btrim(p_password), '') = '' then
    delete from public.invitation_secrets where invitation_id = p_invitation;
    update public.invitations set locked = false where id = p_invitation;
    return;
  end if;
  if length(btrim(p_password)) not between 4 and 40 then
    raise exception 'Mật khẩu từ 4 đến 40 ký tự';
  end if;
  insert into public.invitation_secrets (invitation_id, password_hash)
  values (p_invitation, crypt(btrim(p_password), gen_salt('bf', 8)))
  on conflict (invitation_id) do update set password_hash = excluded.password_hash, updated_at = now();
  update public.invitations set locked = true where id = p_invitation;
end $$;

-- Thống kê cho chủ thiệp
create or replace function public.invitation_stats(p_invitation uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if not exists (select 1 from public.invitations where id = p_invitation and (owner_id = auth.uid() or public.is_admin())) then
    raise exception 'Bạn không có quyền với thiệp này';
  end if;
  return jsonb_build_object(
    'views', (select view_count from public.invitations where id = p_invitation),
    'visitors', (select count(distinct visitor) from public.invitation_visits where invitation_id = p_invitation),
    'today', (select count(*) from public.invitation_visits where invitation_id = p_invitation and day = v_today));
end $$;


-- ---------- 2. PHẢN HỒI: chỉ qua link, theo sự kiện + câu hỏi tùy chỉnh ----------
alter table public.rsvps add column if not exists event_ids text[] not null default '{}';
alter table public.rsvps add column if not exists answers jsonb not null default '{}'::jsonb;
alter table public.rsvps drop constraint if exists rsvps_answers_check;
alter table public.rsvps add constraint rsvps_answers_check
  check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) <= 4000);

drop policy if exists "rsvp_insert_anyone" on public.rsvps;    -- không chèn thẳng vào bảng nữa

-- Trả về {"ok": true} hoặc {"error": "..."} khi sai link / mật khẩu (không báo lỗi để giữ bản ghi lần thử sai).
-- Lỗi dữ liệu (thiếu câu trả lời, trùng tên, chứa link…) vẫn báo lỗi như thường.
drop function if exists public.submit_rsvp(text, text, text, boolean, int, text, text[], jsonb);
create or replace function public.submit_rsvp(
  p_slug text, p_password text, p_guest_name text, p_attending boolean, p_guest_count int,
  p_message text, p_event_ids text[] default '{}', p_answers jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v public.invitations;
  v_events jsonb;
  v_valid_events text[];
  v_chosen text[] := '{}';
  v_answers jsonb := '{}'::jsonb;
  q jsonb;
  v_ans text;
  v_applies boolean;
begin
  select * into r from public.invitation_by_link(p_slug, p_password);
  if r.code <> 'OK' then return jsonb_build_object('error', public.invitation_access_message(r.code)); end if;
  v := r.inv;
  v_events := coalesce(v.details -> 'events', '[]'::jsonb);
  v_valid_events := array(select e ->> 'id' from jsonb_array_elements(v_events) e);

  -- Sự kiện khách dự: chỉ nhận id có thật; thiệp nhiều sự kiện mà "sẽ đến" thì phải chọn ít nhất 1
  if p_attending then
    v_chosen := array(select distinct x from unnest(coalesce(p_event_ids, '{}')) x where x = any (v_valid_events));
    if coalesce(array_length(v_valid_events, 1), 0) > 1 and coalesce(array_length(v_chosen, 1), 0) = 0 then
      raise exception 'Bạn chọn giúp sự kiện sẽ tham dự nhé';
    end if;
  end if;

  -- Câu hỏi tùy chỉnh: chỉ giữ câu trả lời cho câu hỏi có thật, kiểm tra bắt buộc / đáp án hợp lệ
  for q in select * from jsonb_array_elements(coalesce(v.details -> 'rsvp_questions', '[]'::jsonb)) loop
    v_ans := nullif(btrim(coalesce(p_answers ->> (q ->> 'id'), '')), '');
    v_applies := p_attending and (coalesce(q ->> 'event_id', '') = '' or (q ->> 'event_id') = any (v_chosen)
                                  or coalesce(array_length(v_valid_events, 1), 0) <= 1);
    if not v_applies then continue; end if;
    if v_ans is null then
      if coalesce((q ->> 'required')::boolean, false) then
        raise exception 'Vui lòng trả lời: %', q ->> 'text';
      end if;
      continue;
    end if;
    if q ->> 'type' = 'choice' and not (q -> 'options') ? v_ans then
      raise exception 'Câu trả lời cho "%" không hợp lệ', q ->> 'text';
    end if;
    if length(v_ans) > 300 then raise exception 'Câu trả lời tối đa 300 ký tự'; end if;
    if v_ans ~* '(https?://|www\.)' then raise exception 'Câu trả lời không được chứa đường link'; end if;
    v_answers := v_answers || jsonb_build_object(q ->> 'id', v_ans);
  end loop;

  insert into public.rsvps (invitation_id, guest_name, attending, guest_count, message, event_ids, answers)
  values (v.id, p_guest_name, coalesce(p_attending, false),
          case when p_attending then greatest(1, least(coalesce(p_guest_count, 1), 10)) else 1 end,
          nullif(btrim(coalesce(p_message, '')), ''), v_chosen, v_answers);
  return jsonb_build_object('ok', true);
end $$;

-- ---------- 3. LỜI CHÚC: chỉ qua link; cô dâu trả lời ----------
alter table public.guestbook_entries add column if not exists reply text;
alter table public.guestbook_entries add column if not exists replied_at timestamptz;
alter table public.guestbook_entries drop constraint if exists guestbook_reply_check;
alter table public.guestbook_entries add constraint guestbook_reply_check check (reply is null or length(reply) <= 300);

drop policy if exists "guestbook_insert_any" on public.guestbook_entries;
drop policy if exists "guestbook_select" on public.guestbook_entries;
drop policy if exists "guestbook_select_owner" on public.guestbook_entries;
create policy "guestbook_select_owner" on public.guestbook_entries for select
  using (exists (select 1 from public.invitations i where i.id = invitation_id and i.owner_id = auth.uid()));
grant update (status, reply, replied_at) on public.guestbook_entries to authenticated;

drop function if exists public.submit_wish(text, text, text, text);
create or replace function public.submit_wish(p_slug text, p_password text, p_guest_name text, p_message text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from public.invitation_by_link(p_slug, p_password);
  if r.code <> 'OK' then return jsonb_build_object('error', public.invitation_access_message(r.code)); end if;
  insert into public.guestbook_entries (invitation_id, guest_name, message) values ((r.inv).id, p_guest_name, p_message);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.list_wishes(p_slug text, p_password text)
returns table (guest_name text, message text, reply text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from public.invitation_by_link(p_slug, p_password);
  if r.code <> 'OK' then return; end if;
  return query select g.guest_name, g.message, g.reply, g.created_at from public.guestbook_entries g
    where g.invitation_id = (r.inv).id and g.status = 'approved' order by g.created_at desc limit 200;
end $$;


-- ---------- QUYỀN GỌI HÀM ----------
revoke execute on function public.invitation_by_link(text, text) from public, anon, authenticated;
revoke execute on function public.invitation_access_message(text) from public, anon, authenticated;
grant execute on function public.open_invitation(text, text) to anon, authenticated;
grant execute on function public.submit_rsvp(text, text, text, boolean, int, text, text[], jsonb) to anon, authenticated;
grant execute on function public.submit_wish(text, text, text, text) to anon, authenticated;
grant execute on function public.list_wishes(text, text) to anon, authenticated;
revoke execute on function public.set_invitation_password(uuid, text) from public, anon;
grant execute on function public.set_invitation_password(uuid, text) to authenticated;
revoke execute on function public.invitation_stats(uuid) from public, anon;
grant execute on function public.invitation_stats(uuid) to authenticated;
