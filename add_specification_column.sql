-- Thêm cột specification vào bảng product
SET @has_specification_column := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product'
    AND COLUMN_NAME = 'specification'
);

SET @add_specification_column_sql := IF(
  @has_specification_column = 0,
  'ALTER TABLE product ADD COLUMN specification TEXT AFTER desProduct',
  'SELECT 1'
);

PREPARE add_specification_column_stmt FROM @add_specification_column_sql;
EXECUTE add_specification_column_stmt;
DEALLOCATE PREPARE add_specification_column_stmt;

-- Cập nhật dữ liệu mẫu cho các sản phẩm hiện có
UPDATE product SET specification = 'Chất liệu: Nhựa ABS cao cấp\nTrọng lượng: 1.2kg\nKích thước: S, M, L\nChuẩn an toàn: DOT, ECE\nBảo hành: 12 tháng' WHERE specification IS NULL;
