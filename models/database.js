require('dotenv').config();
const mysql = require('mysql2');
const util = require('util');

const pool = mysql.createPool({
  connectionLimit: 10,
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'helmet_store',
  charset: 'utf8mb4'
});

// Promisify pool.query để dùng async/await (giữ nguyên để tương thích với code cũ)
pool.query = util.promisify(pool.query);

// Không promisify getConnection vì cần dùng callback để xử lý transaction
// pool.getConnection sẽ giữ nguyên dạng callback

pool.on('error', (err) => {
  console.error('MySQL pool error', err);
});

async function testConnection() {
  try {
    pool.getConnection((err, conn) => {
      if (err) {
        console.error('Database connection failed:', err);
        process.exit(1);
      }
      conn.release();
      console.log('Database pool created and connection tested.');
    });
  } catch (err) {
    console.error('Database connection failed:', err);
    process.exit(1);
  }
}

testConnection();

module.exports = pool;