const db = require('./database');

// Hàm kiểm tra ID hợp lệ (số nguyên dương)
function validateId(id) {
    if (!id || typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
        throw new Error('ID must be a positive integer');
    }
    return id;
}

// Hàm kiểm tra chuỗi không rỗng và độ dài hợp lý
function validateString(value, fieldName, minLength = 1, maxLength = 255) {
    if (!value || typeof value !== 'string') {
        throw new Error(`${fieldName} is required and must be a string`);
    }
    const trimmedValue = value.trim();
    if (trimmedValue.length === 0) {
        throw new Error(`${fieldName} cannot be empty`);
    }
    if (trimmedValue.length < minLength || trimmedValue.length > maxLength) {
        throw new Error(`${fieldName} must be between ${minLength} and ${maxLength} characters`);
    }
    return trimmedValue;
}

// Hàm kiểm tra số hợp lệ (giá tiền)
function validatePrice(price) {
    if (!price || typeof price !== 'number' || price < 0) {
        throw new Error('Price must be a non-negative number');
    }
    return price;
}

// Hàm kiểm tra dữ liệu tạo/cập nhật sản phẩm
function validateProductData(data) {
    if (!data || typeof data !== 'object') {
        throw new Error('Product data must be an object');
    }
    data.name = validateString(data.name, 'Name');
    data.shortDesc = validateString(data.shortDesc, 'Short description', 1, 500);
    data.images = validateString(data.images, 'Images');
    data.description = validateString(data.description, 'Description', 1, 1000);
    data.dateUpdate = data.dateUpdate || new Date().toISOString().split('T')[0];
    data.price = validatePrice(data.price);
    data.author = validateString(data.author, 'Author');
    if (data.idCat !== undefined && (typeof data.idCat !== 'number' || data.idCat <= 0)) {
        throw new Error('Category ID must be a positive integer');
    }
    if (data.showHide !== undefined && typeof data.showHide !== 'boolean') {
        throw new Error('ShowHide must be a boolean');
    }
    return data;
}

// Hàm xử lý tên
function xoa_dau(str) {
    str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
    str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
    str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
    str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
    str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
    str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
    str = str.replace(/đ/g, "d");
    str = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    str = str.split(' ').join('-');
    return str;
}

function replaceNameProduct(nameProduct) {
    return xoa_dau(nameProduct);
}

// Lấy danh sách sản phẩm
exports.list = async () => {
    try {
        const sql = "SELECT * FROM product";
        const result = await db.query(sql);
        console.log('List success');
        return result;
    } catch (err) {
        console.error('Error getting product list:', err);
        throw err;
    }
};

// Chi tiết sản phẩm theo id
exports.detail = async (idProduct) => {
    try {
        const validatedId = validateId(idProduct);
        const sql = "SELECT * FROM product WHERE idProduct = ?";
        const result = await db.query(sql, [validatedId]);
        console.log('Detail success');
        return result[0] || null;
    } catch (err) {
        console.error('Error getting product detail:', err);
        throw err;
    }
};

// Chi tiết sản phẩm theo tên
exports.detailByName = async (name) => {
    try {
        const validatedName = validateString(name, 'Name');
        const sql = "SELECT * FROM product";
        const result = await db.query(sql);

        const normalizedName = replaceNameProduct(validatedName.toLowerCase());
        const filterProduct = result.find(product =>
            replaceNameProduct(product.nameProduct.toLowerCase()) === normalizedName
        );

        return filterProduct || null;
    } catch (err) {
        console.error('Error getting product by name:', err);
        throw err;
    }
};

// Thêm sản phẩm mới
exports.create = async (data) => {
    try {
        const validatedData = validateProductData(data);
        const sql = "INSERT INTO products SET ?";
        const result = await db.query(sql, validatedData);
        console.log('Create success');
        return result.insertId;
    } catch (err) {
        console.error('Error creating product:', err);
        throw err;
    }
};

// Cập nhật sản phẩm
exports.update = async (idProduct, data) => {
    try {
        const validatedId = validateId(idProduct);
        const validatedData = validateProductData(data);
        const sql = `
          UPDATE products SET 
            name = ?, 
            shortDesc = ?, 
            images = ?, 
            description = ?, 
            dateUpdate = ?, 
            price = ?, 
            author = ?, 
            idCat = ?, 
            showHide = ?
          WHERE idProduct = ?`;
        const params = [
            validatedData.name, validatedData.shortDesc, validatedData.images,
            validatedData.description, validatedData.dateUpdate, validatedData.price,
            validatedData.author, validatedData.idCat, validatedData.showHide, validatedId
        ];
        const result = await db.query(sql, params);
        console.log('Update success');
        return result.affectedRows;
    } catch (err) {
        console.error('Error updating product:', err);
        throw err;
    }
};

// Xóa sản phẩm
exports.delete = async (idProduct) => {
    try {
        const validatedId = validateId(idProduct);
        const sql = "DELETE FROM products WHERE idProduct = ?";
        const result = await db.query(sql, [validatedId]);
        console.log('Delete success');
        return result.affectedRows;
    } catch (err) {
        console.error('Error deleting product:', err);
        throw err;
    }
};

// Top sản phẩm nổi bật
exports.hotProduct = async () => {
    try {
        const sql = "SELECT * FROM product WHERE views > 0 ORDER BY views DESC LIMIT 5";
        const result = await db.query(sql);
        console.log('Hot products success');
        return result;
    } catch (err) {
        console.error('Error getting hot products:', err);
        throw err;
    }
};

// Sản phẩm mới cập nhật
exports.newProduct = async () => {
    try {
        const sql = "SELECT * FROM product ORDER BY dateUpdate DESC LIMIT 5";
        const result = await db.query(sql);
        console.log('New products success');
        return result;
    } catch (err) {
        console.error('Error getting new products:', err);
        throw err;
    }
};

// Tạo bình luận
exports.createComment = async (data) => {
    try {
        if (!data || typeof data !== 'object') {
            throw new Error('Comment data must be an object');
        }
        validateId(data.idProduct);
        data.content = validateString(data.content, 'Comment content', 1, 1000);
        const sql = "INSERT INTO comment SET ?";
        const result = await db.query(sql, data);
        console.log('Insert comment success');
        return result.insertId;
    } catch (err) {
        console.error('Error creating comment:', err);
        throw err;
    }
};

// Lấy bình luận theo sản phẩm
exports.getComment = async (idProduct) => {
    try {
        const validatedId = validateId(idProduct);
        const sql = "SELECT * FROM comment WHERE idProduct = ?";
        const result = await db.query(sql, [validatedId]);
        return result;
    } catch (err) {
        console.error('Error getting comments:', err);
        throw err;
    }
};