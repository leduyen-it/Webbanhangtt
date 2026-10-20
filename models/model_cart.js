var db = require("./database");

// Hàm kiểm tra ID hợp lệ (số nguyên dương)
function validateId(id) {
  if (!id || typeof id !== "number" || !Number.isInteger(id) || id <= 0) {
    throw new Error("ID must be a positive integer");
  }
  return id;
}

// Hàm kiểm tra số lượng hợp lệ
function validateQuantity(quantity) {
  if (
    !quantity ||
    typeof quantity !== "number" ||
    !Number.isInteger(quantity) ||
    quantity <= 0
  ) {
    throw new Error("Quantity must be a positive integer");
  }
  return quantity;
}

// Hàm kiểm tra kích thước hợp lệ
function validateSize(size) {
  const validSizes = ["S", "M", "L"];
  if (!size || typeof size !== "string") {
    throw new Error("Size is required and must be a string");
  }
  const trimmedSize = size.trim();
  if (trimmedSize.length === 0) {
    throw new Error("Size cannot be empty");
  }
  if (!validSizes.includes(trimmedSize.toUpperCase())) {
    throw new Error("Size must be S, M, or L");
  }
  return trimmedSize.toUpperCase();
}

// Hàm kiểm tra session cart
function validateSessionCart(sessionCart) {
  if (
    !sessionCart ||
    typeof sessionCart !== "object" ||
    Array.isArray(sessionCart)
  ) {
    throw new Error("Session cart must be a valid object");
  }
  return sessionCart;
}

// Add item to cart
exports.addToCart = (idUser, idProduct, quantity, size) => {
  return new Promise((resolve, reject) => {
    try {
      const validatedIdUser = validateId(idUser);
      const validatedIdProduct = validateId(idProduct);
      const validatedQuantity = validateQuantity(quantity);
      const validatedSize = validateSize(size);

      const checkSql = `SELECT * FROM cart WHERE idUser = ? AND idProduct = ? AND size = ?`;
      db.query(
        checkSql,
        [validatedIdUser, validatedIdProduct, validatedSize],
        (err, result) => {
          if (err) return reject(err);

          if (result.length > 0) {
            const updateSql = `UPDATE cart SET quantity = quantity + ? WHERE idUser = ? AND idProduct = ? AND size = ?`;
            db.query(
              updateSql,
              [
                validatedQuantity,
                validatedIdUser,
                validatedIdProduct,
                validatedSize,
              ],
              (err, result) => {
                if (err) return reject(err);
                resolve({
                  message: "Đã cập nhật giỏ hàng",
                  affectedRows: result.affectedRows,
                });
              }
            );
          } else {
            const insertSql = `INSERT INTO cart (idUser, idProduct, quantity, size) VALUES (?, ?, ?, ?)`;
            db.query(
              insertSql,
              [
                validatedIdUser,
                validatedIdProduct,
                validatedQuantity,
                validatedSize,
              ],
              (err, result) => {
                if (err) return reject(err);
                resolve({
                  message: "Đã thêm sản phẩm vào giỏ hàng",
                  insertId: result.insertId,
                });
              }
            );
          }
        }
      );
    } catch (err) {
      reject(err);
    }
  });
};

// Get cart items for a user
exports.getCartItems = (idUser) => {
  return new Promise((resolve, reject) => {
    try {
      const validatedIdUser = validateId(idUser);
      const sql = `
                SELECT c.*, p.nameProduct, p.imgProduct, p.priceProduct, p.S, p.M, p.L
                FROM cart c
                JOIN product p ON c.idProduct = p.idProduct
                WHERE c.idUser = ?
                ORDER BY c.createdAt DESC
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

// Update cart item quantity
exports.updateCartQuantity = (idCart, quantity) => {
  return new Promise((resolve, reject) => {
    try {
      const validatedIdCart = validateId(idCart);
      const validatedQuantity = validateQuantity(quantity);

      if (validatedQuantity <= 0) {
        const deleteSql = `DELETE FROM cart WHERE idCart = ?`;
        db.query(deleteSql, [validatedIdCart], (err, result) => {
          if (err) return reject(err);
          resolve({
            message: "Item removed from cart",
            affectedRows: result.affectedRows,
          });
        });
      } else {
        const updateSql = `UPDATE cart SET quantity = ? WHERE idCart = ?`;
        db.query(
          updateSql,
          [validatedQuantity, validatedIdCart],
          (err, result) => {
            if (err) return reject(err);
            resolve({
              message: "Cart quantity updated",
              affectedRows: result.affectedRows,
            });
          }
        );
      }
    } catch (err) {
      reject(err);
    }
  });
};

// Remove item from cart
exports.removeFromCart = (idCart) => {
  return new Promise((resolve, reject) => {
    try {
      const validatedIdCart = validateId(idCart);
      const sql = `DELETE FROM cart WHERE idCart = ?`;
      db.query(sql, [validatedIdCart], (err, result) => {
        if (err) return reject(err);
        resolve({
          message: "Item removed from cart",
          affectedRows: result.affectedRows,
        });
      });
    } catch (err) {
      reject(err);
    }
  });
};

// Clear entire cart for a user
exports.clearCart = (idUser) => {
  return new Promise((resolve, reject) => {
    try {
      const validatedIdUser = validateId(idUser);
      const sql = `DELETE FROM cart WHERE idUser = ?`;
      db.query(sql, [validatedIdUser], (err, result) => {
        if (err) return reject(err);
        resolve({ message: "Cart cleared", affectedRows: result.affectedRows });
      });
    } catch (err) {
      reject(err);
    }
  });
};

// Get cart count for a user
exports.getCartCount = (idUser) => {
  return new Promise((resolve, reject) => {
    try {
      const validatedIdUser = validateId(idUser);
      const sql = `SELECT SUM(quantity) as totalItems FROM cart WHERE idUser = ?`;
      db.query(sql, [validatedIdUser], (err, result) => {
        if (err) return reject(err);
        resolve(result[0].totalItems || 0);
      });
    } catch (err) {
      reject(err);
    }
  });
};

// Get cart total for a user
exports.getCartTotal = (idUser) => {
  return new Promise((resolve, reject) => {
    try {
      const validatedIdUser = validateId(idUser);
      const sql = `
                SELECT SUM(c.quantity * p.priceProduct) as total
                FROM cart c
                JOIN product p ON c.idProduct = p.idProduct
                WHERE c.idUser = ?
            `;
      db.query(sql, [validatedIdUser], (err, result) => {
        if (err) return reject(err);
        resolve(result[0].total || 0);
      });
    } catch (err) {
      reject(err);
    }
  });
};

// Add to cart for guest users (session)
exports.addToCartGuest = (sessionCart, idProduct, quantity, size) => {
  try {
    const validatedSessionCart = validateSessionCart(sessionCart);
    const validatedIdProduct = validateId(idProduct);
    const validatedQuantity = validateQuantity(quantity);
    const validatedSize = validateSize(size);

    const cartKey = `${validatedIdProduct}_${validatedSize}`;
    if (validatedSessionCart[cartKey]) {
      validatedSessionCart[cartKey].quantity += validatedQuantity;
    } else {
      validatedSessionCart[cartKey] = {
        idProduct: validatedIdProduct,
        quantity: validatedQuantity,
        size: validatedSize,
      };
    }
    return validatedSessionCart;
  } catch (err) {
    throw err;
  }
};

// Get guest cart items
exports.getGuestCartItems = (sessionCart) => {
  return new Promise((resolve, reject) => {
    try {
      const validatedSessionCart = validateSessionCart(sessionCart);
      if (
        !validatedSessionCart ||
        Object.keys(validatedSessionCart).length === 0
      )
        return resolve([]);

      const cartItems = Object.values(validatedSessionCart);
      const productIds = cartItems.map((item) => item.idProduct);
      const placeholders = productIds.map(() => "?").join(",");
      const sql = `SELECT * FROM product WHERE idProduct IN (${placeholders})`;

      db.query(sql, productIds, (err, products) => {
        if (err) return reject(err);

        const cartItemsWithDetails = cartItems.map((cartItem) => {
          const product = products.find(
            (p) => p.idProduct === cartItem.idProduct
          );
          return {
            ...cartItem,
            nameProduct: product?.nameProduct,
            imgProduct: product?.imgProduct,
            priceProduct: product?.priceProduct,
            S: product?.S,
            M: product?.M,
            L: product?.L,
          };
        });
        resolve(cartItemsWithDetails);
      });
    } catch (err) {
      reject(err);
    }
  });
};

// Lấy các sản phẩm đã chọn từ giỏ hàng để đặt hàng
exports.getSelectedCartItems = (userId, selectedCartIds) => {
  return new Promise((resolve, reject) => {
    try {
      console.log("=== GET SELECTED CART ITEMS ===");
      console.log("userId:", userId);
      console.log("selectedCartIds:", selectedCartIds);
      console.log("selectedCartIds type:", typeof selectedCartIds);
      console.log("selectedCartIds isArray:", Array.isArray(selectedCartIds));

      const validatedUserId = validateId(userId);

      if (!Array.isArray(selectedCartIds) || selectedCartIds.length === 0) {
        console.log("Empty or invalid selectedCartIds, returning empty array");
        return resolve([]);
      }

      // Validate tất cả cart IDs
      const validatedCartIds = selectedCartIds.map((id) => {
        console.log("Processing cart ID:", id, "type:", typeof id);
        const cartId = parseInt(id);
        console.log("Parsed cart ID:", cartId);
        if (!cartId || cartId <= 0) {
          throw new Error("Invalid cart ID: " + id);
        }
        return cartId;
      });

      console.log("Final validatedCartIds:", validatedCartIds);

      const placeholders = validatedCartIds.map(() => "?").join(",");
      const sql = `
                SELECT c.*, p.nameProduct, p.imgProduct, p.priceProduct 
                FROM cart c 
                LEFT JOIN product p ON c.idProduct = p.idProduct 
                WHERE c.idUser = ? AND c.idCart IN (${placeholders})
            `;

      db.query(sql, [validatedUserId, ...validatedCartIds], (err, results) => {
        if (err) {
          console.error("Database error in getSelectedCartItems:", err);
          return reject(err);
        }
        resolve(results || []);
      });
    } catch (err) {
      reject(err);
    }
  });
};
