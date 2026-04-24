const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const bcrypt = require('bcryptjs');
const multer = require('multer');

dotenv.config();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

async function seedSampleData(conn) {
  // Seed main categories with subcategories
  const categories = [
    {
      name: 'Grocery',
      image: 'https://images.unsplash.com/photo-1488459716781-31db52582fe9?auto=format&fit=crop&w=400&q=80',
      description: 'Fresh groceries and daily essentials',
      subcategories: [
        { name: 'Rice & Grains', image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=300&q=80' },
        { name: 'Dals & Pulses', image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=300&q=80' },
        { name: 'Vegetables', image: 'https://images.unsplash.com/photo-1464454709131-ffd692591ee5?auto=format&fit=crop&w=300&q=80' },
        { name: 'Fruits', image: 'https://images.unsplash.com/photo-1446887877081-d282a0f896e2?auto=format&fit=crop&w=300&q=80' },
        { name: 'Spices', image: 'https://images.unsplash.com/photo-1596040-53c0ea4fa9cd?auto=format&fit=crop&w=300&q=80' }
      ]
    },
    {
      name: 'Fashion',
      image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=400&q=80',
      description: 'Trendy fashion and apparel',
      subcategories: [
        { name: 'Men Clothing', image: 'https://images.unsplash.com/photo-1552062407-c551eeda4bbb?auto=format&fit=crop&w=300&q=80' },
        { name: 'Women Clothing', image: 'https://images.unsplash.com/photo-1595777712802-37a8c5fee8d3?auto=format&fit=crop&w=300&q=80' },
        { name: 'Shoes', image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=300&q=80' },
        { name: 'Accessories', image: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=300&q=80' },
        { name: 'Ethnic Wear', image: 'https://images.unsplash.com/photo-1570512674191-bfc0e36fbea0?auto=format&fit=crop&w=300&q=80' }
      ]
    },
    {
      name: 'Food',
      image: 'https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&w=400&q=80',
      description: 'Ready-to-eat meals and beverages',
      subcategories: [
        { name: 'Breads & Bakery', image: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=300&q=80' },
        { name: 'Dairy', image: 'https://images.unsplash.com/photo-1543182694-e7f8c9e1c2a3?auto=format&fit=crop&w=300&q=80' },
        { name: 'Snacks', image: 'https://images.unsplash.com/photo-1599599810694-b5ac4dd4eae7?auto=format&fit=crop&w=300&q=80' },
        { name: 'Beverages', image: 'https://images.unsplash.com/photo-1556740738-b6a63e27c4df?auto=format&fit=crop&w=300&q=80' },
        { name: 'Prepared Meals', image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=300&q=80' }
      ]
    }
  ];

  for (const cat of categories) {
    const [existingCat] = await conn.execute('SELECT id FROM categories WHERE name = ?', [cat.name]);
    let categoryId;
    
    if (!existingCat.length) {
      const [catResult] = await conn.execute(
        'INSERT INTO categories (name, image, description) VALUES (?, ?, ?)',
        [cat.name, cat.image, cat.description]
      );
      categoryId = catResult.insertId;
    } else {
      categoryId = existingCat[0].id;
    }

    // Add subcategories
    for (const subcat of cat.subcategories) {
      const [existingSubcat] = await conn.execute(
        'SELECT id FROM subcategories WHERE category_id = ? AND name = ?',
        [categoryId, subcat.name]
      );
      if (!existingSubcat.length) {
        await conn.execute(
          'INSERT INTO subcategories (category_id, name, image, description) VALUES (?, ?, ?, ?)',
          [categoryId, subcat.name, subcat.image, subcat.name]
        );
      }
    }
  }

  const [sellerRows] = await conn.execute('SELECT id FROM sellers WHERE shop_name = ?', ['BlinkGro Cards Store']);
  let sellerId;

  if (!sellerRows.length) {
    const passwordHash = await bcrypt.hash('seller123', 10);
    const [userResult] = await conn.execute(
      'INSERT INTO users (name, email, phone, password, role, kyc_status, is_approved, is_active, commission_rate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['Seller Demo', 'seller@example.com', '9876543210', passwordHash, 'seller', 'approved', 1, 1, 10]
    );
    sellerId = userResult.insertId;
    const [groceryRows] = await conn.execute('SELECT id FROM categories WHERE name = ?', ['Grocery']);
    const groceryId = groceryRows[0].id;
    await conn.execute(
      'INSERT INTO sellers (user_id, shop_name, address, latitude, longitude, category, delivery_radius, is_active, is_verified, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [sellerId, 'BlinkGro Cards Store', 'Old Dhatiya Falia, Bhuj', 23.2667, 69.6667, 'Grocery', 3, 1, 1, 'Premium grocery and essentials store.']
    );
  } else {
    sellerId = sellerRows[0].id;
  }

  const [productCountRows] = await conn.execute('SELECT COUNT(*) as count FROM products WHERE seller_id = ?', [sellerId]);
  if (productCountRows[0].count === 0) {
    const [groceryRows] = await conn.execute('SELECT id FROM categories WHERE name = ?', ['Grocery']);
    const groceryId = groceryRows[0].id;
    
    const [riceRows] = await conn.execute(
      'SELECT id FROM subcategories WHERE category_id = ? AND name = ?',
      [groceryId, 'Rice & Grains']
    );
    const riceSubcatId = riceRows[0].id;

    const products = [
      {
        name: 'Basmati Rice',
        description: 'Premium long grain basmati rice.',
        price: 120.0,
        discount: 5.0,
        stock: 100,
        images: ['https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=400&q=80'],
        subcatId: riceSubcatId
      },
      {
        name: 'Mix Dal',
        description: 'Healthy mix of different lentils.',
        price: 110.0,
        discount: 0.0,
        stock: 80,
        images: ['https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=400&q=80'],
        subcatId: riceSubcatId
      },
      {
        name: 'Moong Dal',
        description: 'Pure moong lentils for cooking.',
        price: 85.0,
        discount: 0.0,
        stock: 60,
        images: ['https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=400&q=80'],
        subcatId: riceSubcatId
      }
    ];

    for (const product of products) {
      await conn.execute(
        'INSERT INTO products (seller_id, category_id, subcategory_id, name, description, price, discount_percent, stock, images) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [sellerId, groceryId, product.subcatId, product.name, product.description, product.price, product.discount, product.stock, JSON.stringify(product.images)]
      );
    }
  }

  // Create demo admin user
  const [adminRows] = await conn.execute('SELECT id FROM users WHERE email = ?', ['admin@kirana.com']);
  if (!adminRows.length) {
    const adminPasswordHash = await bcrypt.hash('admin123', 10);
    await conn.execute(
      'INSERT INTO users (name, email, phone, password, role, kyc_status, is_approved, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ['Admin Demo', 'admin@kirana.com', '9988776655', adminPasswordHash, 'admin', 'approved', 1, 1]
    );
  }
}

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve uploaded files
app.use('/uploads', express.static('uploads'));

// MySQL Pool
const DB_PORT = parseInt(process.env.DB_PORT || '3306', 10);

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: DB_PORT,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'kirana_store',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

console.log(`📊 Database pool created for: ${process.env.DB_HOST || 'localhost'}:${DB_PORT}`);

// Initialize Database
async function initializeDatabase() {
  const conn = await pool.getConnection();
  try {
    console.log('✅ Database connected successfully!');
    // Create tables
    const tables = `
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100),
        email VARCHAR(100) UNIQUE,
        phone VARCHAR(20) UNIQUE,
        password VARCHAR(255),
        avatar VARCHAR(255),
        role ENUM('user', 'seller', 'admin') DEFAULT 'user',
        kyc_status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
        is_approved BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        commission_rate DECIMAL(5,2) DEFAULT 10,
        wallet_balance DECIMAL(12,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS otp_records (
        id INT AUTO_INCREMENT PRIMARY KEY,
        phone VARCHAR(20),
        otp VARCHAR(6),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NULL
      );

      CREATE TABLE IF NOT EXISTS sellers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        shop_name VARCHAR(150),
        shop_image VARCHAR(255),
        description TEXT,
        address VARCHAR(255),
        latitude DECIMAL(10,8),
        longitude DECIMAL(11,8),
        category VARCHAR(100),
        delivery_radius DECIMAL(5,2) DEFAULT 3,
        rating DECIMAL(3,2) DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        is_verified BOOLEAN DEFAULT FALSE,
        kyc_document VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) UNIQUE,
        image VARCHAR(255),
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS subcategories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        category_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        image VARCHAR(255),
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
        UNIQUE KEY unique_subcategory (category_id, name)
      );

      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        seller_id INT NOT NULL,
        category_id INT NOT NULL,
        subcategory_id INT,
        name VARCHAR(150),
        description TEXT,
        price DECIMAL(10,2),
        discount_percent DECIMAL(5,2) DEFAULT 0,
        stock INT DEFAULT 0,
        rating DECIMAL(3,2) DEFAULT 0,
        reviews_count INT DEFAULT 0,
        images JSON,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (seller_id) REFERENCES sellers(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES categories(id),
        FOREIGN KEY (subcategory_id) REFERENCES subcategories(id)
      );

      CREATE TABLE IF NOT EXISTS reviews (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_id INT NOT NULL,
        user_id INT NOT NULL,
        rating INT CHECK(rating >= 1 AND rating <= 5),
        comment TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_review (product_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS cart (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        product_id INT NOT NULL,
        quantity INT DEFAULT 1,
        seller_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY (seller_id) REFERENCES sellers(id) ON DELETE CASCADE,
        UNIQUE KEY unique_cart (user_id, product_id)
      );

      CREATE TABLE IF NOT EXISTS wishlist (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        product_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        UNIQUE KEY unique_wishlist (user_id, product_id)
      );

      CREATE TABLE IF NOT EXISTS user_addresses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        name VARCHAR(100),
        phone VARCHAR(20),
        address VARCHAR(255),
        city VARCHAR(50),
        state VARCHAR(50),
        pincode VARCHAR(10),
        is_default BOOLEAN DEFAULT FALSE,
        address_type ENUM('home', 'work', 'other'),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        address_id INT NOT NULL,
        total_amount DECIMAL(10,2),
        payment_method ENUM('cod') DEFAULT 'cod',
        order_status ENUM('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (address_id) REFERENCES user_addresses(id)
      );

      CREATE TABLE IF NOT EXISTS order_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        product_id INT NOT NULL,
        seller_id INT NOT NULL,
        quantity INT,
        price DECIMAL(10,2),
        seller_status ENUM('pending', 'accepted', 'rejected', 'preparing', 'packed', 'ready', 'delivered') DEFAULT 'pending',
        delivery_boy_id INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id),
        FOREIGN KEY (seller_id) REFERENCES sellers(id)
      );

      CREATE TABLE IF NOT EXISTS delivery_tracking (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        seller_id INT,
        delivery_boy_id INT,
        status VARCHAR(50) NOT NULL,
        latitude DECIMAL(10,8),
        longitude DECIMAL(11,8),
        message TEXT,
        updated_by INT,
        updated_by_role VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (seller_id) REFERENCES sellers(id)
      );

      CREATE TABLE IF NOT EXISTS delivery_boys (
        id INT AUTO_INCREMENT PRIMARY KEY,
        seller_id INT NOT NULL,
        name VARCHAR(100),
        phone VARCHAR(20),
        vehicle VARCHAR(100),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (seller_id) REFERENCES sellers(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS service_areas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(150),
        center_latitude DECIMAL(10,8),
        center_longitude DECIMAL(11,8),
        radius_km DECIMAL(5,2),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS promotions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(150),
        code VARCHAR(50) UNIQUE,
        discount_percent DECIMAL(5,2) DEFAULT 0,
        min_order_amount DECIMAL(10,2) DEFAULT 0,
        expires_at DATETIME,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        title VARCHAR(200),
        body TEXT,
        type ENUM('order_update', 'offer', 'promotion'),
        order_id INT,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS fcm_tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        fcm_token VARCHAR(255) NOT NULL,
        device_id VARCHAR(120),
        platform VARCHAR(30),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_user_token (user_id, fcm_token),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS seller_ratings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        seller_id INT NOT NULL,
        user_id INT NOT NULL,
        rating INT CHECK(rating >= 1 AND rating <= 5),
        comment TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (seller_id) REFERENCES sellers(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `;

    // Execute each CREATE TABLE statement
    const statements = tables.split(';').filter(s => s.trim());
    for (const statement of statements) {
      if (statement.trim()) {
        await conn.execute(statement + ';');
      }
    }

    await seedSampleData(conn);
    console.log('✅ Database tables initialized and sample products seeded');
  } catch (error) {
    console.error('Database initialization error:', error);
  } finally {
    conn.release();
  }
}

// Initialize DB on startup
initializeDatabase();

// Routes
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const cartRoutes = require('./routes/cart');
const wishlistRoutes = require('./routes/wishlist');
const orderRoutes = require('./routes/orders');
const addressRoutes = require('./routes/addresses');
const reviewRoutes = require('./routes/reviews');
const sellerRoutes = require('./routes/sellers');
const sellerNewRoutes = require('./routes/seller');
const notificationRoutes = require('./routes/notifications');
const adminRoutes = require('./routes/admin');
const geoRoutes = require('./routes/geo');
const { verifyToken } = require('./middleware/auth');

app.use('/api/auth', authRoutes(pool));
app.use('/api/products', productRoutes(pool));
app.use('/api/cart', cartRoutes(pool));
app.use('/api/wishlist', wishlistRoutes(pool));
app.use('/api/orders', orderRoutes(pool));
app.use('/api/addresses', addressRoutes(pool));
app.use('/api/reviews', reviewRoutes(pool));
app.use('/api/sellers', sellerRoutes(pool));
app.use('/api/seller', sellerNewRoutes(pool));
app.use('/api/notifications', notificationRoutes(pool));
app.use('/api/admin', adminRoutes(pool));
app.use('/api/geo', geoRoutes(pool));

// Quick category endpoint shortcut
app.get('/api/categories', async (req, res) => {
  try {
    const conn = await pool.getConnection();
    const [categories] = await conn.execute('SELECT id, name, image, description FROM categories');
    
    // Get subcategories for each category
    const categoriesWithSubcategories = await Promise.all(
      categories.map(async (cat) => {
        const [subcategories] = await conn.execute(
          'SELECT id, name, image, description FROM subcategories WHERE category_id = ?',
          [cat.id]
        );
        return { ...cat, subcategories };
      })
    );
    
    conn.release();
    res.json(categoriesWithSubcategories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Banners endpoint
app.get('/api/banners', async (req, res) => {
  try {
    const banners = [
      {
        id: 1,
        title: 'Special Offer',
        image: 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=600&h=300&fit=crop',
        url: '/products',
        description: 'Get amazing deals on all products'
      },
      {
        id: 2,
        title: 'New Items',
        image: 'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=600&h=300&fit=crop',
        url: '/products',
        description: 'Check out our latest additions'
      }
    ];
    res.json(banners);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Users endpoint for admin
app.get('/api/users', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const conn = await pool.getConnection();
    const [users] = await conn.execute('SELECT id, name, email, phone, role, created_at FROM users ORDER BY created_at DESC');
    conn.release();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message });
});

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // Listen on all interfaces for network access

app.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT} (Access from network: http://192.168.1.15:${PORT})`);
});

module.exports = { pool };
