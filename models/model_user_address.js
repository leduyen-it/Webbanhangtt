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

    db.getConnection((connectionError, connection) => {
      if (connectionError) {
        reject(connectionError);
        return;
      }

      const query = (sql, params) =>
        new Promise((queryResolve, queryReject) => {
          connection.query(sql, params, (err, result) => {
            if (err) queryReject(err);
            else queryResolve(result);
          });
        });

      const rollback = (error) => {
        connection.rollback((rollbackError) => {
          connection.release();
          if (rollbackError) {
            error.message += `; rollback failed: ${rollbackError.message}`;
          }
          reject(error);
        });
      };

      connection.beginTransaction(async (transactionError) => {
        if (transactionError) {
          connection.release();
          reject(transactionError);
          return;
        }

        try {
          const users = await query(
            "SELECT idUser FROM user WHERE idUser = ? FOR UPDATE",
            [idUser]
          );
          if (!users.length) throw new Error("Không tìm thấy tài khoản.");

          const addresses = await query(
            "SELECT idAddress FROM user_addresses WHERE idUser = ?",
            [idUser]
          );
          if (addresses.length >= 3) {
            const limitError = new Error(
              "Mỗi tài khoản chỉ được lưu tối đa 3 địa chỉ."
            );
            limitError.code = "ADDRESS_LIMIT_REACHED";
            throw limitError;
          }

          if (isDefault) {
            await query(
              "UPDATE user_addresses SET isDefault = 0 WHERE idUser = ?",
              [idUser]
            );
          }

          const result = await query(
            `INSERT INTO user_addresses
              (idUser, fullName, phone, province, district, ward, detailAddress, addressType, isDefault)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              idUser,
              fullName,
              phone,
              province,
              district,
              ward,
              detailAddress,
              addressType,
              isDefault ? 1 : 0,
            ]
          );

          connection.commit((commitError) => {
            if (commitError) {
              rollback(commitError);
              return;
            }
            connection.release();
            resolve(result);
          });
        } catch (error) {
          rollback(error);
        }
      });
    });
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
function updateAddress(addressId, userId, addressData) {
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
            WHERE idAddress = ? AND idUser = ?`;

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
      userId,
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
        userId,
      ],
      (err, result) => {
        if (err) {
          console.error("SQL Error in updateAddress:", err);
          reject(err);
        } else {
          console.log("Update result:", result);
          console.log("Affected rows:", result.affectedRows);

          if (result.affectedRows === 0) {
            const existsSql =
              "SELECT idAddress FROM user_addresses WHERE idAddress = ? AND idUser = ? LIMIT 1";
            db.query(existsSql, [addressId, userId], (checkErr, rows) => {
              if (checkErr) {
                reject(checkErr);
              } else if (rows.length === 0) {
                reject(
                  new Error(
                    "Không tìm thấy địa chỉ hoặc bạn không có quyền cập nhật"
                  )
                );
              } else {
                resolve(result);
              }
            });
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
