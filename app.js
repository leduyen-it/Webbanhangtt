// Load environment variables
require('dotenv').config();

var createError = require("http-errors");
var express = require("express");
var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");
var session = require("express-session");
var nodemailer = require("nodemailer");
var ejs = require("ejs");

var indexRouter = require("./routes/index");
var usersRouter = require("./routes/users");
var catalogRouter = require("./routes/catalog");
var productRouter = require("./routes/product");
var cartRouter = require("./routes/cart");
var wishlistRouter = require("./routes/wishlist");
var ordersRouter = require("./routes/orders");
var adminRouter = require("./routes/admin");
var vnpayRouter = require("./routes/vnpay");
var chatRouter = require("./routes/chat");

var app = express();

// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
app.use(
/*  session({
    secret: "abcdefg",
    resave: true,
    saveUninitialized: true,
    cookie: { maxAge: 1200000 },
  })
);*/
app.set("trust proxy", 1);

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1200000,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
  })
);

// Expose slug helper to all views
app.use(function (req, res, next) {
  function xoa_dau(str) {
    if (!str) return "";
    str = str.toString();
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
    return str.split(" ").join("-").toLowerCase();
  }
  res.locals.slug = function (name) {
    return xoa_dau(name);
  };
  next();
});

// Add cart and wishlist counts to all views
var modelCart = require("./models/model_cart");
var modelWishlist = require("./models/model_wishlist");

app.use(async function (req, res, next) {
  try {
    // Make user available to all views
    res.locals.user = req.session.User || null;

    if (req.session.User) {
      res.locals.cartCount = await modelCart.getCartCount(req.session.User.id);
      res.locals.wishlistCount = await modelWishlist.getWishlistCount(
        req.session.User.id
      );
    } else {
      res.locals.cartCount = 0;
      res.locals.wishlistCount = 0;
    }
  } catch (error) {
    console.error("Error getting counts:", error);
    res.locals.cartCount = 0;
    res.locals.wishlistCount = 0;
  }
  next();
});

app.use(function (req, res, next) {
  var render = res.render;
  res.render = function (view, options, callback) {
    var viewName = typeof view === "string" ? view : "";
    var isPublicView =
      viewName.startsWith("site/") ||
      (viewName === "error" && !req.path.startsWith("/admin"));
    if (
      !isPublicView ||
      typeof callback === "function" ||
      typeof options === "function"
    ) {
      return render.apply(this, arguments);
    }

    var response = this;
    return render.call(this, view, options, function (error, html) {
      if (error) return next(error);

      ejs.renderFile(
        path.join(__dirname, "views", "site", "chatbox.ejs"),
        {
          aiConfigured:
            typeof process.env.OPENAI_API_KEY === "string" &&
            Boolean(process.env.OPENAI_API_KEY.trim()),
        },
        function (chatError, chatbox) {
          if (chatError) return next(chatError);
          var closingBody = /<\/body\s*>/i;
          var output = closingBody.test(html)
            ? html.replace(closingBody, chatbox + "</body>")
            : html + chatbox;
          response.send(output);
        }
      );
    });
  };
  next();
});

app.use("/api/chat", chatRouter);
app.use("/", indexRouter);
app.use("/admin", adminRouter);
app.use("/users", usersRouter);
app.use("/danh-muc", catalogRouter);
app.use("/san-pham", productRouter);
app.use("/cart", cartRouter);
app.use("/wishlist", wishlistRouter);
app.use("/orders", ordersRouter);
app.use("/vnpay", vnpayRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render("error");
});

module.exports = app;
