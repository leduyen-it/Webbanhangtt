-- Thêm cột specification vào bảng product
ALTER TABLE product ADD COLUMN specification TEXT AFTER desProduct;

-- Cập nhật dữ liệu mẫu cho các sản phẩm hiện có
UPDATE product SET specification = 'Chất liệu: Nhựa ABS cao cấp\nTrọng lượng: 1.2kg\nKích thước: S, M, L\nChuẩn an toàn: DOT, ECE\nBảo hành: 12 tháng' WHERE specification IS NULL;
