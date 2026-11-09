var express = require("express");
var router = express.Router();
var modelNotification = require("../models/model_notification");

function requireUser(req, res, next) {
  var user = req.session && req.session.User;
  if (user && user.logIn && user.id) {
    req.notificationUserId = user.id;
    return next();
  }
  return res.status(401).json({
    success: false,
    message: "Vui lòng đăng nhập để xem thông báo",
  });
}

router.use(requireUser);

router.get("/", async function (req, res) {
  try {
    var requestedLimit = Number(req.query.limit);
    var limit =
      Number.isInteger(requestedLimit) && requestedLimit >= 1 && requestedLimit <= 30
        ? requestedLimit
        : 10;
    var result = await Promise.all([
      modelNotification.listForUser(req.notificationUserId, limit),
      modelNotification.countUnread(req.notificationUserId),
    ]);

    res.json({
      success: true,
      notifications: result[0],
      unreadCount: result[1],
    });
  } catch (error) {
    console.error("Load notifications error:", error);
    res.status(500).json({
      success: false,
      message: "Không thể tải thông báo",
    });
  }
});

router.get("/unread-count", async function (req, res) {
  try {
    var unreadCount = await modelNotification.countUnread(req.notificationUserId);
    res.json({ success: true, unreadCount: unreadCount });
  } catch (error) {
    console.error("Load unread notification count error:", error);
    res.status(500).json({
      success: false,
      message: "Không thể tải số lượng thông báo chưa đọc",
    });
  }
});

router.post("/read-all", async function (req, res) {
  try {
    await modelNotification.markAllRead(req.notificationUserId);
    res.json({ success: true });
  } catch (error) {
    console.error("Mark all notifications read error:", error);
    res.status(500).json({
      success: false,
      message: "Không thể cập nhật thông báo",
    });
  }
});

router.post("/:id/read", async function (req, res) {
  try {
    var notificationId = Number(req.params.id);
    if (!Number.isSafeInteger(notificationId) || notificationId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Mã thông báo không hợp lệ",
      });
    }

    var result = await modelNotification.markRead(
      req.notificationUserId,
      notificationId
    );
    if (
      result.affectedRows === 0 &&
      !(await modelNotification.existsForUser(
        req.notificationUserId,
        notificationId
      ))
    ) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy thông báo",
      });
    }
    return res.json({ success: true });
  } catch (error) {
    console.error("Mark notification read error:", error);
    return res.status(500).json({
      success: false,
      message: "Không thể cập nhật thông báo",
    });
  }
});

module.exports = router;
