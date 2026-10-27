-- =====================================================================
-- TRẠM HỶ – 34_TRYON_CREDIT_HOLD.SQL
-- Giữ chỗ credit thử váy AI TRƯỚC khi gọi AI, để gửi nhiều lượt cùng lúc (nhiều tab) không vượt hạn mức/ngày. Chạy SAU 33.
-- Chạy lại nhiều lần không lỗi.
--
--   - tryon_jobs thêm trạng thái 'pending' = credit đang giữ chỗ cho một lượt đang chạy. Dòng này được Edge Function
--     xóa khi lượt kết thúc (thành công / lỗi). Dòng pending quá 5 phút bị coi là treo và không còn được tính.
--   - reserve_tryon_credits(user, cost, limit): khóa theo người dùng → tính (credit đã dùng hôm nay + đang giữ chỗ)
--     → đủ thì ghi dòng pending và trả { ok, id, left }, thiếu thì trả { ok: false, left }.
--   - Chỉ service role (Edge Function) gọi được; người dùng không gọi trực tiếp được.
-- =====================================================================

-- Cho phép trạng thái 'pending' và giữ chỗ tới 12 credit (4 ảnh × 3 credit Siêu nét)
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.tryon_jobs'::regclass and contype = 'c'
      and (pg_get_constraintdef(oid) ilike '%status%' or pg_get_constraintdef(oid) ilike '%credits%')
  loop
    execute format('alter table public.tryon_jobs drop constraint %I', c);
  end loop;
end $$;

alter table public.tryon_jobs add constraint tryon_jobs_status_check check (status in ('done', 'failed', 'pending'));
alter table public.tryon_jobs add constraint tryon_jobs_credits_check check (credits between 0 and 20);

create or replace function public.reserve_tryon_credits(p_user uuid, p_cost int, p_limit int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day_start timestamptz := (date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh')) at time zone 'Asia/Ho_Chi_Minh';
  v_used int;
  v_left int;
  v_id uuid;
begin
  if p_cost is null or p_cost < 1 or p_cost > 20 then
    raise exception 'Số credit không hợp lệ';
  end if;

  -- Một người một lượt kiểm tra tại một thời điểm → hai yêu cầu đồng thời không cùng thấy "còn credit"
  perform pg_advisory_xact_lock(hashtext('tryon:' || p_user::text));

  select coalesce(sum(credits), 0) into v_used
  from public.tryon_jobs
  where user_id = p_user
    and created_at >= v_day_start
    and (status = 'done' or (status = 'pending' and created_at > now() - interval '5 minutes'));

  v_left := greatest(0, p_limit - v_used);
  if p_cost > v_left then
    return jsonb_build_object('ok', false, 'left', v_left);
  end if;

  insert into public.tryon_jobs (user_id, provider, status, credits)
  values (p_user, 'pending', 'pending', p_cost)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'left', v_left);
end $$;

revoke all on function public.reserve_tryon_credits(uuid, int, int) from public, anon, authenticated;
grant execute on function public.reserve_tryon_credits(uuid, int, int) to service_role;
