// E:\NNKichBan_CuoiKy\helmet_store\routes\index.js
var express = require("express");
var modelIndex = require("../models/model_index");
var modelUser = require("../models/model_user");
var modelProduct = require("../models/model_product");
var modelCart = require("../models/model_cart");
var modelWishlist = require("../models/model_wishlist");
var db = require("../models/database");
var router = express.Router();
var contactMessagesTableReady;

function ensureContactMessagesTable() {
  if (!contactMessagesTableReady) {
    contactMessagesTableReady = db
      .query(
        `CREATE TABLE IF NOT EXISTS contact_messages (
          idMessage int(11) NOT NULL AUTO_INCREMENT,
          senderName varchar(100) NOT NULL,
          senderEmail varchar(254) NOT NULL,
          subject varchar(200) NOT NULL,
          message text NOT NULL,
          isRead tinyint(1) NOT NULL DEFAULT 0,
          createdAt timestamp NOT NULL DEFAULT current_timestamp(),
          PRIMARY KEY (idMessage),
          KEY idx_contact_messages_unread (isRead, createdAt)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`
      )
      .catch((error) => {
        contactMessagesTableReady = null;
        throw error;
      });
  }
  return contactMessagesTableReady;
}

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
  res.render("site/lien-he.ejs", {
    contactMessage:
      req.query.sent === "1"
        ? "Tin nhắn của bạn đã được gửi. Cảm ơn bạn đã liên hệ!"
        : "",
    contactMessageType: "success",
    contactForm: {},
  });
});

router.post("/lien-he", async function (req, res, next) {
  const contactForm = {
    name: typeof req.body.name === "string" ? req.body.name.trim() : "",
    email: typeof req.body.email === "string" ? req.body.email.trim() : "",
    subject: typeof req.body.subject === "string" ? req.body.subject.trim() : "",
    message:
      typeof req.body.message === "string" ? req.body.message.trim() : "",
  };
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  let validationMessage = "";

  if (
    !contactForm.name ||
    !contactForm.email ||
    !contactForm.subject ||
    !contactForm.message
  ) {
    validationMessage = "Vui lòng điền đầy đủ các thông tin.";
  } else if (
    contactForm.name.length > 100 ||
    contactForm.email.length > 254 ||
    contactForm.subject.length > 200 ||
    contactForm.message.length > 5000
  ) {
    validationMessage = "Một hoặc nhiều nội dung vượt quá độ dài cho phép.";
  } else if (!emailPattern.test(contactForm.email)) {
    validationMessage = "Địa chỉ email không hợp lệ.";
  }

  if (validationMessage) {
    return res.status(400).render("site/lien-he.ejs", {
      contactMessage: validationMessage,
      contactMessageType: "danger",
      contactForm,
    });
  }

  try {
    await ensureContactMessagesTable();
    await db.query(
      `INSERT INTO contact_messages (senderName, senderEmail, subject, message)
       VALUES (?, ?, ?, ?)`,
      [
        contactForm.name,
        contactForm.email,
        contactForm.subject,
        contactForm.message,
      ]
    );
    res.redirect("/lien-he?sent=1");
  } catch (error) {
    console.error(
      "Contact message submission failed:",
      error.code || "database error"
    );
    const contactErrorMessage =
      error.code === "ER_DBACCESS_DENIED_ERROR" ||
      error.code === "ER_TABLEACCESS_DENIED_ERROR"
        ? "Database chưa có bảng hoặc chưa được cấp quyền lưu tin nhắn. Hãy chạy contact_messages_migration.sql trên database production."
        : "Hiện chưa thể gửi tin nhắn. Vui lòng thử lại sau hoặc liên hệ cửa hàng qua email.";
    res.status(503).render("site/lien-he.ejs", {
      contactMessage: contactErrorMessage,
      contactMessageType: "danger",
      contactForm,
    });
  }
});

var informationPages = {
  "gioi-thieu": {
    title: "Giới thiệu",
    intro:
      "Helmet Store cung cấp các sản phẩm mũ bảo hiểm và phụ kiện, đồng thời hỗ trợ khách hàng trong quá trình lựa chọn và mua sắm.",
    sections: [
      {
        title: "Hỗ trợ khách hàng",
        body:
          "Nếu cần tư vấn về sản phẩm hoặc đơn hàng, vui lòng liên hệ cửa hàng qua thông tin liên hệ ở cuối trang.",
      },
    ],
  },
  "chinh-sach-bao-mat": {
    title: "Chính sách bảo mật",
    intro:
      "Helmet Store tôn trọng quyền riêng tư và chỉ sử dụng thông tin khách hàng cho các hoạt động cần thiết để phục vụ việc mua sắm.",
    sections: [
      {
        title: "Thông tin được sử dụng",
        body:
          "Thông tin liên hệ, địa chỉ giao hàng và chi tiết đơn hàng được sử dụng để xác nhận, xử lý và hỗ trợ đơn hàng.",
      },
      {
        title: "Bảo vệ thông tin",
        body:
          "Cửa hàng không bán thông tin cá nhân của khách hàng. Thông tin chỉ được chia sẻ với đơn vị liên quan khi cần để hoàn tất dịch vụ hoặc theo yêu cầu của pháp luật.",
      },
    ],
  },
  "hinh-thuc-van-chuyen": {
    title: "Hình thức vận chuyển",
    intro:
      "Các hình thức giao hàng khả dụng sẽ được thông báo khi đặt hàng và có thể phụ thuộc vào địa chỉ nhận hàng.",
    sections: [
      {
        title: "Nhận và theo dõi đơn hàng",
        body:
          "Vui lòng cung cấp địa chỉ và số điện thoại chính xác để cửa hàng hoặc đơn vị vận chuyển có thể liên hệ giao hàng. Thông tin giao hàng cụ thể sẽ được xác nhận sau khi đặt hàng.",
      },
    ],
  },
  "chinh-sach-thanh-toan": {
    title: "Chính sách thanh toán",
    intro:
      "Các phương thức thanh toán đang được hỗ trợ sẽ hiển thị tại bước thanh toán hoặc được cửa hàng xác nhận khi tiếp nhận đơn hàng.",
    sections: [
      {
        title: "Xác nhận thanh toán",
        body:
          "Vui lòng kiểm tra tổng giá trị đơn hàng và phương thức thanh toán trước khi xác nhận. Với thanh toán trực tuyến, hãy làm theo hướng dẫn của cổng thanh toán được hiển thị trên trang.",
      },
    ],
  },
  "chinh-sach-van-chuyen": {
    title: "Chính sách vận chuyển",
    intro:
      "Cửa hàng tiếp nhận và xử lý đơn hàng theo thông tin nhận hàng do khách cung cấp.",
    sections: [
      {
        title: "Phí và thời gian giao hàng",
        body:
          "Phí giao hàng và thời gian dự kiến có thể thay đổi theo địa chỉ, phương thức giao hàng và tình trạng đơn. Thông tin áp dụng sẽ được thông báo khi đặt hàng hoặc xác nhận đơn.",
      },
      {
        title: "Khi nhận hàng",
        body:
          "Vui lòng kiểm tra tình trạng kiện hàng khi nhận và liên hệ cửa hàng nếu phát hiện vấn đề với đơn hàng.",
      },
    ],
  },
  "chinh-sach-hoan-tra": {
    title: "Chính sách hoàn trả",
    intro:
      "Nếu sản phẩm hoặc đơn hàng có vấn đề, khách hàng vui lòng liên hệ cửa hàng để được hướng dẫn kiểm tra và xử lý.",
    sections: [
      {
        title: "Yêu cầu hỗ trợ",
        body:
          "Khi liên hệ, vui lòng cung cấp mã đơn hàng, thông tin sản phẩm và mô tả tình trạng gặp phải. Cửa hàng sẽ xem xét tình trạng sản phẩm và hướng dẫn phương án phù hợp theo quy định áp dụng.",
      },
      {
        title: "Giữ lại thông tin đơn hàng",
        body:
          "Vui lòng giữ lại sản phẩm, bao bì và chứng từ liên quan trong thời gian chờ hướng dẫn xử lý.",
      },
    ],
  },
};

router.get("/thong-tin/:slug", function (req, res, next) {
  var page = informationPages[req.params.slug];
  if (!page) return next();
  if (req.params.slug === "gioi-thieu") {
    return res.render("site/gioi-thieu");
  }
  res.render("site/thong-tin", { page: page });
});

module.exports = router;
