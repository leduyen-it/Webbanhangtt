# HƯỚNG DẪN CÀI ĐẶT CHỨC NĂNG ĐÁNH GIÁ SẢN PHẨM

## 1. Cập nhật Database

Chạy lệnh SQL sau trong phpMyAdmin hoặc MySQL Workbench:

```sql
-- Thêm cột idUser vào bảng comment để liên kết với user
ALTER TABLE `comment` ADD `idUser` INT(11) NULL DEFAULT NULL AFTER `idComment`;

-- Thêm foreign key constraint  
ALTER TABLE `comment` ADD CONSTRAINT `fk_comment_user` FOREIGN KEY (`idUser`) REFERENCES `user`(`idUser`) ON DELETE SET NULL ON UPDATE CASCADE;
```

## 2. Các tính năng đã được bổ sung:

### ✅ **Kiểm tra đăng nhập**
- User phải đăng nhập mới được đánh giá

### ✅ **Kiểm tra đã mua hàng**  
- Chỉ user đã thanh toán hoặc đã hoàn tất đơn hàng chứa sản phẩm mới được đánh giá
- Chấp nhận trạng thái đơn hàng `paid`, `delivered` hoặc `completed`

### ✅ **Kiểm tra đã đánh giá**
- Mỗi user chỉ được đánh giá 1 lần cho 1 sản phẩm

### ✅ **Giao diện thông minh**
- Hiển thị thông báo phù hợp với từng trường hợp:
  - Chưa đăng nhập → Yêu cầu đăng nhập
  - Đã đăng nhập nhưng chưa mua → Thông báo cần mua hàng  
  - Đã mua nhưng đã đánh giá → Thông báo đã đánh giá
  - Đã mua và chưa đánh giá → Hiển thị form đánh giá

## 3. Files đã tạo/cập nhật:

- `models/model_review.js` - Model xử lý đánh giá
- `routes/product.js` - Route xử lý đánh giá với validation  
- `views/site/chi-tiet-san-pham.ejs` - Giao diện form đánh giá
- `update_comment_table.sql` - Script cập nhật database

## 4. Cách test:

1. Đăng nhập vào hệ thống
2. Mua một sản phẩm và thanh toán thành công (status = 'paid') hoặc hoàn thành đơn COD
3. Vào trang chi tiết sản phẩm
4. Kiểm tra form đánh giá xuất hiện
5. Gửi đánh giá và kiểm tra không thể đánh giá lần 2

## 5. Security features:

- ✅ Validation đầu vào
- ✅ Kiểm tra quyền user  
- ✅ Ngăn spam đánh giá
- ✅ Liên kết chặt chẽ với đơn hàng