// E:\NNKichBan_CuoiKy\helmet_store\routes\index.js
var express = require("express");
var modelIndex = require("../models/model_index");
var modelUser = require("../models/model_user");
var modelProduct = require("../models/model_product");
var modelCart = require("../models/model_cart");
var modelWishlist = require("../models/model_wishlist");
var router = express.Router();

/* GET home page. */
router.get("/", async function (req, res, next) {
  let listCat = await modelIndex.listCat();
  let listRecent = await modelIndex.listRecent();
  let listNewArrival = await modelIndex.listNewArrival();
  
  // Get user wishlist IDs for displaying heart states
  let userWishlistIds = [];
  if (req.session.User) {
    try {
      userWishlistIds = await modelWishlist.getUserWishlistIds(req.session.User.id);
    } catch (error) {
      console.log("Error getting wishlist IDs:", error);
      userWishlistIds = [];
    }
  }
  
  res.render("site/index", {
    listCat: listCat,
    listNewArrival: listNewArrival,
    listRecent: listRecent,
    userWishlistIds: userWishlistIds,
  });
});
// Cart route moved to /cart route file
router.get("/thanh-toan", async function (req, res, next) {
  try {
    let cartItems = [];
    let cartTotal = 0;
    let cartCount = 0;
    let wishlistCount = 0;

    if (req.session.User) {
      // Logged in user
      const selectedItemsParam = req.query.items;
      
      if (selectedItemsParam) {
        // Lấy chỉ các sản phẩm được chọn
        const selectedCartIds = selectedItemsParam.split(',').map(id => parseInt(id)).filter(id => !isNaN(id));
        
        if (selectedCartIds.length > 0) {
          cartItems = await modelCart.getSelectedCartItems(req.session.User.id, selectedCartIds);
          // Tính tổng từ các items được chọn
          cartTotal = cartItems.reduce((sum, item) => sum + (item.priceProduct * item.quantity), 0);
          cartCount = cartItems.length;
        } else {
          // Không có sản phẩm hợp lệ được chọn
          return res.redirect("/cart?error=noitems");
        }
      } else {
        // Không có items được chọn, redirect về giỏ hàng
        return res.redirect("/cart?error=noselection");
      }

      // Get wishlist count
      try {
        wishlistCount = await modelWishlist.getWishlistCount(req.session.User.id);
      } catch (error) {
        console.log("Error getting wishlist count:", error);
        wishlistCount = 0;
      }
    } else {
      // Redirect to login if not logged in
      req.session.back = "/thanh-toan";
      return res.redirect("/users/dang-nhap");
    }

    res.render("site/thanh-toan.ejs", {
      cartItems: cartItems,
      cartTotal: cartTotal,
      cartCount: cartCount,
      wishlistCount: wishlistCount,
      user: req.session.User || null,
    });
  } catch (error) {
    console.error("Checkout page error:", error);
    res
      .status(500)
      .render("error", { message: "Lỗi khi tải trang thanh toán" });
  }
});
// Wishlist route moved to /wishlist route file
router.get("/lien-he", function (req, res, next) {
  res.render("site/lien-he.ejs");
});

module.exports = router;
