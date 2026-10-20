# Hướng dẫn tích hợp VNPay QR Code Payment

## 📋 Tổng quan
Tính năng thanh toán VNPay QR Code đã được tích hợp vào hệ thống Helmet Store, cho phép khách hàng thanh toán đơn hàng qua QR code của VNPay.

## 🔧 Cấu hình

### 1. Cài đặt packages
```bash
npm install moment qs
```

### 2. Cấu hình database
Chạy file SQL migration để thêm cột `transactionNo`:
```bash
mysql -u root -p helmet_store < vnpay_migration.sql
```

Hoặc chạy trực tiếp trong MySQL:
```sql
ALTER TABLE orders 
ADD COLUMN transactionNo VARCHAR(50) NULL COMMENT 'Mã giao dịch VNPay' AFTER paymentStatus;

CREATE INDEX idx_transactionNo ON orders(transactionNo);
```

### 3. Cấu hình môi trường (.env)
File `.env` đã được cập nhật với thông tin VNPay:
```env
# VNPay Configuration
VNP_TMN_CODE=Z4QIKTHF
VNP_HASH_SECRET=KZ26GO9S651F00AUKT8KOKE12IYQZO6Y
VNP_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNP_RETURN_URL=http://localhost:3000/vnpay/return
```

## 📂 Cấu trúc file đã thêm/sửa

### Files mới:
1. **config/vnpay.config.js** - Cấu hình VNPay
2. **routes/vnpay.js** - Route xử lý thanh toán VNPay
3. **vnpay_migration.sql** - Script migration database

### Files đã sửa:
1. **.env** - Thêm config VNPay
2. **app.js** - Đăng ký route VNPay
3. **models/model_order.js** - Thêm hàm `getOrderById()` và cập nhật `updateOrderStatus()`
4. **views/site/thanh-toan.ejs** - Thêm nút thanh toán VNPay và logic xử lý
5. **views/site/thanh-cong.ejs** - Giao diện thông báo thanh toán thành công/thất bại

## 🚀 Cách sử dụng

### Quy trình thanh toán:

1. **Khách hàng chọn sản phẩm** → Thêm vào giỏ hàng
2. **Vào trang thanh toán** → Chọn sản phẩm cần thanh toán
3. **Chọn phương thức VNPay** → Click radio button "VNPay QR Code"
4. **Nhập thông tin giao hàng** → Họ tên, số điện thoại, địa chỉ
5. **Click "Thanh Toán VNPay QR"** → Hệ thống tạo đơn hàng và redirect
6. **Quét QR code** → Thanh toán qua app ngân hàng/ví điện tử
7. **Hoàn tất** → Redirect về trang thông báo kết quả

### Flow xử lý backend:

```
Client Request → /vnpay/create_payment_url
    ↓
Tạo đơn hàng trong DB (status: PENDING)
    ↓
Tạo URL thanh toán VNPay với secure hash
    ↓
Return payment URL → Client redirect
    ↓
Khách hàng thanh toán trên VNPay
    ↓
VNPay callback → /vnpay/return
    ↓
Verify secure hash
    ↓
Cập nhật order status:
  - Success: PAID + transactionNo
  - Failed: FAILED
    ↓
Xóa giỏ hàng (nếu thành công)
    ↓
Render trang kết quả
```

## 🔐 Bảo mật

### Secure Hash:
- Sử dụng HMAC SHA512 để tạo chữ ký
- Verify checksum ở callback để đảm bảo tính toàn vẹn
- Secret key được lưu trong `.env` (không commit lên git)

### Validation:
- Validate form trước khi gửi
- Validate amount, order data trước khi tạo payment
- Check signature ở callback trước khi cập nhật DB

## 📊 Database Schema

### Bảng orders:
```sql
CREATE TABLE `orders` (
  `idOrder` int(11) PRIMARY KEY AUTO_INCREMENT,
  `idUser` int(11) NOT NULL,
  `totalAmount` decimal(10,2) NOT NULL,
  `status` enum('pending','confirmed','preparing','shipping','delivered','cancelled','PAID','FAILED') DEFAULT 'pending',
  `shippingAddress` text NOT NULL,
  `paymentMethod` varchar(50) DEFAULT 'COD',
  `paymentStatus` enum('pending','paid','failed') DEFAULT 'pending',
  `transactionNo` varchar(50) NULL COMMENT 'Mã giao dịch VNPay',
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_transactionNo (transactionNo)
);
```

## 🧪 Testing

### Thông tin test VNPay Sandbox:

**Ngân hàng:** NCB
**Số thẻ:** 9704198526191432198
**Tên chủ thẻ:** NGUYEN VAN A
**Ngày phát hành:** 07/15
**Mật khẩu OTP:** 123456

### Test cases:

1. ✅ **Thanh toán thành công:**
   - Chọn sản phẩm → VNPay → Nhập thông tin test → OTP → Success
   - Kiểm tra: order status = PAID, transactionNo được lưu, giỏ hàng bị xóa

2. ❌ **Thanh toán thất bại:**
   - Chọn sản phẩm → VNPay → Cancel ở trang VNPay
   - Kiểm tra: order status = FAILED, hiển thị thông báo lỗi

3. 🔄 **Thanh toán lại:**
   - Sau khi failed → Click "Thử lại" → Thanh toán lại thành công
   - Kiểm tra: tạo order mới, không duplicate

## 📞 API Endpoints

### POST /vnpay/create_payment_url
Tạo URL thanh toán VNPay

**Request:**
```json
{
  "amount": 500000,
  "orderDescription": "Thanh toan don hang...",
  "bankCode": "",
  "language": "vn",
  "name": "Nguyen Van A",
  "phone": "0123456789",
  "address": "Ha Noi",
  "note": "",
  "cartItems": [
    {
      "idProduct": 1,
      "quantity": 2,
      "price": 250000,
      "size": "M"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "paymentUrl": "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?...",
  "orderId": 123
}
```

### GET /vnpay/return
Callback URL từ VNPay sau khi thanh toán

**Query params:**
- vnp_ResponseCode: Mã phản hồi (00 = success)
- vnp_TxnRef: Order ID
- vnp_Amount: Số tiền
- vnp_TransactionNo: Mã giao dịch VNPay
- vnp_SecureHash: Chữ ký bảo mật
- ... (các params khác từ VNPay)

## 🐛 Troubleshooting

### Lỗi thường gặp:

1. **"Chữ ký không hợp lệ"**
   - Kiểm tra VNP_HASH_SECRET trong .env
   - Đảm bảo sort params đúng thứ tự
   - Check encoding UTF-8

2. **"Order not found"**
   - Kiểm tra orderId có tồn tại trong DB
   - Check connection DB

3. **"Amount không hợp lệ"**
   - VNPay yêu cầu amount * 100 (VNĐ)
   - Đảm bảo amount > 0

4. **Callback không hoạt động**
   - Check VNP_RETURN_URL trong .env
   - Đảm bảo URL accessible từ internet (nếu production)
   - Kiểm tra route /vnpay/return đã được đăng ký

## 📝 Notes

- **Môi trường TEST:** Sử dụng sandbox.vnpayment.vn
- **Môi trường PRODUCTION:** Cần đăng ký merchant thật với VNPay
- **QR Code:** Để bankCode = '' để hiển thị QR, hoặc chỉ định mã ngân hàng cụ thể
- **Timeout:** VNPay timeout sau 15 phút nếu không thanh toán
- **IPN:** Webhook /vnpay/ipn để VNPay gọi về khi có thay đổi status

## 🎯 Roadmap

- [ ] Thêm refund (hoàn tiền)
- [ ] Lưu lịch sử giao dịch chi tiết
- [ ] Email notification sau thanh toán
- [ ] Dashboard thống kê thanh toán VNPay
- [ ] Hỗ trợ nhiều phương thức thanh toán khác

## 📚 Tài liệu tham khảo

- [VNPay Integration Guide](https://sandbox.vnpayment.vn/apis/docs/)
- [VNPay API Documentation v2.1.0](https://sandbox.vnpayment.vn/apis/)

---

**Phát triển bởi:** Helmet Store Team  
**Version:** 1.0.0  
**Last updated:** December 2025
