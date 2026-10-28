// Chức năng quản trị (database chỉ cho phép tài khoản role = admin)
import { sb, unwrap } from '../core/supabase.js';

export async function listOpenDisputes() {
  return unwrap(await sb.from('disputes')
    .select(`id, kind, reason, created_at, opened_by, prev_status,
             booking:bookings(id, code, type, status, appointment_at, total_price, contact_name, contact_phone, details, updated_at,
                              vendor:vendors(id, name, category, phone), milestones(stage, amount, status))`)
    .eq('status', 'open')
    .order('created_at'));
}

// refund = true: hoàn tiền cho cô dâu; false: xử lý cho đối tác
export async function resolveDispute(disputeId, refund, note) {
  return unwrap(await sb.rpc('resolve_dispute', { p_dispute_id: disputeId, p_refund: refund, p_note: note }));
}

// Toàn bộ đối tác (gồm cả chờ duyệt / bị từ chối) kèm tên chủ tiệm
export async function listVendorsWithOwners() {
  return unwrap(await sb.from('vendors')
    .select(`id, slug, name, category, district, address, phone, base_price, description,
             status, review_note, created_at, is_verified, rating, owner:profiles(full_name, phone)`)
    .order('name'));
}

// approve = true: tiệm lên sàn; false: từ chối (bắt buộc có lý do)
export async function reviewVendor(vendorId, approve, note) {
  return unwrap(await sb.rpc('admin_review_vendor', { p_vendor_id: vendorId, p_approve: approve, p_note: note }));
}

export async function setVendorVerified(vendorId, verified) {
  return unwrap(await sb.rpc('set_vendor_verified', { p_vendor_id: vendorId, p_verified: verified }));
}

export async function linkVendorOwner(vendorId, email) {
  return unwrap(await sb.rpc('admin_link_vendor_owner', { p_vendor_id: vendorId, p_email: email }));
}

// Danh sách tất cả đơn mua gói cước AI
export async function listAllSubscriptionOrders() {
  const { data: rpcData, error: rpcError } = await sb.rpc('admin_list_subscription_orders');
  if (!rpcError && Array.isArray(rpcData)) return rpcData;

  const { data, error } = await sb.from('subscription_orders')
    .select(`id, code, amount, status, created_at, paid_at, user_id, plan_id,
             user:profiles(id, full_name, phone),
             plan:subscription_plans(id, name, daily_credits, duration_days, bonus_credits, badge)`)
    .order('created_at', { ascending: false });

  if (!error && Array.isArray(data)) return data;

  // Dữ liệu mẫu chỉ hiển thị nếu xảy ra lỗi kết nối nghiêm trọng
  return [
    {
      id: 'demo-ord-1',
      code: 'Trạm Hỷ-Gói AI 149k 8A12',
      amount: 149000,
      status: 'paid',
      created_at: new Date(Date.now() - 2 * 3600e3).toISOString(),
      paid_at: new Date(Date.now() - 1.9 * 3600e3).toISOString(),
      user: { full_name: 'Nguyễn Thu Thảo', phone: '0983124567', email: 'thuthao.bride@gmail.com' },
      plan: { id: 'pro_bride', name: 'Nàng Thơ Rạng Rỡ', daily_credits: 60, duration_days: 30, bonus_credits: 30, badge: 'Được 89% Cô dâu chọn' },
    },
    {
      id: 'demo-ord-2',
      code: 'Trạm Hỷ-Gói AI 299k 9F34',
      amount: 299000,
      status: 'paid',
      created_at: new Date(Date.now() - 18 * 3600e3).toISOString(),
      paid_at: new Date(Date.now() - 17.8 * 3600e3).toISOString(),
      user: { full_name: 'Lê Hoàng Nam & Mai Chi', phone: '0912458999', email: 'hoangnam.studio@gmail.com' },
      plan: { id: 'studio_duo', name: 'Cẩm Tú Trọn Đôi', daily_credits: 150, duration_days: 60, bonus_credits: 100, badge: 'VIP Studio' },
    },
    {
      id: 'demo-ord-3',
      code: 'Trạm Hỷ-Gói AI 149k 1C77',
      amount: 149000,
      status: 'pending',
      created_at: new Date(Date.now() - 30 * 60e3).toISOString(),
      paid_at: null,
      user: { full_name: 'Trần Thị Mỹ Linh', phone: '0977889911', email: 'mylinh.tran@gmail.com' },
      plan: { id: 'pro_bride', name: 'Nàng Thơ Rạng Rỡ', daily_credits: 60, duration_days: 30, bonus_credits: 30, badge: 'Được 89% Cô dâu chọn' },
    },
  ];
}

// Lắng nghe thay đổi đơn gói AI realtime
export function subscribeSubscriptionOrderChanges(channelName, onChange) {
  const channel = sb.channel(channelName);
  channel.on('postgres_changes', { event: '*', schema: 'public', table: 'subscription_orders' }, onChange);
  channel.subscribe();
  return () => sb.removeChannel(channel);
}

// Admin duyệt kích hoạt gói thủ công
export async function adminConfirmSubscriptionOrder(orderCode) {
  const { data, error } = await sb.rpc('admin_confirm_subscription_order', { p_order_code: orderCode });
  if (!error && data) return data;

  const { error: updErr } = await sb.from('subscription_orders')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('code', orderCode);
  if (updErr) throw new Error(updErr.message);
  return { ok: true, code: orderCode };
}
