const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { verifyToken, requireRole } = require('../middleware/auth');

module.exports = (pool) => {
  const router = express.Router();

  // Admin Login
  router.post('/login', async (req, res) => {
    try {
      const { email, login, password } = req.body;
      const loginValue = email || login; // Accept both email and login fields
      
      if (!loginValue || !password) {
        return res.status(400).json({ error: 'Email/login and password required' });
      }

      const conn = await pool.getConnection();
      const [users] = await conn.execute(
        'SELECT id, email, password, role, name, phone FROM users WHERE (email = ? OR phone = ?) AND role = "admin"',
        [loginValue, loginValue]
      );

      if (!users.length) {
        conn.release();
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const user = users[0];
      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (!isPasswordValid) {
        conn.release();
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const token = jwt.sign(
        { id: user.id, email: user.email, role: 'admin' },
        process.env.JWT_SECRET || 'secret_key',
        { expiresIn: '7d' }
      );

      conn.release();
      res.json({
        token,
        accessToken: token,
        data: { token },
        admin: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: 'admin'
        },
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: 'admin'
        },
        statusCode: 200
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Verify token middleware for protected routes
  router.use(verifyToken);
  router.use(requireRole('admin'));

  // Get all sellers
  router.get('/sellers', async (req, res) => {
    try {
      const conn = await pool.getConnection();
      const [sellers] = await conn.execute(
        `SELECT s.id, s.shop_name as storeName, s.address, s.category, s.is_active, s.is_verified,
                u.id as user_id, u.name as ownerName, u.email, u.phone as mobile,
                CASE WHEN s.is_verified = 1 THEN 'verified' ELSE 'pending' END as status,
                COUNT(p.id) as products_count,
                COUNT(oi.id) as orders_count
         FROM sellers s
         JOIN users u ON s.user_id = u.id
         LEFT JOIN products p ON s.id = p.seller_id
         LEFT JOIN order_items oi ON s.id = oi.seller_id
         GROUP BY s.id
         ORDER BY s.created_at DESC`
      );
      conn.release();
      res.json(sellers);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get all products
  router.get('/products', async (req, res) => {
    try {
      const conn = await pool.getConnection();
      const [products] = await conn.execute(
        `SELECT p.id, p.name, p.price, p.stock, p.rating,
                s.shop_name, s.id as seller_id
         FROM products p
         JOIN sellers s ON p.seller_id = s.id
         ORDER BY p.created_at DESC`
      );
      conn.release();
      res.json(products);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get all orders
  router.get('/orders', async (req, res) => {
    try {
      const conn = await pool.getConnection();
      const [orders] = await conn.execute(
        `SELECT o.id, o.total_amount, o.order_status as status, o.created_at,
                COUNT(oi.id) as item_count
         FROM orders o
         LEFT JOIN order_items oi ON o.id = oi.order_id
         GROUP BY o.id
         ORDER BY o.created_at DESC`
      );
      conn.release();
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get commission data
  router.get('/commissions', async (req, res) => {
    try {
      const conn = await pool.getConnection();
      const [orders] = await conn.execute(
        `SELECT o.id, o.total_amount, o.order_status as status, o.created_at,
                COUNT(oi.id) as item_count
         FROM orders o
         LEFT JOIN order_items oi ON o.id = oi.order_id
         GROUP BY o.id
         ORDER BY o.created_at DESC`
      );
      conn.release();
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/dashboard', async (req, res) => {
    try {
      const conn = await pool.getConnection();
      const [[usersCount]] = await conn.execute('SELECT COUNT(*) as count FROM users');
      const [[sellersCount]] = await conn.execute('SELECT COUNT(*) as count FROM sellers');
      const [[ordersCount]] = await conn.execute('SELECT COUNT(*) as count FROM orders');
      const [[revenue]] = await conn.execute('SELECT SUM(total_amount) as total_revenue FROM orders WHERE order_status IN ("confirmed","processing","shipped","delivered")');
      const [[pendingSellers]] = await conn.execute('SELECT COUNT(*) as count FROM sellers WHERE is_verified = FALSE');
      conn.release();
      res.json({
        users: usersCount.count,
        sellers: sellersCount.count,
        orders: ordersCount.count,
        revenue: revenue.total_revenue || 0,
        pendingSellers: pendingSellers.count
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/users', async (req, res) => {
    try {
      const conn = await pool.getConnection();
      const [users] = await conn.execute('SELECT id, name, email, phone, role, is_active, created_at FROM users ORDER BY created_at DESC');
      conn.release();
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.put('/users/:id/status', async (req, res) => {
    try {
      const { is_active } = req.body;
      const conn = await pool.getConnection();
      await conn.execute('UPDATE users SET is_active = ? WHERE id = ?', [is_active ? 1 : 0, req.params.id]);
      conn.release();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/sellers', async (req, res) => {
    try {
      const conn = await pool.getConnection();
      const [sellers] = await conn.execute(
        `SELECT s.*, u.name as owner_name, u.email, u.phone, u.is_active, u.kyc_status
         FROM sellers s
         JOIN users u ON s.user_id = u.id
         ORDER BY s.created_at DESC`
      );
      conn.release();
      res.json(sellers);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.put('/sellers/:id/approve', async (req, res) => {
    try {
      const conn = await pool.getConnection();
      await conn.execute('UPDATE sellers SET is_verified = TRUE, is_active = TRUE WHERE id = ?', [req.params.id]);
      conn.release();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.put('/sellers/:id/reject', async (req, res) => {
    try {
      const conn = await pool.getConnection();
      await conn.execute('UPDATE sellers SET is_verified = FALSE, is_active = FALSE WHERE id = ?', [req.params.id]);
      conn.release();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/orders', async (req, res) => {
    try {
      const conn = await pool.getConnection();
      const [orders] = await conn.execute(
        `SELECT o.*, u.name as customer_name, ua.address as delivery_address
         FROM orders o
         JOIN users u ON o.user_id = u.id
         JOIN user_addresses ua ON o.address_id = ua.id
         ORDER BY o.created_at DESC`
      );
      conn.release();
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.put('/orders/:id/status', async (req, res) => {
    try {
      const { status, order_status } = req.body;
      const statusValue = status || order_status;
      
      if (!statusValue) {
        return res.status(400).json({ message: 'Status is required', statusCode: 400 });
      }

      const conn = await pool.getConnection();
      await conn.execute('UPDATE orders SET order_status = ? WHERE id = ?', [statusValue, req.params.id]);
      conn.release();
      res.json({ success: true, message: 'Order status updated' });
    } catch (error) {
      res.status(500).json({ message: error.message, statusCode: 500 });
    }
  });

  router.get('/areas', async (req, res) => {
    try {
      const conn = await pool.getConnection();
      const [areas] = await conn.execute('SELECT * FROM service_areas ORDER BY created_at DESC');
      conn.release();
      res.json(areas);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/areas', async (req, res) => {
    try {
      const { name, center_latitude, center_longitude, radius_km, is_active } = req.body;
      const conn = await pool.getConnection();
      const [result] = await conn.execute(
        'INSERT INTO service_areas (name, center_latitude, center_longitude, radius_km, is_active) VALUES (?, ?, ?, ?, ?)',
        [name, center_latitude, center_longitude, radius_km, is_active ? 1 : 0]
      );
      conn.release();
      res.json({ success: true, areaId: result.insertId });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.put('/areas/:id', async (req, res) => {
    try {
      const { name, center_latitude, center_longitude, radius_km, is_active } = req.body;
      const conn = await pool.getConnection();
      await conn.execute(
        'UPDATE service_areas SET name = ?, center_latitude = ?, center_longitude = ?, radius_km = ?, is_active = ? WHERE id = ?',
        [name, center_latitude, center_longitude, radius_km, is_active ? 1 : 0, req.params.id]
      );
      conn.release();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/promotions', async (req, res) => {
    try {
      const conn = await pool.getConnection();
      const [promotions] = await conn.execute('SELECT * FROM promotions ORDER BY created_at DESC');
      conn.release();
      res.json(promotions);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/promotions', async (req, res) => {
    try {
      const { title, code, discount_percent, min_order_amount, expires_at, is_active } = req.body;
      const conn = await pool.getConnection();
      const [result] = await conn.execute(
        'INSERT INTO promotions (title, code, discount_percent, min_order_amount, expires_at, is_active) VALUES (?, ?, ?, ?, ?, ?)',
        [title, code, discount_percent, min_order_amount, expires_at, is_active ? 1 : 0]
      );
      conn.release();
      res.json({ success: true, promotionId: result.insertId });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
