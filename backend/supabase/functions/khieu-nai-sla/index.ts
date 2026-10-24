// Supabase Edge Function: khieu-nai-sla
// Xử lý toàn diện Khiếu nại, Phản hồi của Khách / Đối tác, Xin dời lịch hẹn (Reschedule),
// Khôi phục đơn hàng & Cơ chế SLA 48h/72h tự động bảo vệ hai bên cho TẤT CẢ dịch vụ cưới trên Trạm Hỷ.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SLA_DISPUTE_HOURS = 48;
const SLA_REVIEW_HOURS = 72;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function fmtMoney(n: number) {
  return `${Math.round(Number(n) || 0).toLocaleString('vi-VN')}đ`;
}

function fmtDateTime(iso?: string | null) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

async function notifyUser(
  adminClient: ReturnType<typeof createClient>,
  userId: string | null | undefined,
  kind: string,
  icon: string,
  title: string,
  body: string,
  link: string,
) {
  if (!userId) return;
  await adminClient.from('notifications').insert({
    user_id: userId,
    kind,
    icon,
    title: title.slice(0, 160),
    body: body.slice(0, 400),
    link,
  });
}

async function notifyAdmins(
  adminClient: ReturnType<typeof createClient>,
  kind: string,
  icon: string,
  title: string,
  body: string,
  link: string,
) {
  const { data: admins } = await adminClient.from('profiles').select('id').eq('role', 'admin');
  for (const a of admins || []) {
    await notifyUser(adminClient, a.id, kind, icon, title, body, link);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!jwt) return jsonResponse({ error: 'Bạn cần đăng nhập để thực hiện thao tác này.' }, 401);

    const { data: authData, error: authErr } = await adminClient.auth.getUser(jwt);
    if (authErr || !authData?.user) {
      return jsonResponse({ error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' }, 401);
    }
    const uid = authData.user.id;
    const { data: profile } = await adminClient.from('profiles').select('id, role, full_name').eq('id', uid).maybeSingle();
    const isAdmin = profile?.role === 'admin';

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');
    const bookingId = String(body.bookingId || '');

    if (!bookingId) return jsonResponse({ error: 'Thiếu mã đơn đặt lịch.' }, 400);

    const { data: booking, error: bErr } = await adminClient
      .from('bookings')
      .select(`
        id, code, bride_id, vendor_id, status, appointment_at, total_price, contact_name, contact_phone, details, updated_at,
        vendor:vendors(id, name, owner_id, category),
        milestones(id, stage, amount, status),
        disputes(id, kind, reason, status, prev_status, created_at)
      `)
      .eq('id', bookingId)
      .maybeSingle();

    if (bErr || !booking) return jsonResponse({ error: 'Không tìm thấy đơn hàng.' }, 404);

    const vendor = Array.isArray(booking.vendor) ? booking.vendor[0] : booking.vendor;
    const isBride = booking.bride_id === uid;
    const isVendorOwner = vendor?.owner_id === uid;
    const openDispute = (booking.disputes || []).find((d: any) => d.status === 'open');
    const details = { ...(booking.details || {}) };

    // 1. KHÁCH HÀNG PHẢN HỒI KHIẾU NẠI (Xin dời lịch hẹn mới HOẶC Gửi giải trình)
    if (action === 'bride_respond') {
      if (!isBride && !isAdmin) {
        return jsonResponse({ error: 'Chỉ khách hàng của đơn này mới được gửi phản hồi.' }, 403);
      }
      if (!openDispute) {
        return jsonResponse({ error: 'Đơn này hiện không có khiếu nại đang mở.' }, 400);
      }
      const responseType = body.responseType === 'reschedule' ? 'reschedule' : 'rebuttal';
      const message = String(body.message || '').trim();
      const proposedAppointmentAt = body.proposedAppointmentAt || null;

      if (message.length < 5) {
        return jsonResponse({ error: 'Vui lòng nhập nội dung phản hồi rõ ràng (ít nhất 5 ký tự).' }, 400);
      }
      if (responseType === 'reschedule' && !proposedAppointmentAt) {
        return jsonResponse({ error: 'Vui lòng chọn ngày giờ hẹn mới bạn muốn đề xuất.' }, 400);
      }

      details.dispute_response = {
        type: responseType,
        message,
        proposed_appointment_at: proposedAppointmentAt,
        responded_at: new Date().toISOString(),
        by_role: 'bride',
        by_name: booking.contact_name || profile?.full_name || 'Khách hàng',
      };

      const { error: uErr } = await adminClient
        .from('bookings')
        .update({ details })
        .eq('id', booking.id);
      if (uErr) throw uErr;

      if (responseType === 'reschedule') {
        const timeStr = fmtDateTime(proposedAppointmentAt);
        await notifyUser(
          adminClient,
          vendor?.owner_id,
          'dispute_reschedule_request',
          '📅',
          `Khách xin dời lịch hẹn đơn ${booking.code}`,
          `${booking.contact_name || 'Khách'} đề xuất hẹn lại lúc ${timeStr}: "${message}". Bạn có thể bấm Đồng ý dời lịch để giữ đơn.`,
          `vendor-dashboard.html?focus=${booking.code}`,
        );
        await notifyAdmins(
          adminClient,
          'dispute_reschedule_request',
          '📅',
          `Khách xin dời lịch đơn ${booking.code} (${vendor?.name})`,
          `Đề xuất lịch mới ${timeStr}: "${message}"`,
          'admin.html?tab=disputes',
        );
      } else {
        await notifyUser(
          adminClient,
          vendor?.owner_id,
          'dispute_bride_rebuttal',
          '💬',
          `Khách đã phản hồi khiếu nại đơn ${booking.code}`,
          `Phản hồi từ ${booking.contact_name || 'Khách'}: "${message}"`,
          `vendor-dashboard.html?focus=${booking.code}`,
        );
        await notifyAdmins(
          adminClient,
          'dispute_bride_rebuttal',
          '💬',
          `Khách gửi giải trình đơn ${booking.code}`,
          `${booking.contact_name || 'Khách'}: "${message}"`,
          'admin.html?tab=disputes',
        );
      }

      return jsonResponse({ ok: true, details });
    }

    // 2. ĐỐI TÁC GỬI PHẢN HỒI / GIẢI TRÌNH (khi khách yêu cầu hoàn cọc)
    if (action === 'vendor_respond') {
      if (!isVendorOwner && !isAdmin) {
        return jsonResponse({ error: 'Chỉ chủ tiệm của đơn này mới được gửi phản hồi.' }, 403);
      }
      if (!openDispute) {
        return jsonResponse({ error: 'Đơn này hiện không có khiếu nại đang mở.' }, 400);
      }
      const message = String(body.message || '').trim();
      if (message.length < 5) {
        return jsonResponse({ error: 'Vui lòng nhập phản hồi của tiệm (ít nhất 5 ký tự).' }, 400);
      }

      details.vendor_dispute_reply = {
        message,
        responded_at: new Date().toISOString(),
        by_name: vendor?.name || 'Đối tác',
      };

      const { error: uErr } = await adminClient
        .from('bookings')
        .update({ details })
        .eq('id', booking.id);
      if (uErr) throw uErr;

      await notifyUser(
        adminClient,
        booking.bride_id,
        'dispute_vendor_reply',
        '🏪',
        `${vendor?.name} đã phản hồi yêu cầu đơn ${booking.code}`,
        `Phản hồi từ tiệm: "${message}"`,
        `bookings.html?focus=${booking.code}`,
      );
      await notifyAdmins(
        adminClient,
        'dispute_vendor_reply',
        '🏪',
        `${vendor?.name} giải trình khiếu nại đơn ${booking.code}`,
        `Nội dung: "${message}"`,
        'admin.html?tab=disputes',
      );

      return jsonResponse({ ok: true, details });
    }

    // 3. KHÔI PHỤC ĐƠN & DỜI LỊCH HẸN MỚI (Tiệm đồng ý hẹn lại, Khách rút khiếu nại, hoặc Admin cho phép dời lịch)
    if (action === 'restore_booking') {
      if (!isVendorOwner && !isAdmin && !isBride) {
        return jsonResponse({ error: 'Bạn không có quyền thực hiện thao tác này.' }, 403);
      }
      if (!openDispute) {
        return jsonResponse({ error: 'Khiếu nại của đơn này đã được xử lý trước đó.' }, 400);
      }
      // Cô dâu chỉ tự rút được khiếu nại do chính cô dâu mở (refund_request)
      if (isBride && !isAdmin && !isVendorOwner && openDispute.kind !== 'refund_request') {
        return jsonResponse({ error: 'Báo cáo không đến do tiệm mở – bạn hãy bấm Xin dời lịch hẹn để tiệm hoặc Admin duyệt.' }, 403);
      }

      const newAppointmentAt = body.newAppointmentAt
        || details.dispute_response?.proposed_appointment_at
        || booking.appointment_at;
      const note = String(body.note || '').trim() || 'Hai bên đã thống nhất lịch hẹn mới và tiếp tục thực hiện đơn.';
      const restoredStatus = openDispute.prev_status || 'confirmed';

      // Lưu lịch sử dời lịch vào details
      const history = Array.isArray(details.reschedule_history) ? details.reschedule_history : [];
      history.push({
        from_appointment_at: booking.appointment_at,
        to_appointment_at: newAppointmentAt,
        note,
        restored_by: isAdmin ? 'admin' : isVendorOwner ? 'vendor' : 'bride',
        restored_at: new Date().toISOString(),
      });
      details.reschedule_history = history;
      delete details.dispute_response;
      delete details.vendor_dispute_reply;

      // Đóng dispute & khôi phục trạng thái đơn (không mất cọc, không hủy đơn)
      const { error: dErr } = await adminClient
        .from('disputes')
        .update({
          status: 'resolved_vendor',
          resolution_note: `[Khôi phục đơn & Hẹn lại] ${note}`,
          resolved_by: uid,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', openDispute.id);
      if (dErr) throw dErr;

      const { error: bUpdErr } = await adminClient
        .from('bookings')
        .update({
          status: restoredStatus,
          appointment_at: newAppointmentAt,
          details,
        })
        .eq('id', booking.id);
      if (bUpdErr) throw bUpdErr;

      const timeStr = fmtDateTime(newAppointmentAt);
      await notifyUser(
        adminClient,
        booking.bride_id,
        'dispute_restored',
        '✅',
        `Đơn ${booking.code} đã được khôi phục & cập nhật lịch hẹn`,
        `Lịch hẹn mới với ${vendor?.name}: ${timeStr}. Tiền cọc của bạn vẫn được bảo lưu an toàn.`,
        `bookings.html?focus=${booking.code}`,
      );
      await notifyUser(
        adminClient,
        vendor?.owner_id,
        'dispute_restored',
        '✅',
        `Đã khôi phục đơn ${booking.code} & cập nhật lịch hẹn`,
        `Lịch hẹn mới với khách ${booking.contact_name || ''}: ${timeStr}. Đơn đã quay lại bảng tiến độ.`,
        `vendor-dashboard.html?focus=${booking.code}`,
      );

      return jsonResponse({ ok: true, status: restoredStatus, appointment_at: newAppointmentAt });
    }

    // 4. XỬ LÝ TỰ ĐỘNG THEO HẠN CHÓT SLA (48h với Khiếu nại không phản hồi / 72h với Nghiệm thu quên bấm)
    if (action === 'trigger_sla') {
      if (!isVendorOwner && !isBride && !isAdmin) {
        return jsonResponse({ error: 'Không có quyền thực hiện.' }, 403);
      }

      // Trường hợp A: Đơn đang có khiếu nại mở quá 48h mà bên kia không phản hồi
      if (openDispute) {
        const openedMs = new Date(openDispute.created_at).getTime();
        const elapsedHours = (Date.now() - openedMs) / 3_600_000;
        const hasCounterResponse = openDispute.kind === 'no_show'
          ? Boolean(details.dispute_response)
          : Boolean(details.vendor_dispute_reply);

        if (!isAdmin && elapsedHours < SLA_DISPUTE_HOURS) {
          return jsonResponse({
            error: `Chưa hết hạn phản hồi ${SLA_DISPUTE_HOURS} giờ (đã qua ${Math.floor(elapsedHours)} giờ). Vui lòng chờ thêm hoặc liên hệ Admin.`,
          }, 400);
        }
        if (!isAdmin && hasCounterResponse) {
          return jsonResponse({
            error: 'Bên kia đã gửi phản hồi / đề xuất lịch mới. Trạm Hỷ sẽ kiểm tra và phân xử công bằng.',
          }, 400);
        }

        if (openDispute.kind === 'no_show') {
          // Giải ngân tiền đang giữ cho tiệm đền bù, đóng đơn
          await adminClient
            .from('milestones')
            .update({ status: 'released', released_at: new Date().toISOString() })
            .eq('booking_id', booking.id)
            .eq('status', 'paid');
          await adminClient.from('bookings').update({ status: 'cancelled' }).eq('id', booking.id);
          await adminClient
            .from('disputes')
            .update({
              status: 'resolved_vendor',
              resolution_note: `Tự động giải ngân đền bù cho đối tác do quá hạn ${SLA_DISPUTE_HOURS} giờ khách hàng không phản hồi báo cáo no-show.`,
              resolved_by: uid,
              resolved_at: new Date().toISOString(),
            })
            .eq('id', openDispute.id);
          return jsonResponse({ ok: true, result: 'released_to_vendor' });
        } else {
          // Hoàn tiền cho cô dâu nếu đối tác im lặng quá 48h trước yêu cầu hoàn cọc
          await adminClient
            .from('milestones')
            .update({ status: 'refunded' })
            .eq('booking_id', booking.id)
            .eq('status', 'paid');
          await adminClient.from('bookings').update({ status: 'refunded' }).eq('id', booking.id);
          await adminClient
            .from('disputes')
            .update({
              status: 'resolved_refund',
              resolution_note: `Tự động hoàn cọc cho khách hàng do quá hạn ${SLA_DISPUTE_HOURS} giờ đối tác không phản hồi khiếu nại.`,
              resolved_by: uid,
              resolved_at: new Date().toISOString(),
            })
            .eq('id', openDispute.id);
          return jsonResponse({ ok: true, result: 'refunded_to_bride' });
        }
      }

      // Trường hợp B: Tiệm đã bấm "Báo đã xong" (ready_for_review) quá 72h mà khách bận đám cưới quên bấm Nghiệm thu
      if (booking.status === 'ready_for_review') {
        const updatedMs = new Date(booking.updated_at).getTime();
        const elapsedHours = (Date.now() - updatedMs) / 3_600_000;
        if (!isAdmin && elapsedHours < SLA_REVIEW_HOURS) {
          return jsonResponse({
            error: `Chưa đủ ${SLA_REVIEW_HOURS} giờ chờ nghiệm thu tự động (đã qua ${Math.floor(elapsedHours)} giờ).`,
          }, 400);
        }

        const paidMilestones = (booking.milestones || []).filter((m: any) => m.status === 'paid');
        if (!paidMilestones.length) {
          return jsonResponse({ error: 'Không có đợt tiền nào đang giữ trong Escrow để giải ngân.' }, 400);
        }

        await adminClient
          .from('milestones')
          .update({ status: 'released', released_at: new Date().toISOString() })
          .eq('booking_id', booking.id)
          .eq('status', 'paid');

        const { data: allMilestones } = await adminClient
          .from('milestones')
          .select('status')
          .eq('booking_id', booking.id);
        const allReleased = (allMilestones || []).every((m: any) => m.status === 'released');
        if (allReleased) {
          await adminClient.from('bookings').update({ status: 'completed' }).eq('id', booking.id);
        }

        const releasedSum = paidMilestones.reduce((s: number, m: any) => s + Number(m.amount || 0), 0);
        await notifyUser(
          adminClient,
          booking.bride_id,
          'sla_auto_release',
          '⏰',
          `Đơn ${booking.code} đã tự động nghiệm thu sau ${SLA_REVIEW_HOURS}h`,
          `Do quá ${SLA_REVIEW_HOURS}h kể từ khi ${vendor?.name} báo hoàn thành mà không có khiếu nại, hệ thống đã giải ngân ${fmtMoney(releasedSum)}.`,
          `bookings.html?focus=${booking.code}`,
        );

        return jsonResponse({ ok: true, result: 'auto_released_review' });
      }

      return jsonResponse({ error: 'Đơn hàng không ở trạng thái cần xử lý SLA tự động.' }, 400);
    }

    return jsonResponse({ error: 'Hành động không hợp lệ.' }, 400);
  } catch (err: any) {
    return jsonResponse({ error: err?.message || 'Lỗi xử lý khiếu nại SLA' }, 500);
  }
});
