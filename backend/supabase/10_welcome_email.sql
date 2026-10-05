-- =====================================================================
-- TRẠM HỶ – 10_WELCOME_EMAIL.SQL
-- Gửi email chào mừng khi có tài khoản MỚI tạo bằng Google. Chạy SAU 09.
--
-- Luồng: tài khoản mới trong auth.users (provider = google)
--        → trigger gọi Edge Function "gui-email-chao-mung" qua pg_net (không chờ, không chặn đăng nhập)
--        → function gửi mail qua Brevo.
--
-- Chuỗi bí mật KHÔNG ghi trong file này: lưu trong Supabase Vault (xem hướng dẫn trong TAI_LIEU_PHAT_TRIEN.md).
-- Chưa tạo Vault secret → trigger tự bỏ qua, đăng ký/đăng nhập vẫn bình thường.
-- =====================================================================

create extension if not exists pg_net with schema extensions;

create or replace function public.send_welcome_email() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_secret text;
begin
  -- Chỉ tài khoản đăng ký bằng Google (đăng ký bằng email đã có email xác nhận của Supabase)
  if coalesce(new.raw_app_meta_data ->> 'provider', '') <> 'google' then
    return new;
  end if;

  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'welcome_email_secret';
  if v_secret is null then
    return new;
  end if;

  perform net.http_post(
    url     := 'https://vsjdijmuvuetmhmszcrl.supabase.co/functions/v1/gui-email-chao-mung',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
    body    := jsonb_build_object(
                 'email', new.email,
                 'full_name', coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'))
  );
  return new;
exception when others then
  -- Lỗi gửi mail không bao giờ được làm hỏng việc tạo tài khoản
  return new;
end $$;

drop trigger if exists on_auth_user_created_welcome on auth.users;
create trigger on_auth_user_created_welcome
  after insert on auth.users
  for each row execute function public.send_welcome_email();
