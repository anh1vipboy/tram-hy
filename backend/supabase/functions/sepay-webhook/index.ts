// Edge Function "sepay-webhook": Đón Webhook biến động số dư ngân hàng từ SePay.vn / Casso
// Khi khách chuyển khoản VietQR đúng số tiền và nội dung, function sẽ tự động:
// 1. Khớp mã đơn hàng (THAI 149K XXXX) với bảng subscription_orders
// 2. Kích hoạt gói cước AI tương ứng cho người dùng qua RPC admin_confirm_subscription_order
// 3. Cập nhật trạng thái đơn thành 'paid', kích hoạt Supabase Realtime bắn pháo hoa ở trình duyệt!

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
    //   "transactionDate": "2026-10-29 23:40:00",
    //   "accountNumber": "0355521617",
    //   "content": "THAI 149K 8A12",
    //   "transferType": "in",
    //   "transferAmount": 149000,
    //   "referenceCode": "FT26..."
    // }

    const { content, transferAmount, transferType, id: transactionId } = body;

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

    // 2. Tìm đơn hàng chờ thanh toán ('pending')
    const { data: pendingOrders, error: orderErr } = await supabase
      .from("subscription_orders")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(100);

    if (orderErr) throw orderErr;

    // Chuẩn hóa nội dung chuyển khoản để so khớp linh hoạt không phân biệt dấu/khoảng trắng
    const normalizedContent = String(content).toUpperCase().replace(/[^A-Z0-9]/g, "");

    const matchedOrder = pendingOrders?.find((order) => {
      const normalizedCode = String(order.code).toUpperCase().replace(/[^A-Z0-9]/g, "");
      // Khớp toàn bộ mã hoặc khớp phần đuôi 4 ký tự ngẫu nhiên
      const suffix = normalizedCode.slice(-4);
      return normalizedContent.includes(normalizedCode) || (suffix.length === 4 && normalizedContent.includes(suffix));
    });

    if (!matchedOrder) {
      console.log("Không tìm thấy đơn hàng pending phù hợp với nội dung:", content);
      return new Response(JSON.stringify({ message: "Không tìm thấy đơn hàng phù hợp", content }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 3. Kiểm tra số tiền chuyển
    if (Number(transferAmount) < matchedOrder.amount) {
      await supabase.from("subscription_orders").update({
        notes: `Khách chuyển thiếu tiền: Đã nhận ${transferAmount}/${matchedOrder.amount} (GD: ${transactionId})`,
      }).eq("id", matchedOrder.id);

      return new Response(JSON.stringify({ message: "Số tiền chuyển chưa đủ", received: transferAmount, expected: matchedOrder.amount }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 4. Kích hoạt gói cước: Cập nhật đơn thành 'paid' và cấp quyền trong user_subscriptions
    const { error: updateErr } = await supabase.from("subscription_orders").update({
      status: "paid",
      paid_at: new Date().toISOString(),
      notes: `Tự động kích hoạt qua SePay webhook (GD: ${transactionId})`,
    }).eq("id", matchedOrder.id);

    if (updateErr) {
      console.error("Lỗi cập nhật subscription_orders:", updateErr);
    }

    // Đảm bảo bảng user_subscriptions luôn có bản ghi active
    const durationDays = matchedOrder.plan_id === 'studio_duo' ? 60 : 30;
    const bonusCredits = matchedOrder.plan_id === 'studio_duo' ? 100 : 30;

    await supabase.from("user_subscriptions").update({ status: 'cancelled' })
      .eq("user_id", matchedOrder.user_id)
      .eq("status", "active");

    await supabase.from("user_subscriptions").insert({
      user_id: matchedOrder.user_id,
      plan_id: matchedOrder.plan_id,
      bonus_balance: bonusCredits,
      starts_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + durationDays * 86400000).toISOString(),
      status: 'active',
    });

    console.log(`Đã kích hoạt thành công đơn hàng ${matchedOrder.code} cho gói ${matchedOrder.plan_id}`);

    return new Response(JSON.stringify({
      success: true,
      message: "Kích hoạt gói cước thành công",
      order_code: matchedOrder.code,
      transaction_id: transactionId,
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
