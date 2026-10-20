const db = require('./database');

// Danh sách danh mục
exports.listCat = async () => {
  try {
    const sql = "SELECT * FROM catalog";
    const result = await db.query(sql);
    console.log('List catalog success');
    return result;
  } catch (err) {
    console.error('Error listing catalog:', err);
    throw err;
  }
};

// Sản phẩm mới về
exports.listNewArrival = async () => {
  try {
    const sql = "SELECT * FROM product LIMIT 7";
    const result = await db.query(sql);
    console.log('List new arrival success');
    return result;
  } catch (err) {
    console.error('Error listing new arrival:', err);
    throw err;
  }
};

// Sản phẩm cập nhật gần nhất
exports.listRecent = async () => {
  try {
    const sql = "SELECT * FROM product ORDER BY dateUpdate DESC LIMIT 6";
    const result = await db.query(sql);
    console.log('List recent products success');
    return result;
  } catch (err) {
    console.error('Error listing recent products:', err);
    throw err;
  }
};

// Danh sách giỏ hàng của người dùng
exports.listCart = async (user) => {
  try {
    const sql = "SELECT * FROM cart WHERE user = ?";
    const result = await db.query(sql, [user]);
    console.log('List cart success');
    return result;
  } catch (err) {
    console.error('Error listing cart:', err);
    throw err;
  }
};
