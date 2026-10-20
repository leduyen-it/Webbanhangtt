// E:\NNKichBan_CuoiKy\helmet_store\routes\product.js
var express = require("express");
var router = express.Router();
var modelProduct = require("../models/model_product"); //nhúng model products vào controller này để sử dụng
var modelCatalog = require("../models/model_catalog");
var modelWishlist = require("../models/model_wishlist");
var modelReview = require("../models/model_review");
var modelReview = require("../models/model_review");

var breadcrumb = "Tất cả sản phẩm";

router.get("/", async function (req, res) {
  try {
    let listPro = await modelProduct.list(); //cách gọi hàm trong model, để có dữ liệu từ db
    let listProPopular = await modelProduct.list();
    let listCat = await modelCatalog.list();

    console.log("Product route - listCat:", listCat.length, listCat);

    const search = (req.query.search || "").trim();
    const priceRange = req.query.priceRange || "";
    const sortOrder = req.query.sort || "";

    let breadcrumbParts = [];

    // Search filter
    if (search) {
      const s = search.toLowerCase();
      listPro = listPro.filter((p) =>
        (p.nameProduct || "").toLowerCase().includes(s)
      );
      breadcrumbParts.push(`Tìm kiếm: ${search}`);
    }

    // Price range filter
    if (priceRange) {
      let priceText = "";
      switch (priceRange) {
        case "0-500000":
          listPro = listPro.filter(
            (p) => p.priceProduct >= 0 && p.priceProduct <= 500000
          );
          priceText = "0 ₫ - 500.000 ₫";
          break;
        case "500000-1000000":
          listPro = listPro.filter(
            (p) => p.priceProduct > 500000 && p.priceProduct <= 1000000
          );
          priceText = "500.000 ₫ - 1.000.000 ₫";
          break;
        case "1000000-2000000":
          listPro = listPro.filter(
            (p) => p.priceProduct > 1000000 && p.priceProduct <= 2000000
          );
          priceText = "1.000.000 ₫ - 2.000.000 ₫";
          break;
        case "2000000-5000000":
          listPro = listPro.filter(
            (p) => p.priceProduct > 2000000 && p.priceProduct <= 5000000
          );
          priceText = "2.000.000 ₫ - 5.000.000 ₫";
          break;
        case "5000000-up":
          listPro = listPro.filter((p) => p.priceProduct > 5000000);
          priceText = "Trên 5.000.000 ₫";
          break;
      }
      if (priceText) breadcrumbParts.push(priceText);
    }

    // Sort by price
    if (sortOrder === "asc") {
      listPro.sort((a, b) => a.priceProduct - b.priceProduct);
      breadcrumbParts.push("Giá tăng dần");
    } else if (sortOrder === "desc") {
      listPro.sort((a, b) => b.priceProduct - a.priceProduct);
      breadcrumbParts.push("Giá giảm dần");
    }

    // Build final breadcrumb
    const breadcrumb =
      breadcrumbParts.length > 0
        ? breadcrumbParts.join(" • ")
        : "Tất cả sản phẩm";

    // Get user wishlist IDs for displaying heart states
    let userWishlistIds = [];
    if (req.session.User) {
      try {
        userWishlistIds = await modelWishlist.getUserWishlistIds(req.session.User.id);
        console.log("Product route - User ID:", req.session.User.id);
        console.log("Product route - userWishlistIds:", userWishlistIds);
      } catch (error) {
        console.log("Error getting wishlist IDs:", error);
        userWishlistIds = [];
      }
    } else {
      console.log("Product route - No user session");
    }

    res.render("site/san-pham", {
      listPro: listPro,
      listCat: listCat,
      listProPopular: listProPopular,
      breadcrumb,
      currentPriceRange: priceRange,
      currentSort: sortOrder,
      userWishlistIds: userWishlistIds,
    });
  } catch (err) {
    console.error("Product list error:", err);
    res
      .status(500)
      .render("error", { message: "Lỗi khi tải danh sách sản phẩm" });
  }
});
router.get("/addnew", function (req, res, next) {
  res.render("product_addnew"); // hiển thị form cho client nhập data
});
router.get("/:name", async function (req, res) {
  try {
    // Decode URL-encoded characters (e.g., %C4%91 -> đ)
    let name = decodeURIComponent(req.params.name);
    console.log("========== PRODUCT ROUTE DEBUG ==========");
    console.log("Requested URL slug (after decode):", name);
    let listProAll = await modelProduct.list();
    let listCat = await modelCatalog.list();

    let newItemPro = null;
    for (itemPro of listProAll) {
      var newNamePro = itemPro.nameProduct;
      breadcrumb = newNamePro;
      newNamePro = replaceNameProduct(itemPro.nameProduct).toLowerCase();
      console.log(`Product: "${itemPro.nameProduct}" -> slug: "${newNamePro}"`);
      if (newNamePro == name) {
        console.log("✓ MATCH FOUND!");
        newItemPro = itemPro;
        break;
      }
    }
    if (!newItemPro) {
      console.log("✗ NO MATCH - Product not found");
    }
    console.log("========================================");
    if (!newItemPro) {
      // product not found -> show 404 friendly page
      const notFoundError = new Error("Sản phẩm không tồn tại");
      notFoundError.status = 404;
      return res
        .status(404)
        .render("error", { message: "Sản phẩm không tồn tại", error: notFoundError });
    }

    let listComment = await modelProduct.getComment(newItemPro.idProduct);
    
    // Kiểm tra trạng thái đăng nhập và đã mua hàng
    let canReview = false;
    let hasReviewed = false;
    let userPurchased = false;
    
    if (req.session.User) {
      try {
        userPurchased = await modelReview.checkUserPurchased(req.session.User.id, newItemPro.idProduct);
        hasReviewed = await modelReview.checkUserReviewed(req.session.User.id, newItemPro.idProduct);
        canReview = userPurchased && !hasReviewed;
      } catch (error) {
        console.error('Error checking review status:', error);
      }
    }
    
    // Lấy danh sách sản phẩm yêu thích của user nếu đã đăng nhập
    let userWishlistIds = [];
    if (req.session.User) {
      try {
        userWishlistIds = await modelWishlist.getUserWishlistIds(req.session.User.id);
      } catch (error) {
        console.error('Error getting wishlist IDs:', error);
        userWishlistIds = [];
      }
    }
    
    // Giới hạn chỉ hiển thị 8 sản phẩm ngẫu nhiên để tránh slider quá lớn
    let listPro = listProAll
      .filter(p => p.idProduct !== newItemPro.idProduct) // Loại bỏ sản phẩm hiện tại
      .sort(() => 0.5 - Math.random()) // Shuffle ngẫu nhiên
      .slice(0, 8); // Chỉ lấy 8 sản phẩm
    
    res.render("site/chi-tiet-san-pham", {
      itemPro: newItemPro,
      listCat: listCat,
      listPro: listPro,
      listComment: listComment,
      breadcrumb,
      userWishlistIds: userWishlistIds,
      user: req.session.User,
      wishlistCount: req.session.wishlistCount || 0,
      cartCount: req.session.cartCount || 0,
      canReview: canReview,
      hasReviewed: hasReviewed,
      userPurchased: userPurchased,
      reviewSubmitted: req.query.review === "success"
    });
  } catch (error) {
    console.error('Error loading product detail:', error);
    error.status = error.status || 500;
    res.status(500).render("error", { 
      message: "Lỗi khi tải chi tiết sản phẩm",
      error: error
    });
  }
});

// API
router.get("/api/hot-product", async function (req, res) {
  let data = await modelProduct.hotProduct();
  res.json(data);
});
router.get("/api/new-product", async function (req, res) {
  let data = await modelProduct.newProduct();
  res.json(data);
});
router.get("/api/chi-tiet-san-pham/:name", async function (req, res) {
  let name = req.params.name;
  console.log(name);
  let data = await modelProduct.detailByName(name);
  console.log(data);
  res.json(data);
});

router.get("/api/comment/:id", async function (req, res) {
  let idProduct = req.params.id;
  let data = await modelProduct.getComment(idProduct);
  res.json(data);
});
router.post("/comment/createcomment", async function (req, res) {
  let rating = req.body.star;
  let content = req.body.content;
  let idProduct = req.body.idProduct;
  let nameProduct = req.body.nameProduct;
  
  // Kiểm tra đăng nhập
  if (!req.session.User) {
    return res.json({
      success: false,
      message: "Bạn cần đăng nhập để đánh giá sản phẩm!"
    });
  }
  
  const idUser = req.session.User.id;
  const ten = req.session.User.ho + ' ' + req.session.User.ten;
  const email = req.session.User.email;
  
  try {
    // Kiểm tra đã mua hàng
    const userPurchased = await modelReview.checkUserPurchased(idUser, idProduct);
    if (!userPurchased) {
      return res.json({
        success: false,
        message: "Bạn cần mua sản phẩm này trước khi đánh giá!"
      });
    }
    
    // Kiểm tra đã đánh giá chưa
    const hasReviewed = await modelReview.checkUserReviewed(idUser, idProduct);
    if (hasReviewed) {
      return res.json({
        success: false,
        message: "Bạn đã đánh giá sản phẩm này rồi!"
      });
    }
    
    // Thêm đánh giá
    const reviewData = {
      idUser: idUser,
      idProduct: idProduct,
      content: content,
      rating: rating,
      ten: ten,
      email: email
    };
    
    await modelReview.addReview(reviewData);
    
    // Chuyển hướng về trang sản phẩm
    const newName = replaceNameProduct(nameProduct).toLowerCase();
    res.redirect(`/san-pham/${newName}?review=success#reviews`);
    
  } catch (error) {
    console.error('Error creating review:', error);
    res.json({
      success: false,
      message: "Có lỗi xảy ra khi đánh giá. Vui lòng thử lại!"
    });
  }
});

function xoa_dau(str) {
  str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
  str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
  str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
  str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
  str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
  str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
  str = str.replace(/đ/g, "d");
  str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, "A");
  str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, "E");
  str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, "I");
  str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, "O");
  str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, "U");
  str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, "Y");
  str = str.replace(/Đ/g, "D");
  str = str.split(" ").join("-");
  return str;
}

function replaceNameProduct(nameProduct) {
  var newNameProduct = xoa_dau(nameProduct);
  return newNameProduct;
}

module.exports = router;
