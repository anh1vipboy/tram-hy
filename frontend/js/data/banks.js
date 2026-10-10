// Ngân hàng phổ biến (mã theo VietQR) – dùng cho QR mừng cưới và tài khoản nhận tiền của đối tác
export const BANKS = [
  ['MB', 'MB Bank'], ['VCB', 'Vietcombank'], ['TCB', 'Techcombank'], ['ACB', 'ACB'], ['BIDV', 'BIDV'],
  ['VPB', 'VPBank'], ['ICB', 'VietinBank'], ['VBA', 'Agribank'], ['TPB', 'TPBank'], ['STB', 'Sacombank'],
];
export const bankName = (code) => BANKS.find(([c]) => c === code)?.[1] ?? code;
