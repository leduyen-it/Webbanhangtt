// E:\NNKichBan_CuoiKy\helmet_store\models\model_review.js
const db = require('./database');

// Kiểm tra xem user đã mua sản phẩm này chưa
exports.checkUserPurchased = async (idUser, idProduct) => {
    try {
        const sql = `
            SELECT COUNT(*) as purchased 
            FROM orders o 
            INNER JOIN order_items oi ON o.idOrder = oi.idOrder 
            WHERE o.idUser = ?
              AND oi.idProduct = ?
              AND LOWER(o.status) IN ('paid', 'delivered', 'completed')
        `;
        const results = await db.query(sql, [idUser, idProduct]);
        return results[0].purchased > 0;
    } catch (err) {
        console.error('Error checking user purchase:', err);
        throw err;
    }
};

// Kiểm tra xem user đã đánh giá sản phẩm này chưa  
exports.checkUserReviewed = async (idUser, idProduct) => {
    try {
        const sql = `
            SELECT COUNT(*) as reviewed 
            FROM comment 
            WHERE idUser = ? AND idProduct = ?
        `;
        const results = await db.query(sql, [idUser, idProduct]);
        return results[0].reviewed > 0;
    } catch (err) {
        console.error('Error checking user review:', err);
        throw err;
    }
};

// Thêm đánh giá mới
exports.addReview = async (reviewData) => {
    try {
        const { idUser, idProduct, content, rating, ten, email } = reviewData;
        
        const sql = `
            INSERT INTO comment (idUser, idProduct, content, rating, ten, email, date) 
            VALUES (?, ?, ?, ?, ?, ?, NOW())
        `;
        
        const result = await db.query(sql, [idUser, idProduct, content, rating, ten, email]);
        return result.insertId;
    } catch (err) {
        console.error('Error adding review:', err);
        throw err;
    }
};

// Lấy đánh giá của sản phẩm
exports.getProductReviews = async (idProduct) => {
    try {
        const sql = `
            SELECT c.*, u.ho, u.ten as userName 
            FROM comment c 
            LEFT JOIN user u ON c.idUser = u.idUser 
            WHERE c.idProduct = ? 
            ORDER BY c.date DESC
        `;
        const results = await db.query(sql, [idProduct]);
        return results;
    } catch (err) {
        console.error('Error getting product reviews:', err);
        throw err;
    }
};

// Tính rating trung bình của sản phẩm
exports.getAverageRating = async (idProduct) => {
    try {
        const sql = `
            SELECT 
                AVG(rating) as avgRating,
                COUNT(*) as totalReviews
            FROM comment 
            WHERE idProduct = ?
        `;
        const results = await db.query(sql, [idProduct]);
        return {
            avgRating: results[0].avgRating || 0,
            totalReviews: results[0].totalReviews || 0
        };
    } catch (err) {
        console.error('Error getting average rating:', err);
        throw err;
    }
};