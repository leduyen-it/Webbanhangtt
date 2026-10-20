# VNPay Thanh Toán - Hướng Dẫn Thiết Lập

## ✅ Những gì đã được tích hợp:

### 1. **Backend - Routes VNPay** (`routes/vnpay.js`)
- ✅ Route `/vnpay/create_payment_url` - Tạo URL thanh toán
- ✅ Route `/vnpay/return` - Callback sau khi thanh toán
- ✅ Route `/vnpay/ipn` - Webhook từ VNPay

### 2. **Frontend - Form Thanh Toán** (`views/site/thanh-toan.ejs`)
- ✅ Phương thức thanh toán VNPay QR
- ✅ Phương thức thanh toán COD (Cash on Delivery)
- ✅ Tính tổng tiền tự động
- ✅ Validate form trước khi thanh toán

### 3. **Database - Schema**
- ✅ Column `transactionNo` - Lưu mã giao dịch VNPay
- ✅ Column `paymentStatus` - Trạng thái thanh toán (paid/unpaid)
- ✅ Column `paymentMethod` - Phương thức thanh toán

### 4. **Model - Order Management** (`models/model_order.js`)
- ✅ Function `createOrder` - Tạo đơn hàng mới
- ✅ Function `updateOrderStatus` - Cập nhật trạng thái đơn hàng + transactionNo

### 5. **Config - VNPay Configuration** (`.env`)
```
VNP_TMN_CODE=Z4QIKTHF
VNP_HASH_SECRET=KZ26GO9S651F00AUKT8KOKE12IYQZO6Y
VNP_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNP_RETURN_URL=http://localhost:3000/vnpay/return
```

---

## 🔧 Các Bước Để Thanh Toán Thành Công:

### **Bước 1: Chuẩn Bị Dữ Liệu**
1. Tài khoản người dùng phải tồn tại trong database
2. Giỏ hàng phải có sản phẩm
3. Điền đầy đủ thông tin giao hàng

### **Bước 2: Chọn Phương Thức Thanh Toán**
- Chọn **VNPay QR** để thanh toán
- Hoặc **COD** để thanh toán khi nhận hàng

### **Bước 3: Xử Lý Thanh Toán**
Nếu chọn **VNPay QR**:
1. Hệ thống gửi request đến `/vnpay/create_payment_url`
2. VNPay trả lại URL thanh toán (QR Code)
3. Người dùng scan QR và thanh toán
4. VNPay redirect về `/vnpay/return`
5. Hệ thống cập nhật trạng thái đơn hàng

### **Bước 4: Kiểm Tra Kết Quả**
- Đơn hàng sẽ có status = **PAID**
- transactionNo sẽ được lưu
- paymentStatus = **paid**

---

## 🌐 Các Endpoint VNPay:

| Endpoint | Phương Thức | Chức Năng |
|----------|-----------|----------|
| `/vnpay/create_payment_url` | POST | Tạo URL thanh toán |
| `/vnpay/return` | GET | Callback từ VNPay (User) |
| `/vnpay/ipn` | GET | Webhook từ VNPay (Server) |

---

## 💰 Thông Tư Thanh Toán Thành Công:

### Request:
```json
POST /vnpay/create_payment_url
{
  "amount": 1030000,
  "orderDescription": "Thanh toan don hang",
  "bankCode": "",
  "language": "vn",
  "name": "Trần Huy",
  "phone": "0123456789",
  "address": "Hà Nội",
  "note": "Ghi chú đơn hàng",
  "cartItems": [
    {
      "idProduct": 1,
      "quantity": 1,
      "price": 1000000,
      "size": "M"
    }
  ]
}
```

### Response:
```json
{
  "success": true,
  "paymentUrl": "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?...",
  "orderId": 12
}
```

---

## 📱 Kiểm Tra Thông Tin Thanh Toán:

### Trạng Thái Đơn Hàng (Orders Table):
- ✅ `status` = **PAID** (đã thanh toán)
- ✅ `paymentStatus` = **paid**
- ✅ `transactionNo` = Mã giao dịch VNPay
- ✅ `paymentMethod` = **VNPAY**

---

## ⚙️ Debug & Troubleshooting:

### 1. Kiểm tra Log VNPay
Mở console/terminal xem output debug:
```
=== VNPay Config ===
TmnCode: Z4QIKTHF
HashSecret: Exists (length: 32)
URL: https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
ReturnUrl: http://localhost:3000/vnpay/return
```

### 2. Kiểm tra Hash Signature
Nếu có lỗi "Chữ ký không hợp lệ":
- Check lại `VNP_HASH_SECRET` trong `.env`
- VNPay endpoint URL phải đúng
- IP address phải trong DSL được phép

### 3. Test Với Tài Khoản Sandbox:
VNPay cung cấp tài khoản test - Xem file `test-vnpay-config.js`

---

## 📝 Ghi Chú:

- ✅ Tất cả code VNPay đã được tích hợp sẵn
- ✅ Database schema đã hỗ trợ VNPay
- ✅ Frontend form đã hiển thị đúng
- ✅ Chỉ cần chạy server và test thanh toán

---

## 🚀 Chạy & Test:

```bash
cd helmet_store
npm start
```

Truy cập: `http://localhost:3000/thanh-toan`
1. Đăng nhập tài khoản
2. Chọn VNPay QR
3. Đặt hàng
4. Quét QR và thanh toán
5. Kiểm tra trạng thái đơn hàng
