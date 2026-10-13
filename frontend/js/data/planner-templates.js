// Mẫu kế hoạch cưới theo phong tục. share = % tổng ngân sách để điền sẵn "Dự kiến" (người dùng sửa thoải mái).
// vendor = loại tiệm trên Trạm Hỷ → đơn đặt qua Trạm Hỷ tự hiện trong danh mục đó + nút "Tìm đối tác".

const COMMON_BEFORE = [
  { name: 'Trang phục', vendor: 'bridal', items: [['Váy cưới', 4], ['Vest chú rể', 1.5], ['Áo dài lễ hỏi', 1.5], ['Giày & phụ kiện', 0.8]] },
  { name: 'Ảnh & phim cưới', vendor: 'studio', items: [['Ảnh cưới pre-wedding', 6], ['Phóng sự ngày cưới', 3], ['Quay phim highlight', 2]] },
  { name: 'Trang điểm & làm tóc', vendor: 'makeup', items: [['Trang điểm ngày lễ hỏi', 1], ['Trang điểm ngày cưới', 1.5], ['Trang điểm mẹ & phù dâu', 0.5]] },
];
const COMMON_AFTER = [
  { name: 'Nhẫn & trang sức', vendor: null, items: [['Nhẫn cưới', 5], ['Trang sức cô dâu', 3]] },
  { name: 'Thiệp & quà cảm ơn', vendor: null, items: [['In thiệp cưới', 1], ['Quà cảm ơn khách', 1]] },
  { name: 'Khác & dự phòng', vendor: null, items: [['Chi phí phát sinh (dự phòng)', 4], ['Tuần trăng mật', 0]] },
];

export const BUDGET_TEMPLATES = {
  bac: [
    { name: 'Lễ dạm ngõ (nhà trai)', vendor: null, items: [['Tráp dạm ngõ (trầu cau, chè, rượu…)', 0.5], ['Phong bì tiền cheo', 0.2]] },
    { name: 'Lễ ăn hỏi', vendor: null, items: [['Tráp ăn hỏi (5–9 tráp)', 4], ['Đội bê tráp & trang phục', 1.5],
      ['Phong bì lại quả', 1], ['Trang trí nhà gái ngày ăn hỏi', 1.5], ['Tiệc nhẹ ngày ăn hỏi', 2]] },
    ...COMMON_BEFORE,
    { name: 'Trang trí', vendor: 'decor', items: [['Trang trí lễ gia tiên', 2], ['Cổng hoa & sân khấu tiệc', 4], ['Hoa cưới cầm tay', 0.5]] },
    { name: 'Lễ cưới (rước dâu)', vendor: null, items: [['Xe hoa', 2], ['Lễ vật rước dâu', 0.5], ['Phong bì cảm ơn đội bê tráp, lái xe', 0.5]] },
    { name: 'Tiệc cưới', vendor: 'venue', items: [['Cỗ cưới (giá mâm × số bàn)', 38], ['Đồ uống', 4], ['Âm thanh, ánh sáng & MC', 2]] },
    ...COMMON_AFTER,
  ],
  nam: [
    { name: 'Lễ đám hỏi (đính hôn)', vendor: null, items: [['Mâm quả đám hỏi (5–7 mâm)', 4], ['Đội bưng quả & trang phục', 1.5],
      ['Trang trí nhà gái ngày đám hỏi', 1.5], ['Tiệc đám hỏi tại nhà', 3], ['Phong bì lại quả', 1]] },
    ...COMMON_BEFORE,
    { name: 'Trang trí', vendor: 'decor', items: [['Bàn thờ gia tiên & cổng hoa tại nhà', 2], ['Trang trí tiệc cưới', 4], ['Hoa cưới cầm tay', 0.5]] },
    { name: 'Lễ rước dâu', vendor: null, items: [['Xe hoa', 2], ['Mâm quả rước dâu', 1], ['Phong bì cảm ơn', 0.5]] },
    { name: 'Tiệc cưới', vendor: 'venue', items: [['Tiệc nhà hàng (giá bàn × số bàn)', 38], ['Đồ uống', 4], ['Âm thanh, ánh sáng & MC', 2]] },
    ...COMMON_AFTER,
  ],
};

// Việc cần làm: days = số ngày trước ngày cưới (âm = sau ngày cưới). title có thể khác theo phong tục.
export const CHECKLIST_TEMPLATE = [
  { days: 365, title: 'Xem ngày cưới đẹp và chốt ngày' },
  { days: 330, title: 'Thống nhất tổng ngân sách với hai gia đình' },
  { days: 300, title: 'Lên danh sách khách mời sơ bộ' },
  { days: 270, title: 'Đặt nhà hàng / sảnh tiệc cưới', vendor: 'venue' },
  { days: 240, title: 'Chọn studio chụp ảnh cưới', vendor: 'studio' },
  { days: 210, title: 'Chụp ảnh cưới pre-wedding', vendor: 'studio' },
  { days: 180, title: 'Thử và chọn váy cưới', vendor: 'bridal' },
  { days: 180, title: 'Đặt đơn vị trang trí', vendor: 'decor' },
  { days: 150, title: 'Đặt chuyên viên trang điểm', vendor: 'makeup' },
  { days: 120, title: 'Mua nhẫn cưới' },
  { days: 120, title: 'Đặt xe hoa' },
  { days: 90, title: 'Làm thiệp cưới (in hoặc thiệp online Trạm Hỷ)' },
  { days: 75, title: { bac: 'Chuẩn bị tráp ăn hỏi', nam: 'Chuẩn bị mâm quả đám hỏi' } },
  { days: 60, title: 'Gửi thiệp mời cho khách' },
  { days: 45, title: 'Đăng ký kết hôn' },
  { days: 30, title: 'Thử váy lần cuối, chỉnh vừa dáng', vendor: 'bridal' },
  { days: 30, title: 'Chốt số bàn tiệc với nhà hàng', vendor: 'venue' },
  { days: 21, title: { bac: 'Lễ ăn hỏi', nam: 'Lễ đám hỏi' } },
  { days: 14, title: 'Xác nhận lại lịch với tất cả đối tác' },
  { days: 7, title: 'Thử trang điểm & làm tóc', vendor: 'makeup' },
  { days: 7, title: 'Chuẩn bị phong bì cảm ơn, quà tặng khách' },
  { days: 2, title: 'Tổng duyệt chương trình buổi lễ' },
  { days: 0, title: 'Ngày cưới – tận hưởng ngày hạnh phúc!' },
  { days: -7, title: 'Nghiệm thu & đánh giá đối tác trên Trạm Hỷ' },
  { days: -14, title: 'Gửi lời cảm ơn khách mời' },
];

// Nhóm hiển thị checklist theo mốc thời gian (days ≥ from)
export const CHECKLIST_STAGES = [
  { from: 240, label: 'Trước 8–12 tháng' },
  { from: 150, label: 'Trước 5–8 tháng' },
  { from: 60, label: 'Trước 2–5 tháng' },
  { from: 14, label: 'Trước 2 tuần – 2 tháng' },
  { from: 1, label: 'Tuần cuối' },
  { from: 0, label: 'Ngày cưới' },
  { from: -Infinity, label: 'Sau ngày cưới' },
];

export const REGION_LABEL = { bac: 'Miền Bắc (dạm ngõ, ăn hỏi)', nam: 'Miền Nam (đám hỏi, rước dâu)' };
