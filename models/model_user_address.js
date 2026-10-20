var db = require("./database");

// Get all addresses for a user
function getAllAddresses(userId) {
  return new Promise((resolve, reject) => {
    const sql = `SELECT * FROM user_addresses WHERE idUser = ? ORDER BY isDefault DESC, createdAt DESC`;
    db.query(sql, [userId], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results);
      }
    });
  });
}

// Get default address for a user
function getDefaultAddress(userId) {
  return new Promise((resolve, reject) => {
    const sql = `SELECT * FROM user_addresses WHERE idUser = ? AND isDefault = 1 LIMIT 1`;
    db.query(sql, [userId], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results.length > 0 ? results[0] : null);
      }
    });
  });
}

// Create new address
function createAddress(addressData) {
  return new Promise((resolve, reject) => {
    const {
      idUser,
      fullName,
      phone,
      province,
      district,
      ward,
      detailAddress,
      addressType,
      isDefault,
    } = addressData;

    if (isDefault) {
      // If setting as default, first remove default from all other addresses
      const resetSql = `UPDATE user_addresses SET isDefault = 0 WHERE idUser = ?`;
      db.query(resetSql, [idUser], (resetErr) => {
        if (resetErr) {
          reject(resetErr);
          return;
        }

        // Then insert new address
        const insertSql = `INSERT INTO user_addresses 
                    (idUser, fullName, phone, province, district, ward, detailAddress, addressType, isDefault) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        db.query(
          insertSql,
          [
            idUser,
            fullName,
            phone,
            province,
            district,
            ward,
            detailAddress,
            addressType,
            1,
          ],
          (err, result) => {
            if (err) {
              reject(err);
            } else {
              resolve(result);
            }
          }
        );
      });
    } else {
      // Just insert new address without setting as default
      const insertSql = `INSERT INTO user_addresses 
                (idUser, fullName, phone, province, district, ward, detailAddress, addressType, isDefault) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      db.query(
        insertSql,
        [
          idUser,
          fullName,
          phone,
          province,
          district,
          ward,
          detailAddress,
          addressType,
          0,
        ],
        (err, result) => {
          if (err) {
            reject(err);
          } else {
            resolve(result);
          }
        }
      );
    }
  });
}

// Set address as default
function setDefaultAddress(addressId, userId) {
  return new Promise((resolve, reject) => {
    // Reset all addresses to not default
    const resetSql = `UPDATE user_addresses SET isDefault = 0 WHERE idUser = ?`;

    db.query(resetSql, [userId], (err) => {
      if (err) {
        reject(err);
        return;
      }

      // Set the selected address as default
      const setSql = `UPDATE user_addresses SET isDefault = 1 WHERE idAddress = ? AND idUser = ?`;
      db.query(setSql, [addressId, userId], (err2, result) => {
        if (err2) {
          reject(err2);
        } else {
          resolve(result);
        }
      });
    });
  });
}

// Delete address
function deleteAddress(addressId, userId) {
  return new Promise((resolve, reject) => {
    const sql = `DELETE FROM user_addresses WHERE idAddress = ? AND idUser = ?`;
    db.query(sql, [addressId, userId], (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
}

// Update address
function updateAddress(addressId, addressData) {
  console.log("=== MODEL UPDATE ADDRESS ===");
  console.log("addressId:", addressId);
  console.log("addressData:", addressData);

  return new Promise((resolve, reject) => {
    const {
      fullName,
      phone,
      province,
      district,
      ward,
      detailAddress,
      addressType,
    } = addressData;

    const sql = `UPDATE user_addresses SET 
            fullName = ?, phone = ?, province = ?, district = ?, ward = ?, 
            detailAddress = ?, addressType = ?, updatedAt = NOW() 
            WHERE idAddress = ?`;

    console.log("SQL Query:", sql);
    console.log("SQL Params:", [
      fullName,
      phone,
      province,
      district,
      ward,
      detailAddress,
      addressType,
      addressId,
    ]);

    db.query(
      sql,
      [
        fullName,
        phone,
        province,
        district,
        ward,
        detailAddress,
        addressType,
        addressId,
      ],
      (err, result) => {
        if (err) {
          console.error("SQL Error in updateAddress:", err);
          reject(err);
        } else {
          console.log("Update result:", result);
          console.log("Affected rows:", result.affectedRows);

          if (result.affectedRows === 0) {
            console.log("WARNING: No rows affected - address not found");
            reject(
              new Error(
                "Không tìm thấy địa chỉ hoặc bạn không có quyền cập nhật"
              )
            );
          } else {
            resolve(result);
          }
        }
      }
    );
  });
}

module.exports = {
  getAllAddresses,
  getDefaultAddress,
  createAddress,
  setDefaultAddress,
  deleteAddress,
  updateAddress,
};
