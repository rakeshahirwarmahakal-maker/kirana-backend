const express = require('express');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');

// Multer configuration for product images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PNG, JPG, JPEG, and GIF are allowed.'));
    }
  }
});

// Verify JWT token
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_key');
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

module.exports = (pool) => {
  const router = express.Router();

  // GET /seller/status - Get seller dashboard status
  router.get('/status', verifyToken, async (req, res) => {
    try {
      const conn = await pool.getConnection();
      
      // Get seller info
      const [sellers] = await conn.execute(
        'SELECT id, user_id, shop_name, is_verified FROM sellers WHERE user_id = ? LIMIT 1',
        [req.user.id]
      );

      if (!sellers.length) {
        conn.release();
        return res.status(404).json({ error: 'Seller not found' });
      }

      const seller = sellers[0];
      const seller_id = seller.id;

      // Count products
      const [productsCount] = await conn.execute(
        'SELECT COUNT(*) as count FROM products WHERE seller_id = ?',
        [seller_id]
      );

      // Count pending orders
      const [pendingOrders] = await conn.execute(
        'SELECT COUNT(*) as count FROM order_items WHERE seller_id = ? AND seller_status = "pending"',
        [seller_id]
      );

      // Count delivery boys
      const [deliveryBoys] = await conn.execute(
        'SELECT COUNT(*) as count FROM delivery_boys WHERE seller_id = ?',
        [seller_id]
      );

      // Calculate revenue
      const [revenue] = await conn.execute(
        'SELECT COALESCE(SUM(oi.price * oi.quantity), 0) as total FROM order_items oi WHERE oi.seller_id = ? AND oi.seller_status = "delivered"',
        [seller_id]
      );

      conn.release();

      res.json({
        seller_id,
        status: seller.is_verified ? 'verified' : 'pending',
        shop_name: seller.shop_name,
        is_verified: seller.is_verified,
        products: productsCount[0].count,
        pendingOrders: pendingOrders[0].count,
        deliveryBoys: deliveryBoys[0].count,
        revenue: revenue[0].total || 0
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /seller/products - Get seller's products
  router.get('/products', verifyToken, async (req, res) => {
    try {
      const conn = await pool.getConnection();
      
      const [seller] = await conn.execute(
        'SELECT id FROM sellers WHERE user_id = ? LIMIT 1',
        [req.user.id]
      );

      if (!seller.length) {
        conn.release();
        return res.status(404).json({ error: 'Seller not found' });
      }

      const [products] = await conn.execute(
        'SELECT id, name, description, price, stock, category_id, images, created_at FROM products WHERE seller_id = ? ORDER BY created_at DESC',
        [seller[0].id]
      );

      // Parse images JSON and return formatted products
      const formattedProducts = products.map(p => ({
        ...p,
        image: p.images ? (JSON.parse(p.images)[0] || null) : null,
        images: p.images ? JSON.parse(p.images) : []
      }));

      conn.release();
      res.json(formattedProducts || []);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /seller/products - Create product
  router.post('/products', verifyToken, upload.single('image'), async (req, res) => {
    try {
      const { name, description, price, stock, category_id, category, imageUrl } = req.body;
      
      if (!name || !price) {
        return res.status(400).json({ error: 'Name and price are required' });
      }

      // Validate that either image file or imageUrl is provided
      if (!req.file && !imageUrl) {
        return res.status(400).json({ error: 'Either image file or imageUrl is required' });
      }

      const conn = await pool.getConnection();
      
      const [seller] = await conn.execute(
        'SELECT id FROM sellers WHERE user_id = ? LIMIT 1',
        [req.user.id]
      );

      if (!seller.length) {
        conn.release();
        return res.status(404).json({ error: 'Seller not found' });
      }

      // Determine category_id: explicit id > category name lookup > default to 1
      let finalCategoryId = category_id || 1;
      
      if (!category_id && category) {
        // Try to find category by name
        const [categories] = await conn.execute(
          'SELECT id FROM categories WHERE LOWER(name) = LOWER(?)',
          [category]
        );
        if (categories.length) {
          finalCategoryId = categories[0].id;
        }
      }

      // Determine image value: file path or URL
      const image = req.file ? `/uploads/${req.file.filename}` : imageUrl;
      const images = JSON.stringify([image]);

      const [result] = await conn.execute(
        'INSERT INTO products (seller_id, category_id, name, description, price, stock, images) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [seller[0].id, finalCategoryId, name, description || '', price, stock || 0, images]
      );

      conn.release();
      res.status(201).json({
        id: result.insertId,
        name,
        price,
        stock,
        category_id,
        image
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // PUT /seller/products/:id - Update product
  router.put('/products/:id', verifyToken, upload.single('image'), async (req, res) => {
    try {
      const { name, description, price, stock, category_id, category, imageUrl } = req.body;
      const productId = req.params.id;

      const conn = await pool.getConnection();
      
      const [seller] = await conn.execute(
        'SELECT id FROM sellers WHERE user_id = ? LIMIT 1',
        [req.user.id]
      );

      if (!seller.length) {
        conn.release();
        return res.status(404).json({ error: 'Seller not found' });
      }

      // Get existing product to retain image if no new image provided
      const [existingProduct] = await conn.execute(
        'SELECT images FROM products WHERE id = ? AND seller_id = ?',
        [productId, seller[0].id]
      );

      if (!existingProduct.length) {
        conn.release();
        return res.status(404).json({ error: 'Product not found' });
      }

      // Determine category_id: explicit id > category name lookup > default to 1
      let finalCategoryId = category_id || 1;
      
      if (!category_id && category) {
        // Try to find category by name
        const [categories] = await conn.execute(
          'SELECT id FROM categories WHERE LOWER(name) = LOWER(?)',
          [category]
        );
        if (categories.length) {
          finalCategoryId = categories[0].id;
        }
      }

      // Determine image: new file > new URL > existing images
      let images = existingProduct[0].images || '[]';
      if (req.file) {
        images = JSON.stringify([`/uploads/${req.file.filename}`]);
      } else if (imageUrl) {
        images = JSON.stringify([imageUrl]);
      }

      // Update product
      await conn.execute(
        'UPDATE products SET name = ?, description = ?, price = ?, stock = ?, category_id = ?, images = ? WHERE id = ? AND seller_id = ?',
        [name, description || '', price, stock || 0, finalCategoryId, images, productId, seller[0].id]
      );

      conn.release();
      res.json({ success: true, id: productId, images });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /seller/products/:id - Delete product
  router.delete('/products/:id', verifyToken, async (req, res) => {
    try {
      const productId = req.params.id;
      
      const conn = await pool.getConnection();
      
      const [seller] = await conn.execute(
        'SELECT id FROM sellers WHERE user_id = ? LIMIT 1',
        [req.user.id]
      );

      if (!seller.length) {
        conn.release();
        return res.status(404).json({ error: 'Seller not found' });
      }

      await conn.execute(
        'DELETE FROM products WHERE id = ? AND seller_id = ?',
        [productId, seller[0].id]
      );

      conn.release();
      res.json({ success: true, message: 'Product deleted' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /seller/delivery-boys - Get delivery boys
  router.get('/delivery-boys', verifyToken, async (req, res) => {
    try {
      const conn = await pool.getConnection();
      
      const [seller] = await conn.execute(
        'SELECT id FROM sellers WHERE user_id = ? LIMIT 1',
        [req.user.id]
      );

      if (!seller.length) {
        conn.release();
        return res.status(404).json({ error: 'Seller not found' });
      }

      const [boys] = await conn.execute(
        'SELECT id, name, phone, vehicle, vehicle_number, is_active, current_orders, total_deliveries, rating FROM delivery_boys WHERE seller_id = ?',
        [seller[0].id]
      );

      conn.release();
      res.json(boys || []);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /seller/delivery-boys - Add delivery boy
  router.post('/delivery-boys', verifyToken, async (req, res) => {
    try {
      const { name, phone, vehicle, vehicle_number } = req.body;

      if (!name || !phone) {
        return res.status(400).json({ error: 'Name and phone are required' });
      }

      const conn = await pool.getConnection();
      
      const [seller] = await conn.execute(
        'SELECT id FROM sellers WHERE user_id = ? LIMIT 1',
        [req.user.id]
      );

      if (!seller.length) {
        conn.release();
        return res.status(404).json({ error: 'Seller not found' });
      }

      const [result] = await conn.execute(
        'INSERT INTO delivery_boys (seller_id, name, phone, vehicle, vehicle_number, is_active) VALUES (?, ?, ?, ?, ?, ?)',
        [seller[0].id, name, phone, vehicle || '', vehicle_number || '', 1]
      );

      conn.release();
      res.status(201).json({
        id: result.insertId,
        name,
        phone,
        vehicle,
        vehicle_number,
        is_active: true
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /seller/delivery-boys/:id - Remove delivery boy
  router.delete('/delivery-boys/:id', verifyToken, async (req, res) => {
    try {
      const boyId = req.params.id;
      
      const conn = await pool.getConnection();
      
      const [seller] = await conn.execute(
        'SELECT id FROM sellers WHERE user_id = ? LIMIT 1',
        [req.user.id]
      );

      if (!seller.length) {
        conn.release();
        return res.status(404).json({ error: 'Seller not found' });
      }

      await conn.execute(
        'DELETE FROM delivery_boys WHERE id = ? AND seller_id = ?',
        [boyId, seller[0].id]
      );

      conn.release();
      res.json({ success: true, message: 'Delivery boy removed' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /seller/tracking - Get delivery tracking
  router.get('/tracking', verifyToken, async (req, res) => {
    try {
      const conn = await pool.getConnection();
      
      const [seller] = await conn.execute(
        'SELECT id FROM sellers WHERE user_id = ? LIMIT 1',
        [req.user.id]
      );

      if (!seller.length) {
        conn.release();
        return res.status(404).json({ error: 'Seller not found' });
      }

      const [tracking] = await conn.execute(
        `SELECT dt.id, dt.order_id, dt.status, dt.current_location, dt.latitude, dt.longitude,
                db.name as delivery_boy_name, db.phone as delivery_boy_phone
         FROM delivery_tracking dt
         LEFT JOIN delivery_boys db ON dt.delivery_boy_id = db.id
         WHERE dt.seller_id = ?
         ORDER BY dt.updated_at DESC`,
        [seller[0].id]
      );

      conn.release();
      res.json(tracking || []);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /seller/orders - Get seller's orders
  router.get('/orders', verifyToken, async (req, res) => {
    try {
      const conn = await pool.getConnection();
      
      const [seller] = await conn.execute(
        'SELECT id FROM sellers WHERE user_id = ? LIMIT 1',
        [req.user.id]
      );

      if (!seller.length) {
        conn.release();
        return res.status(404).json({ error: 'Seller not found' });
      }

      const [orders] = await conn.execute(
        `SELECT DISTINCT o.id, o.user_id, o.total_amount, o.order_status,
                oi.seller_status, COUNT(oi.id) as item_count, o.created_at
         FROM orders o
         JOIN order_items oi ON o.id = oi.order_id
         WHERE oi.seller_id = ?
         GROUP BY o.id
         ORDER BY o.created_at DESC`,
        [seller[0].id]
      );

      conn.release();
      res.json(orders || []);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /seller/orders/pending - Get pending orders (awaiting acceptance)
  router.get('/orders/pending', verifyToken, async (req, res) => {
    try {
      const conn = await pool.getConnection();
      
      const [seller] = await conn.execute(
        'SELECT id FROM sellers WHERE user_id = ? LIMIT 1',
        [req.user.id]
      );

      if (!seller.length) {
        conn.release();
        return res.status(404).json({ error: 'Seller not found' });
      }

      const [pendingOrders] = await conn.execute(
        `SELECT DISTINCT o.id, o.user_id, o.total_amount, o.created_at,
                COUNT(CASE WHEN oi.seller_status = 'pending' THEN 1 END) as pending_items,
                COUNT(CASE WHEN oi.seller_status = 'accepted' THEN 1 END) as accepted_items,
                u.name as customer_name, ua.phone as customer_phone, ua.address as delivery_address
         FROM orders o
         JOIN order_items oi ON o.id = oi.order_id
         LEFT JOIN users u ON o.user_id = u.id
         LEFT JOIN user_addresses ua ON o.address_id = ua.id
         WHERE oi.seller_id = ? AND oi.seller_status = 'pending'
         GROUP BY o.id
         ORDER BY o.created_at DESC`,
        [seller[0].id]
      );

      conn.release();
      res.json(pendingOrders || []);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /seller/orders/:id/items - Get items for an order
  router.get('/orders/:id/items', verifyToken, async (req, res) => {
    try {
      const conn = await pool.getConnection();
      
      const [seller] = await conn.execute(
        'SELECT id FROM sellers WHERE user_id = ? LIMIT 1',
        [req.user.id]
      );

      if (!seller.length) {
        conn.release();
        return res.status(404).json({ error: 'Seller not found' });
      }

      const [items] = await conn.execute(
        `SELECT oi.id, oi.order_id, oi.product_id, oi.quantity, oi.price, oi.seller_status,
                p.name, p.description, p.images, (oi.quantity * oi.price) as item_total
         FROM order_items oi
         JOIN products p ON oi.product_id = p.id
         WHERE oi.order_id = ? AND oi.seller_id = ?
         ORDER BY oi.created_at ASC`,
        [req.params.id, seller[0].id]
      );

      conn.release();
      res.json(items || []);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /seller/orders/:itemId/accept - Accept order item
  router.post('/orders/:itemId/accept', verifyToken, async (req, res) => {
    try {
      const { delivery_boy_id } = req.body;
      const whatsappService = require('../services/whatsapp_service');
      
      const conn = await pool.getConnection();
      
      const [seller] = await conn.execute(
        'SELECT id, user_id, shop_name, latitude as seller_lat, longitude as seller_lon FROM sellers WHERE user_id = ? LIMIT 1',
        [req.user.id]
      );

      if (!seller.length) {
        conn.release();
        return res.status(404).json({ error: 'Seller not found' });
      }

      // Get order item
      const [orderItem] = await conn.execute(
        'SELECT * FROM order_items WHERE id = ? AND seller_id = ?',
        [req.params.itemId, seller[0].id]
      );

      if (!orderItem.length) {
        conn.release();
        return res.status(404).json({ error: 'Order item not found' });
      }

      const item = orderItem[0];
      
      // Update seller_status to accepted
      await conn.execute(
        'UPDATE order_items SET seller_status = ?, delivery_boy_id = ? WHERE id = ?',
        ['accepted', delivery_boy_id || null, item.id]
      );

      // Get order and customer details
      const [order] = await conn.execute(
        'SELECT user_id, address_id, total_amount FROM orders WHERE id = ?',
        [item.order_id]
      );

      // Get customer details
      const [customer] = await conn.execute(
        'SELECT u.name, u.phone, ua.address, ua.latitude as user_lat, ua.longitude as user_lon FROM users u JOIN user_addresses ua ON u.id = ua.user_id WHERE u.id = ? AND ua.id = ?',
        [order[0].user_id, order[0].address_id]
      );

      // Get all order items with product details
      const [allItems] = await conn.execute(
        `SELECT p.name, oi.quantity, oi.price FROM order_items oi 
         JOIN products p ON oi.product_id = p.id 
         WHERE oi.order_id = ?`,
        [item.order_id]
      );

      // Notify customer
      if (order.length) {
        await conn.execute(
          'INSERT INTO notifications (user_id, title, body, type, order_id) VALUES (?, ?, ?, ?, ?)',
          [
            order[0].user_id,
            '✅ Order accepted',
            `${seller[0].shop_name} has accepted your order item. Preparing for dispatch...`,
            'order_update',
            item.order_id
          ]
        );
      }

      // Send WhatsApp to delivery boy if provided
      let whatsappResult = null;
      if (delivery_boy_id) {
        const [deliveryBoy] = await conn.execute(
          'SELECT name, phone FROM delivery_boys WHERE id = ? AND seller_id = ?',
          [delivery_boy_id, seller[0].id]
        );

        if (deliveryBoy.length && customer.length) {
          try {
            // Calculate distance and delivery time
            const userLat = customer[0].user_lat || 23.2667;
            const userLon = customer[0].user_lon || 69.6667;
            const distance = whatsappService.calculateDistance(
              seller[0].seller_lat || 23.2667,
              seller[0].seller_lon || 69.6667,
              userLat,
              userLon
            );
            const deliveryTime = whatsappService.calculateDeliveryTime(distance);

            // Create Google Maps link
            const mapsLink = `https://www.google.com/maps/search/?api=1&query=${userLat},${userLon}`;

            // Send WhatsApp order
            const orderDetails = {
              items: allItems.map(i => ({
                name: i.name,
                quantity: i.quantity,
                price: i.price
              })),
              customer: {
                name: customer[0].name,
                phone: customer[0].phone,
                address: customer[0].address
              },
              totalAmount: order[0].total_amount,
              deliveryTime,
              mapsLink,
              storeName: seller[0].shop_name
            };

            whatsappResult = await whatsappService.sendOrderToDeliveryBoy(
              deliveryBoy[0].phone,
              orderDetails
            );

            console.log('✅ WhatsApp sent to delivery boy:', whatsappResult);
          } catch (whatsappError) {
            console.error('⚠️ WhatsApp error:', whatsappError.message);
            // Don't fail the order acceptance if WhatsApp fails
          }
        }
      }

      conn.release();
      res.json({ 
        success: true, 
        message: 'Order item accepted successfully',
        whatsapp: whatsappResult
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /seller/orders/:itemId/reject - Reject order item
  router.post('/orders/:itemId/reject', verifyToken, async (req, res) => {
    try {
      const { reason } = req.body;
      const conn = await pool.getConnection();
      
      const [seller] = await conn.execute(
        'SELECT id, user_id, shop_name FROM sellers WHERE user_id = ? LIMIT 1',
        [req.user.id]
      );

      if (!seller.length) {
        conn.release();
        return res.status(404).json({ error: 'Seller not found' });
      }

      // Get order item
      const [orderItem] = await conn.execute(
        'SELECT * FROM order_items WHERE id = ? AND seller_id = ?',
        [req.params.itemId, seller[0].id]
      );

      if (!orderItem.length) {
        conn.release();
        return res.status(404).json({ error: 'Order item not found' });
      }

      const item = orderItem[0];
      
      // Update seller_status to rejected
      await conn.execute(
        'UPDATE order_items SET seller_status = ? WHERE id = ?',
        ['rejected', item.id]
      );

      // Try to find another nearby seller for this product
      const [order] = await conn.execute(
        'SELECT o.id, o.user_id, o.address_id FROM orders WHERE id = ?',
        [item.order_id]
      );

      if (order.length) {
        // Get user address for distance calculation
        const [address] = await conn.execute(
          'SELECT latitude, longitude FROM user_addresses WHERE id = ?',
          [order[0].address_id]
        );

        const userLat = address.length ? address[0].latitude : 23.2667;
        const userLon = address.length ? address[0].longitude : 69.6667;

        // Find other sellers with this product (excluding current seller)
        const [otherSellers] = await conn.execute(
          `SELECT s.id, s.latitude, s.longitude, s.shop_name, s.delivery_radius
           FROM sellers s
           JOIN products p ON p.seller_id = s.id
           WHERE p.id = ? AND s.id != ? AND s.is_active = 1 AND s.is_verified = 1`,
          [item.product_id, seller[0].id]
        );

        // Calculate distances for Haversine formula
        const calculateDistance = (lat1, lon1, lat2, lon2) => {
          const R = 6371;
          const dLat = (lat2 - lat1) * Math.PI / 180;
          const dLon = (lon2 - lon1) * Math.PI / 180;
          const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          return R * c;
        };

        // Find nearest seller
        let nearestSeller = null;
        let minDistance = Infinity;

        for (const s of otherSellers) {
          const distance = calculateDistance(userLat, userLon, s.latitude, s.longitude);
          if (distance <= s.delivery_radius && distance < minDistance) {
            minDistance = distance;
            nearestSeller = s;
          }
        }

        // Re-assign to nearest seller
        if (nearestSeller) {
          await conn.execute(
            'INSERT INTO order_items (order_id, product_id, seller_id, quantity, price, seller_status) VALUES (?, ?, ?, ?, ?, ?)',
            [item.order_id, item.product_id, nearestSeller.id, item.quantity, item.price, 'pending']
          );

          // Notify new seller
          const [newSellerUser] = await conn.execute(
            'SELECT user_id FROM sellers WHERE id = ?',
            [nearestSeller.id]
          );

          if (newSellerUser.length) {
            await conn.execute(
              'INSERT INTO notifications (user_id, title, body, type, order_id) VALUES (?, ?, ?, ?, ?)',
              [
                newSellerUser[0].user_id,
                '🆕 New order pending acceptance',
                `Order #${item.order_id} reassigned to you. Tap to accept or reject.`,
                'order_pending',
                item.order_id
              ]
            );
          }
        }

        // Notify customer
        await conn.execute(
          'INSERT INTO notifications (user_id, title, body, type, order_id) VALUES (?, ?, ?, ?, ?)',
          [
            order[0].user_id,
            '⚠️ Order item reassigned',
            `${reason ? reason : 'Previous seller unavailable'}. Finding another seller nearby...`,
            'order_update',
            item.order_id
          ]
        );
      }

      conn.release();
      res.json({ success: true, message: 'Order item rejected. Searching for alternative seller...' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /seller/store - Get store profile
  router.get('/store', verifyToken, async (req, res) => {
    try {
      const conn = await pool.getConnection();
      
      const [seller] = await conn.execute(
        'SELECT id, shop_name, description, address, latitude, longitude, category, delivery_radius, rating FROM sellers WHERE user_id = ? LIMIT 1',
        [req.user.id]
      );

      if (!seller.length) {
        conn.release();
        return res.status(404).json({ error: 'Seller not found' });
      }

      conn.release();
      res.json(seller[0]);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // PUT /seller/store - Update store profile
  router.put('/store', verifyToken, async (req, res) => {
    try {
      const { shop_name, description, address, latitude, longitude, category, delivery_radius } = req.body;
      
      const conn = await pool.getConnection();
      
      await conn.execute(
        'UPDATE sellers SET shop_name = ?, description = ?, address = ?, latitude = ?, longitude = ?, category = ?, delivery_radius = ? WHERE user_id = ?',
        [shop_name, description, address, latitude, longitude, category, delivery_radius, req.user.id]
      );

      conn.release();
      res.json({ success: true, message: 'Store updated' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
