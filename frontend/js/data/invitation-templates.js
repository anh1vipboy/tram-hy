// Mẫu thiệp cưới của Trạm Hỷ – bố cục thiệp vuông 3 trang (bìa · gia đình & hôn lễ · tiệc cưới).
// Họa tiết vẽ bằng SVG trong components/invitation-card.js, font viết tay từ Google Fonts (có tiếng Việt).
// Thêm mẫu mới: thêm 1 dòng ở đây (key chỉ gồm a-z, 0-9, dấu gạch).
export const INVITATION_TEMPLATES = [
  {
    key: 'la-tim', name: 'Lá tím màu nước', tag: 'Lãng mạn', ornament: 'leaves',
    colors: { bg: '#ffffff', ink: '#86566e', accent: '#b07b93', soft: '#ead6df', backdrop: '#5b5068' },
    script: 'Great Vibes',
  },
  {
    key: 'bach-dan', name: 'Bạch đàn xanh', tag: 'Thiên nhiên', ornament: 'eucalyptus',
    colors: { bg: '#fbfcf8', ink: '#4c6655', accent: '#7f9c86', soft: '#dce7de', backdrop: '#3e4d44' },
    script: 'Ephesis',
  },
  {
    key: 'do-hy', name: 'Đỏ hỷ truyền thống', tag: 'Truyền thống', ornament: 'song-hy',
    colors: { bg: '#8c1c1c', ink: '#f6e2ae', accent: '#e2bb63', soft: '#a83434', backdrop: '#3a0e0e' },
    script: 'Dancing Script',
  },
  {
    key: 'champagne', name: 'Champagne ánh vàng', tag: 'Sang trọng', ornament: 'deco',
    colors: { bg: '#fffaf0', ink: '#6a5227', accent: '#c4a466', soft: '#efe1c2', backdrop: '#4a3f2b' },
    script: 'Imperial Script',
  },
  {
    key: 'hong-phan', name: 'Hồng phấn', tag: 'Ngọt ngào', ornament: 'blossom',
    colors: { bg: '#fff7f8', ink: '#9d4f5d', accent: '#e399a6', soft: '#f8dde2', backdrop: '#6a4850' },
    script: 'Dancing Script',
  },
  {
    key: 'navy', name: 'Navy ánh kim', tag: 'Hiện đại', ornament: 'stars',
    colors: { bg: '#1c2942', ink: '#f2e5c2', accent: '#d5b36b', soft: '#2b3b5c', backdrop: '#0e1525' },
    script: 'Great Vibes',
  },
];

export const templateOf = (key) => INVITATION_TEMPLATES.find((t) => t.key === key) ?? INVITATION_TEMPLATES[0];

// Thiệp tạo trước khi có mẫu (SQL 22) chỉ có màu
export const TEMPLATE_FROM_THEME = { gold: 'champagne', red: 'do-hy', green: 'bach-dan', pink: 'hong-phan' };

// Một tải font cho mọi mẫu (chỉ trang thiệp dùng)
export const INVITATION_FONTS_URL = 'https://fonts.googleapis.com/css2?family=Great+Vibes&family=Ephesis&family=Dancing+Script:wght@500;700'
  + '&family=Imperial+Script&family=Cormorant+Garamond:wght@500;600;700&display=swap';

// Dữ liệu mẫu (nhân vật hư cấu) để xem trước trong thư viện mẫu
export const SAMPLE_INVITATION = {
  groom_name: 'Nguyễn Minh Khang',
  bride_name: 'Trần Thu Hà',
  event_at: '2026-12-12T17:30:00+07:00',
  venue: 'Trung tâm tiệc cưới Hoa Sen',
  details: {
    groom_father: 'Nguyễn Văn Bình', groom_mother: 'Lê Thị Mai', groom_address: 'Số 12 ngõ Hoa Sữa, Cầu Giấy, Hà Nội',
    bride_father: 'Trần Quốc Toàn', bride_mother: 'Phạm Thị Lan', bride_address: 'Số 8 đường Bạch Đằng, Hải Châu, Đà Nẵng',
    host: 'trai', ceremony_at: '2026-12-12T09:00:00+07:00',
    venue_address: 'Số 88 đường Hoàng Quốc Việt, Cầu Giấy, Hà Nội',
  },
};
