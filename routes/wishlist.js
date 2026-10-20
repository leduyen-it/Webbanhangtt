// E:\NNKichBan_CuoiKy\helmet_store\routes\wishlist.js
var express = require("express");
var router = express.Router();
var modelWishlist = require("../models/model_wishlist");
var modelCart = require("../models/model_cart");

// GET /wishlist - Display wishlist page
router.get("/", async function (req, res, next) {
  try {
    let wishlistItems = [];
    let wishlistCount = 0;

    if (req.session.User) {
      // Logged in user
      wishlistItems = await modelWishlist.getWishlistItems(req.session.User.id);
      wishlistCount = await modelWishlist.getWishlistCount(req.session.User.id);
    } else {
      // Guest user - use session wishlist
      wishlistItems = await modelWishlist.getGuestWishlistItems(
        req.session.wishlist || []
      );
      wishlistCount = wishlistItems.length;
    }

    // Lấy danh sách sản phẩm yêu thích của user nếu đã đăng nhập
    let userWishlistIds = [];
    if (req.session.User) {
      userWishlistIds = await modelWishlist.getUserWishlistIds(req.session.User.id);
    }

    res.render("site/wishlist", {
      wishlistItems: wishlistItems,
      wishlistCount: wishlistCount,
      user: req.session.User || null,
      userWishlistIds: userWishlistIds,
    });
  } catch (error) {
    console.error("Wishlist page error:", error);
    res
      .status(500)
      .render("error", { message: "Lỗi khi tải danh sách yêu thích" });
  }
});

// POST /wishlist/add - Add item to wishlist
router.post("/add", async function (req, res, next) {
  try {
    const idProduct = parseInt(req.body.idProduct, 10);

    if (!idProduct || isNaN(idProduct)) {
      return res.json({ success: false, message: "Thiếu thông tin sản phẩm" });
    }

    if (req.session.User) {
      // Logged in user
      const result = await modelWishlist.addToWishlist(
        req.session.User.id,
        idProduct
      );
      const wishlistCount = await modelWishlist.getWishlistCount(
        req.session.User.id
      );

      res.json({
        success: true,
        message: result.message,
        wishlistCount: wishlistCount,
        exists: result.exists || false,
      });
    } else {
      // Guest user - use session wishlist
      if (!req.session.wishlist) {
        req.session.wishlist = [];
      }

      req.session.wishlist = modelWishlist.addToWishlistGuest(
        req.session.wishlist,
        idProduct
      );
      const wishlistCount = req.session.wishlist.length;

      res.json({
        success: true,
        message: "Đã thêm vào danh sách yêu thích",
        wishlistCount: wishlistCount,
      });
    }
  } catch (error) {
    console.error("Add to wishlist error:", error);
    res.json({
      success: false,
      message: "Lỗi khi thêm vào danh sách yêu thích",
    });
  }
});

// POST /wishlist/remove - Remove item from wishlist
router.post("/remove", async function (req, res, next) {
  try {
    const idProduct = parseInt(req.body.idProduct, 10);

    if (!idProduct || isNaN(idProduct)) {
      return res.json({ success: false, message: "Thiếu thông tin xóa" });
    }

    if (req.session.User) {
      // Logged in user
      const result = await modelWishlist.removeFromWishlist(
        req.session.User.id,
        idProduct
      );
      const wishlistCount = await modelWishlist.getWishlistCount(
        req.session.User.id
      );

      res.json({
        success: true,
        message: result.message,
        wishlistCount: wishlistCount,
      });
    } else {
      // Guest user
      req.session.wishlist = modelWishlist.removeFromWishlistGuest(
        req.session.wishlist || [],
        idProduct
      );
      const wishlistCount = req.session.wishlist.length;

      res.json({
        success: true,
        message: "Đã xóa khỏi danh sách yêu thích",
        wishlistCount: wishlistCount,
      });
    }
  } catch (error) {
    console.error("Remove from wishlist error:", error);
    res.json({
      success: false,
      message: "Lỗi khi xóa khỏi danh sách yêu thích",
    });
  }
});

// POST /wishlist/toggle - Toggle item in wishlist
router.post("/toggle", async function (req, res, next) {
  try {
    const idProduct = parseInt(req.body.idProduct, 10);

    if (!idProduct || isNaN(idProduct)) {
      return res.json({ success: false, message: "Thiếu thông tin sản phẩm" });
    }

    if (req.session.User) {
      // Logged in user
      const isInWishlist = await modelWishlist.isInWishlist(
        req.session.User.id,
        idProduct
      );

      if (isInWishlist) {
        const result = await modelWishlist.removeFromWishlist(
          req.session.User.id,
          idProduct
        );
        const wishlistCount = await modelWishlist.getWishlistCount(
          req.session.User.id
        );

        res.json({
          success: true,
          message: "Đã xóa khỏi danh sách yêu thích",
          wishlistCount: wishlistCount,
          inWishlist: false,
        });
      } else {
        const result = await modelWishlist.addToWishlist(
          req.session.User.id,
          idProduct
        );
        const wishlistCount = await modelWishlist.getWishlistCount(
          req.session.User.id
        );

        res.json({
          success: true,
          message: "Đã thêm vào danh sách yêu thích",
          wishlistCount: wishlistCount,
          inWishlist: true,
        });
      }
    } else {
      // Guest user
      if (!req.session.wishlist) {
        req.session.wishlist = [];
      }

      const isInWishlist = req.session.wishlist.includes(parseInt(idProduct));

      if (isInWishlist) {
        req.session.wishlist = modelWishlist.removeFromWishlistGuest(
          req.session.wishlist,
          idProduct
        );
        res.json({
          success: true,
          message: "Đã xóa khỏi danh sách yêu thích",
          wishlistCount: req.session.wishlist.length,
          inWishlist: false,
        });
      } else {
        req.session.wishlist = modelWishlist.addToWishlistGuest(
          req.session.wishlist,
          idProduct
        );
        res.json({
          success: true,
          message: "Đã thêm vào danh sách yêu thích",
          wishlistCount: req.session.wishlist.length,
          inWishlist: true,
        });
      }
    }
  } catch (error) {
    console.error("Toggle wishlist error:", error);
    res.json({
      success: false,
      message: "Lỗi khi cập nhật danh sách yêu thích",
    });
  }
});

// GET /wishlist/toggle - Fallback link to toggle then redirect
router.get("/toggle", async function (req, res, next) {
  try {
    const { idProduct } = req.query;
    const returnTo = req.get("referer") || "/wishlist";
    if (!idProduct) return res.redirect(returnTo);

    if (req.session.User) {
      const isInWishlist = await modelWishlist.isInWishlist(
        req.session.User.id,
        idProduct
      );
      if (isInWishlist) {
        await modelWishlist.removeFromWishlist(req.session.User.id, idProduct);
      } else {
        await modelWishlist.addToWishlist(req.session.User.id, idProduct);
      }
      return res.redirect(returnTo);
    } else {
      // guest session toggle
      if (!req.session.wishlist) req.session.wishlist = [];
      const idx = req.session.wishlist.indexOf(parseInt(idProduct));
      if (idx >= 0) {
        req.session.wishlist.splice(idx, 1);
      } else {
        req.session.wishlist.push(parseInt(idProduct));
      }
      return res.redirect(returnTo);
    }
  } catch (error) {
    console.error("GET Toggle wishlist error:", error);
    return res.redirect("/wishlist");
  }
});

// GET /wishlist/count - Get wishlist count (for AJAX updates)
router.get("/count", async function (req, res, next) {
  try {
    let wishlistCount = 0;

    if (req.session.User) {
      wishlistCount = await modelWishlist.getWishlistCount(req.session.User.id);
    } else {
      wishlistCount = (req.session.wishlist || []).length;
    }

    res.json({ wishlistCount: wishlistCount });
  } catch (error) {
    console.error("Get wishlist count error:", error);
    res.json({ wishlistCount: 0 });
  }
});

// POST /wishlist/clear - Clear entire wishlist
router.post("/clear", async function (req, res, next) {
  try {
    if (req.session.User) {
      // Logged in user
      const result = await modelWishlist.clearWishlist(req.session.User.id);
      res.json({
        success: true,
        message: result.message,
        wishlistCount: 0,
      });
    } else {
      // Guest user
      req.session.wishlist = [];
      res.json({
        success: true,
        message: "Đã xóa tất cả sản phẩm yêu thích",
        wishlistCount: 0,
      });
    }
  } catch (error) {
    console.error("Clear wishlist error:", error);
    res.json({ success: false, message: "Lỗi khi xóa danh sách yêu thích" });
  }
});

// POST /wishlist/move-to-cart - Move item from wishlist to cart
router.post("/move-to-cart", async function (req, res, next) {
  try {
    const idProduct = parseInt(req.body.idProduct, 10);
    const quantity = parseInt(req.body.quantity, 10) || 1;
    const size = req.body.size || "M";

    if (!idProduct || isNaN(idProduct)) {
      return res.json({ success: false, message: "Thiếu thông tin sản phẩm" });
    }

    if (req.session.User) {
      // Remove from wishlist
      await modelWishlist.removeFromWishlist(req.session.User.id, idProduct);

      // Add to cart
      const cartResult = await modelCart.addToCart(
        req.session.User.id,
        idProduct,
        quantity,
        size
      );
      const wishlistCount = await modelWishlist.getWishlistCount(
        req.session.User.id
      );
      const cartCount = await modelCart.getCartCount(req.session.User.id);

      res.json({
        success: true,
        message: "Đã chuyển vào giỏ hàng",
        wishlistCount: wishlistCount,
        cartCount: cartCount,
      });
    } else {
      res.json({
        success: false,
        message: "Vui lòng đăng nhập để thực hiện chức năng này",
      });
    }
  } catch (error) {
    console.error("Move to cart error:", error);
    res.json({ success: false, message: "Lỗi khi chuyển vào giỏ hàng" });
  }
});

module.exports = router;
