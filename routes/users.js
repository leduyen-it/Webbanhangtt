// E:\NNKichBan_CuoiKy\helmet_store\routes\users.js
var express = require("express");
var router = express.Router();
var db = require("../models/database");
var modelUser = require("../models/model_user");
var modelUserAddress = require("../models/model_user_address");
var modelOrder = require("../models/model_order");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

// VALIDATION
// =======================
function validateEmail(email) {
  const re = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,10}$/;
  if (!email || typeof email !== "string") return "Email không được bỏ trống";
  if (!re.test(email.trim())) return "Email không hợp lệ";
  return null;
}

function normalizeAddressPhone(phone) {
  let normalized = String(phone || "").trim().replace(/[\s().-]/g, "");
  if (normalized.startsWith("+")) normalized = normalized.slice(1);
  if (/^84\d{9,10}$/.test(normalized)) {
    normalized = "0" + normalized.slice(2);
  } else if (/^\d{9}$/.test(normalized)) {
    normalized = "0" + normalized;
  }
  return normalized;
}

function validateUsername(username) {
  const re = /^[a-zA-Z0-9_]{3,20}$/;
  if (!username || typeof username !== "string")
    return "Username không được bỏ trống";
  if (!re.test(username.trim()))
    return "Username phải từ 3–20 ký tự và chỉ chứa chữ, số, dấu gạch dưới";
  return null;
}

function validatePassword(password) {
  if (!password || typeof password !== "string")
    return "Password không được bỏ trống";
  if (password.trim().length < 6) return "Password phải tối thiểu 6 ký tự";
  return null;
}

const PASSWORD_RESET_OTP_TTL_MS = 5 * 60 * 1000;
const PASSWORD_RESET_TOKEN_TTL_MS = 15 * 60 * 1000;
const PASSWORD_RESET_RESEND_WAIT_MS = 60 * 1000;
const PASSWORD_RESET_WINDOW_MS = 60 * 60 * 1000;
const PASSWORD_RESET_MAX_SENDS = 5;
const PASSWORD_RESET_MAX_ATTEMPTS = 5;

function getPasswordResetConfig() {
  const required = [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASS",
    "SMTP_FROM",
    "PASSWORD_RESET_SECRET",
  ];
  const missing = required.filter(
    (name) => !process.env[name] || !process.env[name].trim()
  );
  const port = Number(process.env.SMTP_PORT);

  if (process.env.SMTP_PORT && (!Number.isInteger(port) || port < 1 || port > 65535)) {
    return { error: "SMTP_PORT phải là số cổng hợp lệ." };
  }
  if (
    process.env.PASSWORD_RESET_SECRET &&
    Buffer.byteLength(process.env.PASSWORD_RESET_SECRET, "utf8") < 32
  ) {
    return {
      error: "PASSWORD_RESET_SECRET phải có ít nhất 32 byte ngẫu nhiên.",
    };
  }
  if (missing.length) {
    return {
      error: `Chưa cấu hình biến môi trường: ${missing.join(", ")}.`,
    };
  }

  return {
    host: process.env.SMTP_HOST,
    port,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM,
    secret: process.env.PASSWORD_RESET_SECRET,
  };
}

function hashPasswordResetValue(value, userId, purpose, secret) {
  return crypto
    .createHmac("sha256", secret)
    .update(`${purpose}:${userId}:${value}`)
    .digest("hex");
}

function safeHashEquals(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return (
    leftBuffer.length === rightBuffer.length &&
    leftBuffer.length > 0 &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function maskEmail(email) {
  const [localPart, domain] = String(email || "").split("@");
  if (!localPart || !domain) return "";
  return `${localPart.charAt(0)}${"*".repeat(Math.min(Math.max(localPart.length - 1, 3), 8))}@${domain}`;
}

function clearPasswordResetSession(session) {
  delete session.passwordResetChallenge;
  delete session.passwordResetToken;
  delete session.passwordResetTokenUserId;
}

function dbConnectionQuery(connection, sql, params = []) {
  return new Promise((resolve, reject) => {
    connection.query(sql, params, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}

function connectionTransaction(connection, method) {
  return new Promise((resolve, reject) => {
    connection[method]((err) => (err ? reject(err) : resolve()));
  });
}

async function withPasswordResetTransaction(callback) {
  const connection = await new Promise((resolve, reject) => {
    db.getConnection((err, activeConnection) => {
      if (err) return reject(err);
      resolve(activeConnection);
    });
  });

  try {
    await connectionTransaction(connection, "beginTransaction");
    const result = await callback(connection);
    await connectionTransaction(connection, "commit");
    return result;
  } catch (err) {
    try {
      await connectionTransaction(connection, "rollback");
    } catch (rollbackError) {
      console.error("Password reset transaction rollback failed:", rollbackError.code || "database error");
    }
    throw err;
  } finally {
    connection.release();
  }
}

async function issuePasswordResetOtp(userId, email, config) {
  const otp = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  const otpHash = hashPasswordResetValue(
    otp,
    userId,
    "otp",
    config.secret
  );
  const now = new Date();
  let previousSendState;

  await withPasswordResetTransaction(async (connection) => {
    const rows = await dbConnectionQuery(
      connection,
      "SELECT sendCount, windowStartedAt, lastSentAt FROM password_reset_tokens WHERE idUser = ? FOR UPDATE",
      [userId]
    );
    const current = rows[0];
    previousSendState = current
      ? {
          sendCount: Number(current.sendCount) || 0,
          windowStartedAt: current.windowStartedAt,
          lastSentAt: current.lastSentAt,
        }
      : null;
    let sendCount = current ? Number(current.sendCount) || 0 : 0;
    let windowStartedAt = current ? current.windowStartedAt : now;

    if (
      !windowStartedAt ||
      now.getTime() - new Date(windowStartedAt).getTime() >=
        PASSWORD_RESET_WINDOW_MS
    ) {
      sendCount = 0;
      windowStartedAt = now;
    }

    if (current && current.lastSentAt) {
      const waitLeft =
        PASSWORD_RESET_RESEND_WAIT_MS -
        (now.getTime() - new Date(current.lastSentAt).getTime());
      if (waitLeft > 0) {
        const error = new Error("Vui lòng đợi trước khi gửi mã OTP tiếp theo.");
        error.code = "OTP_RESEND_WAIT";
        error.waitSeconds = Math.ceil(waitLeft / 1000);
        throw error;
      }
    }
    if (sendCount >= PASSWORD_RESET_MAX_SENDS) {
      const error = new Error("Đã vượt quá số lần gửi mã OTP cho phép.");
      error.code = "OTP_SEND_LIMIT";
      throw error;
    }

    const expiresAt = new Date(now.getTime() + PASSWORD_RESET_OTP_TTL_MS);
    await dbConnectionQuery(
      connection,
      `INSERT INTO password_reset_tokens
        (idUser, otpHash, otpExpiresAt, otpAttempts, sendCount, windowStartedAt,
         lastSentAt, verifiedTokenHash, verifiedExpiresAt, usedAt)
       VALUES (?, ?, ?, 0, ?, ?, ?, NULL, NULL, NULL)
       ON DUPLICATE KEY UPDATE
         otpHash = VALUES(otpHash),
         otpExpiresAt = VALUES(otpExpiresAt),
         otpAttempts = 0,
         sendCount = VALUES(sendCount),
         windowStartedAt = VALUES(windowStartedAt),
         lastSentAt = VALUES(lastSentAt),
         verifiedTokenHash = NULL,
         verifiedExpiresAt = NULL,
         usedAt = NULL`,
      [userId, otpHash, expiresAt, sendCount + 1, windowStartedAt, now]
    );
  });

  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: { user: config.user, pass: config.pass },
    });
    await transporter.sendMail({
      from: config.from,
      to: email,
      subject: "Mã xác thực đặt lại mật khẩu - Helmet Store",
      text: `Mã OTP đặt lại mật khẩu của bạn là ${otp}. Mã có hiệu lực trong 5 phút và chỉ sử dụng được một lần. Nếu bạn không yêu cầu, hãy bỏ qua email này.`,
      html: `<p>Mã OTP đặt lại mật khẩu của bạn là:</p><p style="font-size:28px;font-weight:bold;letter-spacing:8px">${otp}</p><p>Mã có hiệu lực trong 5 phút và chỉ sử dụng được một lần.</p><p>Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>`,
    });
  } catch (err) {
    await db.query(
      `UPDATE password_reset_tokens
       SET otpHash = NULL, otpExpiresAt = NULL, sendCount = ?,
           windowStartedAt = ?, lastSentAt = ?
       WHERE idUser = ? AND otpHash = ?`,
      [
        previousSendState ? previousSendState.sendCount : 0,
        previousSendState ? previousSendState.windowStartedAt : null,
        previousSendState ? previousSendState.lastSentAt : null,
        userId,
        otpHash,
      ]
    );
    console.error("Password reset email delivery failed:", err.code || "SMTP error");
    if (err.code === "EAUTH") {
      throw new Error(
        "Gmail từ chối xác thực SMTP. Hãy kiểm tra SMTP_USER và dùng Google App Password trong SMTP_PASS."
      );
    }
    if (
      err.code === "EENVELOPE" ||
      err.responseCode === 550 ||
      err.responseCode === 553
    ) {
      throw new Error(
        "Máy chủ email từ chối địa chỉ gửi hoặc nhận. Với Gmail, SMTP_FROM nên dùng cùng địa chỉ với SMTP_USER."
      );
    }
    if (
      err.code === "ETIMEDOUT" ||
      err.code === "ECONNECTION" ||
      err.code === "ESOCKET"
    ) {
      throw new Error(
        "Không kết nối được máy chủ SMTP. Hãy kiểm tra SMTP_HOST, SMTP_PORT và kết nối mạng."
      );
    }
    throw new Error(
      `Không thể gửi email OTP${err.code ? ` (mã lỗi ${err.code})` : ""}. Hãy kiểm tra cấu hình SMTP và địa chỉ email nhận.`
    );
  }

  return now;
}

async function invalidatePasswordResetOtp(userId, otpHash) {
  await db.query(
    "UPDATE password_reset_tokens SET otpHash = NULL, otpExpiresAt = NULL, verifiedTokenHash = NULL, verifiedExpiresAt = NULL WHERE idUser = ? AND otpHash = ?",
    [userId, otpHash]
  );
}

async function verifyPasswordResetToken(userId, token, secret) {
  const rows = await db.query(
    "SELECT verifiedTokenHash, verifiedExpiresAt FROM password_reset_tokens WHERE idUser = ? LIMIT 1",
    [userId]
  );
  const reset = rows[0];
  if (
    !reset ||
    !reset.verifiedTokenHash ||
    !reset.verifiedExpiresAt ||
    new Date(reset.verifiedExpiresAt).getTime() <= Date.now()
  ) {
    return false;
  }
  const expectedHash = hashPasswordResetValue(
    token,
    userId,
    "reset",
    secret
  );
  return safeHashEquals(reset.verifiedTokenHash, expectedHash);
}

// API ENDPOINTS FOR ASYNC VALIDATION
// =======================

// Check if username already exists
router.post("/api/check-username", async function (req, res) {
  try {
    const username = req.body.username;
    
    if (!username || typeof username !== "string") {
      return res.status(400).json({ error: "Username không được bỏ trống" });
    }
    
    // Check if username exists in database
    const user = await modelUser.checkUsername(username.trim());
    
    if (user) {
      res.json({ exists: true });
    } else {
      res.json({ exists: false });
    }
  } catch (err) {
    console.error("Error checking username:", err);
    res.status(500).json({ error: "Lỗi kiểm tra username" });
  }
});

// Check if email already exists
router.post("/api/check-email", async function (req, res) {
  try {
    const email = req.body.email;
    
    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "Email không được bỏ trống" });
    }
    
    // Check if email exists in database
    const user = await modelUser.checkEmail(email.trim());
    
    if (user) {
      res.json({ exists: true });
    } else {
      res.json({ exists: false });
    }
  } catch (err) {
    console.error("Error checking email:", err);
    res.status(500).json({ error: "Lỗi kiểm tra email" });
  }
});

/* GET users listing. */
router.get("/tai-khoan", async function (req, res, next) {
  if (req.session.User) {
    let addresses = [];
    let message = req.query.message || null;

    try {
      addresses = await modelUserAddress.getAllAddresses(req.session.User.id);
    } catch (err) {
      console.error("Error loading addresses:", err);
      message = "Không thể tải danh sách địa chỉ.";
    }

    try {
      const orders = await modelOrder.getUserOrders(req.session.User.id);

      res.render("site/my-account.ejs", {
        user: req.session.User,
        addresses: addresses,
        orders: orders,
        message: message,
        accountMessage: req.query.accountMessage || null,
        accountStatus: req.query.accountStatus || null,
        passwordMessage: req.query.passwordMessage || null,
        passwordStatus: req.query.passwordStatus || null,
      });
    } catch (err) {
      next(err);
    }
  } else {
    req.session.back = "/users/tai-khoan";
    res.redirect("/users/dang-nhap");
  }
});
router.get("/dang-nhap", function (req, res, next) {
  res.render("site/dang-nhap.ejs", {
    message:
      req.query.passwordReset === "success"
        ? "Đổi mật khẩu thành công. Vui lòng đăng nhập bằng mật khẩu mới."
        : null,
    messageType: req.query.passwordReset === "success" ? "success" : "danger",
  });
});
router.post("/dang-nhap", async function (req, res, next) {
  const username = req.body.username;
  const password = req.body.password;
  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    !username ||
    !password
  ) {
    return res.render("site/dang-nhap", {
      message: "Vui lòng nhập đầy đủ thông tin",
    });
  }
  try {
    const rows = await db.query(
      "SELECT * FROM user WHERE username = ? OR email = ? LIMIT 1",
      [username, username]
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.render("site/dang-nhap", {
        message: "Sai tài khoản hoặc mật khẩu",
      });
    }

    req.session.User = {
      id: user.idUser,
      username: user.username,
      ho: user.ho,
      ten: user.ten,
      phone: user.phone,
      email: user.email,
      role: user.role,
      address: user.address,
      logIn: true,
    };

    if (user.role === "admin") {
      return res.redirect("/admin");
    }
    if (req.session.back) {
      return res.redirect(req.session.back);
    }
    return res.redirect("/");
  } catch (err) {
    next(err);
  }
});
router.get("/dang-ky", function (req, res, next) {
  res.render("site/dang-ky.ejs");
});
router.post("/luu", async function (req, res, next) {
  let ho = req.body.ho;
  let ten = req.body.ten;
  let u = req.body.username;
  let em = req.body.email;
  let phone = req.body.phone;
  let p = req.body.password;
  let rp = req.body.retypePassword;
  let address = req.body.address;

  // VALIDATION
  // ============================
  let msg;

  if ((msg = validateUsername(u))) {
    return res.render("site/dang-ky", { message: msg });
  }
  if ((msg = validateEmail(em))) {
    return res.render("site/dang-ky", { message: msg });
  }
  if ((msg = validatePassword(p))) {
    return res.render("site/dang-ky", { message: msg });
  }
  if (p !== rp) {
    return res.render("site/dang-ky", {
      message: "Mật khẩu nhập lại không khớp",
    });
  }
  // Kiểm tra trùng Email
  let checkEmail = await modelUser.checkEmail(em);
  if (checkEmail) {
    return res.render("site/dang-ky", { message: "Email đã tồn tại" });
  }
  // Kiểm tra trùng Username
  let checkUser = await modelUser.checkUsername(u);
  if (checkUser) {
    return res.render("site/dang-ky", { message: "Username đã tồn tại" });
  }

  if (p === rp && p != "") {
    var salt = bcrypt.genSaltSync(10);
    var pass_mahoa = bcrypt.hashSync(p, salt);

    let user_info = {
      ho: ho,
      ten: ten,
      email: em,
      username: u,
      password: pass_mahoa,
      role: "customer",
      phone: phone,
      address: address,
    };

    let sql = "INSERT INTO user SET ?";
    db.query(sql, user_info);
  } else {
    res.redirect("/users/dang-ky");
  }

  res.redirect("/users/dang-ky-thanh-cong");
});
router.get("/dang-ky-thanh-cong", function (req, res, next) {
  res.render("site/dang-ky-thanh-cong");
});
router.get("/dang-xuat", function (req, res, next) {
  req.session.destroy();
  res.redirect("/users/dang-nhap");
});
router.post("/doi-mat-khau", async function (req, res) {
  if (!req.session.User || !req.session.User.id) {
    return res.redirect("/users/dang-nhap");
  }

  const passwordMessage = (message, success) =>
    res.redirect(
      "/users/tai-khoan?passwordMessage=" +
        encodeURIComponent(message) +
        "&passwordStatus=" +
        (success ? "success" : "error") +
        "#account-tab"
    );
  const { password, newPassword, confirmPassword } = req.body;

  if (
    typeof password !== "string" ||
    typeof newPassword !== "string" ||
    typeof confirmPassword !== "string" ||
    !password ||
    !newPassword ||
    !confirmPassword
  ) {
    return passwordMessage("Vui lòng nhập đầy đủ cả ba mật khẩu.", false);
  }

  if (newPassword.length < 6) {
    return passwordMessage("Mật khẩu mới phải có ít nhất 6 ký tự.", false);
  }

  if (Buffer.byteLength(newPassword, "utf8") > 72) {
    return passwordMessage("Mật khẩu mới không được vượt quá 72 byte.", false);
  }

  if (newPassword !== confirmPassword) {
    return passwordMessage("Mật khẩu không khớp.", false);
  }

  try {
    const rows = await db.query(
      "SELECT password FROM user WHERE idUser = ? LIMIT 1",
      [req.session.User.id]
    );

    if (rows.length === 0) {
      return passwordMessage("Không tìm thấy tài khoản đang đăng nhập.", false);
    }

    const passwordMatches = await bcrypt.compare(password, rows[0].password);
    if (!passwordMatches) {
      return passwordMessage("Mật khẩu hiện tại không chính xác.", false);
    }

    if (await bcrypt.compare(newPassword, rows[0].password)) {
      return passwordMessage(
        "Mật khẩu mới phải khác mật khẩu hiện tại.",
        false
      );
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const result = await db.query(
      "UPDATE user SET password = ? WHERE idUser = ?",
      [hashedPassword, req.session.User.id]
    );

    if (result.affectedRows !== 1) {
      console.error(
        "Password update did not affect the logged-in account:",
        req.session.User.id
      );
      return passwordMessage("Không thể cập nhật mật khẩu. Vui lòng thử lại.", false);
    }

    return passwordMessage("Đổi mật khẩu thành công.", true);
  } catch (err) {
    console.error("Error changing password:", err);
    return passwordMessage("Có lỗi khi đổi mật khẩu. Vui lòng thử lại.", false);
  }
});

// Route để cập nhật thông tin tài khoản
router.post("/update", async function (req, res) {
  if (!req.session.User || !req.session.User.id) {
    return res.redirect("/users/dang-nhap");
  }

  const profileMessage = (message, success) =>
    res.redirect(
      "/users/tai-khoan?accountMessage=" +
        encodeURIComponent(message) +
        "&accountStatus=" +
        (success ? "success" : "error") +
        "#account-tab"
    );
  const { ho: rawHo, ten: rawTen, email: rawEmail, phone: rawPhone, address: rawAddress } = req.body;

  if (
    typeof rawHo !== "string" ||
    typeof rawTen !== "string" ||
    typeof rawEmail !== "string" ||
    typeof rawPhone !== "string" ||
    (rawAddress !== undefined && typeof rawAddress !== "string")
  ) {
    return profileMessage("Vui lòng nhập thông tin tài khoản hợp lệ.", false);
  }

  const ho = rawHo.trim();
  const ten = rawTen.trim();
  const email = rawEmail.trim();
  const phone = rawPhone.trim();
  const address = (rawAddress || "").trim();
  const userId = req.session.User.id;

  if (!ho || !ten || !email || !phone) {
    return profileMessage(
      "Họ, tên, email và số điện thoại không được để trống.",
      false
    );
  }

  if (ho.length > 50 || ten.length > 50) {
    return profileMessage("Họ và tên không được vượt quá 50 ký tự.", false);
  }

  if (email.length > 50 || validateEmail(email)) {
    return profileMessage("Email không hợp lệ hoặc vượt quá 50 ký tự.", false);
  }

  if (!/^[0-9]{10,11}$/.test(phone)) {
    return profileMessage("Số điện thoại phải gồm 10 hoặc 11 chữ số.", false);
  }

  if (address.length > 500) {
    return profileMessage("Địa chỉ không được vượt quá 500 ký tự.", false);
  }

  try {
    const duplicateEmails = await db.query(
      "SELECT idUser FROM user WHERE email = ? AND idUser <> ? LIMIT 1",
      [email, userId]
    );
    if (duplicateEmails.length > 0) {
      return profileMessage("Email này đã được sử dụng bởi tài khoản khác.", false);
    }

    const result = await db.query(
      "UPDATE user SET ho = ?, ten = ?, email = ?, phone = ?, address = ? WHERE idUser = ?",
      [ho, ten, email, phone, address, userId]
    );

    if (result.affectedRows === 0) {
      const users = await db.query(
        "SELECT idUser FROM user WHERE idUser = ? LIMIT 1",
        [userId]
      );
      if (users.length === 0) {
        return profileMessage(
          "Không tìm thấy tài khoản để cập nhật.",
          false
        );
      }
    } else if (result.affectedRows !== 1) {
      console.error("Unexpected account update result:", result);
      return profileMessage(
        "Không thể cập nhật thông tin tài khoản. Vui lòng thử lại.",
        false
      );
    }

    req.session.User.ho = ho;
    req.session.User.ten = ten;
    req.session.User.email = email;
    req.session.User.phone = phone;
    req.session.User.address = address;

    return profileMessage("Cập nhật tài khoản thành công", true);
  } catch (err) {
    console.error("Error updating account information:", err);
    return profileMessage(
      "Có lỗi xảy ra khi cập nhật thông tin tài khoản. Vui lòng thử lại.",
      false
    );
  }
});

// Route để cập nhật địa chỉ nhận hàng (thêm mới)
router.post("/update-address", async function (req, res, next) {
  console.log("=== POST UPDATE-ADDRESS (CREATE NEW) ===");
  console.log("Request body:", req.body);
  console.log("Session User:", req.session.User);

  if (!req.session.User) {
    return res.redirect("/users/dang-nhap");
  }

  let fullName = req.body.fullName;
  let phone = normalizeAddressPhone(req.body.phone);
  let province = req.body.province;
  let district = req.body.district;
  let ward = req.body.ward;
  let detailAddress = req.body.detailAddress;
  fullName = String(fullName || "").trim();
  province = String(province || "").trim();
  district = String(district || "").trim();
  ward = String(ward || "").trim();
  detailAddress = String(detailAddress || "").trim();
  let addressType = req.body.addressType || "home";
  let setAsDefault = req.body.setAsDefault === "1";
  let userId = req.session.User.id;

  // Validation
  console.log("Validation check:", {
    fullName: !!fullName,
    phone: !!phone,
    province: !!province,
    district: !!district,
    ward: !!ward,
    detailAddress: !!detailAddress,
  });

  if (
    !fullName ||
    !phone ||
    !province ||
    !district ||
    !ward ||
    !detailAddress
  ) {
    console.log("VALIDATION FAILED - Missing fields:", {
      fullName: !fullName ? "MISSING" : "OK",
      phone: !phone ? "MISSING" : "OK",
      province: !province ? "MISSING" : "OK",
      district: !district ? "MISSING" : "OK",
      ward: !ward ? "MISSING" : "OK",
      detailAddress: !detailAddress ? "MISSING" : "OK",
    });
    if (req.xhr) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng điền đầy đủ thông tin địa chỉ",
      });
    }

    try {
      const addresses = await modelUserAddress.getAllAddresses(userId);
      return res.render("site/my-account", {
        user: req.session.User,
        addresses: addresses,
        message: "Vui lòng điền đầy đủ thông tin địa chỉ",
      });
    } catch (err) {
      console.log(err);
      return res.render("site/my-account", {
        user: req.session.User,
        addresses: [],
        message: "Vui lòng điền đầy đủ thông tin địa chỉ",
      });
    }
  }

  // Validate phone number
  const phoneRegex = /^[0-9]{10,11}$/;
  if (!phoneRegex.test(phone)) {
    if (req.xhr) {
      return res.status(400).json({
        success: false,
        message: "Số điện thoại không hợp lệ",
      });
    }

    try {
      const addresses = await modelUserAddress.getAllAddresses(userId);
      return res.render("site/my-account", {
        user: req.session.User,
        addresses: addresses,
        message: "Số điện thoại không hợp lệ",
      });
    } catch (err) {
      console.log(err);
      return res.render("site/my-account", {
        user: req.session.User,
        addresses: [],
        message: "Số điện thoại không hợp lệ",
      });
    }
  }

  try {
    console.log("Creating address with data:", {
      idUser: userId,
      fullName,
      phone,
      province,
      district,
      ward,
      detailAddress,
      addressType,
      isDefault: setAsDefault,
    });

    // Create address data
    const addressData = {
      idUser: userId,
      fullName,
      phone,
      province,
      district,
      ward,
      detailAddress,
      addressType,
      isDefault: setAsDefault,
    };

    // Create new address using model
    const result = await modelUserAddress.createAddress(addressData);
    console.log("Create address result:", result);

    // Cập nhật session user với địa chỉ mặc định mới
    if (setAsDefault) {
      req.session.User.phone = phone;
      let fullAddress = `${detailAddress}, ${ward}, ${district}, ${province}`;
      req.session.User.address = fullAddress;
    }

    if (req.xhr) {
      return res.json({
        success: true,
        message: "Thêm địa chỉ thành công!",
      });
    }

    res.redirect(
      "/users/tai-khoan?message=" +
        encodeURIComponent("Thêm địa chỉ thành công!") +
        "#address-tab"
    );
  } catch (err) {
    console.error("ERROR in POST update-address:", err);
    console.error("Error stack:", err.stack);
    const errorMessage =
      err.code === "ADDRESS_LIMIT_REACHED"
        ? err.message
        : "Có lỗi xảy ra khi cập nhật địa chỉ";
    if (req.xhr) {
      return res.status(err.code === "ADDRESS_LIMIT_REACHED" ? 409 : 500).json({
        success: false,
        message: errorMessage,
      });
    }

    try {
      const addresses = await modelUserAddress.getAllAddresses(userId);
      res.render("site/my-account", {
        user: req.session.User,
        addresses: addresses,
        message: errorMessage,
      });
    } catch (err2) {
      console.log(err2);
      res.render("site/my-account", {
        user: req.session.User,
        addresses: [],
        message: errorMessage,
      });
    }
  }
});

// Route PUT để cập nhật địa chỉ hiện có (edit existing address)
router.put("/update-address", async function (req, res, next) {
  console.log("=== PUT UPDATE-ADDRESS (EDIT EXISTING) ===");
  console.log("Request body:", req.body);
  console.log("Session User:", req.session.User);

  if (!req.session.User) {
    return res.status(401).json({ success: false, message: "Chưa đăng nhập" });
  }

  const { id, fullName, province, district, ward, detailAddress } = req.body;
  const phone = normalizeAddressPhone(req.body.phone);
  const userId = req.session.User.id;
  const normalizedFullName = String(fullName || "").trim();
  const normalizedProvince = String(province || "").trim();
  const normalizedDistrict = String(district || "").trim();
  const normalizedWard = String(ward || "").trim();
  const normalizedDetailAddress = String(detailAddress || "").trim();

  console.log("Update params:", {
    id,
    userId,
    fullName,
    phone,
    province,
    district,
    ward,
    detailAddress,
  });

  // Validation
  if (
    !id ||
    !normalizedFullName ||
    !phone ||
    !normalizedProvince ||
    !normalizedDistrict ||
    !normalizedWard ||
    !normalizedDetailAddress
  ) {
    console.log("ERROR: Missing required fields");
    return res
      .status(400)
      .json({ success: false, message: "Vui lòng điền đầy đủ thông tin" });
  }

  // Validate phone number
  const phoneRegex = /^[0-9]{10,11}$/;
  if (!phoneRegex.test(phone)) {
    console.log("ERROR: Invalid phone number:", phone);
    return res
      .status(400)
      .json({ success: false, message: "Số điện thoại không hợp lệ" });
  }

  try {
    const addressData = {
      fullName: normalizedFullName,
      phone,
      province: normalizedProvince,
      district: normalizedDistrict,
      ward: normalizedWard,
      detailAddress: normalizedDetailAddress,
      addressType: "home",
    };

    console.log("Updating address with data:", addressData);

    const result = await modelUserAddress.updateAddress(
      id,
      userId,
      addressData
    );
    console.log("Update result:", result);

    res.json({ success: true, message: "Cập nhật địa chỉ thành công" });
  } catch (err) {
    console.error("ERROR updating address:", err);
    console.error("Error stack:", err.stack);
    res
      .status(500)
      .json({ success: false, message: "Lỗi server: " + err.message });
  }
});

// Route debug để kiểm tra và tạo bảng user_addresses
router.get("/debug/check-table", async function (req, res) {
  try {
    // Kiểm tra xem bảng có tồn tại không
    const checkQuery = `
      SELECT COUNT(*) as table_exists 
      FROM information_schema.tables 
      WHERE table_schema = 'helmet_store' 
      AND table_name = 'user_addresses'
    `;

    const result = await db.query(checkQuery);
    console.log("Table check result:", result);

    if (result[0].table_exists === 0) {
      console.log("Table does not exist, creating...");

      // Tạo bảng nếu chưa tồn tại
      const createQuery = `
        CREATE TABLE IF NOT EXISTS user_addresses (
          idAddress int(11) NOT NULL AUTO_INCREMENT,
          idUser int(11) NOT NULL,
          fullName varchar(100) NOT NULL,
          phone varchar(15) NOT NULL,
          province varchar(50) NOT NULL,
          district varchar(50) NOT NULL,
          ward varchar(50) NOT NULL,
          detailAddress text NOT NULL,
          addressType enum('home','office','other') DEFAULT 'home',
          isDefault tinyint(1) DEFAULT 0,
          createdAt timestamp NOT NULL DEFAULT current_timestamp(),
          updatedAt timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
          PRIMARY KEY (idAddress),
          KEY idUser (idUser),
          CONSTRAINT user_addresses_ibfk_1 FOREIGN KEY (idUser) REFERENCES user (idUser) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
      `;

      await db.query(createQuery);
      console.log("Table created successfully");
      res.json({ success: true, message: "Table created successfully" });
    } else {
      console.log("Table exists");

      // Kiểm tra cấu trúc bảng
      const describeQuery = "DESCRIBE user_addresses";
      const structure = await db.query(describeQuery);
      console.log("Table structure:", structure);

      res.json({
        success: true,
        message: "Table exists",
        structure: structure,
      });
    }
  } catch (error) {
    console.error("Error checking/creating table:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Debug route để kiểm tra database
router.get("/debug/check-table", async function (req, res) {
  try {
    // Kiểm tra bảng có tồn tại không
    const checkTableQuery = `SHOW TABLES LIKE 'user_addresses'`;
    db.query(checkTableQuery, (err, results) => {
      if (err) {
        return res.json({ error: "Error checking table", details: err });
      }

      if (results.length === 0) {
        return res.json({ error: "Table user_addresses does not exist" });
      }

      // Kiểm tra cấu trúc bảng
      const describeQuery = `DESCRIBE user_addresses`;
      db.query(describeQuery, (err2, structure) => {
        if (err2) {
          return res.json({ error: "Error describing table", details: err2 });
        }

        // Đếm số record
        const countQuery = `SELECT COUNT(*) as count FROM user_addresses`;
        db.query(countQuery, (err3, countResult) => {
          if (err3) {
            return res.json({ error: "Error counting records", details: err3 });
          }

          res.json({
            success: true,
            tableExists: true,
            structure: structure,
            recordCount: countResult[0].count,
          });
        });
      });
    });
  } catch (error) {
    res.status(500).json({ error: "Server error", details: error.message });
  }
});

// Route để lấy địa chỉ mặc định cho trang thanh toán
router.get("/default-address/:userId", async function (req, res) {
  console.log("=== GET DEFAULT ADDRESS ===");
  let userId = req.params.userId;
  console.log("User ID:", userId);

  try {
    // Try to get default address first
    console.log("Trying to get default address from user_addresses table...");
    const defaultAddress = await modelUserAddress.getDefaultAddress(userId);
    console.log("Default address result:", defaultAddress);

    if (defaultAddress) {
      console.log("Found default address, returning:", defaultAddress);
      res.json({ success: true, address: defaultAddress });
    } else {
      console.log("No default address found, falling back to user table...");
      // Fallback to user table address
      let userSql = `SELECT ho, ten, phone, address FROM user WHERE idUser = ?`;
      db.query(userSql, [userId], function (err, userResults) {
        if (err) {
          console.error("SQL Error in user fallback:", err);
          return res.json({ success: false });
        }

        if (userResults.length === 0) {
          console.log("No user found with idUser:", userId);
          return res.json({ success: false });
        }

        let user = userResults[0];
        console.log("User fallback data:", user);
        res.json({
          success: true,
          address: {
            fullName: `${user.ho} ${user.ten}`,
            phone: user.phone || "",
            detailAddress: user.address || "",
          },
        });
      });
    }
  } catch (err) {
    console.error("Error getting default address:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// Route để set địa chỉ mặc định
router.post("/set-default-address", async function (req, res, next) {
  if (!req.session.User) {
    return res.json({ success: false, message: "Chưa đăng nhập" });
  }

  let addressId = req.body.addressId;
  let userId = req.session.User.id;

  try {
    await modelUserAddress.setDefaultAddress(addressId, userId);
    res.json({ success: true });
  } catch (err) {
    console.log(err);
    res.json({ success: false, message: "Có lỗi xảy ra" });
  }
});

// Route để xóa địa chỉ
router.post("/delete-address", async function (req, res) {
  if (!req.session.User) {
    return res.json({ success: false, message: "Chưa đăng nhập" });
  }

  let addressId = req.body.addressId;
  let userId = req.session.User.id;

  try {
    await modelUserAddress.deleteAddress(addressId, userId);
    res.json({ success: true });
  } catch (err) {
    console.log(err);
    res.json({ success: false, message: "Có lỗi xảy ra" });
  }
});

// Route quên mật khẩu - GET
router.get("/quen-mat-khau", function (req, res, next) {
  res.render("site/quen-mat-khau", {
    message:
      req.query.passwordReset === "success"
        ? "Đổi mật khẩu thành công. Vui lòng đăng nhập bằng mật khẩu mới."
        : "",
    messageType: req.query.passwordReset === "success" ? "success" : "danger",
  });
});

router.post("/quen-mat-khau", async function (req, res, next) {
  const email = typeof req.body.email === "string" ? req.body.email.trim() : "";
  const emailError = validateEmail(email);

  if (emailError) {
    return res.status(400).render("site/quen-mat-khau", {
      message: emailError,
      messageType: "danger",
    });
  }

  const config = getPasswordResetConfig();
  if (config.error) {
    return res.status(503).render("site/quen-mat-khau", {
      message: config.error,
      messageType: "danger",
    });
  }

  clearPasswordResetSession(req.session);
  try {
    const users = await db.query(
      "SELECT idUser, email FROM user WHERE LOWER(email) = LOWER(?) LIMIT 1",
      [email]
    );
    const user = users[0];
    const sentAt = Date.now();

    if (!user) {
      req.session.passwordResetChallenge = {
        email,
        userId: null,
        sentAt,
        sendWindowStartedAt: sentAt,
        sendCount: 1,
      };
      req.session.passwordResetNotice =
        "Nếu email đã đăng ký, mã OTP sẽ được gửi đến hộp thư của bạn.";
      return res.redirect("/users/xac-thuc-otp");
    }

    try {
      const issuedAt = await issuePasswordResetOtp(
        user.idUser,
        user.email,
        config
      );
      req.session.passwordResetChallenge = {
        email: user.email,
        userId: user.idUser,
        sentAt: issuedAt.getTime(),
        sendWindowStartedAt: issuedAt.getTime(),
        sendCount: 1,
      };
      req.session.passwordResetNotice =
        "Nếu email đã đăng ký, mã OTP sẽ được gửi đến hộp thư của bạn.";
      return res.redirect("/users/xac-thuc-otp");
    } catch (err) {
      if (err.code === "OTP_RESEND_WAIT" || err.code === "OTP_SEND_LIMIT") {
        req.session.passwordResetChallenge = {
          email: user.email,
          userId: user.idUser,
          sentAt:
            sentAt -
            Math.max(
              0,
              PASSWORD_RESET_RESEND_WAIT_MS -
                (err.waitSeconds || PASSWORD_RESET_RESEND_WAIT_MS / 1000) *
                  1000
            ),
          sendWindowStartedAt: sentAt,
          sendCount: PASSWORD_RESET_MAX_SENDS,
        };
        req.session.passwordResetNotice =
          err.code === "OTP_RESEND_WAIT"
            ? `Vui lòng chờ ${err.waitSeconds} giây trước khi gửi lại mã.`
            : "Đã vượt quá số lần gửi mã OTP. Vui lòng thử lại sau.";
        return res.redirect("/users/xac-thuc-otp");
      }
      return res.status(503).render("site/quen-mat-khau", {
        message: err.message || "Không thể gửi email OTP. Vui lòng thử lại sau.",
        messageType: "danger",
      });
    }
  } catch (err) {
    next(err);
  }
});

router.get("/xac-thuc-otp", function (req, res) {
  const challenge = req.session.passwordResetChallenge;
  if (!challenge) return res.redirect("/users/quen-mat-khau");

  const waitLeft = challenge.sentAt
    ? PASSWORD_RESET_RESEND_WAIT_MS -
      (Date.now() - Number(challenge.sentAt))
    : 0;
  res.render("site/xac-thuc-otp", {
    maskedEmail: maskEmail(challenge.email),
    message: req.session.passwordResetNotice || "",
    messageType: req.session.passwordResetNoticeType || "warning",
    resendAfterSeconds: Math.max(0, Math.ceil(waitLeft / 1000)),
  });
  delete req.session.passwordResetNotice;
  delete req.session.passwordResetNoticeType;
});

router.post("/xac-thuc-otp", async function (req, res, next) {
  const challenge = req.session.passwordResetChallenge;
  if (!challenge) return res.redirect("/users/quen-mat-khau");

  const otp = typeof req.body.otp === "string" ? req.body.otp : "";
  const config = getPasswordResetConfig();
  if (config.error) {
    req.session.passwordResetNotice = config.error;
    req.session.passwordResetNoticeType = "warning";
    return res.redirect("/users/xac-thuc-otp");
  }
  if (!challenge.userId) {
    req.session.passwordResetNotice =
      "Mã OTP không hợp lệ hoặc đã hết hạn.";
    req.session.passwordResetNoticeType = "warning";
    return res.redirect("/users/xac-thuc-otp");
  }

  try {
    const result = await withPasswordResetTransaction(async (connection) => {
      const rows = await dbConnectionQuery(
        connection,
        "SELECT otpHash, otpExpiresAt, otpAttempts, usedAt FROM password_reset_tokens WHERE idUser = ? FOR UPDATE",
        [challenge.userId]
      );
      const reset = rows[0];
      if (!reset) return { error: "Mã OTP không hợp lệ hoặc đã hết hạn." };
      if (reset.usedAt) return { error: "Mã OTP này đã được sử dụng." };
      if (
        !reset.otpHash ||
        !reset.otpExpiresAt ||
        new Date(reset.otpExpiresAt).getTime() <= Date.now()
      ) {
        await dbConnectionQuery(
          connection,
          "UPDATE password_reset_tokens SET otpHash = NULL, otpExpiresAt = NULL WHERE idUser = ?",
          [challenge.userId]
        );
        return { error: "Mã OTP đã hết hạn. Vui lòng yêu cầu mã mới." };
      }
      if (Number(reset.otpAttempts) >= PASSWORD_RESET_MAX_ATTEMPTS) {
        return {
          error: "Bạn đã nhập sai quá số lần cho phép. Vui lòng yêu cầu mã mới.",
        };
      }

      const suppliedHash = /^\d{6}$/.test(otp)
        ? hashPasswordResetValue(otp, challenge.userId, "otp", config.secret)
        : "";
      if (!safeHashEquals(reset.otpHash, suppliedHash)) {
        const attempts = Number(reset.otpAttempts) + 1;
        const locked = attempts >= PASSWORD_RESET_MAX_ATTEMPTS;
        await dbConnectionQuery(
          connection,
          `UPDATE password_reset_tokens
           SET otpAttempts = ?, otpHash = ?, otpExpiresAt = ?
           WHERE idUser = ?`,
          [
            attempts,
            locked ? null : reset.otpHash,
            locked ? null : reset.otpExpiresAt,
            challenge.userId,
          ]
        );
        return {
          error: locked
            ? "Bạn đã nhập sai quá số lần cho phép. Vui lòng yêu cầu mã mới."
            : "Mã OTP không chính xác.",
        };
      }

      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = hashPasswordResetValue(
        token,
        challenge.userId,
        "reset",
        config.secret
      );
      const tokenExpiresAt = new Date(
        Date.now() + PASSWORD_RESET_TOKEN_TTL_MS
      );
      await dbConnectionQuery(
        connection,
        `UPDATE password_reset_tokens
         SET otpHash = NULL, otpExpiresAt = NULL, usedAt = NOW(),
             verifiedTokenHash = ?, verifiedExpiresAt = ?
         WHERE idUser = ?`,
        [tokenHash, tokenExpiresAt, challenge.userId]
      );
      return { token };
    });

    if (result.error) {
      req.session.passwordResetNotice = result.error;
      req.session.passwordResetNoticeType = "warning";
      return res.redirect("/users/xac-thuc-otp");
    }

    req.session.passwordResetToken = result.token;
    req.session.passwordResetTokenUserId = challenge.userId;
    return res.redirect("/users/dat-lai-mat-khau");
  } catch (err) {
    next(err);
  }
});

router.post("/gui-lai-otp", async function (req, res, next) {
  const challenge = req.session.passwordResetChallenge;
  if (!challenge) return res.redirect("/users/quen-mat-khau");

  const now = Date.now();
  if (
    now - Number(challenge.sentAt || 0) <
    PASSWORD_RESET_RESEND_WAIT_MS
  ) {
    req.session.passwordResetNotice = "Vui lòng đợi hết thời gian đếm ngược trước khi gửi lại mã.";
    req.session.passwordResetNoticeType = "warning";
    return res.redirect("/users/xac-thuc-otp");
  }

  if (!challenge.userId) {
    const windowStart = Number(challenge.sendWindowStartedAt || now);
    if (now - windowStart >= PASSWORD_RESET_WINDOW_MS) {
      challenge.sendWindowStartedAt = now;
      challenge.sendCount = 0;
    }
    if (Number(challenge.sendCount || 0) >= PASSWORD_RESET_MAX_SENDS) {
      req.session.passwordResetNotice =
        "Đã vượt quá số lần gửi mã OTP. Vui lòng thử lại sau.";
      req.session.passwordResetNoticeType = "warning";
      return res.redirect("/users/xac-thuc-otp");
    }
    challenge.sendCount = Number(challenge.sendCount || 0) + 1;
    challenge.sentAt = now;
    req.session.passwordResetNotice =
      "Nếu email đã đăng ký, mã OTP sẽ được gửi đến hộp thư của bạn.";
    req.session.passwordResetNoticeType = "success";
    return res.redirect("/users/xac-thuc-otp");
  }

  const config = getPasswordResetConfig();
  if (config.error) {
    req.session.passwordResetNotice = config.error;
    req.session.passwordResetNoticeType = "warning";
    return res.redirect("/users/xac-thuc-otp");
  }

  try {
    const issuedAt = await issuePasswordResetOtp(
      challenge.userId,
      challenge.email,
      config
    );
    challenge.sentAt = issuedAt.getTime();
    challenge.sendCount = Number(challenge.sendCount || 0) + 1;
    req.session.passwordResetNotice =
      "Nếu email đã đăng ký, mã OTP sẽ được gửi đến hộp thư của bạn.";
    req.session.passwordResetNoticeType = "success";
    return res.redirect("/users/xac-thuc-otp");
  } catch (err) {
    if (err.code === "OTP_RESEND_WAIT") {
      req.session.passwordResetNotice =
        "Vui lòng đợi hết thời gian đếm ngược trước khi gửi lại mã.";
      req.session.passwordResetNoticeType = "warning";
      return res.redirect("/users/xac-thuc-otp");
    }
    if (err.code === "OTP_SEND_LIMIT") {
      req.session.passwordResetNotice =
        "Đã vượt quá số lần gửi mã OTP. Vui lòng thử lại sau.";
      req.session.passwordResetNoticeType = "warning";
      return res.redirect("/users/xac-thuc-otp");
    }
    req.session.passwordResetNotice =
      "Không thể gửi email OTP. Vui lòng kiểm tra cấu hình SMTP.";
    req.session.passwordResetNoticeType = "warning";
    return res.redirect("/users/xac-thuc-otp");
  }
});

router.get("/dat-lai-mat-khau", async function (req, res, next) {
  const userId = req.session.passwordResetTokenUserId;
  const token = req.session.passwordResetToken;
  const config = getPasswordResetConfig();
  if (!userId || !token || config.error) {
    clearPasswordResetSession(req.session);
    return res.redirect("/users/quen-mat-khau");
  }
  try {
    if (!(await verifyPasswordResetToken(userId, token, config.secret))) {
      clearPasswordResetSession(req.session);
      return res.redirect("/users/quen-mat-khau");
    }
    const challenge = req.session.passwordResetChallenge;
    return res.render("site/reset-password", {
      maskedEmail: maskEmail(challenge && challenge.email),
      message: "",
    });
  } catch (err) {
    next(err);
  }
});

router.post("/dat-lai-mat-khau", async function (req, res, next) {
  const userId = req.session.passwordResetTokenUserId;
  const token = req.session.passwordResetToken;
  const config = getPasswordResetConfig();
  if (!userId || !token || config.error) {
    clearPasswordResetSession(req.session);
    return res.redirect("/users/quen-mat-khau");
  }

  const { newPassword, confirmPassword } = req.body;
  if (typeof newPassword !== "string" || typeof confirmPassword !== "string") {
    return res.status(400).render("site/reset-password", {
      maskedEmail: maskEmail(
        req.session.passwordResetChallenge &&
          req.session.passwordResetChallenge.email
      ),
      message: "Vui lòng nhập và xác nhận mật khẩu mới.",
    });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).render("site/reset-password", {
      maskedEmail: maskEmail(
        req.session.passwordResetChallenge &&
          req.session.passwordResetChallenge.email
      ),
      message: "Mật khẩu xác nhận không khớp.",
    });
  }
  if (
    newPassword.length < 8 ||
    !/[a-z]/.test(newPassword) ||
    !/[A-Z]/.test(newPassword) ||
    !/\d/.test(newPassword)
  ) {
    return res.status(400).render("site/reset-password", {
      maskedEmail: maskEmail(
        req.session.passwordResetChallenge &&
          req.session.passwordResetChallenge.email
      ),
      message: "Mật khẩu cần ít nhất 8 ký tự, gồm chữ hoa, chữ thường và chữ số.",
    });
  }
  if (Buffer.byteLength(newPassword, "utf8") > 72) {
    return res.status(400).render("site/reset-password", {
      maskedEmail: maskEmail(
        req.session.passwordResetChallenge &&
          req.session.passwordResetChallenge.email
      ),
      message: "Mật khẩu không được vượt quá 72 byte.",
    });
  }

  try {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const updated = await withPasswordResetTransaction(async (connection) => {
      const rows = await dbConnectionQuery(
        connection,
        "SELECT verifiedTokenHash, verifiedExpiresAt FROM password_reset_tokens WHERE idUser = ? FOR UPDATE",
        [userId]
      );
      const reset = rows[0];
      const expectedHash = hashPasswordResetValue(
        token,
        userId,
        "reset",
        config.secret
      );
      if (
        !reset ||
        !reset.verifiedTokenHash ||
        !reset.verifiedExpiresAt ||
        new Date(reset.verifiedExpiresAt).getTime() <= Date.now() ||
        !safeHashEquals(reset.verifiedTokenHash, expectedHash)
      ) {
        return false;
      }

      const passwordResult = await dbConnectionQuery(
        connection,
        "UPDATE user SET password = ? WHERE idUser = ?",
        [hashedPassword, userId]
      );
      if (passwordResult.affectedRows !== 1) {
        throw new Error("Không thể cập nhật mật khẩu tài khoản.");
      }
      await dbConnectionQuery(
        connection,
        `UPDATE password_reset_tokens
         SET otpHash = NULL, otpExpiresAt = NULL, verifiedTokenHash = NULL,
             verifiedExpiresAt = NULL, usedAt = NOW()
         WHERE idUser = ?`,
        [userId]
      );
      return true;
    });

    if (!updated) {
      clearPasswordResetSession(req.session);
      return res.redirect("/users/quen-mat-khau");
    }

    clearPasswordResetSession(req.session);
    return res.redirect("/users/dang-nhap?passwordReset=success");
  } catch (err) {
    next(err);
  }
});

// GET /users/get-default-address - Lấy địa chỉ mặc định để thanh toán
router.get("/get-default-address", async function (req, res, next) {
  try {
    if (!req.session.User) {
      return res.json({ success: false, message: "Vui lòng đăng nhập" });
    }

    const addresses = await modelUserAddress.getAllAddresses(
      req.session.User.id
    );
    const defaultAddress = addresses.find((addr) => addr.isDefault);

    if (defaultAddress) {
      res.json({ success: true, address: defaultAddress });
    } else {
      res.json({ success: false, message: "Chưa có địa chỉ mặc định" });
    }
  } catch (error) {
    console.error("Get default address error:", error);
    res.json({ success: false, message: "Lỗi server" });
  }
});

module.exports = router;
