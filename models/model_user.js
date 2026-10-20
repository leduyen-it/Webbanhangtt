// E:\NNKichBan_CuoiKy\helmet_store\models\model_user.js
const db = require('./database'); // đã là pool promisified

// Hàm kiểm tra định dạng email
function validateEmail(email) {
    const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/;
    if (!email || typeof email !== 'string') {
        throw new Error('Email is required and must be a string');
    }
    email = email.trim();
    if (email.length === 0) {
        throw new Error('Email cannot be empty');
    }
    if (!emailRegex.test(email)) {
        throw new Error('Invalid email format');
    }
    return email;
}

// Hàm kiểm tra định dạng username
function validateUsername(username) {
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!username || typeof username !== 'string') {
        throw new Error('Username is required and must be a string');
    }
    username = username.trim();
    if (username.length === 0) {
        throw new Error('Username cannot be empty');
    }
    if (username.length < 3 || username.length > 20) {
        throw new Error('Username must be between 3 and 20 characters');
    }
    if (!usernameRegex.test(username)) {
        throw new Error('Username can only contain letters, numbers, and underscores');
    }
    return username;
}

// Kiểm tra email an toàn
exports.checkEmail = async (email) => {
    try {
        const sql = 'SELECT * FROM user WHERE email = ?';
        const results = await db.query(sql, [email]);
        return results[0] || null; // trả về null nếu không tìm thấy
    } catch (err) {
        console.error('Error checking email:', err);
        throw err;
    }
};

// Kiểm tra username an toàn
exports.checkUsername = async (username) => {
    try {
        const sql = 'SELECT * FROM user WHERE username = ?';
        const results = await db.query(sql, [username]);
        return results[0] || null;
    } catch (err) {
        console.error('Error checking username:', err);
        throw err;
    }
};

// Lấy user theo email
exports.getUserByEmail = async (email) => {
    try {
        const sql = 'SELECT * FROM user WHERE email = ?';
        const results = await db.query(sql, [email]);
        return results[0] || null;
    } catch (err) {
        console.error('Error getting user by email:', err);
        throw err;
    }
};

// Cập nhật mật khẩu theo email
exports.updatePasswordByEmail = async (email, newPassword) => {
    try {
        const sql = 'UPDATE user SET password = ? WHERE email = ?';
        await db.query(sql, [newPassword, email]);
    } catch (err) {
        console.error('Error updating password by email:', err);
        throw err;
    }
};
