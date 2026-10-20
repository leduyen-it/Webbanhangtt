// VNPay Configuration
// Đảm bảo load .env từ thư mục root
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

module.exports = {
  vnp_TmnCode: process.env.VNP_TMN_CODE,
  vnp_HashSecret: process.env.VNP_HASH_SECRET,
  vnp_Url: process.env.VNP_URL,
  vnp_ReturnUrl: process.env.VNP_RETURN_URL,
  vnp_Version: '2.1.1', // Cập nhật lên version mới nhất
  vnp_Command: 'pay',
  vnp_CurrCode: 'VND',
  vnp_Locale: 'vn',
  vnp_OrderType: 'other',
  vnp_BankCode: '', // Để trống để hiển thị QR code
};
