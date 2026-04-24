const express = require('express');

const router = express.Router();

const toRadians = (degrees) => degrees * (Math.PI / 180);

const getDistanceKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth radius in km
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.asin(Math.sqrt(a));
  return R * c;
};

module.exports = (pool) => {
  router.get('/stores', async (req, res) => {
    try {
      const { lat, lng, max_km = 3 } = req.query;
      if (!lat || !lng) {
        return res.status(400).json({ error: 'lat and lng are required' });
      }

      const conn = await pool.getConnection();
      const [stores] = await conn.execute(
        'SELECT s.*, u.name as owner_name, u.phone, u.email FROM sellers s JOIN users u ON s.user_id = u.id WHERE s.is_active = TRUE AND s.is_verified = TRUE'
      );

      const nearby = stores
        .map((store) => {
          if (store.latitude == null || store.longitude == null) return null;
          const distance = getDistanceKm(parseFloat(lat), parseFloat(lng), parseFloat(store.latitude), parseFloat(store.longitude));
          const sellerRadius = store.delivery_radius != null ? Number(store.delivery_radius) : Number(max_km);
          const maxRadius = Math.min(Number(max_km), sellerRadius);
          return { ...store, distance_km: Number(distance.toFixed(3)), max_radius_km: maxRadius };
        })
        .filter((store) => store && store.distance_km <= Number(store.max_radius_km))
        .sort((a, b) => a.distance_km - b.distance_km);

      conn.release();
      res.json({ nearby, count: nearby.length });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/ip', (req, res) => {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req.ip;
    res.json({ ip });
  });

  router.get('/areas', async (req, res) => {
    try {
      const conn = await pool.getConnection();
      const [areas] = await conn.execute('SELECT * FROM service_areas WHERE is_active = TRUE ORDER BY created_at DESC');
      conn.release();
      res.json(areas);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
