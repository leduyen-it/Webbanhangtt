-- Cập nhật bảng orders để hỗ trợ VNPay (chạy nếu chưa có các column)

-- Thêm column transactionNo nếu chưa tồn tại
ALTER TABLE `orders` ADD COLUMN `transactionNo` VARCHAR(50) DEFAULT NULL COMMENT 'Mã giao dịch VNPay' AFTER `paymentStatus`;

-- Thêm column paymentStatus nếu chưa tồn tại
ALTER TABLE `orders` ADD COLUMN `paymentStatus` VARCHAR(20) DEFAULT 'unpaid' COMMENT 'Trạng thái thanh toán: paid/unpaid' AFTER `paymentMethod`;

-- Cập nhật index cho performance
ALTER TABLE `orders` ADD INDEX `idx_paymentStatus` (`paymentStatus`);
ALTER TABLE `orders` ADD INDEX `idx_transactionNo` (`transactionNo`);
ALTER TABLE `orders` ADD INDEX `idx_paymentMethod` (`paymentMethod`);
