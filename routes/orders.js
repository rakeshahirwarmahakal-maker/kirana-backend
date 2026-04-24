const express = require('express');

module.exports = (pool) => {
  const router = express.Router();

  const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_key');
      req.user = decoded;
      next();
    } catch (error) {
      res.status(401).json({ error: 'Invalid token' });
    }
  };

  // Haversine formula to calculate distance between two coordinates
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const getSellerByUserId = async (conn, userId) => {
    const [rows] = await conn.execute('SELECT * FROM sellers WHERE user_id = ? LIMIT 1', [userId]);
    return rows[0];
  };

  const notifySellers = async (conn, orderId, sellerIds) => {
    if (!sellerIds.length) return;
    const placeholders = sellerIds.map(() => '?').join(',');
    const [sellers] = await conn.execute(
      `SELECT id, user_id, shop_name FROM sellers WHERE id IN (${placeholders})`,
      sellerIds
    );

    for (const seller of sellers) {
      await conn.execute(
        'INSERT INTO notifications (user_id, title, body, type, order_id) VALUES (?, ?, ?, ?, ?)',
        [
          seller.user_id,
          '🆕 New pending order for acceptance',
          `Order #${orderId} from ${seller.shop_name}. Tap to accept or reject.`,
          'order_pending',
          orderId
        ]
      );
    }
  };

  // Create order from cart with nearby seller matching
  router.post('/create', verifyToken, async (req, res) => {
    try {
      const { address_id } = req.body;
      const conn = await pool.getConnection();

      // Get cart items with seller info
      const [cartItems] = await conn.execute(
        `SELECT c.*, p.price, p.seller_id as current_seller_id FROM cart c 
         JOIN products p ON c.product_id = p.id WHERE c.user_id = ?`,
        [req.user.id]
      );

      if (!cartItems.length) {
        conn.release();
        return res.status(400).json({ error: 'Cart is empty' });
      }

      // Get user's delivery address
      const [addressRows] = await conn.execute(
        'SELECT * FROM user_addresses WHERE id = ? AND user_id = ?',
        [address_id, req.user.id]
      );

      if (!addressRows.length) {
        conn.release();
        return res.status(404).json({ error: 'Address not found' });
      }

      const userAddress = addressRows[0];
      // Use default coordinates for demo if not present
      const userLat = userAddress.latitude || 23.2667;
      const userLon = userAddress.longitude || 69.6667;

      // Calculate total
      const totalAmount = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

      // Create order
      const [orderResult] = await conn.execute(
        'INSERT INTO orders (user_id, address_id, total_amount, payment_method) VALUES (?, ?, ?, ?)',
        [req.user.id, address_id, totalAmount, 'cod']
      );

      const orderId = orderResult.insertId;

      // Group items by product to find best nearby sellers
      const productsMap = {};
      for (const item of cartItems) {
        if (!productsMap[item.product_id]) {
          productsMap[item.product_id] = item;
        }
      }

      const sellerIds = new Set();
      
      // For each unique product, find nearby sellers who have it
      for (const productId in productsMap) {
        const item = productsMap[productId];
        
        // Find all sellers who have this product and are active
        const [sellers] = await conn.execute(
          `SELECT s.id, s.latitude, s.longitude, s.shop_name, s.delivery_radius, 
                  (SELECT COUNT(*) FROM products WHERE seller_id = s.id AND id = ?) as has_product
           FROM sellers s 
           WHERE s.is_active = 1 AND s.is_verified = 1`,
          [productId]
        );

        // Calculate distances and find nearby sellers
        let nearestSeller = null;
        let minDistance = Infinity;

        for (const seller of sellers) {
          if (seller.has_product === 0) continue; // Skip if seller doesn't have this product
          
          const distance = calculateDistance(userLat, userLon, seller.latitude, seller.longitude);
          
          // Check if seller is within delivery radius
          if (distance <= seller.delivery_radius && distance < minDistance) {
            minDistance = distance;
            nearestSeller = seller;
          }
        }

        // If no nearby seller found, use the one from cart (fallback)
        const assignedSeller = nearestSeller ? nearestSeller.id : item.current_seller_id;
        
        if (assignedSeller) {
          // Get all cart items for this product and add to order
          const itemsForProduct = cartItems.filter(ci => ci.product_id == productId);
          for (const cartItem of itemsForProduct) {
            await conn.execute(
              'INSERT INTO order_items (order_id, product_id, seller_id, quantity, price, seller_status) VALUES (?, ?, ?, ?, ?, ?)',
              [orderId, cartItem.product_id, assignedSeller, cartItem.quantity, cartItem.price, 'pending']
            );
          }
          sellerIds.add(assignedSeller);
        }
      }

      // Notify customer
      await conn.execute(
        'INSERT INTO notifications (user_id, title, body, type, order_id) VALUES (?, ?, ?, ?, ?)',
        [req.user.id, '📦 Order placed', `Order #${orderId} pending seller acceptance...`, 'order_update', orderId]
      );

      // Notify sellers
      await notifySellers(conn, orderId, Array.from(sellerIds));

      // Clear cart
      await conn.execute('DELETE FROM cart WHERE user_id = ?', [req.user.id]);

      conn.release();
      res.json({ 
        success: true, 
        orderId, 
        totalAmount,
        message: 'Order created. Nearby sellers will review and accept.',
        sellers_notified: sellerIds.size 
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get orders
  router.get('/', verifyToken, async (req, res) => {
    try {
      const conn = await pool.getConnection();
      const [orders] = await conn.execute(
        `SELECT o.*, COUNT(oi.id) as items_count FROM orders o 
         LEFT JOIN order_items oi ON o.id = oi.order_id
         WHERE o.user_id = ? 
         GROUP BY o.id
         ORDER BY o.created_at DESC`,
        [req.user.id]
      );

      conn.release();
      res.json({ success: true, orders });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // ALSO SUPPORT /customer/orders endpoint (for frontend compatibility)
  router.get('/customer/orders', verifyToken, async (req, res) => {
    try {
      const conn = await pool.getConnection();
      const [orders] = await conn.execute(
        `SELECT o.*, COUNT(oi.id) as items_count FROM orders o 
         LEFT JOIN order_items oi ON o.id = oi.order_id
         WHERE o.user_id = ? 
         GROUP BY o.id
         ORDER BY o.created_at DESC`,
        [req.user.id]
      );

      conn.release();
      res.json({ success: true, orders });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get order details
  router.get('/:id', verifyToken, async (req, res) => {
    try {
      const conn = await pool.getConnection();
      const [orders] = await conn.execute(
        `SELECT o.*, ua.* FROM orders o 
         JOIN user_addresses ua ON o.address_id = ua.id 
         WHERE o.id = ? AND o.user_id = ?`,
        [req.params.id, req.user.id]
      );

      if (!orders.length) {
        conn.release();
        return res.status(404).json({ error: 'Order not found' });
      }

      const [items] = await conn.execute(
        `SELECT oi.*, p.name, p.images, s.shop_name FROM order_items oi 
         JOIN products p ON oi.product_id = p.id 
         JOIN sellers s ON oi.seller_id = s.id 
         WHERE oi.order_id = ?`,
        [req.params.id]
      );

      conn.release();
      res.json({ order: orders[0], items });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get delivery tracking
  router.get('/:id/tracking', verifyToken, async (req, res) => {
    try {
      const conn = await pool.getConnection();
      const userRole = req.user.role || 'user';

      if (userRole === 'user') {
        const [orders] = await conn.execute('SELECT id FROM orders WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
        if (!orders.length) {
          conn.release();
          return res.status(404).json({ error: 'Order not found' });
        }
      }

      if (userRole === 'seller') {
        const seller = await getSellerByUserId(conn, req.user.id);
        if (!seller) {
          conn.release();
          return res.status(404).json({ error: 'Seller profile not found' });
        }
        const [rows] = await conn.execute(
          'SELECT id FROM order_items WHERE order_id = ? AND seller_id = ? LIMIT 1',
          [req.params.id, seller.id]
        );
        if (!rows.length) {
          conn.release();
          return res.status(403).json({ error: 'Access denied' });
        }
      }

      const [tracking] = await conn.execute(
        `SELECT t.*, s.shop_name, u.name as updated_by_name
         FROM delivery_tracking t
         LEFT JOIN sellers s ON t.seller_id = s.id
         LEFT JOIN users u ON t.updated_by = u.id
         WHERE t.order_id = ?
         ORDER BY t.created_at ASC`,
        [req.params.id]
      );

      conn.release();
      res.json(tracking);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // NEW SIMPLIFIED ORDER ENDPOINT (for frontend)
  // POST /api/orders/simple - Create order from request data (no cart DB needed)
  router.post('/simple', verifyToken, async (req, res) => {
    try {
      const { items, street, city, state, zip, payment_method } = req.body;
      const conn = await pool.getConnection();

      if (!items || items.length === 0) {
        conn.release();
        return res.status(400).json({ error: 'No items in order' });
      }

      if (!payment_method || !['cash', 'upi', 'card'].includes(payment_method.toLowerCase())) {
        conn.release();
        return res.status(400).json({ error: 'Invalid payment method. Use: cash, upi, or card' });
      }

      // Create or get default address for user
      let addressId = null;
      const [existingAddress] = await conn.execute(
        'SELECT id FROM user_addresses WHERE user_id = ? AND is_default = 1 LIMIT 1',
        [req.user.id]
      );

      if (existingAddress.length) {
        addressId = existingAddress[0].id;
      } else {
        // Create new address
        const [addressResult] = await conn.execute(
          'INSERT INTO user_addresses (user_id, address, city, state, pincode, is_default, address_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [req.user.id, street, city, state, zip, 1, 'home']
        );
        addressId = addressResult.insertId;
      }

      // Calculate total from items
      let totalAmount = 0;
      for (const item of items) {
        totalAmount += item.price * item.quantity;
      }
      totalAmount += 20; // Add platform charge

      // Create order
      const [orderResult] = await conn.execute(
        'INSERT INTO orders (user_id, address_id, total_amount, payment_method, order_status) VALUES (?, ?, ?, ?, ?)',
        [req.user.id, addressId, totalAmount, payment_method.toLowerCase(), 'pending']
      );

      const orderId = orderResult.insertId;

      // Get sellers for each product and create order items
      const sellerIds = new Set();
      
      for (const item of items) {
        // Get seller for this product (first active seller with this product)
        const [sellers] = await conn.execute(
          `SELECT s.id FROM sellers s 
           JOIN products p ON p.seller_id = s.id
           WHERE p.id = ? AND s.is_active = 1
           LIMIT 1`,
          [item.product_id]
        );

        const sellerId = sellers.length > 0 ? sellers[0].id : 1; // Default to seller 1 if not found
        
        await conn.execute(
          'INSERT INTO order_items (order_id, product_id, seller_id, quantity, price, seller_status) VALUES (?, ?, ?, ?, ?, ?)',
          [orderId, item.product_id, sellerId, item.quantity, item.price, 'pending']
        );
        
        sellerIds.add(sellerId);
      }

      // Notify sellers
      if (sellerIds.size > 0) {
        await notifySellers(conn, orderId, Array.from(sellerIds));
      }

      // Notify customer
      await conn.execute(
        'INSERT INTO notifications (user_id, title, body, type, order_id) VALUES (?, ?, ?, ?, ?)',
        [req.user.id, '📦 Order Placed', `Order #${orderId} confirmed via ${payment_method.toUpperCase()}. Awaiting seller confirmation.`, 'order_update', orderId]
      );

      conn.release();
      res.json({
        success: true,
        orderId,
        totalAmount,
        payment_method: payment_method.toLowerCase(),
        status: 'pending',
        message: `Order created successfully! Paying via ${payment_method.toUpperCase()}.`
      });
    } catch (error) {
      console.error('Simple order error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Add delivery tracking update (seller/admin)
  router.post('/:id/tracking', verifyToken, async (req, res) => {
    try {
      const { status, latitude, longitude, message, delivery_boy_id } = req.body;
      if (!status) return res.status(400).json({ error: 'status is required' });

      const conn = await pool.getConnection();
      const userRole = req.user.role || 'user';

      if (userRole === 'user') {
        conn.release();
        return res.status(403).json({ error: 'Only seller/admin can update tracking' });
      }

      let sellerId = null;
      if (userRole === 'seller') {
        const seller = await getSellerByUserId(conn, req.user.id);
        if (!seller) {
          conn.release();
          return res.status(404).json({ error: 'Seller profile not found' });
        }
        const [rows] = await conn.execute(
          'SELECT id FROM order_items WHERE order_id = ? AND seller_id = ? LIMIT 1',
          [req.params.id, seller.id]
        );
        if (!rows.length) {
          conn.release();
          return res.status(403).json({ error: 'Access denied' });
        }
        sellerId = seller.id;
      }

      await conn.execute(
        `INSERT INTO delivery_tracking (order_id, seller_id, delivery_boy_id, status, latitude, longitude, message, updated_by, updated_by_role)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.params.id,
          sellerId,
          delivery_boy_id || null,
          status,
          latitude != null ? latitude : null,
          longitude != null ? longitude : null,
          message || null,
          req.user.id,
          userRole
        ]
      );

      conn.release();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update order status (admin only)
  router.put('/:id/status', async (req, res) => {
    try {
      const { status } = req.body;
      const conn = await pool.getConnection();

      await conn.execute('UPDATE orders SET order_status = ? WHERE id = ?', [status, req.params.id]);

      conn.release();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Seller accepts/rejects order
  router.post('/:orderId/accept', verifyToken, async (req, res) => {
    try {
      const { action } = req.body; // 'accept' or 'reject'
      if (!action || !['accept', 'reject'].includes(action)) {
        return res.status(400).json({ error: 'Invalid action. Use: accept or reject' });
      }

      const conn = await pool.getConnection();
      const orderId = req.params.orderId;

      // Get seller info
      const seller = await getSellerByUserId(conn, req.user.id);
      if (!seller) {
        conn.release();
        return res.status(404).json({ error: 'Seller profile not found' });
      }

      // Check if seller has items in this order
      const [orderItems] = await conn.execute(
        'SELECT * FROM order_items WHERE order_id = ? AND seller_id = ?',
        [orderId, seller.id]
      );

      if (!orderItems.length) {
        conn.release();
        return res.status(403).json({ error: 'You don\'t have items in this order' });
      }

      // Update seller_status for all items from this seller
      const newStatus = action === 'accept' ? 'accepted' : 'rejected';
      await conn.execute(
        'UPDATE order_items SET seller_status = ? WHERE order_id = ? AND seller_id = ?',
        [newStatus, orderId, seller.id]
      );

      // Get order details to notify customer
      const [orders] = await conn.execute(
        'SELECT user_id FROM orders WHERE id = ?',
        [orderId]
      );

      if (orders.length > 0) {
        const customerId = orders[0].user_id;
        
        // Notify customer
        const notificationTitle = action === 'accept' ? '✅ Order Accepted' : '❌ Order Rejected';
        const notificationBody = action === 'accept' 
          ? `Order #${orderId} accepted by ${seller.shop_name}. Your order will be prepared soon!`
          : `Order #${orderId} rejected by ${seller.shop_name}. Please place a new order.`;

        await conn.execute(
          'INSERT INTO notifications (user_id, title, body, type, order_id) VALUES (?, ?, ?, ?, ?)',
          [customerId, notificationTitle, notificationBody, action === 'accept' ? 'order_accepted' : 'order_rejected', orderId]
        );
      }

      conn.release();
      res.json({
        success: true,
        action,
        message: `Order ${action === 'accept' ? 'accepted' : 'rejected'} successfully! Customer has been notified.`
      });
    } catch (error) {
      console.error('Accept order error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
