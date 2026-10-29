const fs = require('fs');
const path = require('path');

const familyNames = [
  'Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Phan', 'Đặng', 'Bùi', 'Đỗ',
  'Hồ', 'Ngô', 'Dương', 'Lý', 'Đinh', 'Đoàn', 'Lâm', 'Trịnh', 'Mai', 'Đào',
  'Cao', 'Hà', 'Lưu', 'Lương', 'Thái', 'Chu', 'Tạ', 'Phùng', 'Võ', 'Huỳnh'
];

const middleAndGivenNames = [
  'Thu Thảo', 'Minh Anh', 'Phương Thảo', 'Hà My', 'Khánh Linh', 'Bảo Ngọc', 'Thu Trang', 'Thanh Huyền',
  'Quỳnh Anh', 'Ngọc Hân', 'Thùy Dung', 'Mai Phương', 'Hải Yến', 'Phương Linh', 'Thảo Nhi', 'Thùy Dương',
  'Quỳnh Chi', 'Hương Giang', 'Bích Ngọc', 'Tú Uyên', 'Hoài Thương', 'Lan Hương', 'Ngọc Ánh', 'Hồng Nhung',
  'Thanh Hằng', 'Bảo Châu', 'Diệu Linh', 'Kim Ngân', 'Thục Quyên', 'Yến Nhi', 'Minh Châu', 'Khánh Vân',
  'Hoàng Anh', 'Minh Tuấn', 'Thanh Tùng', 'Quốc Bảo', 'Đức Thắng', 'Minh Huy', 'Đức Anh', 'Hồng Phúc',
  'Hoàng Việt', 'Quang Huy', 'Trọng Đạt', 'Minh Khoa', 'Bảo Long', 'Mạnh Hùng', 'Thế Phong', 'Hải Sơn',
  'Minh Quân', 'Gia Thịnh', 'Trung Kiên', 'Tuấn Anh', 'Thành Nam', 'Hoàng Nam', 'Tiến Dũng', 'Quang Minh',
  'Văn Đạt', 'Đăng Khoa', 'Quốc Anh', 'Trường Giang', 'Việt Anh', 'Khánh Duy', 'Hữu Phước', 'Đình Trọng'
];

function removeVietnameseTones(str) {
  return str.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().trim();
}

const emailSuffixes = [
  '92', '93', '94', '95', '96', '97', '98', '99', '2000', '2001', '2002', '1995', '1996', '1997', '1998', '1999',
  'hn', 'hcm', 'work', 'wedding', 'design', 'photo', 'official', 'media', 'studio', 'contact'
];

const prefixes = ['090', '091', '093', '094', '097', '098', '086', '088', '089', '070', '079', '038', '039', '035'];

const users = [];
const emails = new Set();
const phones = new Set();

let i = 0;
while (users.length < 128) {
  const fam = familyNames[i % familyNames.length];
  const midGiven = middleAndGivenNames[(i * 3 + Math.floor(i / familyNames.length)) % middleAndGivenNames.length];
  const fullName = fam + ' ' + midGiven;
  
  const rawFam = removeVietnameseTones(fam);
  const parts = removeVietnameseTones(midGiven).split(' ');
  const given = parts[parts.length - 1];
  const middle = parts.slice(0, -1).join('');
  const sfx = emailSuffixes[(i * 7 + 3) % emailSuffixes.length];
  
  const style = i % 5;
  let handle = '';
  if (style === 0) handle = `${rawFam}.${middle}${given}${sfx}`;
  else if (style === 1) handle = `${middle}${given}.${rawFam}${sfx}`;
  else if (style === 2) handle = `${rawFam}${middle}${given}.${sfx}`;
  else if (style === 3) handle = `${given}.${rawFam}${middle}${sfx}`;
  else handle = `${rawFam}.${given}.${sfx}`;
  
  handle = handle.replace(/\.+/g, '.');
  const email = `${handle}@gmail.com`;
  
  const pref = prefixes[(i * 5 + 2) % prefixes.length];
  const num = String(1000000 + ((i * 73939 + 12345) % 8999999)).slice(0, 7);
  const phone = `${pref}${num}`;
  
  if (!emails.has(email) && !phones.has(phone)) {
    emails.add(email);
    phones.add(phone);
    users.push({ fullName, email, phone });
  }
  i++;
}

console.log(`Generated ${users.length} users successfully!`);

// Tạo file SQL
let sql = `-- =====================================================================
-- TRẠM HỶ – TẠO 128 TÀI KHOẢN NGƯỜI DÙNG THỰC TẾ (GMAIL CHUẨN)
-- Mật khẩu: 1 (đã mã hóa bcrypt an toàn theo chuẩn Supabase Auth)
-- Vai trò: bride (Cô dâu / khách hàng)
-- Chạy trong Supabase Dashboard -> SQL Editor -> Run
-- Chạy lại nhiều lần không bị trùng lặp (ON CONFLICT DO NOTHING)
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $$
DECLARE
  v_pass_hash text := extensions.crypt('1', extensions.gen_salt('bf', 10));
  r record;
  v_user_id uuid;
BEGIN
  -- Danh sách 128 người dùng với họ tên tiếng Việt, số điện thoại và Gmail tự nhiên
  FOR r IN 
    SELECT * FROM (VALUES\n`;

const valuesList = users.map((u, idx) => {
  const isLast = idx === users.length - 1;
  return `      ('${u.fullName.replace(/'/g, "''")}', '${u.email}', '${u.phone}')${isLast ? '' : ','}`;
}).join('\n');

sql += valuesList;
sql += `
    ) AS t(full_name, email, phone)
  LOOP
    -- Bỏ qua nếu email đã tồn tại trong hệ thống
    IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower(r.email)) THEN
      CONTINUE;
    END IF;

    v_user_id := gen_random_uuid();

    -- 1. Thêm vào bảng auth.users của Supabase Auth (email_confirmed_at = now() để đăng nhập được ngay không cần xác thực)
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      lower(r.email),
      v_pass_hash,
      now(),
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      jsonb_build_object('full_name', r.full_name, 'phone', r.phone, 'role', 'bride'),
      now(),
      now(),
      '', '', '', ''
    );

    -- 2. Đảm bảo bản ghi trong public.profiles (trigger handle_new_user có thể đã tạo, bổ sung on conflict cho an toàn tuyệt đối)
    INSERT INTO public.profiles (id, full_name, phone, role)
    VALUES (v_user_id, r.full_name, r.phone, 'bride')
    ON CONFLICT (id) DO UPDATE
      SET full_name = EXCLUDED.full_name,
          phone = EXCLUDED.phone;

    -- 3. Bổ sung bản ghi trong auth.identities để GoTrue xác thực mật khẩu mượt mà 100%
    BEGIN
      INSERT INTO auth.identities (
        id,
        user_id,
        identity_data,
        provider,
        last_sign_in_at,
        created_at,
        updated_at
      ) VALUES (
        v_user_id::text,
        v_user_id,
        jsonb_build_object('sub', v_user_id::text, 'email', lower(r.email)),
        'email',
        now(),
        now(),
        now()
      )
      ON CONFLICT DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      -- Bỏ qua nếu phiên bản GoTrue quản lý identities tự động
      NULL;
    END;

  END LOOP;

  RAISE NOTICE 'Đã tạo thành công 128 tài khoản với mật khẩu là 1!';
END $$;
`;

const outputPath = path.join(__dirname, 'add_128_users.sql');
fs.writeFileSync(outputPath, sql, 'utf8');
console.log(`Saved SQL to ${outputPath}`);

// Tạo file markdown danh sách tài khoản để người dùng dễ tra cứu
let md = `# Danh sách 128 Tài Khoản Người Dùng Mẫu Trạm Hỷ

- **Mật khẩu chung cho tất cả tài khoản:** \`1\`
- **Vai trò:** \`bride\` (Cô dâu / Khách hàng)
- **Định dạng Gmail:** Chuẩn thực tế tự nhiên, không bị lộ mùi tài khoản giả lập.

| STT | Họ và Tên | Email (Gmail) | Số điện thoại | Mật khẩu |
|:---:|:---|:---|:---:|:---:|
`;

users.forEach((u, idx) => {
  md += `| ${idx + 1} | ${u.fullName} | \`${u.email}\` | \`${u.phone}\` | \`1\` |\n`;
});

const mdPath = path.join(__dirname, 'danh_sach_128_tai_khoan.md');
fs.writeFileSync(mdPath, md, 'utf8');
console.log(`Saved Markdown list to ${mdPath}`);

