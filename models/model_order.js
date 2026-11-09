var db = require("./database");
var modelNotification = require("./model_notification");

// Hàm kiểm tra ID hợp lệ (số nguyên dương)
function validateId(id) {
  // Chuyển đổi string thành number nếu cần
  const numericId = typeof id === "string" ? parseInt(id, 10) : id;

  if (
    !numericId ||
    typeof numericId !== "number" ||
    !Number.isInteger(numericId) ||
    numericId <= 0
  ) {
    throw new Error("ID must be a positive integer");
  }
  return numericId;
}

// Hàm kiểm tra số không âm
function validateNonNegativeNumber(value, fieldName) {
  if (!value || typeof value !== "number" || value < 0) {
    throw new Error(`${fieldName} must be a non-negative number`);
  }
  return value;
}

// Hàm kiểm tra chuỗi không rỗng và độ dài hợp lý
function validateString(value, fieldName, minLength = 1, maxLength = 255) {
  if (!value || typeof value !== "string") {
    throw new Error(`${fieldName} is required and must be a string`);
  }
  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    throw new Error(`${fieldName} cannot be empty`);
  }
  if (trimmedValue.length < minLength || trimmedValue.length > maxLength) {
    throw new Error(
      `${fieldName} must be between ${minLength} and ${maxLength} characters`
    );
  }
  return trimmedValue;
}

// Hàm kiểm tra trạng thái hợp lệ
function validateStatus(status) {
  const validStatuses = [
    "pending",
    "confirmed",
    "preparing",
    "shipping",
    "delivered",
    "cancelled",
    "paid",
    "failed",
  ];
  if (!status || typeof status !== "string") {
    throw new Error("Status is required and must be a string");
  }
  const trimmedStatus = status.trim().toLowerCase();
  if (!validStatuses.includes(trimmedStatus)) {
    throw new Error("Invalid status value");
  }
  return trimmedStatus;
}

// Hàm kiểm tra cart items
function validateCartItems(cartItems) {
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    throw new Error("Cart items must be a non-empty array");
  }
  cartItems.forEach((item) => {
    if (!item || typeof item !== "object") {
      throw new Error("Each cart item must be an object");
    }
    validateId(item.idProduct);
    validateNonNegativeNumber(item.quantity, "Quantity");
    validateString(item.size, "Size", 1, 2); // Ví dụ: 'S', 'M', 'L'
    validateNonNegativeNumber(item.price, "Price");
  });
  return cartItems;
}

// Hàm kiểm tra limit và offset
function validatePagination(limit, offset) {
  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error("Limit must be a non-negative integer");
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error("Offset must be a non-negative integer");
  }
  return { limit, offset };
}

// Create new order (transaction)
exports.createOrder = (orderData) => {
  return new Promise((resolve, reject) => {
    let connection;
    
    try {
      if (!orderData || typeof orderData !== "object") {
        throw new Error("Order data must be an object");
      }
      const {
        idUser,
        totalAmount,
        shippingAddress,
        paymentMethod,
        cartItems,
      } = orderData;

      validateId(idUser);
      validateNonNegativeNumber(totalAmount, "Total amount");
      validateString(shippingAddress, "Shipping address");
      validateString(paymentMethod, "Payment method");
      validateCartItems(cartItems);

      // Lấy connection từ pool
      db.getConnection((err, conn) => {
        if (err) return reject(err);
        
        connection = conn;
        
        // Bắt đầu transaction
        connection.beginTransaction((err) => {
          if (err) {
            connection.release();
            return reject(err);
          }

          const orderSql = `INSERT INTO orders (idUser, totalAmount, shippingAddress, paymentMethod) VALUES (?, ?, ?, ?)`;
          connection.query(
            orderSql,
            [idUser, totalAmount, shippingAddress, paymentMethod],
            (err, orderResult) => {
              if (err) {
                return connection.rollback(() => {
                  connection.release();
                  reject(err);
                });
              }

              const orderId = orderResult.insertId;
              const orderItemsSql = `INSERT INTO order_items (idOrder, idProduct, quantity, size, price) VALUES ?`;
              const orderItemsValues = cartItems.map((item) => [
                orderId,
                item.idProduct,
                item.quantity,
                item.size,
                item.price,
              ]);

              connection.query(orderItemsSql, [orderItemsValues], (err, itemsResult) => {
                if (err) {
                  return connection.rollback(() => {
                    connection.release();
                    reject(err);
                  });
                }

                modelNotification
                  .createForConnection(connection, {
                    userId: idUser,
                    title: `Đặt hàng thành công #${orderId}`,
                    message: `Đơn hàng #${orderId} đã được ghi nhận. Nhấn để xem chi tiết và theo dõi trạng thái.`,
                    type: "order_created",
                    relatedId: orderId,
                    eventKey: `order_created:${orderId}`,
                  })
                  .then(() => {
                    connection.commit((err) => {
                      if (err) {
                        return connection.rollback(() => {
                          connection.release();
                          reject(err);
                        });
                      }

                      connection.release();
                      resolve({
                        orderId,
                        message: "Order created successfully",
                        orderItems: itemsResult.affectedRows,
                      });
                    });
                  })
                  .catch((notificationError) => {
                    connection.rollback(() => {
                      connection.release();
                      reject(notificationError);
                    });
                  });
              });
            }
          );
        });
      });
    } catch (err) {
      if (connection) connection.release();
      reject(err);
    }
  });
};

// Get orders for a user
exports.getUserOrders = (idUser) => {
  return new Promise((resolve, reject) => {
    try {
      const validatedIdUser = validateId(idUser);
      const sql = `
                SELECT o.*, 
                       COUNT(oi.idOrderItem) as itemCount,
                       GROUP_CONCAT(p.nameProduct SEPARATOR ', ') as productNames
                FROM orders o
                LEFT JOIN order_items oi ON o.idOrder = oi.idOrder
                LEFT JOIN product p ON oi.idProduct = p.idProduct
                WHERE o.idUser = ?
                GROUP BY o.idOrder
                ORDER BY o.createdAt DESC
            `;
      db.query(sql, [validatedIdUser], (err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
    } catch (err) {
      reject(err);
    }
  });
};

// Get order details by order ID
exports.getOrderDetails = (orderId, idUser = null) => {
  return new Promise((resolve, reject) => {
    try {
      const validatedOrderId = validateId(orderId);
      let sql = `
                SELECT o.*, oi.*, p.nameProduct, p.imgProduct
                FROM orders o
                JOIN order_items oi ON o.idOrder = oi.idOrder
                JOIN product p ON oi.idProduct = p.idProduct
                WHERE o.idOrder = ?
            `;
      const params = [validatedOrderId];

      if (idUser) {
        validateId(idUser);
        sql += ` AND o.idUser = ?`;
        params.push(idUser);
      }

      sql += ` ORDER BY oi.idOrderItem`;

      db.query(sql, params, (err, result) => {
        if (err) return reject(err);
        if (result.length === 0) return resolve(null);

        const order = {
          idOrder: result[0].idOrder,
          idUser: result[0].idUser,
          totalAmount: result[0].totalAmount,
          status: result[0].status,
          shippingAddress: result[0].shippingAddress,
          customerName: result[0].customerName,
          customerPhone: result[0].customerPhone,
          paymentMethod: result[0].paymentMethod,
          paymentStatus: result[0].paymentStatus,
          orderNotes: result[0].orderNotes,
          createdAt: result[0].createdAt,
          updatedAt: result[0].updatedAt,
          items: result.map((item) => ({
            idOrderItem: item.idOrderItem,
            idProduct: item.idProduct,
            quantity: item.quantity,
            size: item.size,
            price: item.price,
            nameProduct: item.nameProduct,
            imgProduct: item.imgProduct,
          })),
        };
        resolve(order);
      });
    } catch (err) {
      reject(err);
    }
  });
};

// Get order by ID (simple)
exports.getOrderById = (orderId) => {
  return new Promise((resolve, reject) => {
    try {
      const validatedOrderId = validateId(orderId);
      const sql = `SELECT * FROM orders WHERE idOrder = ?`;
      
      db.query(sql, [validatedOrderId], (err, result) => {
        if (err) return reject(err);
        if (result.length === 0) return resolve(null);
        resolve(result[0]);
      });
    } catch (err) {
      reject(err);
    }
  });
};

// Get all orders (admin)
exports.getAllOrders = (limit = 50, offset = 0) => {
  return new Promise((resolve, reject) => {
    try {
      const { limit: validatedLimit, offset: validatedOffset } =
        validatePagination(limit, offset);
      const sql = `
                SELECT o.*, u.username, u.email,
                       COUNT(oi.idOrderItem) as itemCount
                FROM orders o
                JOIN user u ON o.idUser = u.idUser
                LEFT JOIN order_items oi ON o.idOrder = oi.idOrder
                GROUP BY o.idOrder
                ORDER BY o.createdAt DESC
                LIMIT ? OFFSET ?
            `;
      db.query(sql, [validatedLimit, validatedOffset], (err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
    } catch (err) {
      reject(err);
    }
  });
};

// Get order statistics
exports.getOrderStats = () => {
  return new Promise((resolve, reject) => {
    try {
      const sql = `
                SELECT 
                    COUNT(*) as totalOrders,
                    SUM(totalAmount) as totalRevenue,
                    AVG(totalAmount) as averageOrderValue,
                    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pendingOrders,
                    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completedOrders,
                    COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelledOrders
                FROM orders
            `;
      db.query(sql, (err, result) => {
        if (err) return reject(err);
        resolve(result[0]);
      });
    } catch (err) {
      reject(err);
    }
  });
};

// Delete order (admin)
exports.deleteOrder = (orderId) => {
  return new Promise((resolve, reject) => {
    try {
      const validatedOrderId = validateId(orderId);

      db.beginTransaction((err) => {
        if (err) return reject(err);

        const deleteItemsSql = `DELETE FROM order_items WHERE idOrder = ?`;
        db.query(deleteItemsSql, [validatedOrderId], (err) => {
          if (err) return db.rollback(() => reject(err));

          const deleteOrderSql = `DELETE FROM orders WHERE idOrder = ?`;
          db.query(deleteOrderSql, [validatedOrderId], (err, result) => {
            if (err) return db.rollback(() => reject(err));

            db.commit((err) => {
              if (err) return db.rollback(() => reject(err));
              resolve({
                message: "Order deleted successfully",
                affectedRows: result.affectedRows,
              });
            });
          });
        });
      });
    } catch (err) {
      reject(err);
    }
  });
};

// Tạo đơn hàng COD từ giỏ hàng đã chọn
module.exports.createCODOrder = function (orderData, cartItems) {
  return new Promise(async (resolve, reject) => {
    let connection;
    try {
      const {
        userId,
        customerName,
        customerPhone,
        shippingAddress,
        orderNotes,
      } = orderData;

      if (
        !userId ||
        !customerName ||
        !customerPhone ||
        !shippingAddress ||
        !cartItems.length
      ) {
        throw new Error("Missing required order information");
      }

      // Lấy connection từ pool
      connection = await db.getConnection();

      // Bắt đầu transaction
      await new Promise((resolve, reject) => {
        connection.beginTransaction((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Tính tổng tiền
      const totalAmount = cartItems.reduce(
        (total, item) => total + item.quantity * item.priceProduct,
        0
      );

      // Tạo đơn hàng
      const orderSql = `INSERT INTO orders (idUser, totalAmount, status, shippingAddress, customerName, customerPhone, paymentMethod, paymentStatus, orderNotes) 
                             VALUES (?, ?, 'pending', ?, ?, ?, 'COD', 'unpaid', ?)`;

      const orderResult = await new Promise((resolve, reject) => {
        connection.query(
          orderSql,
          [
            userId,
            totalAmount,
            shippingAddress,
            customerName,
            customerPhone,
            orderNotes || "",
          ],
          (err, result) => {
            if (err) reject(err);
            else resolve(result);
          }
        );
      });

      const orderId = orderResult.insertId;

      // Thêm chi tiết đơn hàng
      const orderItems = cartItems.map((item) => [
        orderId,
        item.idProduct,
        item.quantity,
        item.size || "M",
        item.priceProduct,
      ]);
      const itemsSql = `INSERT INTO order_items (idOrder, idProduct, quantity, size, price) VALUES ?`;

      await new Promise((resolve, reject) => {
        connection.query(itemsSql, [orderItems], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Xóa sản phẩm đã đặt khỏi giỏ hàng
      const cartIds = cartItems.map((item) => item.idCart);
      const deleteCartSql = `DELETE FROM cart WHERE idCart IN (${cartIds
        .map(() => "?")
        .join(",")})`;

      await new Promise((resolve, reject) => {
        connection.query(deleteCartSql, cartIds, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      await modelNotification.createForConnection(connection, {
        userId: userId,
        title: `Đặt hàng thành công #${orderId}`,
        message: `Đơn hàng #${orderId} đã được ghi nhận và đang chờ cửa hàng xác nhận.`,
        type: "order_created",
        relatedId: orderId,
        eventKey: `order_created:${orderId}`,
      });

      // Commit transaction
      await new Promise((resolve, reject) => {
        connection.commit((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      resolve({
        success: true,
        orderId: orderId,
        message:
          "Đặt hàng thành công! Đơn hàng sẽ được giao trong 2-3 ngày tới.",
      });
    } catch (err) {
      // Rollback nếu có lỗi
      if (connection) {
        await new Promise((resolve) => {
          connection.rollback(() => resolve());
        });
      }
      reject(err);
    } finally {
      // Đóng connection
      if (connection) {
        connection.release();
      }
    }
  });
};

// Lấy danh sách đơn hàng của user
module.exports.getUserOrders = function (userId) {
  return new Promise((resolve, reject) => {
    try {
      validateId(userId);

      const sql = `SELECT o.*, 
                         COUNT(oi.idOrderItem) as itemCount,
                         GROUP_CONCAT(p.nameProduct SEPARATOR ', ') as productNames
                         FROM orders o 
                         LEFT JOIN order_items oi ON o.idOrder = oi.idOrder
                         LEFT JOIN product p ON oi.idProduct = p.idProduct
                         WHERE o.idUser = ? 
                         GROUP BY o.idOrder
                         ORDER BY o.createdAt DESC`;

      db.query(sql, [userId], (err, results) => {
        if (err) return reject(err);
        resolve(results || []);
      });
    } catch (err) {
      reject(err);
    }
  });
};

// Cập nhật trạng thái đơn hàng; tùy chọn lưu thông tin giao dịch nếu schema hỗ trợ.
exports.updateOrderStatus = async (
  orderId,
  newStatus,
  transactionNo = null,
  notification = null
) => {
  const validatedOrderId = validateId(orderId);
  const validatedStatus = validateStatus(newStatus);

  if (notification) {
    let connection;
    try {
      connection = await new Promise((resolve, reject) => {
        db.getConnection((error, conn) => {
          if (error) return reject(error);
          resolve(conn);
        });
      });

      await new Promise((resolve, reject) => {
        connection.beginTransaction((error) => {
          if (error) return reject(error);
          resolve();
        });
      });

      const currentOrders = await new Promise((resolve, reject) => {
        connection.query(
          "SELECT idUser, status FROM orders WHERE idOrder = ? FOR UPDATE",
          [validatedOrderId],
          (error, rows) => {
            if (error) return reject(error);
            resolve(rows);
          }
        );
      });
      if (!currentOrders.length) {
        throw new Error("Order not found");
      }

      const currentStatus = String(currentOrders[0].status || "").toLowerCase();
      if (currentStatus !== validatedStatus) {
        const columns = await new Promise((resolve, reject) => {
          connection.query("SHOW COLUMNS FROM orders", (error, rows) => {
            if (error) return reject(error);
            resolve(rows);
          });
        });
        const availableColumns = new Set(
          columns.map((column) => column.Field)
        );
        const assignments = ["status = ?"];
        const params = [validatedStatus];

        if (availableColumns.has("paymentStatus")) {
          assignments.push("paymentStatus = ?");
          params.push(
            validatedStatus === "paid"
              ? "paid"
              : validatedStatus === "failed"
                ? "failed"
                : "unpaid"
          );
        }
        if (availableColumns.has("transactionNo") && validatedStatus === "paid") {
          assignments.push("transactionNo = ?");
          params.push(transactionNo);
        }
        if (availableColumns.has("updatedAt")) {
          assignments.push("updatedAt = CURRENT_TIMESTAMP");
        }

        params.push(validatedOrderId);
        await new Promise((resolve, reject) => {
          connection.query(
            `UPDATE orders SET ${assignments.join(", ")} WHERE idOrder = ?`,
            params,
            (error, result) => {
              if (error) return reject(error);
              if (result.affectedRows === 0) {
                return reject(new Error("Order not found"));
              }
              resolve();
            }
          );
        });

        await modelNotification.createForConnection(connection, {
          userId: currentOrders[0].idUser,
          title: notification.title,
          message: notification.message,
          type: notification.type,
          relatedId: validatedOrderId,
          eventKey: notification.eventKey,
        });
      }

      await new Promise((resolve, reject) => {
        connection.commit((error) => {
          if (error) return reject(error);
          resolve();
        });
      });
      return {
        success: true,
        message: `Cập nhật trạng thái đơn hàng thành công: ${validatedStatus}`,
      };
    } catch (error) {
      if (connection) {
        await new Promise((resolve) => {
          connection.rollback(() => resolve());
        });
      }
      throw error;
    } finally {
      if (connection) connection.release();
    }
  }

  const columns = await db.query("SHOW COLUMNS FROM orders");
  const availableColumns = new Set(columns.map((column) => column.Field));
  const assignments = ["status = ?"];
  const params = [validatedStatus];

  if (availableColumns.has("paymentStatus")) {
    assignments.push("paymentStatus = ?");
    params.push(
      validatedStatus === "paid"
        ? "paid"
        : validatedStatus === "failed"
          ? "failed"
          : "unpaid"
    );
  }
  if (availableColumns.has("transactionNo") && validatedStatus === "paid") {
    assignments.push("transactionNo = ?");
    params.push(transactionNo);
  }
  if (availableColumns.has("updatedAt")) {
    assignments.push("updatedAt = CURRENT_TIMESTAMP");
  }

  params.push(validatedOrderId);
  const sql = `UPDATE orders SET ${assignments.join(", ")} WHERE idOrder = ?`;
  const result = await db.query(sql, params);
  if (result.affectedRows === 0) {
    throw new Error("Order not found");
  }

  return {
    success: true,
    message: `Cập nhật trạng thái đơn hàng thành công: ${validatedStatus}`,
  };
};

// Hủy đơn hàng (chỉ khi đang pending hoặc confirmed)
module.exports.cancelOrder = function (orderId, userId, reason) {
  return new Promise((resolve, reject) => {
    try {
      validateId(orderId);
      validateId(userId);

      // Kiểm tra đơn hàng có thể hủy không
      const checkSql = `SELECT status FROM orders WHERE idOrder = ? AND idUser = ?`;

      db.query(checkSql, [orderId, userId], (err, result) => {
        if (err) return reject(err);
        if (result.length === 0) return reject(new Error("Order not found"));

        const currentStatus = result[0].status;
        if (!["pending", "confirmed"].includes(currentStatus)) {
          return reject(new Error("Không thể hủy đơn hàng đã được xử lý"));
        }

        // Cập nhật trạng thái hủy
        const updateSql = `UPDATE orders SET status = 'cancelled', orderNotes = CONCAT(IFNULL(orderNotes, ''), '\nLý do hủy: ', ?) WHERE idOrder = ?`;

        db.query(
          updateSql,
          [reason || "Khách hàng hủy", orderId],
          (err, updateResult) => {
            if (err) return reject(err);

            resolve({
              success: true,
              message: "Đã hủy đơn hàng thành công",
            });
          }
        );
      });
    } catch (err) {
      reject(err);
    }
  });
};
