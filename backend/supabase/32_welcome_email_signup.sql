-- =====================================================================
-- TRẠM HỶ – 32_WELCOME_EMAIL_SIGNUP.SQL
-- Email chào mừng cho CẢ người đăng ký bằng email + mật khẩu (SQL 10 chỉ gửi cho tài khoản Google).
-- Chạy SAU 31. Chạy lại nhiều lần không lỗi. Thay hàm public.send_welcome_email của SQL 10.
--
-- Luồng:
--   • Google: tài khoản mới (INSERT auth.users, provider = google) → gửi ngay, giữ nguyên như SQL 10.
--   • Email + mật khẩu: lúc INSERT email chưa xác nhận → chưa gửi. Người dùng bấm link trong email xác nhận
--     → Supabase UPDATE email_confirmed_at từ NULL sang có giá trị → trigger mới gửi email chào mừng.
--   Cả hai gọi Edge Function "gui-email-chao-mung" qua pg_net (không chờ, không chặn đăng ký/đăng nhập),
--   gửi kèm provider ('google' | 'email') để function chọn lời chào cho đúng.
--
-- Không bao giờ gửi 2 email chào mừng cho 1 người:
--   • Chú ý: tài khoản Google KHÔNG được tạo ở trạng thái "đã xác nhận". Supabase Auth INSERT với
--     email_confirmed_at = NULL rồi UPDATE xác nhận ngay trong cùng giao dịch (hàm user.Confirm của Supabase Auth).
--     Vì vậy trigger UPDATE cũng thấy NULL → có giá trị với tài khoản Google, nên không thể chỉ dựa vào điều kiện đó.
--   • Mỗi lần gửi đều ghi 1 dòng vào bảng welcome_emails (khóa chính = user_id). Đã có dòng → không gửi nữa.
--     Tài khoản Google: trigger INSERT ghi dòng + gửi → trigger UPDATE xác nhận ngay sau đó thấy đã có dòng → bỏ qua.
--   • Tài khoản đã xác nhận từ trước khi chạy file này được đánh dấu sẵn (provider 'truoc-sql-32') → không ai nhận
--     thư "muộn", kể cả khi admin bỏ xác nhận rồi xác nhận lại.
--   • Trường hợp hiếm: đăng ký bằng email (chưa xác nhận) rồi bấm "Tiếp tục với Google" cùng email → Supabase đổi
--     provider sang google rồi xác nhận → trigger UPDATE gửi đúng 1 thư (lời chào kiểu Google).
--   • Tài khoản tạo thẳng bằng SQL với email_confirmed_at có sẵn (vd dữ liệu demo SQL 15) không qua bước xác nhận
--     và không phải Google → không nhận thư.
--
-- Chuỗi bí mật vẫn nằm trong Supabase Vault ('welcome_email_secret', phải trùng secret WEBHOOK_SECRET của function).
-- Chưa có Vault secret → bỏ qua, không ghi bảng. Mọi lỗi đều bị bỏ qua: gửi mail không bao giờ làm hỏng
-- việc đăng ký / xác nhận / đăng nhập.
-- =====================================================================

create extension if not exists pg_net with schema extensions;

-- Sổ ghi ai đã được gửi email chào mừng: mỗi tài khoản tối đa 1 dòng = tối đa 1 email.
create table if not exists public.welcome_emails (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  provider    text not null,                       -- 'google' | 'email' | 'truoc-sql-32' (đánh dấu sẵn, không gửi)
  created_at  timestamptz not null default now()
);
alter table public.welcome_emails enable row level security;
-- Không có policy nào → khách và người dùng không đọc/ghi được; chỉ hàm trigger bên dưới (security definer) dùng.
revoke all on public.welcome_emails from anon, authenticated;

-- Tài khoản đã xác nhận từ trước: coi như đã xử lý (Google đã nhận thư theo SQL 10; email cũ thì không gửi muộn)
insert into public.welcome_emails (user_id, provider, created_at)
select u.id, 'truoc-sql-32', coalesce(u.email_confirmed_at, u.created_at, now())
from auth.users u
where u.email_confirmed_at is not null
on conflict (user_id) do nothing;

create or replace function public.send_welcome_email() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_provider text;
  v_secret   text;
begin
  v_provider := coalesce(new.raw_app_meta_data ->> 'provider', 'email');
  if new.email is null or new.email = '' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Tài khoản mới tạo bằng Google: gửi ngay (như SQL 10). Đăng ký bằng email thì chờ xác nhận.
    if v_provider <> 'google' then
      return new;
    end if;
  else
    -- UPDATE: chỉ đúng lúc email vừa được xác nhận (trigger cũng lọc sẵn bằng WHEN)
    if old.email_confirmed_at is not null or new.email_confirmed_at is null then
      return new;
    end if;
    if v_provider not in ('email', 'google') then
      return new;
    end if;
  end if;

  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'welcome_email_secret';
  if v_secret is null then
    return new;
  end if;

  -- Mỗi tài khoản tối đa 1 email chào mừng: đã có dòng thì thôi
  insert into public.welcome_emails (user_id, provider) values (new.id, v_provider)
  on conflict (user_id) do nothing;
  if not found then
    return new;
  end if;

  perform net.http_post(
    url     := 'https://vsjdijmuvuetmhmszcrl.supabase.co/functions/v1/gui-email-chao-mung',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
    body    := jsonb_build_object(
                 'email', new.email,
                 'full_name', coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
                 'provider', case when v_provider = 'google' then 'google' else 'email' end)
  );
  return new;
exception when others then
  -- Lỗi gửi mail không bao giờ được làm hỏng việc tạo / xác nhận tài khoản
  -- (dòng welcome_emails vừa ghi trong khối này cũng tự hủy theo)
  return new;
end $$;

-- Google: lúc tạo tài khoản (giữ như SQL 10)
drop trigger if exists on_auth_user_created_welcome on auth.users;
create trigger on_auth_user_created_welcome
  after insert on auth.users
  for each row execute function public.send_welcome_email();

-- Email + mật khẩu: lúc email vừa được xác nhận. WHEN lọc sẵn → không chạy hàm ở các lần UPDATE khác (vd mỗi lần đăng nhập).
drop trigger if exists on_auth_user_confirmed_welcome on auth.users;
create trigger on_auth_user_confirmed_welcome
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.send_welcome_email();
