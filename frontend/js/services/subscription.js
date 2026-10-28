// Quản lý gói cước AI Studio (3 gói: Khởi Điểm, Nàng Thơ Rạng Rỡ, Cẩm Tú Trọn Đôi)
import { sb, unwrap } from '../core/supabase.js';

export const DEFAULT_PLANS = [
  {
    id: 'basic',
    name: 'Khởi Điểm',
    price: 0,
    duration_days: 3650,
    daily_credits: 6,
    bonus_credits: 0,
    max_saved_photos: 3,
    allow_own_garment: false,
    allow_max_quality: false,
    badge: null,
    description: 'Trải nghiệm thử váy cơ bản mỗi ngày',
    features: [
      '6 credit thử váy mỗi ngày',
      'Chất lượng chuẩn (Fast / 768p)',
      'Kho váy cưới có sẵn của tiệm',
      'Lưu tối đa 3 ảnh người mẫu',
      'Xếp hàng xử lý thông thường',
    ],
  },
  {
    id: 'pro_bride',
    name: 'Nàng Thơ Rạng Rỡ',
    price: 149000,
    duration_days: 30,
    daily_credits: 60,
    bonus_credits: 30,
    max_saved_photos: 15,
    allow_own_garment: true,
    allow_max_quality: true,
    badge: 'Được 89% Cô dâu chọn',
    description: 'Thỏa sức tìm chiếc váy mơ ước suốt mùa chuẩn bị cưới',
    features: [
      '60 credit mỗi ngày (gấp 10 lần)',
      'Tặng ngay +30 credit dùng tức thì',
      'Mở khóa Siêu Nét 1K Ultra HD (FASHN Max)',
      'Tự do tải váy riêng từ Pinterest / TikTok',
      'Lưu 15 ảnh cá nhân nhiều góc chụp',
      'Hàng đợi ưu tiên cao cấp (8-12s)',
      'Xóa sạch Watermark trên ảnh',
    ],
  },
  {
    id: 'studio_duo',
    name: 'Cẩm Tú Trọn Đôi',
    price: 299000,
    duration_days: 60,
    daily_credits: 150,
    bonus_credits: 100,
    max_saved_photos: 999,
    allow_own_garment: true,
    allow_max_quality: true,
    badge: 'VIP Studio & Duo',
    description: 'Trọn gói cao cấp cho cặp đôi & chuyên gia tư vấn',
    features: [
      '150 credit mỗi ngày (Fair Use cao nhất)',
      'Tặng ngay +100 credit dùng tức thì',
      'Mở khóa Thử Đôi (Váy & Vest cùng lúc)',
      'Trợ lý AI Stylist phân tích dáng & màu sắc',
      'Xuất file ảnh gốc in ấn phóng album',
      'Không giới hạn lưu trữ ảnh cá nhân',
      'Kênh hỗ trợ 1:1 qua Zalo VIP',
    ],
  },
];

/** Lấy danh sách 3 gói cước từ Supabase (có fallback mặc định khi chưa chạy SQL 35 hoặc DB chưa chạy SQL 36) */
export async function listSubscriptionPlans() {
  const { data, error } = await sb.from('subscription_plans').select('*').order('price', { ascending: true });
  if (error || !data?.length) return DEFAULT_PLANS;
  return data.map((p) => {
    const fallback = DEFAULT_PLANS.find((d) => d.id === p.id);
    return {
      ...p,
      price: fallback ? fallback.price : p.price,
      features: Array.isArray(p.features) ? p.features : JSON.parse(p.features || '[]'),
    };
  });
}

/** Lấy thông tin gói đang hoạt động của người dùng hiện tại */
export async function getMySubscription() {
  const { data: user } = await sb.auth.getUser();
  if (!user?.user) return null;

  // Thử gọi RPC
  const { data: rpcData, error: rpcError } = await sb.rpc('get_my_subscription');
  if (!rpcError && rpcData) return rpcData;

  // Fallback: truy vấn bảng user_subscriptions
  const { data: sub } = await sb.from('user_subscriptions')
    .select('plan_id, bonus_balance, expires_at, status')
    .eq('user_id', user.user.id)
    .eq('status', 'active')
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order('created_at', { ascending: false })
    .maybeSingle();

  if (sub) {
    const plans = await listSubscriptionPlans();
    const plan = plans.find((p) => p.id === sub.plan_id) || DEFAULT_PLANS[1];
    return {
      has_subscription: true,
      plan_id: plan.id,
      plan_name: plan.name,
      daily_credits: plan.daily_credits,
      bonus_balance: sub.bonus_balance || 0,
      allow_own_garment: plan.allow_own_garment,
      allow_max_quality: plan.allow_max_quality,
      badge: plan.badge,
      expires_at: sub.expires_at,
    };
  }

  return {
    has_subscription: false,
    plan_id: 'basic',
    plan_name: 'Khởi Điểm',
    daily_credits: 6,
    bonus_balance: 0,
    allow_own_garment: false,
    allow_max_quality: false,
    badge: null,
    expires_at: null,
  };
}

/** Tạo thông tin đơn hàng nâng cấp gói (tạo mã VietQR, không ghi log vào DB khi khách chưa chuyển khoản) */
export async function createSubscriptionOrder(planId) {
  const { data: user } = await sb.auth.getUser();
  if (!user?.user) throw new Error('Vui lòng đăng nhập để nâng cấp gói cước');

  const plans = await listSubscriptionPlans();
  const plan = plans.find((p) => p.id === planId);
  if (!plan) throw new Error('Gói cước không hợp lệ');

  const priceK = Math.round((plan.price || 149000) / 1000);
  const randomSuffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  const code = `Trạm Hỷ-Gói AI ${priceK}k ${randomSuffix}`;

  // Không ghi log vào DB lúc này để tránh phát sinh đơn "Chờ thanh toán" khi khách chỉ mới xem mã QR
  return {
    code,
    amount: plan.price,
    plan_id: plan.id,
    plan,
    user_id: user.user.id,
  };
}

/** Kích hoạt gói sau khi khách bấm "Tôi đã chuyển khoản thành công" (lúc này mới ghi log vào DB) */
export async function activateSubscription(orderOrCode) {
  const { data: user } = await sb.auth.getUser();
  if (!user?.user) throw new Error('Chưa đăng nhập');

  const orderCode = typeof orderOrCode === 'string' ? orderOrCode : orderOrCode?.code;
  const orderObj = typeof orderOrCode === 'object' ? orderOrCode : null;

  const plans = await listSubscriptionPlans();
  const plan = orderObj?.plan || (orderCode.includes('299k')
    ? (plans.find((p) => p.id === 'studio_duo') || DEFAULT_PLANS[2])
    : (plans.find((p) => p.id === 'pro_bride') || DEFAULT_PLANS[1]));

  // 1. Ghi log đơn hàng vào subscription_orders khi người dùng xác nhận đã chuyển khoản
  const { data: existing } = await sb.from('subscription_orders')
    .select('id, status')
    .eq('code', orderCode)
    .maybeSingle();

  if (!existing) {
    await sb.from('subscription_orders').insert({
      user_id: user.user.id,
      plan_id: plan.id,
      code: orderCode,
      amount: orderObj?.amount || plan.price,
      status: 'pending',
    });
  }

  // 2. Kích hoạt gói qua RPC activate_my_subscription (chuyển sang 'paid' và cộng credit)
  const { data: rpcData, error: rpcError } = await sb.rpc('activate_my_subscription', { p_order_code: orderCode });
  if (!rpcError && rpcData) return rpcData;

  // Fallback nếu remote DB chưa chạy RPC
  await sb.from('subscription_orders')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('code', orderCode);

  return {
    ok: true,
    plan_id: plan.id,
    plan_name: plan.name,
    daily_credits: plan.daily_credits,
    bonus_credits: plan.bonus_credits,
    expires_at: new Date(Date.now() + (plan.duration_days || 30) * 86400e3).toISOString(),
  };
}
