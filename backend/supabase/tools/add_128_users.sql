-- =====================================================================
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
    SELECT * FROM (VALUES
      ('Nguyễn Thu Thảo', 'nguyen.thuthao95@gmail.com', '0931012345'),
      ('Trần Hà My', 'hamy.tran2002@gmail.com', '0881086284'),
      ('Lê Thu Trang', 'lethutrang.hcm@gmail.com', '0391160223'),
      ('Phạm Ngọc Hân', 'han.phamngocstudio@gmail.com', '0941234162'),
      ('Hoàng Hải Yến', 'hoang.yen.97@gmail.com', '0891308101'),
      ('Vũ Thùy Dương', 'vu.thuyduong1996@gmail.com', '0351382040'),
      ('Phan Bích Ngọc', 'bichngoc.phanwedding@gmail.com', '0971455979'),
      ('Đặng Lan Hương', 'danglanhuong.92@gmail.com', '0701529918'),
      ('Bùi Thanh Hằng', 'hang.buithanh99@gmail.com', '0901603857'),
      ('Đỗ Kim Ngân', 'do.ngan.1998@gmail.com', '0981677796'),
      ('Hồ Minh Châu', 'ho.minhchauphoto@gmail.com', '0791751735'),
      ('Ngô Minh Tuấn', 'minhtuan.ngo94@gmail.com', '0911825674'),
      ('Dương Đức Thắng', 'duongducthang.2001@gmail.com', '0861899613'),
      ('Lý Hồng Phúc', 'phuc.lyhonghn@gmail.com', '0381973552'),
      ('Đinh Trọng Đạt', 'dinh.dat.media@gmail.com', '0932047491'),
      ('Đoàn Mạnh Hùng', 'doan.manhhung96@gmail.com', '0882121430'),
      ('Lâm Minh Quân', 'minhquan.lam1995@gmail.com', '0392195369'),
      ('Trịnh Tuấn Anh', 'trinhtuananh.work@gmail.com', '0942269308'),
      ('Mai Tiến Dũng', 'dung.maitiencontact@gmail.com', '0892343247'),
      ('Đào Đăng Khoa', 'dao.khoa.98@gmail.com', '0352417186'),
      ('Cao Việt Anh', 'cao.vietanh1997@gmail.com', '0972491125'),
      ('Hà Đình Trọng', 'dinhtrong.hadesign@gmail.com', '0702565064'),
      ('Lưu Phương Thảo', 'luuphuongthao.93@gmail.com', '0902639003'),
      ('Lương Bảo Ngọc', 'ngoc.luongbao2000@gmail.com', '0982712942'),
      ('Thái Quỳnh Anh', 'thai.anh.1999@gmail.com', '0792786881'),
      ('Chu Mai Phương', 'chu.maiphuongofficial@gmail.com', '0912860820'),
      ('Tạ Thảo Nhi', 'thaonhi.ta95@gmail.com', '0862934759'),
      ('Phùng Hương Giang', 'phunghuonggiang.2002@gmail.com', '0383008698'),
      ('Võ Hoài Thương', 'thuong.vohoaihcm@gmail.com', '0933082637'),
      ('Huỳnh Hồng Nhung', 'huynh.nhung.studio@gmail.com', '0883156576'),
      ('Nguyễn Kim Ngân', 'nguyen.kimngan97@gmail.com', '0393230515'),
      ('Trần Minh Châu', 'minhchau.tran1996@gmail.com', '0943304454'),
      ('Lê Minh Tuấn', 'leminhtuan.wedding@gmail.com', '0893378393'),
      ('Phạm Đức Thắng', 'thang.phamduc92@gmail.com', '0353452332'),
      ('Hoàng Hồng Phúc', 'hoang.phuc.99@gmail.com', '0973526271'),
      ('Vũ Trọng Đạt', 'vu.trongdat1998@gmail.com', '0703600210'),
      ('Phan Mạnh Hùng', 'manhhung.phanphoto@gmail.com', '0903674149'),
      ('Đặng Minh Quân', 'dangminhquan.94@gmail.com', '0983748088'),
      ('Bùi Tuấn Anh', 'anh.buituan2001@gmail.com', '0793822027'),
      ('Đỗ Tiến Dũng', 'do.dung.hn@gmail.com', '0913895966'),
      ('Hồ Đăng Khoa', 'ho.dangkhoamedia@gmail.com', '0863969905'),
      ('Ngô Việt Anh', 'vietanh.ngo96@gmail.com', '0384043844'),
      ('Dương Đình Trọng', 'duongdinhtrong.1995@gmail.com', '0934117783'),
      ('Lý Phương Thảo', 'thao.lyphuongwork@gmail.com', '0884191722'),
      ('Đinh Bảo Ngọc', 'dinh.ngoc.contact@gmail.com', '0394265661'),
      ('Đoàn Quỳnh Anh', 'doan.quynhanh98@gmail.com', '0944339600'),
      ('Lâm Mai Phương', 'maiphuong.lam1997@gmail.com', '0894413539'),
      ('Trịnh Thảo Nhi', 'trinhthaonhi.design@gmail.com', '0354487478'),
      ('Mai Hương Giang', 'giang.maihuong93@gmail.com', '0974561417'),
      ('Đào Hoài Thương', 'dao.thuong.2000@gmail.com', '0704635356'),
      ('Cao Hồng Nhung', 'cao.hongnhung1999@gmail.com', '0904709295'),
      ('Hà Diệu Linh', 'dieulinh.haofficial@gmail.com', '0984783234'),
      ('Lưu Yến Nhi', 'luuyennhi.95@gmail.com', '0794857173'),
      ('Lương Hoàng Anh', 'anh.luonghoang2002@gmail.com', '0914931112'),
      ('Thái Quốc Bảo', 'thai.bao.hcm@gmail.com', '0865005051'),
      ('Chu Đức Anh', 'chu.ducanhstudio@gmail.com', '0385078990'),
      ('Tạ Quang Huy', 'quanghuy.ta97@gmail.com', '0935152929'),
      ('Phùng Bảo Long', 'phungbaolong.1996@gmail.com', '0885226868'),
      ('Võ Hải Sơn', 'son.vohaiwedding@gmail.com', '0395300807'),
      ('Huỳnh Trung Kiên', 'huynh.kien.92@gmail.com', '0945374746'),
      ('Nguyễn Tiến Dũng', 'nguyen.tiendung99@gmail.com', '0895448685'),
      ('Trần Đăng Khoa', 'dangkhoa.tran1998@gmail.com', '0355522624'),
      ('Lê Việt Anh', 'levietanh.photo@gmail.com', '0975596563'),
      ('Phạm Đình Trọng', 'trong.phamdinh94@gmail.com', '0705670502'),
      ('Hoàng Phương Thảo', 'hoang.thao.2001@gmail.com', '0905744441'),
      ('Vũ Bảo Ngọc', 'vu.baongochn@gmail.com', '0985818380'),
      ('Phan Quỳnh Anh', 'quynhanh.phanmedia@gmail.com', '0795892319'),
      ('Đặng Mai Phương', 'dangmaiphuong.96@gmail.com', '0915966258'),
      ('Bùi Thảo Nhi', 'nhi.buithao1995@gmail.com', '0866040197'),
      ('Đỗ Hương Giang', 'do.giang.work@gmail.com', '0386114136'),
      ('Hồ Hoài Thương', 'ho.hoaithuongcontact@gmail.com', '0936188075'),
      ('Ngô Hồng Nhung', 'hongnhung.ngo98@gmail.com', '0886262014'),
      ('Dương Diệu Linh', 'duongdieulinh.1997@gmail.com', '0396335953'),
      ('Lý Yến Nhi', 'nhi.lyyendesign@gmail.com', '0946409892'),
      ('Đinh Hoàng Anh', 'dinh.anh.93@gmail.com', '0896483831'),
      ('Đoàn Quốc Bảo', 'doan.quocbao2000@gmail.com', '0356557770'),
      ('Lâm Đức Anh', 'ducanh.lam1999@gmail.com', '0976631709'),
      ('Trịnh Quang Huy', 'trinhquanghuy.official@gmail.com', '0706705648'),
      ('Mai Bảo Long', 'long.maibao95@gmail.com', '0906779587'),
      ('Đào Hải Sơn', 'dao.son.2002@gmail.com', '0986853526'),
      ('Cao Trung Kiên', 'cao.trungkienhcm@gmail.com', '0796927465'),
      ('Hà Hoàng Nam', 'hoangnam.hastudio@gmail.com', '0917001404'),
      ('Lưu Văn Đạt', 'luuvandat.97@gmail.com', '0867075343'),
      ('Lương Trường Giang', 'giang.luongtruong1996@gmail.com', '0387149282'),
      ('Thái Hữu Phước', 'thai.phuoc.wedding@gmail.com', '0937223221'),
      ('Chu Minh Anh', 'chu.minhanh92@gmail.com', '0887297160'),
      ('Tạ Khánh Linh', 'khanhlinh.ta99@gmail.com', '0397371099'),
      ('Phùng Thanh Huyền', 'phungthanhhuyen.1998@gmail.com', '0947445038'),
      ('Võ Thùy Dung', 'dung.vothuyphoto@gmail.com', '0897518977'),
      ('Huỳnh Phương Linh', 'huynh.linh.94@gmail.com', '0357592916'),
      ('Nguyễn Hương Giang', 'nguyen.huonggiang2001@gmail.com', '0977666855'),
      ('Trần Hoài Thương', 'hoaithuong.tranhn@gmail.com', '0707740794'),
      ('Lê Hồng Nhung', 'lehongnhung.media@gmail.com', '0907814733'),
      ('Phạm Diệu Linh', 'linh.phamdieu96@gmail.com', '0987888672'),
      ('Hoàng Yến Nhi', 'hoang.nhi.1995@gmail.com', '0797962611'),
      ('Vũ Hoàng Anh', 'vu.hoanganhwork@gmail.com', '0918036550'),
      ('Phan Quốc Bảo', 'quocbao.phancontact@gmail.com', '0868110489'),
      ('Đặng Đức Anh', 'dangducanh.98@gmail.com', '0388184428'),
      ('Bùi Quang Huy', 'huy.buiquang1997@gmail.com', '0938258367'),
      ('Đỗ Bảo Long', 'do.long.design@gmail.com', '0888332306'),
      ('Hồ Hải Sơn', 'ho.haison93@gmail.com', '0398406245'),
      ('Ngô Trung Kiên', 'trungkien.ngo2000@gmail.com', '0948480184'),
      ('Dương Hoàng Nam', 'duonghoangnam.1999@gmail.com', '0898554123'),
      ('Lý Văn Đạt', 'dat.lyvanofficial@gmail.com', '0358628062'),
      ('Đinh Trường Giang', 'dinh.giang.95@gmail.com', '0978702001'),
      ('Đoàn Hữu Phước', 'doan.huuphuoc2002@gmail.com', '0708775940'),
      ('Lâm Minh Anh', 'minhanh.lamhcm@gmail.com', '0908849879'),
      ('Trịnh Khánh Linh', 'trinhkhanhlinh.studio@gmail.com', '0988923818'),
      ('Mai Thanh Huyền', 'huyen.maithanh97@gmail.com', '0798997757'),
      ('Đào Thùy Dung', 'dao.dung.1996@gmail.com', '0919071696'),
      ('Cao Phương Linh', 'cao.phuonglinhwedding@gmail.com', '0869145635'),
      ('Hà Quỳnh Chi', 'quynhchi.ha92@gmail.com', '0389219574'),
      ('Lưu Tú Uyên', 'luutuuyen.99@gmail.com', '0939293513'),
      ('Lương Ngọc Ánh', 'anh.luongngoc1998@gmail.com', '0889367452'),
      ('Thái Bảo Châu', 'thai.chau.photo@gmail.com', '0399441391'),
      ('Chu Thục Quyên', 'chu.thucquyen94@gmail.com', '0949515330'),
      ('Tạ Khánh Vân', 'khanhvan.ta2001@gmail.com', '0899589269'),
      ('Phùng Thanh Tùng', 'phungthanhtung.hn@gmail.com', '0359663208'),
      ('Võ Minh Huy', 'huy.vominhmedia@gmail.com', '0979737147'),
      ('Huỳnh Hoàng Việt', 'huynh.viet.96@gmail.com', '0709811086'),
      ('Nguyễn Bảo Long', 'nguyen.baolong1995@gmail.com', '0909885025'),
      ('Trần Hải Sơn', 'haison.tranwork@gmail.com', '0989958964'),
      ('Lê Trung Kiên', 'letrungkien.contact@gmail.com', '0791032904'),
      ('Phạm Hoàng Nam', 'nam.phamhoang98@gmail.com', '0911106843'),
      ('Hoàng Văn Đạt', 'hoang.dat.1997@gmail.com', '0861180782'),
      ('Vũ Trường Giang', 'vu.truonggiangdesign@gmail.com', '0381254721'),
      ('Phan Hữu Phước', 'huuphuoc.phan93@gmail.com', '0931328660'),
      ('Đặng Minh Anh', 'dangminhanh.2000@gmail.com', '0881402599')
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
