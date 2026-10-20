// Test VNPay Configuration
require('dotenv').config();

console.log('=== Testing .env loading ===');
console.log('VNP_TMN_CODE:', process.env.VNP_TMN_CODE);
console.log('VNP_HASH_SECRET:', process.env.VNP_HASH_SECRET ? 'Loaded (length: ' + process.env.VNP_HASH_SECRET.length + ')' : 'NOT LOADED');
console.log('VNP_URL:', process.env.VNP_URL);
console.log('VNP_RETURN_URL:', process.env.VNP_RETURN_URL);

console.log('\n=== Testing vnpay.config.js ===');
const vnpayConfig = require('./config/vnpay.config');
console.log('Config object:', vnpayConfig);

if (!vnpayConfig.vnp_TmnCode || !vnpayConfig.vnp_HashSecret) {
  console.error('\n❌ ERROR: Config not loaded properly!');
  process.exit(1);
} else {
  console.log('\n✅ SUCCESS: Config loaded correctly!');
}
