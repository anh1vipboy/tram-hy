// Edge Function "sepay-webhook": Đón Webhook biến động số dư ngân hàng từ SePay.vn / Casso
// Khi khách chuyển khoản VietQR đúng số tiền và nội dung, function sẽ tự động:
// 1. Phân loại giao dịch: Đặt lịch & Escrow (BK...) hoặc Gói cước AI Studio (THAI...)
// 2. Với Booking Escrow: Xác nhận thanh toán chặng (milestone), kích hoạt Escrow bảo chứng, chuyển trạng thái đơn sang 'confirmed'
// 3. Với Gói cước AI: Kích hoạt gói cước trong user_subscriptions và cập nhật subscription_orders thành 'paid'
// 4. Bắn tín hiệu Supabase Realtime để trình duyệt tự động nổ pháo hoa và cập nhật trạng thái tức thì!

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SEPAY_API_KEY = Deno.env.get("SEPAY_API_KEY") || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req: Request) => {
  // Chỉ nhận phương thức POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // 1. Kiểm tra xác thực Token từ SePay (nếu có cấu hình SEPAY_API_KEY)
    const authHeader = req.headers.get("Authorization") || "";
    if (SEPAY_API_KEY && authHeader !== `Apikey ${SEPAY_API_KEY}` && !authHeader.includes(SEPAY_API_KEY)) {
      console.warn("Unauthorized webhook request:", authHeader);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    console.log("Received SePay Webhook Payload:", JSON.stringify(body));

    // Cấu trúc chuẩn của SePay:
    // {
    //   "id": 12345,
    //   "gateway": "TPBank",
    //   "transactionDate": "2026-11-03 14:40:00",
    //   "accountNumber": "0355521617",
    //   "content": "BK261103-540EC D1",
    //   "transferType": "in",
    //   "transferAmount": 750000,
    //   "referenceCode": "FT26..."
    // }

    const { content, transferAmount, transferType, id: transactionId, referenceCode } = body;

    // Chỉ xử lý giao dịch nhận tiền vào
    if (transferType && transferType !== "in") {
      return new Response(JSON.stringify({ message: "Bỏ qua giao dịch tiền ra" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!content || !transferAmount) {
      return new Response(JSON.stringify({ message: "Thiếu thông tin nội dung hoặc số tiền" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const rawContent = String(content || "");
    const upperContent = rawContent.toUpperCase();
    const normalizedContent = upperContent.replace(/[^A-Z0-9]/g, "");

    // =========================================================================
    // NHÁNH 1: THANH TOÁN TIỀN CỌC / CHẶNG DỊCH VỤ CƯỚI (BOOKING ESCROW)
    // Cú pháp nội dung chuẩn: BK261103-540EC D1 (hoặc BK261103540ECD1)
    // =========================================================================
    const bkDirectMatch = upperContent.match(/BK(\d{6})[-_\s]?([A-Z0-9]{5})/);
    const bkNormMatch = normalizedContent.match(/BK(\d{6})([A-Z0-9]{5})/);
    const bkMatch = bkDirectMatch || bkNormMatch;

    if (bkMatch) {
      const targetBookingCode = `BK${bkMatch[1]}-${bkMatch[2]}`;
      console.log(`Nhận diện mã booking: ${targetBookingCode} từ nội dung: "${rawContent}"`);

      const { data: booking, error: bErr } = await supabase
        .from("bookings")
        .select("id, code, status, total_price, bride_id, vendor_id, milestones(id, stage, amount, status)")
        .ilike("code", targetBookingCode)
        .maybeSingle();

      if (bErr) {
        console.error("Lỗi truy vấn booking:", bErr);
        throw bErr;
      }

      if (booking) {
        // Xác định đợt thanh toán (Stage 1, 2, 3)
        let targetStage: number | null = null;

        // Ưu tiên tìm ký hiệu đợt: D1, D2, D3 hoặc DOT1, DOT 1, STAGE 1
        const stageMatch = upperContent.match(/\bD([1-3])\b|D([1-3])|DOT\s*([1-3])|STAGE\s*([1-3])/i);
        if (stageMatch) {
          targetStage = parseInt(stageMatch[1] || stageMatch[2] || stageMatch[3] || stageMatch[4], 10);
        }

        const milestones = (booking.milestones || []).sort((a: any, b: any) => a.stage - b.stage);

        // Nếu nội dung không ghi rõ đợt, suy luận theo đợt đang chờ thanh toán gần nhất
        if (!targetStage) {
          const lockedMilestones = milestones.filter((m: any) => m.status === "locked");
          const amountMatched = lockedMilestones.find((m: any) => Math.abs(Number(transferAmount) - m.amount) < 1000);
          targetStage = amountMatched ? amountMatched.stage : (lockedMilestones[0]?.stage || 1);
        }

        const targetMilestone = milestones.find((m: any) => m.stage === targetStage);

        if (!targetMilestone) {
          console.warn(`Không tìm thấy đợt ${targetStage} cho đơn ${booking.code}`);
          return new Response(JSON.stringify({
            message: `Không tìm thấy đợt ${targetStage} của booking`,
            booking_code: booking.code,
          }), { status: 200, headers: { "Content-Type": "application/json" } });
        }

        // Nếu đợt này đã thanh toán rồi
        if (targetMilestone.status === "paid") {
          console.log(`Đợt ${targetStage} của đơn ${booking.code} đã được thanh toán trước đó.`);
          return new Response(JSON.stringify({
            message: "Đợt này đã được thanh toán trước đó",
            booking_code: booking.code,
            stage: targetStage,
          }), { status: 200, headers: { "Content-Type": "application/json" } });
        }

        // Kiểm tra số tiền chuyển
        if (Number(transferAmount) < targetMilestone.amount) {
          console.warn(`Khách chuyển thiếu tiền cho booking ${booking.code} đợt ${targetStage}: nhận ${transferAmount}, cần ${targetMilestone.amount}`);
          return new Response(JSON.stringify({
            message: "Số tiền chuyển chưa đủ cho đợt thanh toán",
            received: transferAmount,
            expected: targetMilestone.amount,
            booking_code: booking.code,
            stage: targetStage,
          }), { status: 200, headers: { "Content-Type": "application/json" } });
        }

        // Gọi hàm hệ thống để kích hoạt milestone sang 'paid' và chuyển booking sang 'confirmed'
        const transRef = String(transactionId || referenceCode || Date.now());
        const { error: payErr } = await supabase.rpc("system_pay_milestone", {
          p_booking_id: booking.id,
          p_stage: targetStage,
          p_transaction_id: transRef,
        });

        if (payErr) {
          console.error("Lỗi gọi system_pay_milestone:", payErr);
          throw payErr;
        }

        console.log(`Thanh toán thành công đợt ${targetStage} cho booking ${booking.code} (${targetMilestone.amount}đ). Giao dịch: ${transRef}`);

        return new Response(JSON.stringify({
          success: true,
          type: "booking_milestone",
          booking_code: booking.code,
          stage: targetStage,
          amount: targetMilestone.amount,
          transaction_id: transRef,
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // =========================================================================
    // NHÁNH 2: THANH TOÁN GÓI CƯỚC AI STUDIO (SUBSCRIPTION ORDERS)
    // Cú pháp nội dung chuẩn: THAI 149K XXXX
    // =========================================================================
    const { data: pendingOrders, error: orderErr } = await supabase
      .from("subscription_orders")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(100);

    if (orderErr) throw orderErr;

    const matchedOrder = pendingOrders?.find((order) => {
      const normalizedCode = String(order.code).toUpperCase().replace(/[^A-Z0-9]/g, "");
      const suffix = normalizedCode.slice(-4);
      return normalizedContent.includes(normalizedCode) || (suffix.length === 4 && normalizedContent.includes(suffix));
    });

    if (matchedOrder) {
      // Kiểm tra số tiền chuyển
      if (Number(transferAmount) < matchedOrder.amount) {
        await supabase.from("subscription_orders").update({
          notes: `Khách chuyển thiếu tiền: Đã nhận ${transferAmount}/${matchedOrder.amount} (GD: ${transactionId})`,
        }).eq("id", matchedOrder.id);

        return new Response(JSON.stringify({
          message: "Số tiền chuyển chưa đủ",
          received: transferAmount,
          expected: matchedOrder.amount,
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Cập nhật đơn thành 'paid'
      const { error: updateErr } = await supabase.from("subscription_orders").update({
        status: "paid",
        paid_at: new Date().toISOString(),
        notes: `Tự động kích hoạt qua SePay webhook (GD: ${transactionId})`,
      }).eq("id", matchedOrder.id);

      if (updateErr) {
        console.error("Lỗi cập nhật subscription_orders:", updateErr);
      }

      // Kích hoạt gói cước trong user_subscriptions
      const durationDays = matchedOrder.plan_id === "studio_duo" ? 60 : 30;
      const bonusCredits = matchedOrder.plan_id === "studio_duo" ? 100 : 30;

      await supabase.from("user_subscriptions").update({ status: "cancelled" })
        .eq("user_id", matchedOrder.user_id)
        .eq("status", "active");

      await supabase.from("user_subscriptions").insert({
        user_id: matchedOrder.user_id,
        plan_id: matchedOrder.plan_id,
        bonus_balance: bonusCredits,
        starts_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + durationDays * 86400000).toISOString(),
        status: "active",
      });

      console.log(`Đã kích hoạt thành công đơn hàng ${matchedOrder.code} cho gói ${matchedOrder.plan_id}`);

      return new Response(JSON.stringify({
        success: true,
        type: "subscription_order",
        message: "Kích hoạt gói cước thành công",
        order_code: matchedOrder.code,
        transaction_id: transactionId,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Không tìm thấy booking hay đơn cước AI
    console.log("Không tìm thấy đơn hàng pending hoặc booking phù hợp với nội dung:", content);
    return new Response(JSON.stringify({
      message: "Không tìm thấy đơn hàng hoặc booking phù hợp",
      content,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Lỗi xử lý webhook:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
