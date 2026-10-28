-- ==============================================================================
-- Trạm Hỷ Migration 36: Cập nhật giá gói cước AI Studio
-- Gói Nàng Thơ Rạng Rỡ: 149.000đ (thay vì 99.000đ)
-- Gói Cẩm Tú Trọn Đôi: 299.000đ (thay vì 249.000đ)
-- ==============================================================================

update public.subscription_plans
set price = 149000
where id = 'pro_bride';

update public.subscription_plans
set price = 299000
where id = 'studio_duo';

-- Xác nhận kết quả sau khi update
select id, name, price, duration_days, daily_credits, bonus_credits
from public.subscription_plans
order by price asc;
