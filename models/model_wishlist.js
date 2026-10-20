var db = require('./database');

// Add item to wishlist
exports.addToWishlist = (idUser, idProduct) => {
    return new Promise((resolve, reject) => {
        const checkSql = "SELECT * FROM wishlist WHERE idUser = ? AND idProduct = ?";
        db.query(checkSql, [idUser, idProduct], (err, result) => {
            if (err) return reject(err);

            if (result.length > 0) {
                return resolve({ message: 'Item already in wishlist', exists: true });
            }

            const insertSql = "INSERT INTO wishlist (idUser, idProduct) VALUES (?, ?)";
            db.query(insertSql, [idUser, idProduct], (err, result) => {
                if (err) return reject(err);
                resolve({ message: 'Đã thêm sản phẩm vào danh sách yêu thích', insertId: result.insertId });
            });
        });
    });
};

// Remove item from wishlist
exports.removeFromWishlist = (idUser, idProduct) => {
    return new Promise((resolve, reject) => {
        const sql = "DELETE FROM wishlist WHERE idUser = ? AND idProduct = ?";
        db.query(sql, [idUser, idProduct], (err, result) => {
            if (err) return reject(err);
            resolve({ message: 'Item removed from wishlist', affectedRows: result.affectedRows });
        });
    });
};

// Get wishlist items for a user
exports.getWishlistItems = (idUser) => {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT w.*, p.nameProduct, p.imgProduct, p.priceProduct, p.S, p.M, p.L
            FROM wishlist w
            JOIN product p ON w.idProduct = p.idProduct
            WHERE w.idUser = ?
            ORDER BY w.createdAt DESC
        `;
        db.query(sql, [idUser], (err, result) => {
            if (err) return reject(err);
            resolve(result);
        });
    });
};

// Check if item is in wishlist
exports.isInWishlist = (idUser, idProduct) => {
    return new Promise((resolve, reject) => {
        const sql = "SELECT * FROM wishlist WHERE idUser = ? AND idProduct = ?";
        db.query(sql, [idUser, idProduct], (err, result) => {
            if (err) return reject(err);
            resolve(result.length > 0);
        });
    });
};

// Get wishlist product IDs for a user
exports.getUserWishlistIds = (idUser) => {
    return new Promise((resolve, reject) => {
        const sql = "SELECT idProduct FROM wishlist WHERE idUser = ?";
        db.query(sql, [idUser], (err, result) => {
            if (err) return reject(err);
            resolve(result.map(row => row.idProduct));
        });
    });
};

// Get wishlist count for a user
exports.getWishlistCount = (idUser) => {
    return new Promise((resolve, reject) => {
        const sql = "SELECT COUNT(*) as totalItems FROM wishlist WHERE idUser = ?";
        db.query(sql, [idUser], (err, result) => {
            if (err) return reject(err);
            resolve(result[0]?.totalItems || 0);
        });
    });
};

// Clear entire wishlist for a user
exports.clearWishlist = (idUser) => {
    return new Promise((resolve, reject) => {
        const sql = "DELETE FROM wishlist WHERE idUser = ?";
        db.query(sql, [idUser], (err, result) => {
            if (err) return reject(err);
            resolve({ message: 'Wishlist cleared', affectedRows: result.affectedRows });
        });
    });
};

// Add to wishlist for guest users (using session)
exports.addToWishlistGuest = (sessionWishlist, idProduct) => {
    if (!sessionWishlist.includes(idProduct)) {
        sessionWishlist.push(idProduct);
    }
    return sessionWishlist;
};

// Remove from wishlist for guest users
exports.removeFromWishlistGuest = (sessionWishlist, idProduct) => {
    return sessionWishlist.filter(id => id != idProduct);
};

// Get guest wishlist items with product details
exports.getGuestWishlistItems = (sessionWishlist) => {
    return new Promise((resolve, reject) => {
        if (!sessionWishlist || sessionWishlist.length === 0) {
            return resolve([]);
        }

        const placeholders = sessionWishlist.map(() => '?').join(',');
        const sql = `SELECT * FROM product WHERE idProduct IN (${placeholders})`;
        db.query(sql, sessionWishlist, (err, result) => {
            if (err) return reject(err);
            resolve(result);
        });
    });
};
