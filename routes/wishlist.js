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

  // Add to wishlist
  router.post('/add', verifyToken, async (req, res) => {
    try {
      const { product_id } = req.body;
      const conn = await pool.getConnection();

      await conn.execute(
        'INSERT IGNORE INTO wishlist (user_id, product_id) VALUES (?, ?)',
        [req.user.id, product_id ?? null]
      );

      conn.release();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get wishlist
  router.get('/', verifyToken, async (req, res) => {
    try {
      const conn = await pool.getConnection();
      const [items] = await conn.execute(
        `SELECT w.id, p.* FROM wishlist w JOIN products p ON w.product_id = p.id WHERE w.user_id = ?`,
        [req.user.id]
      );

      conn.release();
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Remove from wishlist
  router.delete('/:product_id', verifyToken, async (req, res) => {
    try {
      const conn = await pool.getConnection();
      await conn.execute('DELETE FROM wishlist WHERE user_id = ? AND product_id = ?', [req.user.id, req.params.product_id]);
      conn.release();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
