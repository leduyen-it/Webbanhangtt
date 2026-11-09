var express = require("express");
var router = express.Router();
var db = require("../models/database");
var { isAdmin } = require("../middleware/auth");
var ejs = require("ejs");
var path = require("path");
var multer = require("multer");
var fs = require("fs");
var nodemailer = require("nodemailer");

// Cấu hình multer để upload ảnh
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, "../public/img");
    // Tạo thư mục nếu chưa tồn tại
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    // Tạo tên file unique với timestamp
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
    );
  },
});

const upload = multer({
  storage: storage,
  fileFilter: function (req, file, cb) {
    // Chỉ cho phép upload ảnh
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Chỉ được upload file ảnh!"), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // Giới hạn 5MB
  },
});

// Helper function để render admin views với layout
function renderWithLayout(res, viewPath, data = {}) {
  const layoutPath = path.join(__dirname, "../views/admin/layout.ejs");
  const contentPath = path.join(__dirname, "../views/", viewPath + ".ejs");

  ejs.renderFile(contentPath, data, (err, content) => {
    if (err) {
      return res.status(500).send(err.message);
    }

    data.body = content;
    ejs.renderFile(layoutPath, data, (err, html) => {
      if (err) {
        return res.status(500).send(err.message);
      }
      res.send(html);
    });
  });
}

// Áp dụng middleware isAdmin cho tất cả routes admin
router.use(isAdmin);

const revenueCondition = (hasPaymentStatus) => {
  const paidConditions = [
    `(
      LOWER(COALESCE(o.paymentMethod, '')) = 'vnpay'
      AND LOWER(COALESCE(o.status, '')) IN ('paid', 'delivered', 'completed')
    )`,
    `(
      LOWER(COALESCE(o.paymentMethod, '')) = 'cod'
      AND LOWER(COALESCE(o.status, '')) IN ('delivered', 'completed')
    )`,
  ];
  if (hasPaymentStatus) {
    paidConditions.unshift(
      "LOWER(COALESCE(o.paymentStatus, '')) = 'paid'"
    );
  }

  return `(LOWER(COALESCE(o.status, '')) NOT IN ('cancelled', 'failed')
    AND (${paidConditions.join(" OR ")}))`;
};

function getDashboardPeriod(range, group) {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  let start;

  if (range === "7d") {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  } else if (range === "30d") {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
  } else {
    start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  }

  let periodExpression;
  if (group === "month") {
    periodExpression = "DATE_FORMAT(o.createdAt, '%Y-%m')";
  } else if (group === "year") {
    periodExpression = "DATE_FORMAT(o.createdAt, '%Y')";
  } else {
    periodExpression = "DATE_FORMAT(o.createdAt, '%Y-%m-%d')";
  }

  return { start, end, periodExpression };
}

function buildDashboardSeries(rows, start, end, group) {
  const totals = new Map(
    rows.map((row) => [String(row.period), Number(row.revenue) || 0])
  );
  const labels = [];
  const values = [];
  const cursor = new Date(start);

  while (cursor < end) {
    let key;
    if (group === "year") {
      key = String(cursor.getFullYear());
      cursor.setFullYear(cursor.getFullYear() + 1, 0, 1);
    } else if (group === "month") {
      key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
      cursor.setMonth(cursor.getMonth() + 1, 1);
    } else {
      key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
      cursor.setDate(cursor.getDate() + 1);
    }

    labels.push(key);
    values.push(totals.get(key) || 0);
  }

  return { labels, values };
}

async function getDashboardStats() {
  const columns = await db.query("SHOW COLUMNS FROM orders");
  const hasPaymentStatus = columns.some(
    (column) => column.Field === "paymentStatus"
  );
  const eligibleRevenue = revenueCondition(hasPaymentStatus);
  const [products, users, orders, revenue, statuses, recentOrders] =
    await Promise.all([
      db.query("SELECT COUNT(*) AS total FROM product"),
      db.query(
        "SELECT COUNT(*) AS total FROM user WHERE LOWER(role) = 'customer'"
      ),
      db.query(
        "SELECT COUNT(*) AS total FROM orders WHERE LOWER(COALESCE(status, '')) != 'cancelled'"
      ),
      db.query(
        `SELECT COALESCE(SUM(o.totalAmount), 0) AS total
         FROM orders o
         WHERE ${eligibleRevenue}`
      ),
      db.query(
        `SELECT status, COUNT(*) AS total
         FROM orders
         GROUP BY status
         ORDER BY total DESC, status`
      ),
      db.query(
        `SELECT o.idOrder, o.totalAmount, o.status, o.paymentMethod, o.createdAt,
                u.username,
                COUNT(oi.idOrderItem) AS itemCount,
                GROUP_CONCAT(DISTINCT p.nameProduct ORDER BY p.nameProduct SEPARATOR ', ') AS productNames
         FROM orders o
         LEFT JOIN user u ON u.idUser = o.idUser
         LEFT JOIN order_items oi ON oi.idOrder = o.idOrder
         LEFT JOIN product p ON p.idProduct = oi.idProduct
         GROUP BY o.idOrder
         ORDER BY o.createdAt DESC, o.idOrder DESC
         LIMIT 8`
      ),
    ]);

  return {
    stats: {
      totalProducts: Number(products[0].total) || 0,
      totalUsers: Number(users[0].total) || 0,
      totalOrders: Number(orders[0].total) || 0,
      totalRevenue: Number(revenue[0].total) || 0,
    },
    statuses,
    recentOrders,
    eligibleRevenue,
  };
}

async function getDashboardRevenue(range, group, eligibleRevenue) {
  const period = getDashboardPeriod(range, group);
  const rows = await db.query(
    `SELECT ${period.periodExpression} AS period,
            COALESCE(SUM(o.totalAmount), 0) AS revenue
     FROM orders o
     WHERE o.createdAt >= ?
       AND o.createdAt < ?
       AND ${eligibleRevenue}
     GROUP BY period
     ORDER BY period`,
    [period.start, period.end]
  );

  return buildDashboardSeries(rows, period.start, period.end, group);
}

// Dashboard admin
router.get("/", async function (req, res, next) {
  try {
    const dashboard = await getDashboardStats();
    const revenueChart = await getDashboardRevenue(
      "30d",
      "day",
      dashboard.eligibleRevenue
    );

    renderWithLayout(res, "admin/index", {
      stats: dashboard.stats,
      statuses: dashboard.statuses,
      recentOrders: dashboard.recentOrders,
      revenueChart: revenueChart,
      user: req.session.User,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/api/dashboard/revenue", async function (req, res, next) {
  const ranges = ["7d", "30d", "12m"];
  const groups = ["day", "month", "year"];
  const range = req.query.range || "30d";
  const group = req.query.group || (range === "12m" ? "month" : "day");

  if (!ranges.includes(range) || !groups.includes(group)) {
    return res.status(400).json({
      success: false,
      message: "Khoảng thời gian hoặc cách nhóm dữ liệu không hợp lệ.",
    });
  }

  try {
    const columns = await db.query("SHOW COLUMNS FROM orders");
    const eligibleRevenue = revenueCondition(
      columns.some((column) => column.Field === "paymentStatus")
    );
    const series = await getDashboardRevenue(range, group, eligibleRevenue);
    res.json({ success: true, range, group, ...series });
  } catch (err) {
    next(err);
  }
});

function parseReportDate(value, fieldName) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${fieldName} không hợp lệ.`);
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error(`${fieldName} không hợp lệ.`);
  }
  return date;
}

function reportDateValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseReportPeriod(query, prefix = "") {
  const startValue = query[prefix ? `${prefix}StartDate` : "startDate"];
  const endValue = query[prefix ? `${prefix}EndDate` : "endDate"];
  const monthValue = query[prefix ? `${prefix}Month` : "month"];
  const yearValue = query[prefix ? `${prefix}Year` : "year"];
  const hasDateRange = Boolean(startValue || endValue);
  const hasCalendarPeriod = Boolean(monthValue || yearValue);

  if (hasDateRange && hasCalendarPeriod) {
    throw new Error("Chọn khoảng ngày hoặc tháng/năm, không chọn đồng thời.");
  }

  let start;
  let endInclusive;
  if (hasDateRange) {
    if (!startValue || !endValue) {
      throw new Error("Vui lòng chọn đủ ngày bắt đầu và ngày kết thúc.");
    }
    start = parseReportDate(startValue, "Ngày bắt đầu");
    endInclusive = parseReportDate(endValue, "Ngày kết thúc");
  } else if (monthValue || yearValue) {
    const now = new Date();
    const year = yearValue ? Number(yearValue) : now.getFullYear();
    const month = monthValue ? Number(monthValue) : null;
    if (!Number.isInteger(year) || year < 1900 || year > 2100) {
      throw new Error("Năm báo cáo không hợp lệ.");
    }
    if (month !== null && (!Number.isInteger(month) || month < 1 || month > 12)) {
      throw new Error("Tháng báo cáo không hợp lệ.");
    }
    start = month
      ? new Date(year, month - 1, 1)
      : new Date(year, 0, 1);
    endInclusive = month
      ? new Date(year, month, 0)
      : new Date(year, 11, 31);
  } else {
    const today = new Date();
    endInclusive = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    start = new Date(endInclusive);
    start.setDate(start.getDate() - 29);
  }

  if (endInclusive < start) {
    throw new Error("Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.");
  }
  const endExclusive = new Date(endInclusive);
  endExclusive.setDate(endExclusive.getDate() + 1);

  return {
    start,
    endInclusive,
    endExclusive,
    startValue: reportDateValue(start),
    endValue: reportDateValue(endInclusive),
  };
}

function buildReportWhere(period, filters, alias = "o") {
  const clauses = [`${alias}.createdAt >= ?`, `${alias}.createdAt < ?`];
  const params = [period.start, period.endExclusive];

  if (filters.status) {
    clauses.push(`LOWER(COALESCE(${alias}.status, '')) = LOWER(?)`);
    params.push(filters.status);
  }
  if (filters.paymentMethod) {
    clauses.push(`LOWER(COALESCE(${alias}.paymentMethod, '')) = LOWER(?)`);
    params.push(filters.paymentMethod);
  }
  return { sql: clauses.join(" AND "), params };
}

async function loadRevenueReport(query) {
  const reportPeriod = parseReportPeriod(query);
  const comparePeriod =
    query.compareStartDate || query.compareEndDate
      ? parseReportPeriod(query, "compare")
      : null;
  const view = query.view === "day" ? "day" : "order";
  const columns = await db.query("SHOW COLUMNS FROM orders");
  const columnNames = new Set(columns.map((column) => column.Field));
  const hasPaymentStatus = columnNames.has("paymentStatus");
  const eligibleRevenue = revenueCondition(hasPaymentStatus);
  const statuses = await db.query(
    "SELECT DISTINCT status FROM orders WHERE status IS NOT NULL AND status != '' ORDER BY status"
  );
  const paymentMethods = await db.query(
    "SELECT DISTINCT paymentMethod FROM orders WHERE paymentMethod IS NOT NULL AND paymentMethod != '' ORDER BY paymentMethod"
  );

  const filters = {
    status: typeof query.status === "string" ? query.status : "",
    paymentMethod:
      typeof query.paymentMethod === "string" ? query.paymentMethod : "",
  };
  if (filters.status && !statuses.some((row) => row.status === filters.status)) {
    throw new Error("Trạng thái đơn hàng được chọn không hợp lệ.");
  }
  if (
    filters.paymentMethod &&
    !paymentMethods.some((row) => row.paymentMethod === filters.paymentMethod)
  ) {
    throw new Error("Phương thức thanh toán được chọn không hợp lệ.");
  }

  const reportWhere = buildReportWhere(reportPeriod, filters);
  const summarySql = `SELECT COUNT(*) AS orderCount,
      COALESCE(SUM(o.totalAmount), 0) AS grossAmount,
      COALESCE(SUM(CASE WHEN ${eligibleRevenue} THEN o.totalAmount ELSE 0 END), 0) AS recognizedRevenue
    FROM orders o
    WHERE ${reportWhere.sql}`;
  const detailColumns = [
    "o.idOrder",
    "o.createdAt",
    "o.status",
    "o.paymentMethod",
    "o.totalAmount",
  ];

  const detailSql =
    view === "day"
      ? `SELECT DATE_FORMAT(o.createdAt, '%Y-%m-%d') AS reportDate,
           COUNT(*) AS orderCount,
           COALESCE(SUM(o.totalAmount), 0) AS grossAmount,
           COALESCE(SUM(CASE WHEN ${eligibleRevenue} THEN o.totalAmount ELSE 0 END), 0) AS recognizedRevenue
         FROM orders o
         WHERE ${reportWhere.sql}
         GROUP BY reportDate
         ORDER BY reportDate DESC`
      : `SELECT ${detailColumns.join(", ")},
           CASE WHEN ${eligibleRevenue} THEN o.totalAmount ELSE 0 END AS recognizedRevenue
         FROM orders o
         WHERE ${reportWhere.sql}
         ORDER BY o.createdAt DESC, o.idOrder DESC`;
  const [summaryRows, rows, comparisonRows] = await Promise.all([
    db.query(summarySql, reportWhere.params),
    db.query(detailSql, reportWhere.params),
    comparePeriod
      ? (() => {
          const comparisonWhere = buildReportWhere(comparePeriod, filters);
          return db.query(summarySql, comparisonWhere.params);
        })()
      : Promise.resolve(null),
  ]);

  const summary = summaryRows[0] || {};
  const comparison = comparisonRows
    ? comparisonRows[0] || {}
    : null;

  const recognizedRevenue = Number(summary.recognizedRevenue) || 0;
  const comparisonRevenue = comparison
    ? Number(comparison.recognizedRevenue) || 0
    : null;
  const difference =
    comparisonRevenue === null ? null : recognizedRevenue - comparisonRevenue;
  const percentage =
    comparisonRevenue === null || comparisonRevenue === 0
      ? null
      : (difference / comparisonRevenue) * 100;

  return {
    period: reportPeriod,
    comparePeriod,
    selection: {
      startDate:
        query.startDate || (!query.month && !query.year ? reportPeriod.startValue : ""),
      endDate:
        query.endDate || (!query.month && !query.year ? reportPeriod.endValue : ""),
      month: query.month || "",
      year: query.year || "",
      compareStartDate: query.compareStartDate || "",
      compareEndDate: query.compareEndDate || "",
    },
    filters,
    view,
    rows,
    statuses: statuses.map((row) => row.status),
    paymentMethods: paymentMethods.map((row) => row.paymentMethod),
    summary: {
      orderCount: Number(summary.orderCount) || 0,
      grossAmount: Number(summary.grossAmount) || 0,
      recognizedRevenue,
    },
    comparison:
      comparison === null
        ? null
        : {
            orderCount: Number(comparison.orderCount) || 0,
            recognizedRevenue: comparisonRevenue,
            difference,
            percentage,
          },
  };
}

router.get("/revenue-reports", async function (req, res, next) {
  try {
    const report = await loadRevenueReport(req.query);
    renderWithLayout(res, "admin/revenue-reports", {
      report,
      user: req.session.User,
    });
  } catch (err) {
    if (err instanceof Error && /không hợp lệ|Vui lòng|Chọn khoảng|Ngày kết thúc/i.test(err.message)) {
      return res.status(400).send(err.message);
    }
    next(err);
  }
});

// Quản lý sản phẩm
router.get("/products", function (req, res, next) {
  let sql =
    "SELECT p.*, c.nameCat FROM product p LEFT JOIN catalog c ON p.idCat = c.idCat";
  db.query(sql, (err, products) => {
    if (err) return next(err);
    renderWithLayout(res, "admin/products", {
      products: products,
      user: req.session.User,
    });
  });
});

// Thêm sản phẩm mới
router.get("/products/add", function (req, res, next) {
  db.query("SELECT * FROM catalog", (err, categories) => {
    if (err) return next(err);
    renderWithLayout(res, "admin/product-add", {
      categories: categories,
      user: req.session.User,
    });
  });
});

router.post(
  "/products/add",
  upload.single("imgProduct"),
  function (req, res, next) {
    const nameProduct =
      typeof req.body.nameProduct === "string" ? req.body.nameProduct.trim() : "";
    const priceProduct = Number(req.body.priceProduct);
    const idCat = Number(req.body.idCat);
    const amountProduct = Number(req.body.amountProduct);
    const submittedSizes = Array.isArray(req.body.sizes)
      ? req.body.sizes
      : [req.body.sizes].filter(Boolean);
    const availableSizes = new Set(
      submittedSizes.filter((size) => ["S", "M", "L"].includes(size))
    );
    const specification =
      typeof req.body.specification === "string"
        ? req.body.specification.trim()
        : "";
    const desProduct =
      typeof req.body.desProduct === "string" ? req.body.desProduct.trim() : "";

    if (!nameProduct || nameProduct.length > 50) {
      return res.status(400).send("Tên sản phẩm phải có từ 1 đến 50 ký tự.");
    }
    if (!Number.isFinite(priceProduct) || priceProduct < 0) {
      return res.status(400).send("Giá sản phẩm không hợp lệ.");
    }
    if (!Number.isSafeInteger(idCat) || idCat <= 0) {
      return res.status(400).send("Vui lòng chọn danh mục hợp lệ.");
    }
    if (
      !Number.isSafeInteger(amountProduct) ||
      amountProduct < 0 ||
      amountProduct > 999999
    ) {
      return res.status(400).send("Số lượng tồn kho không hợp lệ.");
    }
    if (!availableSizes.size) {
      return res.status(400).send("Vui lòng chọn ít nhất một kích cỡ.");
    }

    let sql =
      "INSERT INTO product (nameProduct, amountProduct, S, M, L, priceProduct, desProduct, specification, idCat, imgProduct, showHide) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)";
    db.query(
      sql,
      [
        nameProduct,
        amountProduct,
        availableSizes.has("S") ? 1 : 0,
        availableSizes.has("M") ? 1 : 0,
        availableSizes.has("L") ? 1 : 0,
        priceProduct,
        desProduct || null,
        specification || null,
        idCat,
        req.file ? `img/${req.file.filename}` : null,
      ],
      (err, result) => {
        if (err) return next(err);
        res.redirect("/admin/products?success=add");
      }
    );
  }
);

// Sửa sản phẩm
router.get("/products/edit/:id", function (req, res, next) {
  let productId = req.params.id;
  db.query(
    "SELECT * FROM product WHERE idProduct = ?",
    [productId],
    (err, product) => {
      if (err) throw err;
      db.query("SELECT * FROM catalog", (err, categories) => {
        if (err) throw err;
        renderWithLayout(res, "admin/product-edit", {
          product: product[0],
          categories: categories,
          user: req.session.User,
        });
      });
    }
  );
});

router.post(
  "/products/edit/:id",
  upload.single("imgProduct"),
  function (req, res, next) {
    let productId = req.params.id;
    let { nameProduct, priceProduct, desProduct, specification, idCat } = req.body;

    // Nếu có file mới được upload
    if (req.file) {
      let imgProduct = `img/${req.file.filename}`;
      let sql =
        "UPDATE product SET nameProduct = ?, priceProduct = ?, desProduct = ?, specification = ?, idCat = ?, imgProduct = ? WHERE idProduct = ?";
      db.query(
        sql,
        [nameProduct, priceProduct, desProduct, specification, idCat, imgProduct, productId],
        (err, result) => {
          if (err) throw err;
          res.redirect("/admin/products?success=edit");
        }
      );
    } else {
      // Không có file mới, chỉ update các field khác
      let sql =
        "UPDATE product SET nameProduct = ?, priceProduct = ?, desProduct = ?, specification = ?, idCat = ? WHERE idProduct = ?";
      db.query(
        sql,
        [nameProduct, priceProduct, desProduct, specification, idCat, productId],
        (err, result) => {
          if (err) throw err;
          res.redirect("/admin/products?success=edit");
        }
      );
    }
  }
);

// Xóa sản phẩm
router.post("/products/delete/:id", function (req, res, next) {
  let productId = req.params.id;
  db.query(
    "DELETE FROM product WHERE idProduct = ?",
    [productId],
    (err, result) => {
      if (err) throw err;
      res.redirect("/admin/products?success=delete");
    }
  );
});

// Quản lý đơn hàng và lọc các đơn thanh toán qua VNPay
router.get("/orders", async function (req, res, next) {
  const requestedPaymentMethod = req.query.paymentMethod;
  if (requestedPaymentMethod && requestedPaymentMethod !== "VNPAY") {
    return res.status(400).send("Phương thức thanh toán không hợp lệ");
  }

  const paymentFilter = requestedPaymentMethod || "ALL";
  const paymentCondition =
    paymentFilter === "VNPAY"
      ? "WHERE UPPER(COALESCE(o.paymentMethod, '')) = ?"
      : "";
  const params = paymentFilter === "VNPAY" ? ["VNPAY"] : [];
  const sql = `SELECT o.*, u.username, u.ho, u.ten
               FROM orders o
               LEFT JOIN user u ON o.idUser = u.idUser
               ${paymentCondition}
               ORDER BY o.createdAt DESC`;

  try {
    const orders = await db.query(sql, params);
    const message = req.session.message;
    delete req.session.message;

    renderWithLayout(res, "admin/orders", {
      orders,
      paymentFilter,
      user: req.session.User,
      message,
    });
  } catch (err) {
    next(err);
  }
});

// Chi tiết đơn hàng
router.get("/orders/:id", async function (req, res, next) {
  try {
    const modelOrder = require("../models/model_order");
    const orderId = req.params.id;

    // Lấy chi tiết đơn hàng bằng model
    const order = await modelOrder.getOrderDetails(orderId);

    if (!order) {
      return res.status(404).render("error", {
        message: "Không tìm thấy đơn hàng",
        error: { status: 404, stack: "" },
      });
    }

    // Render template admin order-detail
    res.render("admin/order-detail", {
      order: order,
      user: req.session.User,
    });
  } catch (error) {
    console.error("Admin order detail error:", error);
    res.status(500).render("error", {
      message: "Lỗi khi tải chi tiết đơn hàng",
      error: { status: 500, stack: error.stack },
    });
  }
});

// Cập nhật trạng thái đơn hàng
router.post(
  "/orders/:id/update-status",
  isAdmin,
  async function (req, res, next) {
    try {
      const modelOrder = require("../models/model_order");
      const orderId = req.params.id;
      const { status } = req.body;

      console.log("=== UPDATE ORDER STATUS ===");
      console.log("Order ID:", orderId);
      console.log("New Status:", status);
      console.log("Request body:", req.body);

      // Lấy thông tin đơn hàng hiện tại để kiểm tra trạng thái
      const currentOrder = await modelOrder.getOrderDetails(orderId);
      if (!currentOrder) {
        req.session.message = {
          type: "error",
          text: "Không tìm thấy đơn hàng",
        };
        return res.redirect("/admin/orders");
      }

      // Định nghĩa thứ tự trạng thái (không được chuyển ngược)
      const statusOrder = [
        "pending",
        "confirmed",
        "preparing",
        "shipping",
        "delivered",
      ];
      const currentStatusIndex = statusOrder.indexOf(currentOrder.status);
      const newStatusIndex = statusOrder.indexOf(status);

      // Kiểm tra không cho phép chuyển ngược (trừ trường hợp hủy)
      if (status !== "cancelled" && currentOrder.status !== "cancelled") {
        if (newStatusIndex < currentStatusIndex) {
          req.session.message = {
            type: "error",
            text: `Không thể chuyển trạng thái từ "${getStatusText(
              currentOrder.status
            )}" về "${getStatusText(status)}"`,
          };
          return res.redirect("/admin/orders");
        }
      }

      // Không cho phép thay đổi nếu đã hủy hoặc đã giao
      if (currentOrder.status === "cancelled") {
        req.session.message = {
          type: "error",
          text: "Không thể thay đổi trạng thái đơn hàng đã hủy",
        };
        return res.redirect("/admin/orders");
      }

      if (currentOrder.status === "delivered" && status !== "delivered") {
        req.session.message = {
          type: "error",
          text: "Không thể thay đổi trạng thái đơn hàng đã giao",
        };
        return res.redirect("/admin/orders");
      }

      // Cập nhật trạng thái đơn hàng
      await modelOrder.updateOrderStatus(orderId, status);

      req.session.message = {
        type: "success",
        text: `Cập nhật trạng thái đơn hàng #${orderId} thành "${getStatusText(
          status
        )}" thành công!`,
      };
      res.redirect("/admin/orders");
    } catch (error) {
      console.error("Update order status error:", error);
      req.session.message = {
        type: "error",
        text:
          "Có lỗi xảy ra khi cập nhật trạng thái đơn hàng: " + error.message,
      };
      res.redirect("/admin/orders");
    }
  }
);

// Helper function để lấy text hiển thị của trạng thái
function getStatusText(status) {
  const statusMap = {
    pending: "Chờ xác nhận",
    confirmed: "Đã xác nhận",
    preparing: "Đang chuẩn bị",
    shipping: "Đang giao",
    delivered: "Đã giao",
    cancelled: "Đã hủy",
  };
  return statusMap[status] || status;
}

// Quản lý người dùng
router.get("/users", function (req, res, next) {
  let sql = "SELECT * FROM user ORDER BY idUser DESC";
  db.query(sql, (err, users) => {
    if (err) throw err;
    renderWithLayout(res, "admin/users", {
      users: users,
      user: req.session.User,
    });
  });
});

// Quản lý đánh giá sản phẩm
router.get("/reviews", async function (req, res, next) {
  try {
    const reviews = await db.query(`
      SELECT c.idComment, c.idUser, c.content, c.ten, c.email, c.date, c.rating,
             c.idProduct, p.nameProduct, u.username
      FROM comment c
      LEFT JOIN product p ON p.idProduct = c.idProduct
      LEFT JOIN user u ON u.idUser = c.idUser
      ORDER BY c.date DESC, c.idComment DESC
    `);

    renderWithLayout(res, "admin/reviews", {
      reviews: reviews,
      user: req.session.User,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/messages", async function (req, res, next) {
  try {
    const messages = await db.query(
      `SELECT idMessage, senderName, senderEmail, subject, message, isRead, createdAt
       FROM contact_messages
       ORDER BY isRead ASC, createdAt DESC, idMessage DESC`
    );
    renderWithLayout(res, "admin/messages", {
      messages,
      updated: req.query.updated === "1",
      replySent: req.query.reply === "sent",
      replyError:
        req.query.reply === "error"
          ? "Không thể gửi email trả lời. Vui lòng kiểm tra cấu hình SMTP trong Render và thử lại."
          : "",
      user: req.session.User,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/messages/:id/reply", async function (req, res, next) {
  const messageId = Number(req.params.id);
  const replyText =
    typeof req.body.reply === "string" ? req.body.reply.trim() : "";
  if (!Number.isInteger(messageId) || messageId <= 0) {
    return res.status(400).send("Mã tin nhắn không hợp lệ");
  }
  if (!replyText || replyText.length > 5000) {
    return res.redirect("/admin/messages?reply=error");
  }

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  const smtpPort = Number(SMTP_PORT);
  if (
    !SMTP_HOST ||
    !SMTP_USER ||
    !SMTP_PASS ||
    !SMTP_FROM ||
    !Number.isInteger(smtpPort) ||
    smtpPort < 1 ||
    smtpPort > 65535
  ) {
    console.error("Contact reply email failed: SMTP configuration is incomplete");
    return res.redirect("/admin/messages?reply=error");
  }

  let contactMessage;
  try {
    const messages = await db.query(
      `SELECT senderName, senderEmail, subject
       FROM contact_messages
       WHERE idMessage = ?
       LIMIT 1`,
      [messageId]
    );
    contactMessage = messages[0];
  } catch (err) {
    return next(err);
  }
  if (!contactMessage) {
    return res.status(404).send("Không tìm thấy tin nhắn");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactMessage.senderEmail || "")) {
    console.error("Contact reply email failed: invalid recipient address");
    return res.redirect("/admin/messages?reply=error");
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: smtpPort,
    secure: smtpPort === 465,
    requireTLS: smtpPort === 587,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 30000,
  });
  try {
    await transporter.sendMail({
      from: SMTP_FROM,
      to: contactMessage.senderEmail,
      replyTo: SMTP_USER,
      subject: `Re: ${contactMessage.subject}`,
      text: `Xin chào ${contactMessage.senderName},\n\n${replyText}\n\nTrân trọng,\nHelmet Store`,
    });
  } catch (err) {
    console.error("Contact reply email failed:", err.code || "SMTP error");
    return res.redirect("/admin/messages?reply=error");
  }

  try {
    await db.query(
      "UPDATE contact_messages SET isRead = 1 WHERE idMessage = ?",
      [messageId]
    );
  } catch (err) {
    console.error(
      "Contact reply sent, but message read status update failed:",
      err.code || "database error"
    );
  }
  return res.redirect("/admin/messages?reply=sent");
});

router.post("/messages/:id/read", async function (req, res, next) {
  const messageId = Number(req.params.id);
  if (!Number.isInteger(messageId) || messageId <= 0) {
    return res.status(400).send("Mã tin nhắn không hợp lệ");
  }

  try {
    const result = await db.query(
      "UPDATE contact_messages SET isRead = 1 WHERE idMessage = ?",
      [messageId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).send("Không tìm thấy tin nhắn");
    }
    res.redirect("/admin/messages?updated=1");
  } catch (err) {
    next(err);
  }
});

router.post("/reviews/delete/:id", async function (req, res, next) {
  try {
    const reviewId = Number(req.params.id);
    if (!Number.isInteger(reviewId) || reviewId <= 0) {
      return res.status(400).send("Mã đánh giá không hợp lệ");
    }

    const result = await db.query(
      "DELETE FROM comment WHERE idComment = ?",
      [reviewId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).send("Không tìm thấy đánh giá");
    }

    res.redirect("/admin/reviews");
  } catch (err) {
    next(err);
  }
});

// Quản lý danh mục
router.get("/categories", function (req, res, next) {
  let sql = "SELECT * FROM catalog ORDER BY idCat DESC";
  db.query(sql, (err, categories) => {
    if (err) throw err;
    renderWithLayout(res, "admin/categories", {
      categories: categories,
      user: req.session.User,
    });
  });
});

// Thêm danh mục mới
router.post("/categories/add", function (req, res, next) {
  let { category_name } = req.body;
  let sql = "INSERT INTO catalog (nameCat) VALUES (?)";
  db.query(sql, [category_name], (err, result) => {
    if (err) throw err;
    res.redirect("/admin/categories");
  });
});

// Sửa danh mục
router.post("/categories/edit/:id", function (req, res, next) {
  let categoryId = req.params.id;
  let { category_name } = req.body;
  let sql = "UPDATE catalog SET nameCat = ? WHERE idCat = ?";
  db.query(sql, [category_name, categoryId], (err, result) => {
    if (err) throw err;
    res.redirect("/admin/categories");
  });
});

// Xóa danh mục
router.post("/categories/delete/:id", function (req, res, next) {
  let categoryId = req.params.id;
  db.query(
    "DELETE FROM catalog WHERE idCat = ?",
    [categoryId],
    (err, result) => {
      if (err) throw err;
      res.redirect("/admin/categories");
    }
  );
});

// Đăng xuất
router.get("/logout", function (req, res, next) {
  req.session.destroy();
  res.redirect("/users/dang-nhap");
});

module.exports = router;
