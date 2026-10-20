// E:\NNKichBan_CuoiKy\helmet_store\routes\orders.js
var express = require("express");
var router = express.Router();
var modelOrder = require("../models/model_order");
var modelCart = require("../models/model_cart");

// GET /orders - Display user's order history
router.get("/", async function (req, res, next) {
  try {
    if (!req.session.User) {
      req.session.back = "/orders";
      return res.redirect("/users/dang-nhap");
    }

    // Chuyển hướng đến trang tài khoản với tab đơn hàng
    res.redirect("/users/tai-khoan#orders-tab");
  } catch (error) {
    console.error("Order history error:", error);
    res.status(500).render("error", {
      message: "Lỗi khi tải lịch sử đơn hàng",
      error: { status: 500, stack: error.stack },
    });
  }
});

// GET /orders/:id - Display order details
router.get("/:id", async function (req, res, next) {
  try {
    if (!req.session.User) {
      req.session.back = `/orders/${req.params.id}`;
      return res.redirect("/users/dang-nhap");
    }

    const orderId = req.params.id;
    const order = await modelOrder.getOrderDetails(
      orderId,
      req.session.User.id
    );

    if (!order) {
      return res.status(404).render("error", {
        message: "Không tìm thấy đơn hàng",
        error: { status: 404, stack: "" },
      });
    }

    res.render("site/order-detail", {
      order: order,
      user: req.session.User,
    });
  } catch (error) {
    console.error("Order detail error:", error);
    res.status(500).render("error", {
      message: "Lỗi khi tải chi tiết đơn hàng",
      error: { status: 500, stack: error.stack },
    });
  }
});

// POST /orders/create - Create new order
router.post("/create", async function (req, res, next) {
  try {
    if (!req.session.User) {
      return res
        .status(400)
        .json({ success: false, message: "Vui lòng đăng nhập để đặt hàng" });
    }

    const { shippingAddress, paymentMethod } = req.body;

    if (!shippingAddress || !paymentMethod) {
      return res
        .status(400)
        .json({ success: false, message: "Thiếu thông tin đặt hàng" });
    }

    // Get cart items
    const cartItems = await modelCart.getCartItems(req.session.User.id);

    if (cartItems.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Giỏ hàng trống" });
    }

    // Calculate total
    const totalAmount = cartItems.reduce(
      (total, item) => total + item.quantity * item.priceProduct,
      0
    );

    // Prepare order data
    const orderData = {
      idUser: req.session.User.id,
      totalAmount: totalAmount,
      shippingAddress: shippingAddress,
      paymentMethod: paymentMethod,
      cartItems: cartItems.map((item) => ({
        idProduct: item.idProduct,
        quantity: item.quantity,
        size: item.size,
        price: item.priceProduct,
      })),
    };

    // Create order
    const result = await modelOrder.createOrder(orderData);

    // Clear cart after successful order
    await modelCart.clearCart(req.session.User.id);

    res.json({
      success: true,
      message: "Đặt hàng thành công",
      orderId: result.orderId,
    });
  } catch (error) {
    console.error("Create order error:", error);
    res.json({ success: false, message: "Lỗi khi đặt hàng" });
  }
});

// POST /orders/:id/cancel - Cancel order
router.post("/:id/cancel", async function (req, res, next) {
  try {
    if (!req.session.User) {
      return res
        .status(403)
        .json({ success: false, message: "Vui lòng đăng nhập" });
    }

    const orderId = req.params.id;

    // Check if order belongs to user
    const order = await modelOrder.getOrderDetails(
      orderId,
      req.session.User.id
    );

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy đơn hàng" });
    }

    if (order.status !== "pending") {
      return res
        .status(403)
        .json({ success: false, message: "Không thể hủy đơn hàng này" });
    }

    // Update order status to cancelled
    const result = await modelOrder.updateOrderStatus(orderId, "cancelled");

    res.json({
      success: true,
      message: "Đã hủy đơn hàng",
    });
  } catch (error) {
    console.error("Cancel order error:", error);
    res.json({ success: false, message: "Lỗi khi hủy đơn hàng" });
  }
});

// GET /orders/:id/invoice - Generate invoice (PDF or view)
router.get("/:id/invoice", async function (req, res, next) {
  try {
    if (!req.session.User) {
      req.session.back = `/orders/${req.params.id}/invoice`;
      return res.redirect("/users/dang-nhap");
    }

    const orderId = req.params.id;
    const order = await modelOrder.getOrderDetails(
      orderId,
      req.session.User.id
    );

    if (!order) {
      return res.status(404).render("error", {
        message: "Không tìm thấy đơn hàng",
        error: { status: 404, stack: "" },
      });
    }

    res.render("site/invoice", {
      order: order,
      user: req.session.User,
    });
  } catch (error) {
    console.error("Invoice error:", error);
    res.status(500).render("error", {
      message: "Lỗi khi tạo hóa đơn",
      error: { status: 500, stack: error.stack },
    });
  }
});

// POST /orders/create-cod - Tạo đơn hàng COD
router.post("/create-cod", async function (req, res, next) {
  try {
    console.log("=== COD ORDER REQUEST ===");
    console.log(
      "Session User:",
      req.session.User ? req.session.User.id : "No user"
    );
    console.log("Request body:", req.body);
    console.log("========================");

    if (!req.session.User) {
      console.log("ERROR: No user session");
      return res.json({
        success: false,
        message: "Vui lòng đăng nhập để đặt hàng",
      });
    }

    const {
      selectedItems,
      customerName,
      customerPhone,
      shippingAddress,
      orderNotes,
    } = req.body;

    // Parse selectedItems nếu là string
    let parsedSelectedItems = selectedItems;
    if (typeof selectedItems === "string") {
      try {
        parsedSelectedItems = JSON.parse(selectedItems);
      } catch (e) {
        console.log("ERROR: Cannot parse selectedItems JSON");
        return res.json({
          success: false,
          message: "Dữ liệu sản phẩm không hợp lệ",
        });
      }
    }

    console.log("Parsed data:", {
      selectedItems: parsedSelectedItems,
      customerName,
      customerPhone,
      shippingAddress,
      orderNotes,
    });

    if (
      !parsedSelectedItems ||
      !Array.isArray(parsedSelectedItems) ||
      parsedSelectedItems.length === 0
    ) {
      console.log("ERROR: Invalid selectedItems after parsing");
      return res.json({
        success: false,
        message: "Vui lòng chọn sản phẩm để đặt hàng",
      });
    }

    if (!customerName || !customerPhone || !shippingAddress) {
      console.log("ERROR: Missing customer info");
      return res.json({
        success: false,
        message: "Vui lòng điền đầy đủ thông tin giao hàng",
      });
    }

    // Lấy thông tin các sản phẩm đã chọn từ giỏ hàng
    const cartItems = await modelCart.getSelectedCartItems(
      req.session.User.id,
      parsedSelectedItems
    );

    if (!cartItems || cartItems.length === 0) {
      return res.json({
        success: false,
        message: "Không tìm thấy sản phẩm trong giỏ hàng",
      });
    }

    const orderData = {
      userId: req.session.User.id,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      shippingAddress: shippingAddress.trim(),
      orderNotes: orderNotes ? orderNotes.trim() : "",
    };

    const result = await modelOrder.createCODOrder(orderData, cartItems);

    res.json(result);
  } catch (error) {
    console.error("Create COD order error:", error);
    res.json({
      success: false,
      message: "Có lỗi xảy ra khi tạo đơn hàng. Vui lòng thử lại.",
    });
  }
});

// POST /orders/cancel/:id - Hủy đơn hàng
router.post("/cancel/:id", async function (req, res, next) {
  try {
    if (!req.session.User) {
      return res.json({ success: false, message: "Vui lòng đăng nhập" });
    }

    const orderId = parseInt(req.params.id);
    const reason = req.body.reason || "Khách hàng hủy";

    const result = await modelOrder.cancelOrder(
      orderId,
      req.session.User.id,
      reason
    );
    res.json(result);
  } catch (error) {
    console.error("Cancel order error:", error);
    res.json({
      success: false,
      message: error.message || "Có lỗi xảy ra khi hủy đơn hàng",
    });
  }
});

module.exports = router;
