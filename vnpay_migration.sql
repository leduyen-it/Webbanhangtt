-- Thêm cột transactionNo vào bảng orders để lưu mã giao dịch VNPay
ALTER TABLE orders 
ADD COLUMN transactionNo VARCHAR(50) NULL COMMENT 'Mã giao dịch VNPay' AFTER paymentStatus;

-- Thêm index cho transactionNo để tìm kiếm nhanh hơn
CREATE INDEX idx_transactionNo ON orders(transactionNo);

-- Cập nhật comment cho bảng
ALTER TABLE orders COMMENT = 'Bảng đơn hàng - Hỗ trợ thanh toán VNPay';
