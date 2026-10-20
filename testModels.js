require('dotenv').config();
const db = require('./models/database');

const userModel = require('./models/model_user');
const catalogModel = require('./models/model_catalog');
const productModel = require('./models/model_product');
const cartModel = require('./models/model_cart');
const wishlistModel = require('./models/model_wishlist');
const orderModel = require('./models/model_order');

(async () => {
  try {
    console.log('================== TEST USER MODEL ==================');
    const userEmail = 'test@example.com';
    const user = await userModel.checkEmail(userEmail);
    console.log('checkEmail:', user);

    console.log('\n================== TEST CATALOG MODEL ==================');
    const catalogs = await catalogModel.list();
    console.log('Danh mục:', catalogs);

    console.log('\n================== TEST PRODUCT MODEL ==================');
    const products = await productModel.list();
    console.log('Tổng sản phẩm:', products.length);
    console.log('Một sản phẩm mẫu:', products[0]);

    console.log('\n================== TEST CART MODEL ==================');
    const testUserId = 1;
    const cartItems = await cartModel.getCartItems(testUserId);
    console.log('Giỏ hàng:', cartItems);

    console.log('\nThêm sản phẩm mới vào giỏ...');
    await cartModel.addToCart(testUserId, 1, 2, 'M');
    const updatedCart = await cartModel.getCartItems(testUserId);
    console.log('Sau khi thêm:', updatedCart);

    console.log('\n================== TEST WISHLIST MODEL ==================');
    const wishlist = await wishlistModel.getWishlistItems(testUserId);
    console.log('Danh sách yêu thích:', wishlist);

    console.log('\nThêm vào wishlist...');
    await wishlistModel.addToWishlist(testUserId, 2);
    const newWishlist = await wishlistModel.getWishlistItems(testUserId);
    console.log('Sau khi thêm:', newWishlist);

    console.log('\n================== TEST ORDER MODEL ==================');
    console.log('Lấy đơn hàng người dùng...');
    const orders = await orderModel.getUserOrders(testUserId);
    console.log('Danh sách đơn:', orders);

    if (orders.length > 0) {
      console.log('\nChi tiết đơn hàng đầu tiên...');
      const orderDetails = await orderModel.getOrderDetails(orders[0].idOrder);
      console.log(orderDetails);
    } else {
      console.log('Chưa có đơn hàng nào.');
    }

    console.log('\n================== TEST HOÀN TẤT ==================');
    db.end(); // đóng kết nối DB
    process.exit(0);
  } catch (err) {
    console.error('❌ Lỗi khi test models:', err);
    db.end();
    process.exit(1);
  }
})();
