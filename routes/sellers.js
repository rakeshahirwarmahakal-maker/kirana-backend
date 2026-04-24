const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

module.exports = (pool) => {
  const router = express.Router();

  // Seller Login
  router.post('/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
      }

      const conn = await pool.getConnection();
      const [users] = await conn.execute(
        'SELECT u.id, u.email, u.password, u.role, s.id as seller_id, s.shop_name FROM users u LEFT JOIN sellers s ON u.id = s.user_id WHERE u.email = ? AND u.role = "seller"',
        [email]
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
        { id: user.id, email: user.email, role: 'seller', seller_id: user.seller_id },
        process.env.JWT_SECRET || 'secret_key',
        { expiresIn: '7d' }
      );

      conn.release();
      res.json({
        token,
        seller: {
          id: user.seller_id,
          email: user.email,
          shop_name: user.shop_name
        }
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get seller orders
  router.get('/orders', async (req, res) => {
    try {
      const token = req.headers.authorization?.split(' ')[1];
      if (!token) return res.status(401).json({ error: 'No token provided' });
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_key');
      const conn = await pool.getConnection();
      
      const [orders] = await conn.execute(
        `SELECT o.id, o.user_id, o.total_amount, o.order_status as status, o.created_at,
                COUNT(oi.id) as item_count
         FROM orders o
         LEFT JOIN order_items oi ON o.id = oi.order_id
         WHERE oi.seller_id = ?
         GROUP BY o.id
         ORDER BY o.created_at DESC`,
        [decoded.seller_id]
      );
      
      conn.release();
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get seller earnings
  router.get('/earnings', async (req, res) => {
    try {
      const token = req.headers.authorization?.split(' ')[1];
      if (!token) return res.status(401).json({ error: 'No token provided' });
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_key');
      const conn = await pool.getConnection();
      
      const [orders] = await conn.execute(
        `SELECT SUM(oi.price * oi.quantity) as total_earnings, COUNT(o.id) as order_count
         FROM orders o
         JOIN order_items oi ON o.id = oi.order_id
         WHERE oi.seller_id = ? AND o.order_status IN ('confirmed', 'delivered')`,
        [decoded.seller_id]
      );
      
      conn.release();
      res.json({
        total: orders[0]?.total_earnings || 0,
        orders: orders[0]?.order_count || 0
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get all sellers
  router.get('/', async (req, res) => {
    try {
      const conn = await pool.getConnection();
      const [sellers] = await conn.execute(
        `SELECT s.*, COUNT(p.id) as products_count FROM sellers s 
         LEFT JOIN products p ON s.id = p.seller_id 
         WHERE s.is_active = TRUE 
         GROUP BY s.id`
      );

      conn.release();
      res.json(sellers);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get nearby sellers (with distance calculation)
  router.get('/nearby', async (req, res) => {
    try {
      const { lat, lng, radius = 5 } = req.query;
      const conn = await pool.getConnection();

      // If no location provided, just return all active sellers
      if (!lat || !lng) {
        const [sellers] = await conn.execute(
          `SELECT s.*, 
                  COUNT(p.id) as products_count,
                  COALESCE(s.rating, 4.5) as rating
           FROM sellers s 
           LEFT JOIN products p ON s.id = p.seller_id 
           WHERE s.is_active = TRUE 
           GROUP BY s.id
           LIMIT 10`
        );
        conn.release();
        return res.json(sellers.map(s => ({
          ...s,
          distance: '0.0 km',
          rating: s.rating || 4.5
        })));
      }

      // Calculate distance using haversine formula
      const [sellers] = await conn.execute(
        `SELECT s.*, 
                COUNT(p.id) as products_count,
                COALESCE(s.rating, 4.5) as rating,
                ROUND(
                  6371 * 2 * ASIN(SQRT(
                    POWER(SIN(RADIANS((s.latitude - ?) / 2)), 2) +
                    COS(RADIANS(?)) * COS(RADIANS(s.latitude)) *
                    POWER(SIN(RADIANS((s.longitude - ?) / 2)), 2)
                  )), 2
                ) as distance
         FROM sellers s 
         LEFT JOIN products p ON s.id = p.seller_id 
         WHERE s.is_active = TRUE 
         GROUP BY s.id
         ORDER BY distance ASC
         LIMIT 20`,
        [lat, lat, lng]
      );

      // Filter by radius in application
      const filteredSellers = sellers.filter(s => s.distance <= radius || !s.distance);
      
      conn.release();
      res.json(filteredSellers.map(s => ({
        ...s,
        distance: s.distance ? `${s.distance} km` : 'N/A',
        rating: s.rating || 4.5
      })));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get seller details
  router.get('/:id', async (req, res) => {
    try {
      const conn = await pool.getConnection();
      const [sellers] = await conn.execute('SELECT * FROM sellers WHERE id = ?', [req.params.id]);

      if (!sellers.length) {
        conn.release();
        return res.status(404).json({ error: 'Seller not found' });
      }

      const [products] = await conn.execute('SELECT * FROM products WHERE seller_id = ?', [req.params.id]);

      conn.release();
      res.json({ seller: sellers[0], products });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
