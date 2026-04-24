const express = require('express');
const { verifyToken, requireRole } = require('../middleware/auth');
const multer = require('multer');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + require('path').extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// SMS Notification Function
const sendSMSNotification = (phone, message) => {
  // This is a placeholder for SMS sending
  // In production, use services like Twilio, AWS SNS, etc.
  console.log(`📱 SMS Sent to ${phone}: ${message}`);
  // For now, just log it - in production integrate with SMS API
  return true;
};

module.exports = (pool) => {
  const router = express.Router();
  router.use(verifyToken);
  router.use(requireRole('seller'));

  const getSeller = async (userId) => {
    const conn = await pool.getConnection();
    const [rows] = await conn.execute('SELECT * FROM sellers WHERE user_id = ?', [userId]);
    conn.release();
    return rows[0];
  };

  router.get('/status', async (req, res) => {
    try {
      res.json({ success: true, message: 'Seller API reachable', user: req.user });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/store', async (req, res) => {
    try {
      const seller = await getSeller(req.user.id);
      if (!seller) return res.status(404).json({ error: 'Seller profile not found' });
      res.json(seller);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.put('/store', async (req, res) => {
    try {
      const {
        shop_name,
        shop_image,
        description,
        address,
        latitude,
        longitude,
        category,
        delivery_radius,
        kyc_document
      } = req.body;

      const seller = await getSeller(req.user.id);
      if (!seller) return res.status(404).json({ error: 'Seller profile not found' });

      const conn = await pool.getConnection();
      await conn.execute(
        `UPDATE sellers SET shop_name = ?, shop_image = ?, description = ?, address = ?, latitude = ?, longitude = ?, category = ?, delivery_radius = ?, kyc_document = ? WHERE user_id = ?`,
        [shop_name ?? null, shop_image ?? null, description ?? null, address ?? null, latitude ?? null, longitude ?? null, category ?? null, delivery_radius ?? null, kyc_document ?? null, req.user.id]
      );

      await conn.execute('UPDATE users SET name = ? WHERE id = ?', [shop_name, req.user.id]);
      conn.release();
      res.json({ success: true, message: 'Store profile updated' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/products', async (req, res) => {
    try {
      const seller = await getSeller(req.user.id);
      const conn = await pool.getConnection();
      const [products] = await conn.execute(
        `SELECT p.*, c.name as category_name FROM products p JOIN categories c ON p.category_id = c.id WHERE p.seller_id = ? ORDER BY p.created_at DESC`,
        [seller.id]
      );
      conn.release();
      res.json(products);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/products', upload.array('images', 10), async (req, res) => {
    try {
      const seller = await getSeller(req.user.id);
      const {
        category_id,
        subcategory_id,
        name,
        description,
        price,
        discount_percent,
        stock,
        image_urls
      } = req.body;

      // Handle uploaded files
      let imageUrls = [];
      if (req.files && req.files.length > 0) {
        imageUrls = req.files.map(file => `/uploads/${file.filename}`);
      }

      // Handle URL images
      if (image_urls) {
        const urls = Array.isArray(image_urls) ? image_urls : JSON.parse(image_urls);
        imageUrls = [...imageUrls, ...urls];
      }

      const conn = await pool.getConnection();
      const [result] = await conn.execute(
        `INSERT INTO products (seller_id, category_id, subcategory_id, name, description, price, discount_percent, stock, images, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [seller.id, category_id ?? null, subcategory_id ?? null, name ?? null, description ?? null, price ?? 0, discount_percent ?? 0, stock ?? 0, JSON.stringify(imageUrls)]
      );
      conn.release();
      res.json({ success: true, productId: result.insertId });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.put('/products/:id', upload.array('images', 10), async (req, res) => {
    try {
      const seller = await getSeller(req.user.id);
      const { category_id, subcategory_id, name, description, price, discount_percent, stock, image_urls, is_active } = req.body;
      const conn = await pool.getConnection();

      const [existing] = await conn.execute('SELECT * FROM products WHERE id = ? AND seller_id = ?', [req.params.id, seller.id]);
      if (!existing.length) {
        conn.release();
        return res.status(404).json({ error: 'Product not found' });
      }

      // Handle uploaded files
      let imageUrls = [];
      if (req.files && req.files.length > 0) {
        imageUrls = req.files.map(file => `/uploads/${file.filename}`);
      }

      // Handle URL images
      if (image_urls) {
        const urls = Array.isArray(image_urls) ? image_urls : JSON.parse(image_urls);
        imageUrls = [...imageUrls, ...urls];
      }

      // If no new images provided, keep existing ones
      if (imageUrls.length === 0) {
        imageUrls = JSON.parse(existing[0].images || '[]');
      }

      await conn.execute(
        `UPDATE products SET category_id = ?, subcategory_id = ?, name = ?, description = ?, price = ?, discount_percent = ?, stock = ?, images = ?, is_active = ?, updated_at = NOW() WHERE id = ?`,
        [category_id ?? null, subcategory_id ?? null, name ?? null, description ?? null, price ?? 0, discount_percent ?? 0, stock ?? 0, JSON.stringify(imageUrls), is_active === false ? 0 : 1, req.params.id]
      );

      conn.release();
      res.json({ success: true, message: 'Product updated' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.delete('/products/:id', async (req, res) => {
    try {
      const seller = await getSeller(req.user.id);
      const conn = await pool.getConnection();
      await conn.execute('DELETE FROM products WHERE id = ? AND seller_id = ?', [req.params.id, seller.id]);
      conn.release();
      res.json({ success: true, message: 'Product deleted' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/products/bulk', async (req, res) => {
    try {
      const seller = await getSeller(req.user.id);
      const { csvData, items } = req.body;
      const conn = await pool.getConnection();
      const rows = [];

      if (Array.isArray(items) && items.length) {
        rows.push(...items);
      } else if (csvData) {
        const lines = csvData.trim().split('\n');
        const headers = lines.shift().split(',').map((h) => h.trim());
        for (const line of lines) {
          const values = line.split(',').map((value) => value.trim());
          const record = headers.reduce((obj, key, index) => {
            obj[key] = values[index];
            return obj;
          }, {});
          rows.push(record);
        }
      }

      for (const item of rows) {
        await conn.execute(
          `INSERT INTO products (seller_id, category_id, name, description, price, discount_percent, stock, images) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [seller.id, item.category_id ?? null, item.name ?? null, item.description ?? null, item.price ?? 0, item.discount_percent ?? 0, item.stock ?? 0, JSON.stringify(item.images || [])]
        );
      }

      conn.release();
      res.json({ success: true, imported: rows.length });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/orders', async (req, res) => {
    try {
      const seller = await getSeller(req.user.id);
      const conn = await pool.getConnection();
      const [orders] = await conn.execute(
        `SELECT oi.*, o.order_status, u.name as customer_name, u.phone as customer_phone, p.name as product_name
         FROM order_items oi
         JOIN orders o ON oi.order_id = o.id
         JOIN users u ON o.user_id = u.id
         JOIN products p ON oi.product_id = p.id
         WHERE oi.seller_id = ? ORDER BY oi.created_at DESC`,
        [seller.id]
      );
      conn.release();
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.put('/orders/:itemId/status', async (req, res) => {
    try {
      const seller = await getSeller(req.user.id);
      const { seller_status } = req.body;
      const conn = await pool.getConnection();
      await conn.execute(
        'UPDATE order_items SET seller_status = ? WHERE id = ? AND seller_id = ?',
        [seller_status, req.params.itemId, seller.id]
      );
      conn.release();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/delivery/boys', async (req, res) => {
    try {
      const seller = await getSeller(req.user.id);
      const { name, phone, vehicle } = req.body;
      const conn = await pool.getConnection();
      const [result] = await conn.execute(
        'INSERT INTO delivery_boys (seller_id, name, phone, vehicle) VALUES (?, ?, ?, ?)',
        [seller.id, name, phone, vehicle]
      );
      conn.release();
      res.json({ success: true, id: result.insertId });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/delivery/boys', async (req, res) => {
    try {
      const seller = await getSeller(req.user.id);
      const conn = await pool.getConnection();
      const [boys] = await conn.execute('SELECT * FROM delivery_boys WHERE seller_id = ?', [seller.id]);
      conn.release();
      res.json(boys);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.put('/orders/:itemId/assign-delivery', async (req, res) => {
    try {
      const seller = await getSeller(req.user.id);
      const { delivery_boy_id } = req.body;
      const conn = await pool.getConnection();
      await conn.execute(
        'UPDATE order_items SET delivery_boy_id = ? WHERE id = ? AND seller_id = ?',
        [delivery_boy_id, req.params.itemId, seller.id]
      );
      conn.release();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Accept order with delivery boy assignment and SMS notification
  router.post('/orders/:itemId/accept', async (req, res) => {
    try {
      const seller = await getSeller(req.user.id);
      const { delivery_boy_id } = req.body;
      const conn = await pool.getConnection();

      // Get order item and related info
      const [orderItem] = await conn.execute(
        `SELECT oi.*, o.id as order_id, u.phone as customer_phone, u.name as customer_name, 
                p.name as product_name, p.price, db.name as delivery_boy_name, db.phone as delivery_boy_phone,
                s.shop_name
         FROM order_items oi
         JOIN orders o ON oi.order_id = o.id
         JOIN users u ON o.user_id = u.id
         JOIN products p ON oi.product_id = p.id
         LEFT JOIN delivery_boys db ON oi.delivery_boy_id = db.id
         WHERE oi.id = ? AND oi.seller_id = ?`,
        [req.params.itemId, seller.id]
      );

      if (!orderItem.length) {
        conn.release();
        return res.status(404).json({ error: 'Order item not found' });
      }

      const item = orderItem[0];
      
      // Update order status to accepted
      await conn.execute(
        'UPDATE order_items SET seller_status = ? WHERE id = ? AND seller_id = ?',
        ['accepted', req.params.itemId, seller.id]
      );

      // If delivery boy is assigned, update it
      if (delivery_boy_id) {
        await conn.execute(
          'UPDATE order_items SET delivery_boy_id = ? WHERE id = ? AND seller_id = ?',
          [delivery_boy_id, req.params.itemId, seller.id]
        );

        // Get updated delivery boy info
        const [updatedDeliveryBoy] = await conn.execute(
          'SELECT * FROM delivery_boys WHERE id = ? AND seller_id = ?',
          [delivery_boy_id, seller.id]
        );

        if (updatedDeliveryBoy.length) {
          const deliveryBoy = updatedDeliveryBoy[0];
          
          // Prepare SMS message for platform (8052559771)
          const platformMessage = `🎯 New Order Assigned!\n\nOrder ID: ${item.order_id}\nStore: ${item.shop_name}\nCustomer: ${item.customer_name}\nPhone: ${item.customer_phone}\nProduct: ${item.product_name}\nQuantity: ${item.quantity}\nDelivery Boy: ${deliveryBoy.name}\nDelivery Boy Phone: ${deliveryBoy.phone}\n\nReady for delivery!`;
          
          // Send SMS to platform
          sendSMSNotification('8052559771', platformMessage);
          
          // Send SMS to customer
          const customerMessage = `✅ Your order #${item.order_id} has been accepted by ${item.shop_name}\n\nDelivery Boy: ${deliveryBoy.name}\nPhone: ${deliveryBoy.phone}\n\nDelivery in 30-45 mins`;
          sendSMSNotification(item.customer_phone, customerMessage);
          
          // Send SMS to delivery boy
          const deliveryBoyMessage = `📦 New Delivery Order!\n\nOrder ID: ${item.order_id}\nCustomer: ${item.customer_name}\nPhone: ${item.customer_phone}\nProduct: ${item.product_name} (Qty: ${item.quantity})\nStore: ${item.shop_name}\n\nReady for pickup!`;
          sendSMSNotification(deliveryBoy.phone, deliveryBoyMessage);
        }
      }

      conn.release();
      res.json({ success: true, message: 'Order accepted and delivery assigned' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/earnings', async (req, res) => {
    try {
      const seller = await getSeller(req.user.id);
      const conn = await pool.getConnection();
      const [rows] = await conn.execute(
        `SELECT
          SUM(oi.price * oi.quantity) as total_earnings,
          SUM(oi.price * oi.quantity) * (s.commission_rate / 100) as commission,
          SUM(oi.price * oi.quantity) - SUM(oi.price * oi.quantity) * (s.commission_rate / 100) as payout_amount
          FROM order_items oi
          JOIN sellers s ON oi.seller_id = s.id
          JOIN orders o ON oi.order_id = o.id
          WHERE oi.seller_id = ? AND oi.seller_status = 'delivered' AND o.order_status = 'delivered'`,
        [seller.id]
      );

      conn.release();
      res.json(rows[0] || { total_earnings: 0, commission: 0, payout_amount: 0 });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/inventory/low-stock', async (req, res) => {
    try {
      const seller = await getSeller(req.user.id);
      const conn = await pool.getConnection();
      const [products] = await conn.execute(
        'SELECT * FROM products WHERE seller_id = ? AND stock <= 5 ORDER BY stock ASC',
        [seller.id]
      );
      conn.release();
      res.json(products);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Delete delivery boy
  router.delete('/delivery-boys/:id', async (req, res) => {
    try {
      const seller = await getSeller(req.user.id);
      const conn = await pool.getConnection();
      await conn.execute('DELETE FROM delivery_boys WHERE id = ? AND seller_id = ?', [req.params.id, seller.id]);
      conn.release();
      res.json({ success: true, message: 'Delivery boy removed' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get order tracking information
  router.get('/tracking', async (req, res) => {
    try {
      const seller = await getSeller(req.user.id);
      const conn = await pool.getConnection();
      const [tracking] = await conn.execute(
        `SELECT dt.*, oi.id as order_item_id, o.id as order_id, p.name as product_name, u.name as customer_name, u.phone as customer_phone, db.name as delivery_boy_name
         FROM delivery_tracking dt
         RIGHT JOIN order_items oi ON dt.order_item_id = oi.id
         JOIN orders o ON oi.order_id = o.id
         JOIN products p ON oi.product_id = p.id
         JOIN users u ON o.user_id = u.id
         LEFT JOIN delivery_boys db ON oi.delivery_boy_id = db.id
         WHERE oi.seller_id = ? ORDER BY oi.created_at DESC`,
        [seller.id]
      );
      conn.release();
      res.json(tracking);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get seller status
  router.get('/seller-status', async (req, res) => {
    try {
      const seller = await getSeller(req.user.id);
      const conn = await pool.getConnection();
      
      const [[productsCount]] = await conn.execute('SELECT COUNT(*) as count FROM products WHERE seller_id = ?', [seller.id]);
      const [[ordersCount]] = await conn.execute(
        'SELECT COUNT(*) as count FROM order_items WHERE seller_id = ? AND seller_status = "pending"',
        [seller.id]
      );
      const [[deliveryBoysCount]] = await conn.execute('SELECT COUNT(*) as count FROM delivery_boys WHERE seller_id = ?', [seller.id]);

      conn.release();
      
      res.json({
        seller_id: seller.id,
        status: seller.is_verified ? 'verified' : 'pending',
        shop_name: seller.shop_name,
        is_active: seller.is_active,
        products: productsCount.count,
        pending_orders: ordersCount.count,
        delivery_boys: deliveryBoysCount.count
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
