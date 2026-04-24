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

  // ✅ Helper function (IMPORTANT)
  const parseImages = (images) => {
    let arr = [];
    try {
      if (typeof images === "string") {
        arr = JSON.parse(images);
      } else if (Array.isArray(images)) {
        arr = images;
      }
    } catch (e) {
      arr = [];
    }
    return arr;
  };

  // ================================
  // ✅ Get all products
  // ================================
  router.get('/', async (req, res) => {
    try {
      const { category_id, search, min_price, max_price, seller_id, sort } = req.query;
      const conn = await pool.getConnection();

      let query = `
        SELECT p.*, s.shop_name, 
        COALESCE(c.name, "Uncategorized") as category 
        FROM products p 
        JOIN sellers s ON p.seller_id = s.id 
        LEFT JOIN categories c ON p.category_id = c.id 
        WHERE 1=1
      `;
      const params = [];

      if (category_id) {
        query += ' AND p.category_id = ?';
        params.push(category_id);
      }
      if (search) {
        query += ' AND p.name LIKE ?';
        params.push('%' + search + '%');
      }
      if (min_price) {
        query += ' AND p.price >= ?';
        params.push(min_price);
      }
      if (max_price) {
        query += ' AND p.price <= ?';
        params.push(max_price);
      }
      if (seller_id) {
        query += ' AND p.seller_id = ?';
        params.push(seller_id);
      }

      if (sort === 'price_low') query += ' ORDER BY p.price ASC';
      else if (sort === 'price_high') query += ' ORDER BY p.price DESC';
      else if (sort === 'rating') query += ' ORDER BY p.rating DESC';
      else query += ' ORDER BY p.created_at DESC';

      const [products] = await conn.execute(query, params);

      const formattedProducts = products.map(p => {
        const imagesArray = parseImages(p.images);

        return {
          ...p,
          image: imagesArray[0] || null,
          images: imagesArray
        };
      });

      conn.release();
      res.json(formattedProducts);

    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // ================================
  // ✅ Get product by ID
  // ================================
  router.get('/:id', async (req, res) => {
    try {
      const conn = await pool.getConnection();

      const [products] = await conn.execute(
        `SELECT p.*, s.shop_name, 
         COALESCE(c.name, "Uncategorized") as category 
         FROM products p 
         JOIN sellers s ON p.seller_id = s.id 
         LEFT JOIN categories c ON p.category_id = c.id 
         WHERE p.id = ?`,
        [req.params.id]
      );

      if (!products.length) {
        conn.release();
        return res.status(404).json({ error: 'Product not found' });
      }

      const product = products[0];
      const imagesArray = parseImages(product.images);

      const formattedProduct = {
        ...product,
        image: imagesArray[0] || null,
        images: imagesArray
      };

      conn.release();
      res.json(formattedProduct);

    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // ================================
  // ✅ Get categories
  // ================================
  router.get('/categories/all', async (req, res) => {
    try {
      const conn = await pool.getConnection();
      const [categories] = await conn.execute('SELECT * FROM categories');
      conn.release();
      res.json(categories);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // ================================
  // ✅ Last updated
  // ================================
  router.get('/last-updated', async (req, res) => {
    try {
      const conn = await pool.getConnection();
      const [result] = await conn.execute(
        'SELECT MAX(updated_at) as last_updated FROM products WHERE is_active = 1'
      );
      conn.release();
      res.json({ last_updated: result[0].last_updated });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};