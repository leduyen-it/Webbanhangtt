
require('dotenv').config();

const mysql = require('mysql2');
const util = require('util');

const config = {
  connectionLimit: 10,
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'helmet_store',
  charset: 'utf8mb4'
};

// Bật SSL khi kết nối Aiven
if (process.env.DB_SSL_CA) {
  config.ssl = {
    ca: process.env.DB_SSL_CA.replace(/\\n/g, '\n'),
    rejectUnauthorized: true
  };
}

const pool = mysql.createPool(config);

// Promisify pool.query để sử dụng async/await
pool.query = util.promisify(pool.query);

// Giữ nguyên getConnection dạng callback để tương thích transaction
pool.on('error', (err) => {
  console.error('MySQL pool error:', err);
});

// Kiểm tra kết nối database
function testConnection() {
  pool.getConnection((err, conn) => {
    if (err) {
      console.error('Database connection failed:', err);
      return;
    }

    conn.release();
    console.log('Database pool created and connection tested.');
  });
}

testConnection();

module.exports = pool;
