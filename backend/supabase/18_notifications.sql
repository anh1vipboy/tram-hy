-- =====================================================================
-- TRẠM HỶ – 18_NOTIFICATIONS.SQL
-- Chuông thông báo cho cả 3 vai trò. Chạy SAU 17.
--   - Database TỰ tạo thông báo bằng trigger khi đơn / đợt cọc / khiếu nại / hồ sơ tiệm / đánh giá / phản hồi thiệp
--     thay đổi → không sót, không giả mạo được từ trình duyệt.
--   - Mỗi người chỉ đọc / đánh dấu đã đọc / xóa thông báo của mình. Realtime để chuông nhảy số ngay.
--   - Dữ liệu demo (đơn seed) không tạo thông báo. Thông báo cũ hơn 90 ngày tự dọn.
-- Chạy lại nhiều lần không lỗi.
-- =====================================================================

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null,                 -- booking_new, milestone_paid, vendor_approved… (để lọc / thống kê sau này)
  icon        text not null default '🔔',
  title       text not null,
  body        text,
  link        text,                          -- trang nội bộ mở khi bấm (vd bookings.html?focus=BK…)
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;
drop policy if exists "notif_select_own" on public.notifications;
create policy "notif_select_own" on public.notifications for select using (user_id = auth.uid());
drop policy if exists "notif_update_own" on public.notifications;
create policy "notif_update_own" on public.notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "notif_delete_own" on public.notifications;
create policy "notif_delete_own" on public.notifications for delete using (user_id = auth.uid());

-- Người dùng chỉ được đổi read_at (không sửa nội dung); thêm mới chỉ trigger làm
revoke insert, update on public.notifications from anon, authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;


-- ---------- HÀM GỬI ----------
create or replace function public.notify(p_user uuid, p_kind text, p_icon text, p_title text, p_body text, p_link text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  insert into public.notifications (user_id, kind, icon, title, body, link)
  values (p_user, p_kind, p_icon, left(p_title, 160), left(p_body, 400), p_link);
  -- dọn nhẹ: thông báo cũ hơn 90 ngày của người này
  delete from public.notifications where user_id = p_user and created_at < now() - interval '90 days';
end $$;

create or replace function public.notify_admins(p_kind text, p_icon text, p_title text, p_body text, p_link text)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from public.profiles where role = 'admin' loop
    perform public.notify(r.id, p_kind, p_icon, p_title, p_body, p_link);
  end loop;
end $$;

revoke execute on function public.notify(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.notify_admins(text, text, text, text, text) from public, anon, authenticated;

create or replace function public.fmt_money(p bigint) returns text language sql immutable as $$
  select replace(to_char(coalesce(p, 0), 'FM999,999,999,999'), ',', '.') || 'đ'
$$;


-- ---------- ĐƠN HÀNG ----------
create or replace function public.notif_bookings() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_vendor public.vendors;
  v_bride_name text;
begin
  if new.details ->> 'seed' = 'demo' then return new; end if;
  select * into v_vendor from public.vendors where id = new.vendor_id;
  select coalesce(nullif(trim(full_name), ''), 'Khách') into v_bride_name from public.profiles where id = new.bride_id;

  if tg_op = 'INSERT' then
    perform public.notify(v_vendor.owner_id, 'booking_new', '📥', 'Đơn đặt lịch mới ' || new.code,
      v_bride_name || ' đặt lịch' || coalesce(' lúc ' || to_char(new.appointment_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM/YYYY'), '')
        || ' · ' || public.fmt_money(new.total_price) || '. Chờ khách trả cọc đợt 1.',
      'vendor-dashboard.html?focus=' || new.code);
    return new;
  end if;

  if new.status is distinct from old.status then
    case new.status
      when 'in_progress' then
        perform public.notify(new.bride_id, 'booking_in_progress', '🧵', v_vendor.name || ' bắt đầu thực hiện đơn của bạn',
          'Đơn ' || new.code || ' đang được thực hiện.', 'bookings.html?focus=' || new.code);
      when 'ready_for_review' then
        perform public.notify(new.bride_id, 'booking_review', '📋', v_vendor.name || ' báo đã xong – chờ bạn nghiệm thu',
          'Kiểm tra rồi bấm "Nghiệm thu" để Trạm Hỷ chuyển tiền cho tiệm (đơn ' || new.code || ').', 'bookings.html?focus=' || new.code);
      when 'completed' then
        perform public.notify(new.bride_id, 'booking_completed', '⭐', 'Đơn ' || new.code || ' đã hoàn tất',
          'Cảm ơn bạn! Hãy dành 1 phút đánh giá ' || v_vendor.name || ' để giúp các cô dâu khác.', 'bookings.html?focus=' || new.code);
        perform public.notify(v_vendor.owner_id, 'booking_completed', '🎉', 'Đơn ' || new.code || ' đã hoàn tất',
          v_bride_name || ' đã nghiệm thu đủ các đợt.', 'vendor-dashboard.html?focus=' || new.code);
      when 'cancelled' then
        if old.status = 'pending' then          -- tiệm hủy đơn chưa đặt cọc
          perform public.notify(new.bride_id, 'booking_cancelled', '❌', v_vendor.name || ' đã hủy đơn ' || new.code,
            'Đơn chưa đặt cọc nên bạn không mất tiền. Hãy chọn tiệm khác hoặc đặt lại lịch khác.', 'bookings.html?focus=' || new.code);
        end if;
      else null;
    end case;
  end if;
  return new;
end $$;

drop trigger if exists notif_bookings on public.bookings;
create trigger notif_bookings after insert or update of status on public.bookings
  for each row execute function public.notif_bookings();


-- ---------- ĐỢT CỌC (trả tiền / giải ngân) ----------
create or replace function public.notif_milestones() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  b public.bookings;
  v public.vendors;
  v_bride_name text;
begin
  if new.status is not distinct from old.status then return new; end if;
  select * into b from public.bookings where id = new.booking_id;
  if b.details ->> 'seed' = 'demo' then return new; end if;
  select * into v from public.vendors where id = b.vendor_id;
  select coalesce(nullif(trim(full_name), ''), 'Khách') into v_bride_name from public.profiles where id = b.bride_id;

  if new.status = 'paid' then
    perform public.notify(v.owner_id, 'milestone_paid', '💰', v_bride_name || ' đã trả đợt ' || new.stage || ' – ' || public.fmt_money(new.amount),
      'Trạm Hỷ đang giữ khoản này cho đơn ' || b.code || ' và chuyển cho bạn khi khách nghiệm thu.',
      'vendor-dashboard.html?focus=' || b.code);
  elsif new.status = 'released' then
    perform public.notify(v.owner_id, 'milestone_released', '✅', 'Đã giải ngân đợt ' || new.stage || ' đơn ' || b.code,
      public.fmt_money(round(new.amount * 0.9)::bigint) || ' (sau phí 10%) sẽ được chuyển vào tài khoản nhận tiền của bạn.',
      'vendor-dashboard.html?focus=' || b.code);
  end if;
  return new;
end $$;

drop trigger if exists notif_milestones on public.milestones;
create trigger notif_milestones after update of status on public.milestones
  for each row execute function public.notif_milestones();


-- ---------- KHIẾU NẠI ----------
create or replace function public.notif_disputes() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  b public.bookings;
  v public.vendors;
  v_result text;
begin
  select * into b from public.bookings where id = new.booking_id;
  select * into v from public.vendors where id = b.vendor_id;

  if tg_op = 'INSERT' then
    if new.kind = 'no_show' then
      perform public.notify_admins('dispute_new', '🚫', v.name || ' báo khách không đến – đơn ' || b.code,
        left(new.reason, 200), 'admin.html?tab=disputes');
      perform public.notify(b.bride_id, 'dispute_no_show', '🚫', v.name || ' báo bạn không đến buổi hẹn',
        'Đơn ' || b.code || ' đang chờ Trạm Hỷ xem xét. Nếu có nhầm lẫn, hãy liên hệ Trạm Hỷ ngay.', 'bookings.html?focus=' || b.code);
    else
      perform public.notify_admins('dispute_new', '⚠️', 'Khiếu nại mới – đơn ' || b.code,
        v.name || ': ' || left(new.reason, 200), 'admin.html?tab=disputes');
      perform public.notify(v.owner_id, 'dispute_refund_request', '⚠️', 'Khách yêu cầu hoàn cọc đơn ' || b.code,
        'Lý do: ' || left(new.reason, 200) || '. Trạm Hỷ sẽ xem xét và liên hệ hai bên.', 'vendor-dashboard.html?focus=' || b.code);
    end if;
    return new;
  end if;

  if old.status = 'open' and new.status <> 'open' then
    v_result := case new.status when 'resolved_refund' then 'Khách được hoàn tiền' else 'Tiền được giải ngân cho tiệm' end;
    perform public.notify(b.bride_id, 'dispute_resolved', '⚖️', 'Khiếu nại đơn ' || b.code || ' đã được xử lý',
      v_result || coalesce('. ' || new.resolution_note, '') || '.', 'bookings.html?focus=' || b.code);
    perform public.notify(v.owner_id, 'dispute_resolved', '⚖️', 'Khiếu nại đơn ' || b.code || ' đã được xử lý',
      v_result || coalesce('. ' || new.resolution_note, '') || '.', 'vendor-dashboard.html?focus=' || b.code);
  end if;
  return new;
end $$;

drop trigger if exists notif_disputes on public.disputes;
create trigger notif_disputes after insert or update of status on public.disputes
  for each row execute function public.notif_disputes();


-- ---------- HỒ SƠ TIỆM ----------
create or replace function public.notif_vendors() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'pending' then
      perform public.notify_admins('vendor_application', '🏪', 'Hồ sơ mở tiệm mới: ' || new.name,
        coalesce(new.district, '') || ' · chờ bạn duyệt.', 'admin.html?tab=approvals');
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'pending' then
      perform public.notify_admins('vendor_application', '🔁', 'Hồ sơ gửi lại: ' || new.name,
        'Đối tác đã sửa theo góp ý – chờ bạn duyệt lại.', 'admin.html?tab=approvals');
    elsif new.status = 'approved' then
      perform public.notify(new.owner_id, 'vendor_approved', '🎉', 'Tiệm "' || new.name || '" đã được duyệt!',
        'Tiệm đã lên sàn. Hoàn thiện hồ sơ (logo, ảnh, tài khoản nhận tiền) để bắt đầu nhận đơn.', 'vendor-dashboard.html');
    elsif new.status = 'rejected' then
      perform public.notify(new.owner_id, 'vendor_rejected', '📝', 'Hồ sơ "' || new.name || '" cần chỉnh sửa',
        'Lý do: ' || coalesce(new.review_note, 'không ghi rõ') || '. Sửa và gửi lại ngay ở Kênh đối tác.', 'vendor-dashboard.html');
    end if;
  end if;
  if new.is_verified and not coalesce(old.is_verified, false) then
    perform public.notify(new.owner_id, 'vendor_verified', '✓', 'Tiệm "' || new.name || '" được cấp Tích Xanh',
      'Tiệm của bạn sẽ được ưu tiên hiển thị với khách.', 'vendor.html?slug=' || new.slug);
  end if;
  return new;
end $$;

drop trigger if exists notif_vendors on public.vendors;
create trigger notif_vendors after insert or update of status, is_verified on public.vendors
  for each row execute function public.notif_vendors();


-- ---------- ĐÁNH GIÁ MỚI ----------
create or replace function public.notif_reviews() returns trigger
language plpgsql security definer set search_path = public as $$
declare v public.vendors;
begin
  if coalesce((to_jsonb(new) ->> 'is_demo')::boolean, false) then return new; end if;   -- cột có từ SQL 15
  select * into v from public.vendors where id = new.vendor_id;
  perform public.notify(v.owner_id, 'review_new', '⭐', coalesce(new.reviewer_name, 'Khách') || ' đánh giá ' || new.rating || ' sao',
    coalesce('“' || left(new.content, 160) || '”', 'Không kèm nhận xét.'), 'vendor.html?slug=' || v.slug);
  return new;
end $$;

drop trigger if exists notif_reviews on public.reviews;
create trigger notif_reviews after insert on public.reviews
  for each row execute function public.notif_reviews();


-- ---------- PHẢN HỒI THIỆP CƯỚI ----------
create or replace function public.notif_rsvps() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  select owner_id into v_owner from public.invitations where id = new.invitation_id;
  perform public.notify(v_owner, 'rsvp_new', '💌',
    new.guest_name || case when new.attending then ' sẽ đến (' || new.guest_count || ' người)' else ' không thể đến' end,
    coalesce('“' || left(new.message, 160) || '”', 'Khách đã phản hồi thiệp cưới của bạn.'), 'invitation.html');
  return new;
end $$;

drop trigger if exists notif_rsvps on public.rsvps;
create trigger notif_rsvps after insert on public.rsvps
  for each row execute function public.notif_rsvps();

revoke execute on function public.notif_bookings(), public.notif_milestones(), public.notif_disputes(),
  public.notif_vendors(), public.notif_reviews(), public.notif_rsvps() from public, anon, authenticated;
