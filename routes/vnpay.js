const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const moment = require('moment');
const vnpayConfig = require('../config/vnpay.config');
const modelOrder = require('../models/model_order');
const modelCart = require('../models/model_cart');

// Helper function to sort object by key - ĐÚNG CHUẨN VNPAY
function sortObject(obj) {
  let sorted = {};
  let str = [];
  let key;
  for (key in obj) {
    if (obj.hasOwnProperty(key)) {
      str.push(key);
    }
  }
  str.sort();
  for (key = 0; key < str.length; key++) {
    sorted[str[key]] = obj[str[key]];
  }
  return sorted;
}

// Route tạo thanh toán VNPay
router.post('/create_payment_url', async function (req, res, next) {
  try {
    // Kiểm tra đăng nhập
    if (!req.session.User) {
      return res.status(401).json({
        success: false,
        message: 'Vui lòng đăng nhập để thanh toán'
      });
    }

    const requiredConfig = [
      ['VNP_TMN_CODE', vnpayConfig.vnp_TmnCode],
      ['VNP_HASH_SECRET', vnpayConfig.vnp_HashSecret],
      ['VNP_URL', vnpayConfig.vnp_Url],
      ['VNP_RETURN_URL', vnpayConfig.vnp_ReturnUrl]
    ];
    const missingConfig = requiredConfig
      .filter(([, value]) => !value || !String(value).trim())
      .map(([name]) => name);
    if (missingConfig.length > 0) {
      throw new Error(`Missing VNPay configuration: ${missingConfig.join(', ')}`);
    }

    const paymentUrl = new URL(vnpayConfig.vnp_Url);
    const returnUrl = new URL(vnpayConfig.vnp_ReturnUrl);
    if (!['http:', 'https:'].includes(paymentUrl.protocol) ||
        !['http:', 'https:'].includes(returnUrl.protocol)) {
      throw new Error('VNPay URLs must use HTTP or HTTPS');
    }

    const {
      orderDescription,
      bankCode,
      language,
      // Thông tin đơn hàng
      name,
      phone,
      address,
      note,
      cartItems
    } = req.body;

    // Validate input
    if (!Array.isArray(cartItems) || cartItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng chọn ít nhất một sản phẩm'
      });
    }

    const selectedCartIds = cartItems.map((item) => item && item.cartId);
    if (
      selectedCartIds.some((id) => !Number.isInteger(Number(id)) || Number(id) <= 0) ||
      new Set(selectedCartIds.map(Number)).size !== selectedCartIds.length
    ) {
      return res.status(400).json({
        success: false,
        message: 'Danh sách sản phẩm không hợp lệ'
      });
    }

    const selectedItems = await modelCart.getSelectedCartItems(
      req.session.User.id,
      selectedCartIds
    );
    if (selectedItems.length !== selectedCartIds.length) {
      return res.status(400).json({
        success: false,
        message: 'Một hoặc nhiều sản phẩm không còn trong giỏ hàng'
      });
    }

    const orderItems = selectedItems.map((item) => {
      const price = Number(item.priceProduct);
      if (!Number.isFinite(price) || price <= 0 || !Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new Error('Giá hoặc số lượng sản phẩm trong giỏ hàng không hợp lệ');
      }
      return {
        idProduct: item.idProduct,
        quantity: item.quantity,
        size: item.size || 'M',
        price
      };
    });
    const totalCents = orderItems.reduce(
      (total, item) => total + Math.round(item.price * 100) * item.quantity,
      30000 * 100
    );
    const amount = totalCents / 100;
    if (!Number.isSafeInteger(totalCents) || amount > 9999999999.99) {
      return res.status(400).json({
        success: false,
        message: 'Tổng tiền đơn hàng vượt quá giới hạn thanh toán'
      });
    }

    // Tạo đơn hàng trong database với trạng thái PENDING
    const shippingAddress = `${name}, ${phone}, ${address}${note ? ', Ghi chú: ' + note : ''}`;
    const orderData = {
      idUser: req.session.User.id,
      totalAmount: amount,
      shippingAddress: shippingAddress,
      paymentMethod: 'VNPAY',
      cartItems: orderItems
    };

    const orderResult = await modelOrder.createOrder(orderData);
    const orderId = orderResult.orderId;

    // Tạo các tham số cho VNPay
    const date = new Date();
    const createDate = moment(date).format('YYYYMMDDHHmmss');
    const expireDate = moment(date).add(15, 'minutes').format('YYYYMMDDHHmmss'); // Thêm expire date
    
    // Lấy IP address và convert IPv6 sang IPv4 nếu cần
    const forwardedFor = req.headers['x-forwarded-for'];
    let ipAddr = (typeof forwardedFor === 'string' ? forwardedFor.split(',')[0].trim() : '') ||
      req.socket.remoteAddress ||
      '127.0.0.1';
    
    // Convert IPv6 localhost (::1) sang IPv4 (127.0.0.1)
    if (ipAddr === '::1' || ipAddr === '::ffff:127.0.0.1') {
      ipAddr = '127.0.0.1';
    }
    // Nếu là IPv6, lấy phần IPv4 embedded
    if (ipAddr && ipAddr.includes('::ffff:')) {
      ipAddr = ipAddr.replace('::ffff:', '');
    }

    let vnp_Params = {};
    vnp_Params['vnp_Version'] = '2.1.1';
    vnp_Params['vnp_Command'] = 'pay';
    vnp_Params['vnp_TmnCode'] = vnpayConfig.vnp_TmnCode;
    vnp_Params['vnp_Locale'] = language || 'vn';
    vnp_Params['vnp_CurrCode'] = 'VND';
    vnp_Params['vnp_TxnRef'] = orderId.toString(); // Chuyển sang string
    vnp_Params['vnp_OrderInfo'] = orderDescription || 'Thanh toan don hang ' + orderId;
    vnp_Params['vnp_OrderType'] = 'other';
    vnp_Params['vnp_Amount'] = totalCents; // VNPay nhận số tiền theo đơn vị xu.
    vnp_Params['vnp_ReturnUrl'] = vnpayConfig.vnp_ReturnUrl;
    vnp_Params['vnp_IpAddr'] = ipAddr;
    vnp_Params['vnp_CreateDate'] = createDate;
    vnp_Params['vnp_ExpireDate'] = expireDate; // Thêm expire date (bắt buộc)
    
    if (bankCode) {
      vnp_Params['vnp_BankCode'] = bankCode;
    }

    // Sắp xếp các tham số
    vnp_Params = sortObject(vnp_Params);

    // Tạo chuỗi query string để sign - ĐÚNG CHUẨN VNPAY
    let signData = [];
    for (let key in vnp_Params) {
      if (vnp_Params.hasOwnProperty(key)) {
        signData.push(key + '=' + encodeURIComponent(vnp_Params[key]).replace(/%20/g, '+'));
      }
    }
    const signDataString = signData.join('&');
    
    // Tạo secure hash
    const hmac = crypto.createHmac('sha512', vnpayConfig.vnp_HashSecret);
    const signed = hmac.update(Buffer.from(signDataString, 'utf-8')).digest('hex');
    vnp_Params['vnp_SecureHash'] = signed;

    const vnpUrl = `${paymentUrl.origin}${paymentUrl.pathname}?${signDataString}&vnp_SecureHash=${signed}`;

    res.json({
      success: true,
      paymentUrl: vnpUrl,
      orderId: orderId
    });

  } catch (error) {
    console.error('VNPay create payment error:', error);
    const response = {
      success: false,
      message: 'Có lỗi xảy ra khi tạo thanh toán'
    };
    if (req.app.get('env') === 'development') {
      response.detail = error.message;
    }
    res.status(500).json(response);
  }
});

// Route nhận callback từ VNPay
router.get('/return', async function (req, res, next) {
  try {
    let vnp_Params = req.query;

    const secureHash = vnp_Params['vnp_SecureHash'];

    // Xóa các tham số không cần thiết
    delete vnp_Params['vnp_SecureHash'];
    delete vnp_Params['vnp_SecureHashType'];

    // Sắp xếp lại các tham số
    vnp_Params = sortObject(vnp_Params);

    // Tạo chuỗi query string để verify - ĐÚNG CHUẨN VNPAY
    let signData = [];
    for (let key in vnp_Params) {
      if (vnp_Params.hasOwnProperty(key)) {
        signData.push(key + '=' + encodeURIComponent(vnp_Params[key]).replace(/%20/g, '+'));
      }
    }
    const signDataString = signData.join('&');
    
    const hmac = crypto.createHmac('sha512', vnpayConfig.vnp_HashSecret);
    const signed = hmac.update(Buffer.from(signDataString, 'utf-8')).digest('hex');

    console.log('VNPay Return - Received Hash:', secureHash);
    console.log('VNPay Return - Calculated Hash:', signed);
    console.log('VNPay Return - Match:', secureHash === signed);

    // Kiểm tra chữ ký
    if (secureHash === signed) {
      const orderId = vnp_Params['vnp_TxnRef'];
      const responseCode = vnp_Params['vnp_ResponseCode'];
      const amount = vnp_Params['vnp_Amount'] / 100; // Chia 100 để lấy số tiền thực
      const transactionNo = vnp_Params['vnp_TransactionNo'];
      const bankCode = vnp_Params['vnp_BankCode'];
      const payDate = vnp_Params['vnp_PayDate'];

      // Kiểm tra mã phản hồi
      if (responseCode === '00') {
        // Thanh toán thành công
        await modelOrder.updateOrderStatus(orderId, 'PAID', transactionNo);
        
        // Xóa giỏ hàng của user
        if (req.session.User) {
          try {
            await modelCart.clearCart(req.session.User.id);
          } catch (error) {
            console.error('Error clearing cart:', error);
          }
        }

        res.render('site/thanh-cong', {
          success: true,
          message: 'Thanh toán thành công!',
          orderId: orderId,
          amount: amount,
          transactionNo: transactionNo,
          bankCode: bankCode,
          payDate: payDate,
          user: req.session.User || null
        });
      } else {
        // Thanh toán thất bại
        await modelOrder.updateOrderStatus(orderId, 'FAILED');
        
        const errorMessages = {
          '07': 'Trừ tiền thành công. Giao dịch bị nghi ngờ (liên quan tới lừa đảo, giao dịch bất thường).',
          '09': 'Giao dịch không thành công do: Thẻ/Tài khoản của khách hàng chưa đăng ký dịch vụ InternetBanking tại ngân hàng.',
          '10': 'Giao dịch không thành công do: Khách hàng xác thực thông tin thẻ/tài khoản không đúng quá 3 lần',
          '11': 'Giao dịch không thành công do: Đã hết hạn chờ thanh toán. Xin quý khách vui lòng thực hiện lại giao dịch.',
          '12': 'Giao dịch không thành công do: Thẻ/Tài khoản của khách hàng bị khóa.',
          '13': 'Giao dịch không thành công do Quý khách nhập sai mật khẩu xác thực giao dịch (OTP). Xin quý khách vui lòng thực hiện lại giao dịch.',
          '24': 'Giao dịch không thành công do: Khách hàng hủy giao dịch',
          '51': 'Giao dịch không thành công do: Tài khoản của quý khách không đủ số dư để thực hiện giao dịch.',
          '65': 'Giao dịch không thành công do: Tài khoản của Quý khách đã vượt quá hạn mức giao dịch trong ngày.',
          '75': 'Ngân hàng thanh toán đang bảo trì.',
          '79': 'Giao dịch không thành công do: KH nhập sai mật khẩu thanh toán quá số lần quy định. Xin quý khách vui lòng thực hiện lại giao dịch',
          '99': 'Các lỗi khác (lỗi còn lại, không có trong danh sách mã lỗi đã liệt kê)'
        };

        const errorMessage = errorMessages[responseCode] || 'Giao dịch thất bại';

        res.render('site/thanh-cong', {
          success: false,
          message: errorMessage,
          orderId: orderId,
          responseCode: responseCode,
          user: req.session.User || null
        });
      }
    } else {
      res.render('site/thanh-cong', {
        success: false,
        message: 'Chữ ký không hợp lệ',
        user: req.session.User || null
      });
    }
  } catch (error) {
    console.error('VNPay return error:', error);
    res.render('site/thanh-cong', {
      success: false,
      message: 'Có lỗi xảy ra khi xử lý thanh toán',
      error: error.message,
      user: req.session.User || null
    });
  }
});

// Route IPN (Instant Payment Notification) - Webhook từ VNPay
router.get('/ipn', async function (req, res, next) {
  try {
    let vnp_Params = req.query;
    const secureHash = vnp_Params['vnp_SecureHash'];

    delete vnp_Params['vnp_SecureHash'];
    delete vnp_Params['vnp_SecureHashType'];

    vnp_Params = sortObject(vnp_Params);

    // Tạo chuỗi query string để verify - ĐÚNG CHUẨN VNPAY
    let signData = [];
    for (let key in vnp_Params) {
      if (vnp_Params.hasOwnProperty(key)) {
        signData.push(key + '=' + encodeURIComponent(vnp_Params[key]).replace(/%20/g, '+'));
      }
    }
    const signDataString = signData.join('&');
    
    const hmac = crypto.createHmac('sha512', vnpayConfig.vnp_HashSecret);
    const signed = hmac.update(Buffer.from(signDataString, 'utf-8')).digest('hex');

    if (secureHash === signed) {
      const orderId = vnp_Params['vnp_TxnRef'];
      const rspCode = vnp_Params['vnp_ResponseCode'];

      // Kiểm tra đơn hàng có tồn tại không
      const order = await modelOrder.getOrderById(orderId);

      if (order) {
        if (String(order.status).toLowerCase() === 'pending') {
          if (rspCode === '00') {
            // Cập nhật trạng thái thành công
            await modelOrder.updateOrderStatus(orderId, 'PAID', vnp_Params['vnp_TransactionNo']);
            res.status(200).json({ RspCode: '00', Message: 'Success' });
          } else {
            // Cập nhật trạng thái thất bại
            await modelOrder.updateOrderStatus(orderId, 'FAILED');
            res.status(200).json({ RspCode: '00', Message: 'Success' });
          }
        } else {
          res.status(200).json({ RspCode: '02', Message: 'Order already confirmed' });
        }
      } else {
        res.status(200).json({ RspCode: '01', Message: 'Order not found' });
      }
    } else {
      res.status(200).json({ RspCode: '97', Message: 'Invalid signature' });
    }
  } catch (error) {
    console.error('VNPay IPN error:', error);
    res.status(500).json({ RspCode: '99', Message: 'Unknown error' });
  }
});

module.exports = router;
