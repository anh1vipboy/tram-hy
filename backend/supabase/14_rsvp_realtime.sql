-- =====================================================================
-- TRẠM HỶ – 14_RSVP_REALTIME.SQL
-- Phản hồi thiệp cưới (RSVP) tự hiện trên trang của cô dâu, không cần tải lại. Chạy SAU 13.
-- Realtime vẫn theo RLS: chỉ chủ thiệp nhận được phản hồi của thiệp mình (policy rsvp_select_owner).
-- Chạy lại nhiều lần không lỗi.
-- =====================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rsvps'
  ) then
    alter publication supabase_realtime add table public.rsvps;
  end if;
end $$;
