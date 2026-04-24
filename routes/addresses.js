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

  // Create address
  router.post('/', verifyToken, async (req, res) => {
    try {
      const { name, phone, address, city, state, pincode, address_type } = req.body;
      const conn = await pool.getConnection();

      const [result] = await conn.execute(
        `INSERT INTO user_addresses (user_id, name, phone, address, city, state, pincode, address_type) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.user.id, name ?? null, phone ?? null, address ?? null, city ?? null, state ?? null, pincode ?? null, address_type ?? null]
      );

      conn.release();
      res.json({ success: true, addressId: result.insertId });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get all addresses
  router.get('/', verifyToken, async (req, res) => {
    try {
      const conn = await pool.getConnection();
      const [addresses] = await conn.execute(
        'SELECT * FROM user_addresses WHERE user_id = ? ORDER BY is_default DESC',
        [req.user.id]
      );

      conn.release();
      res.json(addresses);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update address
  router.put('/:id', verifyToken, async (req, res) => {
    try {
      const { name, phone, address, city, state, pincode, address_type, is_default } = req.body;
      const conn = await pool.getConnection();

      if (is_default) {
        await conn.execute('UPDATE user_addresses SET is_default = FALSE WHERE user_id = ?', [req.user.id]);
      }

      await conn.execute(
        `UPDATE user_addresses SET name = ?, phone = ?, address = ?, city = ?, state = ?, pincode = ?, address_type = ?, is_default = ? 
         WHERE id = ? AND user_id = ?`,
        [name ?? null, phone ?? null, address ?? null, city ?? null, state ?? null, pincode ?? null, address_type ?? null, is_default || false, req.params.id, req.user.id]
      );

      conn.release();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Delete address
  router.delete('/:id', verifyToken, async (req, res) => {
    try {
      const conn = await pool.getConnection();
      await conn.execute('DELETE FROM user_addresses WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
      conn.release();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
