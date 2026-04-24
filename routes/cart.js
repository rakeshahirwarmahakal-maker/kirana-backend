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

  // Add to cart
  router.post('/add', verifyToken, async (req, res) => {
    try {
      const { product_id, quantity, seller_id } = req.body;
      const conn = await pool.getConnection();

      const [existing] = await conn.execute(
        'SELECT * FROM cart WHERE user_id = ? AND product_id = ? AND seller_id = ?',
        [req.user.id, product_id, seller_id]
      );

      if (existing.length) {
        await conn.execute(
          'UPDATE cart SET quantity = quantity + ? WHERE user_id = ? AND product_id = ?',
          [quantity, req.user.id, product_id]
        );
      } else {
        await conn.execute(
          'INSERT INTO cart (user_id, product_id, quantity, seller_id) VALUES (?, ?, ?, ?)',
          [req.user.id, product_id ?? null, quantity ?? 1, seller_id ?? null]
        );
      }

      conn.release();
      res.json({ success: true, message: 'Added to cart' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get cart
  router.get('/', verifyToken, async (req, res) => {
    try {
      const conn = await pool.getConnection();
      const [items] = await conn.execute(
        `SELECT c.*, p.name, p.price, p.discount_percent, p.images, s.shop_name 
         FROM cart c 
         JOIN products p ON c.product_id = p.id 
         JOIN sellers s ON c.seller_id = s.id 
         WHERE c.user_id = ?`,
        [req.user.id]
      );

      conn.release();
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update cart quantity
  router.put('/:id', verifyToken, async (req, res) => {
    try {
      const { quantity } = req.body;
      const conn = await pool.getConnection();

      await conn.execute('UPDATE cart SET quantity = ? WHERE id = ? AND user_id = ?', [quantity, req.params.id, req.user.id]);

      conn.release();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Remove from cart
  router.delete('/:id', verifyToken, async (req, res) => {
    try {
      const conn = await pool.getConnection();
      await conn.execute('DELETE FROM cart WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
      conn.release();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Clear cart
  router.delete('/', verifyToken, async (req, res) => {
    try {
      const conn = await pool.getConnection();
      await conn.execute('DELETE FROM cart WHERE user_id = ?', [req.user.id]);
      conn.release();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
