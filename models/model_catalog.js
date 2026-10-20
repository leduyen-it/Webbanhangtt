var db = require('./database'); // Kết nối database
var dataList = [];
var dataListPro = [];

exports.list = async () => {
    return new Promise((resolve, reject) => {
        const sql = "SELECT * FROM catalog";
        db.query(sql, (err, result) => {
            if (err) {
                console.error('Lỗi truy vấn:', err);
                return reject(err);
            }
            console.log('Get List catalog success');
            resolve(result);
        });
    });
};

exports.listByName = async (nameCat) => {
    return new Promise((resolve, reject) => {
        const sql1 = "SELECT idCat FROM catalog WHERE nameCat = ?";
        db.query(sql1, [nameCat], (err, result1) => {
            if (err) {
                console.error('Lỗi truy vấn catalog:', err);
                return reject(err);
            }

            if (!result1.length) {
                console.warn('Không tìm thấy danh mục:', nameCat);
                return resolve([]); // Trả mảng rỗng nếu không có danh mục
            }

            const idCat = result1[0].idCat;
            const sql2 = "SELECT * FROM product WHERE idCat = ?";
            db.query(sql2, [idCat], (err, result2) => {
                if (err) {
                    console.error('Lỗi truy vấn product:', err);
                    return reject(err);
                }
                console.log('Get list product by idCat success');
                resolve(result2);
            });
        });
    });
};
