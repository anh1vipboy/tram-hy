// Chức năng quản trị (database chỉ cho phép tài khoản role = admin)
import { sb, unwrap } from '../core/supabase.js';

export async function listOpenDisputes() {
  return unwrap(await sb.from('disputes')
    .select(`id, kind, reason, created_at, opened_by,
             booking:bookings(id, code, type, total_price, contact_name, contact_phone,
                              vendor:vendors(name), milestones(stage, amount, status))`)
    .eq('status', 'open')
    .order('created_at'));
}

// refund = true: hoàn tiền cho cô dâu; false: xử lý cho đối tác
export async function resolveDispute(disputeId, refund, note) {
  return unwrap(await sb.rpc('resolve_dispute', { p_dispute_id: disputeId, p_refund: refund, p_note: note }));
}

export async function listVendorsWithOwners() {
  return unwrap(await sb.from('vendors')
    .select('id, slug, name, category, district, is_verified, rating, owner:profiles(full_name)')
    .order('name'));
}

export async function setVendorVerified(vendorId, verified) {
  return unwrap(await sb.rpc('set_vendor_verified', { p_vendor_id: vendorId, p_verified: verified }));
}

export async function linkVendorOwner(vendorId, email) {
  return unwrap(await sb.rpc('admin_link_vendor_owner', { p_vendor_id: vendorId, p_email: email }));
}
