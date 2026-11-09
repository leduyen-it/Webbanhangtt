var db = require("./database");

function validateId(id) {
  var numericId = Number(id);
  if (!Number.isSafeInteger(numericId) || numericId <= 0) {
    throw new Error("ID must be a positive integer");
  }
  return numericId;
}

function queryOnConnection(connection, sql, params) {
  return new Promise(function (resolve, reject) {
    connection.query(sql, params, function (error, result) {
      if (error) return reject(error);
      resolve(result);
    });
  });
}

var insertNotificationSql = `
  INSERT INTO notifications (user_id, title, message, type, related_id, event_key)
  VALUES (?, ?, ?, ?, ?, ?)
  ON DUPLICATE KEY UPDATE id = id
`;

function notificationValues(notification) {
  var userId = validateId(notification.userId);
  if (!notification.title || !notification.message || !notification.type) {
    throw new Error("Notification title, message, and type are required");
  }
  if (!notification.eventKey || notification.eventKey.length > 191) {
    throw new Error("Notification event key is required and must be at most 191 characters");
  }

  return [
    userId,
    String(notification.title).slice(0, 150),
    String(notification.message).slice(0, 1000),
    String(notification.type).slice(0, 50),
    notification.relatedId == null ? null : validateId(notification.relatedId),
    notification.eventKey,
  ];
}

exports.createForConnection = function (connection, notification) {
  return queryOnConnection(
    connection,
    insertNotificationSql,
    notificationValues(notification)
  );
};

exports.create = async function (notification) {
  return db.query(insertNotificationSql, notificationValues(notification));
};

exports.listForUser = async function (userId, limit) {
  var validatedUserId = validateId(userId);
  var validatedLimit = Number(limit);
  if (!Number.isInteger(validatedLimit) || validatedLimit < 1 || validatedLimit > 30) {
    validatedLimit = 10;
  }

  return db.query(
    `SELECT id, title, message, type, related_id, is_read, created_at
     FROM notifications
     WHERE user_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT ?`,
    [validatedUserId, validatedLimit]
  );
};

exports.countUnread = async function (userId) {
  var rows = await db.query(
    "SELECT COUNT(*) AS unreadCount FROM notifications WHERE user_id = ? AND is_read = 0",
    [validateId(userId)]
  );
  return Number(rows[0].unreadCount);
};

exports.markRead = async function (userId, notificationId) {
  return db.query(
    "UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?",
    [validateId(notificationId), validateId(userId)]
  );
};

exports.existsForUser = async function (userId, notificationId) {
  var rows = await db.query(
    "SELECT id FROM notifications WHERE id = ? AND user_id = ? LIMIT 1",
    [validateId(notificationId), validateId(userId)]
  );
  return rows.length > 0;
};

exports.markAllRead = async function (userId) {
  return db.query(
    "UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0",
    [validateId(userId)]
  );
};
