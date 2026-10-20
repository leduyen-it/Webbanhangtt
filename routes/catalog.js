// E:\NNKichBan_CuoiKy\helmet_store\routes\catalog.js
var express = require('express');
var router = express.Router();
var modelCatalog = require('../models/model_catalog.js'); //nhúng model catalog vào controller này để sử dụng
var modelProduct = require('../models/model_product.js');
var modelWishlist = require('../models/model_wishlist.js');
var message = '';

router.get('/:name', async function(req, res) {
  let name = req.params.name;
  console.log('Catalog route - name:', name);
  
  let listPro = await modelCatalog.listByName(name);
  console.log('Catalog route - listPro:', listPro.length, listPro);
  
  let listProPopular = await modelProduct.list();
  let listCat = await modelCatalog.list();
  let breadcrumb = name;
  
  // Lấy danh sách sản phẩm yêu thích của user nếu đã đăng nhập
  let userWishlistIds = [];
  if (req.session.User) {
    userWishlistIds = await modelWishlist.getUserWishlistIds(req.session.User.id);
  }
  
  res.render('site/san-pham-theo-loai', {
    listPro: listPro, 
    listCat: listCat, 
    listProPopular: listProPopular, 
    breadcrumb,
    userWishlistIds: userWishlistIds
  });
})

// API 
router.get('/api/:name', async function(req, res) {
  let name = req.params.name;
  let listPro = await modelCatalog.listByName(name);
  res.json(listPro);
})

module.exports = router;