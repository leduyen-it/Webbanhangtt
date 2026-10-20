// helmet_store\routes\cart.js
var express = require("express");
var router = express.Router();
var modelCart = require("../models/model_cart");
var modelWishlist = require("../models/model_wishlist");
var modelProduct = require("../models/model_product");

// GET /cart - Display cart page
router.get("/", async function (req, res, next) {
  try {
    let cartItems = [];
    let cartTotal = 0;
    let cartCount = 0;

    if (req.session.User) {
      // Logged in user
      cartItems = await modelCart.getCartItems(req.session.User.id);
      cartTotal = await modelCart.getCartTotal(req.session.User.id);
      cartCount = await modelCart.getCartCount(req.session.User.id);
    } else {
      // Guest user - use session cart
      cartItems = await modelCart.getGuestCartItems(req.session.cart || {});
      cartTotal = cartItems.reduce(
        (total, item) => total + item.quantity * item.priceProduct,
        0
      );
      cartCount = cartItems.reduce((count, item) => count + item.quantity, 0);
    }

    res.render("site/gio-hang", {
      cartItems: cartItems,
      cartTotal: cartTotal,
      cartCount: cartCount,
      user: req.session.User || null,
    });
  } catch (error) {
    console.error("Cart page error:", error);
    res.status(500).render("error", { message: "Lỗi khi tải giỏ hàng" });
  }
});

// POST /cart/add - Add item to cart
router.post("/add", async function (req, res, next) {
  try {
    const idProduct = parseInt(req.body.idProduct, 10);
    const quantity = parseInt(req.body.quantity, 10) || 1;
    const size = req.body.size || "M";

    if (!idProduct || isNaN(idProduct)) {
      return res.json({ success: false, message: "Thiếu thông tin sản phẩm" });
    }

    if (req.session.User) {
      // Logged in user
      const result = await modelCart.addToCart(
        req.session.User.id,
        idProduct,
        parseInt(quantity),
        size
      );
      const cartCount = await modelCart.getCartCount(req.session.User.id);

      res.json({
        success: true,
        message: result.message,
        cartCount: cartCount,
      });
    } else {
      // Require login to add to cart
      return res.status(401).json({
        success: false,
        message: "Bạn cần đăng nhập để thêm sản phẩm vào giỏ hàng.",
      });
    }
  } catch (error) {
    console.error("Add to cart error:", error);
    res.json({ success: false, message: "Lỗi khi thêm vào giỏ hàng" });
  }
});

// GET /cart/add - Fallback link to add item then redirect
router.get("/add", async function (req, res, next) {
  try {
    const { idProduct } = req.query;
    const quantity = parseInt(req.query.quantity, 10) || 1;
    const size = req.query.size || "M";

    const returnTo = req.get("referer") || "/cart";

    if (!idProduct) {
      return res.redirect(returnTo);
    }

    if (!req.session.User) {
      return res.redirect("/users/dang-nhap");
    }

    await modelCart.addToCart(req.session.User.id, idProduct, quantity, size);
    return res.redirect(returnTo);
  } catch (error) {
    console.error("GET Add to cart error:", error);
    return res.redirect("/cart");
  }
});

// POST /cart/update - Update cart item quantity
router.post("/update", async function (req, res, next) {
  try {
    const idCart = parseInt(req.body.idCart, 10);
    const quantity = parseInt(req.body.quantity, 10);

    if (!idCart || isNaN(idCart) || isNaN(quantity)) {
      return res.json({ success: false, message: "Thiếu thông tin cập nhật" });
    }

    if (req.session.User) {
      // Logged in user
      const result = await modelCart.updateCartQuantity(idCart, quantity);
      const cartCount = await modelCart.getCartCount(req.session.User.id);
      const cartTotal = await modelCart.getCartTotal(req.session.User.id);

      res.json({
        success: true,
        message: result.message,
        cartCount: cartCount,
        cartTotal: cartTotal,
      });
    } else {
      // Guest user - update session cart
      res.json({
        success: false,
        message: "Vui lòng đăng nhập để cập nhật giỏ hàng",
      });
    }
  } catch (error) {
    console.error("Update cart error:", error);
    res.json({ success: false, message: "Lỗi khi cập nhật giỏ hàng" });
  }
});

// POST /cart/remove - Remove item from cart
router.post("/remove", async function (req, res, next) {
  try {
    const idCart = parseInt(req.body.idCart, 10);

    if (!idCart || isNaN(idCart)) {
      return res.json({ success: false, message: "Thiếu thông tin xóa" });
    }

    if (req.session.User) {
      // Logged in user
      const result = await modelCart.removeFromCart(idCart);
      const cartCount = await modelCart.getCartCount(req.session.User.id);
      const cartTotal = await modelCart.getCartTotal(req.session.User.id);

      res.json({
        success: true,
        message: result.message,
        cartCount: cartCount,
        cartTotal: cartTotal,
      });
    } else {
      // Guest user
      res.json({
        success: false,
        message: "Vui lòng đăng nhập để xóa sản phẩm",
      });
    }
  } catch (error) {
    console.error("Remove from cart error:", error);
    res.json({ success: false, message: "Lỗi khi xóa sản phẩm" });
  }
});

// POST /cart/clear - Clear entire cart
router.post("/clear", async function (req, res, next) {
  try {
    if (req.session.User) {
      // Logged in user
      const result = await modelCart.clearCart(req.session.User.id);
      res.json({
        success: true,
        message: result.message,
        cartCount: 0,
        cartTotal: 0,
      });
    } else {
      // Guest user
      req.session.cart = {};
      res.json({
        success: true,
        message: "Đã xóa tất cả sản phẩm",
        cartCount: 0,
        cartTotal: 0,
      });
    }
  } catch (error) {
    console.error("Clear cart error:", error);
    res.json({ success: false, message: "Lỗi khi xóa giỏ hàng" });
  }
});

// GET /cart/count - Get cart count (for AJAX updates)
router.get("/count", async function (req, res, next) {
  try {
    let cartCount = 0;

    if (req.session.User) {
      cartCount = await modelCart.getCartCount(req.session.User.id);
    } else {
      const cartItems = await modelCart.getGuestCartItems(
        req.session.cart || {}
      );
      cartCount = cartItems.reduce((count, item) => count + item.quantity, 0);
    }

    res.json({ cartCount: cartCount });
  } catch (error) {
    console.error("Get cart count error:", error);
    res.json({ cartCount: 0 });
  }
});

// GET /cart/total - Get cart total (for AJAX updates)
router.get("/total", async function (req, res, next) {
  try {
    let cartTotal = 0;

    if (req.session.User) {
      cartTotal = await modelCart.getCartTotal(req.session.User.id);
    } else {
      const cartItems = await modelCart.getGuestCartItems(
        req.session.cart || {}
      );
      cartTotal = cartItems.reduce(
        (total, item) => total + item.quantity * item.priceProduct,
        0
      );
    }

    res.json({ cartTotal: cartTotal });
  } catch (error) {
    console.error("Get cart total error:", error);
    res.json({ cartTotal: 0 });
  }
});

module.exports = router;
