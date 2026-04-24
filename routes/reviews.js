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

  // Add review
  router.post('/', verifyToken, async (req, res) => {
    try {
      const { product_id, rating, comment } = req.body;
      const conn = await pool.getConnection();

      const [result] = await conn.execute(
        'INSERT INTO reviews (product_id, user_id, rating, comment) VALUES (?, ?, ?, ?)',
        [product_id ?? null, req.user.id, rating ?? null, comment ?? null]
      );

      // Update product rating
      const [reviews] = await conn.execute(
        'SELECT AVG(rating) as avg_rating, COUNT(*) as count FROM reviews WHERE product_id = ?',
        [product_id]
      );

      await conn.execute(
        'UPDATE products SET rating = ?, reviews_count = ? WHERE id = ?',
        [reviews[0].avg_rating, reviews[0].count, product_id]
      );

      conn.release();
      res.json({ success: true, reviewId: result.insertId });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get reviews for product
  router.get('/product/:product_id', async (req, res) => {
    try {
      const conn = await pool.getConnection();
      const [reviews] = await conn.execute(
        `SELECT r.*, u.name, u.avatar FROM reviews r 
         JOIN users u ON r.user_id = u.id 
         WHERE r.product_id = ? 
         ORDER BY r.created_at DESC`,
        [req.params.product_id]
      );

      conn.release();
      res.json(reviews);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
