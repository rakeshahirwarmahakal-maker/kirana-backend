const express = require('express');
const { getMessaging } = require('../services/firebase_admin');

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

  // Get notifications
  router.get('/', verifyToken, async (req, res) => {
    try {
      const conn = await pool.getConnection();
      const [notifications] = await conn.execute(
        'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC',
        [req.user.id]
      );

      conn.release();
      res.json(notifications);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Mark as read
  router.put('/:id/read', verifyToken, async (req, res) => {
    try {
      const conn = await pool.getConnection();
      await conn.execute('UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
      conn.release();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Register FCM token
  router.post('/register-token', verifyToken, async (req, res) => {
    try {
      const { fcm_token, device_id, platform } = req.body;
      if (!fcm_token) {
        return res.status(400).json({ error: 'fcm_token is required' });
      }

      const conn = await pool.getConnection();
      await conn.execute(
        `INSERT INTO fcm_tokens (user_id, fcm_token, device_id, platform)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE device_id = VALUES(device_id), platform = VALUES(platform), updated_at = NOW()` ,
        [req.user.id, fcm_token, device_id || null, platform || null]
      );
      conn.release();

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Send push notification (admin only)
  router.post('/send', verifyToken, async (req, res) => {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const { user_id, title, body, data } = req.body;
      if (!user_id || !title) {
        return res.status(400).json({ error: 'user_id and title are required' });
      }

      const conn = await pool.getConnection();
      await conn.execute(
        'INSERT INTO notifications (user_id, title, body, type) VALUES (?, ?, ?, ?)',
        [user_id, title, body || '', 'order_update']
      );

      const [rows] = await conn.execute('SELECT fcm_token FROM fcm_tokens WHERE user_id = ?', [user_id]);
      conn.release();

      const tokens = rows.map((row) => row.fcm_token).filter(Boolean);
      if (!tokens.length) {
        return res.json({ success: true, sent: 0 });
      }

      const messaging = getMessaging();
      if (!messaging) {
        return res.status(500).json({ error: 'Firebase admin not configured' });
      }

      const payload = {
        tokens,
        notification: {
          title,
          body: body || '',
        },
        data: Object.entries(data || {}).reduce((acc, [key, value]) => {
          acc[key] = String(value);
          return acc;
        }, {}),
      };

      const result = await messaging.sendEachForMulticast(payload);
      res.json({ success: true, sent: result.successCount, failed: result.failureCount });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
