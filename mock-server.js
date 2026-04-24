const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('uploads'));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// In-memory data storage (mock database)
const mockData = {
  users: [
    { id: 1, email: 'user@kirana.com', phone: '9876543210', password: 'password123', name: 'John User', role: 'customer' }
  ],
  sellers: [
    { id: 1, email: 'seller@kirana.com', password: 'password123', name: 'BlinkGro Store', phone: '9123456789', location: { lat: 28.7041, lng: 77.1025 }, commissionRate: 10 }
  ],
  products: [
    { id: 1, seller_id: 1, name: 'Rice (1kg)', price: 45, description: 'Premium basmati rice', category: 'Grocery', images: ['https://via.placeholder.com/300'] },
    { id: 2, seller_id: 1, name: 'Milk (1L)', price: 50, description: 'Fresh milk', category: 'Dairy', images: ['https://via.placeholder.com/300'] }
  ],
  orders: [],
  banners: [
    { id: 1, image: 'https://via.placeholder.com/600x300', title: 'Special Offer', url: '/products' },
    { id: 2, image: 'https://via.placeholder.com/600x300', title: 'New Items', url: '/products' }
  ],
  categories: [
    { id: 1, name: 'Grocery', image: 'https://via.placeholder.com/300', description: 'Fresh groceries' },
    { id: 2, name: 'Dairy', image: 'https://via.placeholder.com/300', description: 'Milk and products' }
  ]
};

// Helper functions
const sendResponse = (res, code, message, data = null) => {
  res.status(code).json({
    status: code < 400 ? 'success' : 'error',
    message,
    ...(data && { data })
  });
};

// ============ PUBLIC ENDPOINTS ============

// Banners
app.get('/api/banners', (req, res) => {
  sendResponse(res, 200, 'Banners fetched', mockData.banners);
});

// Categories
app.get('/api/categories', (req, res) => {
  sendResponse(res, 200, 'Categories fetched', mockData.categories);
});

// Products (search & filter)
app.get('/api/products', (req, res) => {
  sendResponse(res, 200, 'Products fetched', mockData.products);
});

app.get('/api/products/:id', (req, res) => {
  const product = mockData.products.find(p => p.id === parseInt(req.params.id));
  if (!product) return sendResponse(res, 404, 'Product not found');
  sendResponse(res, 200, 'Product fetched', product);
});

// Nearby sellers
app.get('/api/sellers/nearby', (req, res) => {
  sendResponse(res, 200, 'Nearby sellers fetched', mockData.sellers);
});

// Seller products
app.get('/api/sellers/:sellerId/products', (req, res) => {
  const products = mockData.products.filter(p => p.seller_id === parseInt(req.params.sellerId));
  sendResponse(res, 200, 'Seller products fetched', products);
});

// ============ AUTH ENDPOINTS ============

// Auth login (supports both customer and seller)
app.post('/api/auth/login', (req, res) => {
  const { email, login, password } = req.body;
  const loginValue = login || email;
  
  // Check customers first
  let user = mockData.users.find(u => (u.email === loginValue || u.email === email) && u.password === password);
  if (user) {
    const token = `mock_token_${user.id}_${Date.now()}`;
    return sendResponse(res, 200, 'Login successful', { user, token, role: 'customer' });
  }
  
  // Check sellers
  let seller = mockData.sellers.find(s => (s.email === loginValue || s.email === email) && s.password === password);
  if (!seller && loginValue === 'seller@kirana.com' && password === 'password123') {
    seller = mockData.sellers[0];
  }
  if (seller) {
    const token = `mock_seller_token_${Date.now()}`;
    return sendResponse(res, 200, 'Login successful', { user: seller, token, role: 'seller' });
  }
  
  sendResponse(res, 401, 'Invalid credentials');
});

// Customer signup
app.post('/api/auth/signup', (req, res) => {
  const { email, phone, password, name } = req.body;
  
  if (mockData.users.find(u => u.email === email)) {
    return sendResponse(res, 400, 'Email already exists');
  }
  
  const newUser = {
    id: mockData.users.length + 1,
    email,
    phone,
    password,
    name,
    role: 'customer'
  };
  
  mockData.users.push(newUser);
  const token = `mock_token_${newUser.id}_${Date.now()}`;
  sendResponse(res, 201, 'Signup successful', { user: newUser, token });
});

// Seller login
app.post('/api/seller/login', (req, res) => {
  const { email, password } = req.body;
  // Mock seller login
  if (email === 'seller@kirana.com' && password === 'password123') {
    const token = `mock_seller_token_${Date.now()}`;
    sendResponse(res, 200, 'Seller login successful', { seller: mockData.sellers[0], token });
  } else {
    sendResponse(res, 401, 'Invalid seller credentials');
  }
});

// Admin login
app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body;
  // Mock admin login
  if (email === 'admin@kirana.com' && password === 'admin123') {
    const token = `mock_admin_token_${Date.now()}`;
    sendResponse(res, 200, 'Admin login successful', { admin: { id: 1, email, role: 'admin' }, token });
  } else {
    sendResponse(res, 401, 'Invalid admin credentials');
  }
});

// ============ CUSTOMER ENDPOINTS ============

// Cart operations
app.post('/api/customer/cart', (req, res) => {
  sendResponse(res, 201, 'Item added to cart', { cartId: Math.random() });
});

app.get('/api/customer/cart', (req, res) => {
  sendResponse(res, 200, 'Cart fetched', { items: [], total: 0 });
});

// Orders
app.post('/api/customer/orders', (req, res) => {
  const newOrder = {
    id: mockData.orders.length + 1,
    ...req.body,
    status: 'pending',
    createdAt: new Date()
  };
  mockData.orders.push(newOrder);
  sendResponse(res, 201, 'Order created', newOrder);
});

app.get('/api/customer/orders', (req, res) => {
  sendResponse(res, 200, 'Orders fetched', mockData.orders);
});

app.get('/api/customer/orders/:id', (req, res) => {
  const order = mockData.orders.find(o => o.id === parseInt(req.params.id));
  if (!order) return sendResponse(res, 404, 'Order not found');
  sendResponse(res, 200, 'Order fetched', order);
});

// ============ SELLER ENDPOINTS ============

// Seller products
app.get('/api/seller/products', (req, res) => {
  const sellerProducts = mockData.products.filter(p => p.seller_id === 1);
  sendResponse(res, 200, 'Seller products fetched', sellerProducts);
});

app.post('/api/seller/products', upload.single('image'), (req, res) => {
  const newProduct = {
    id: mockData.products.length + 1,
    seller_id: 1,
    name: req.body.name,
    price: parseFloat(req.body.price),
    description: req.body.description,
    category: req.body.category,
    images: [req.file ? `uploads/${req.file.filename}` : req.body.imageUrl]
  };
  mockData.products.push(newProduct);
  sendResponse(res, 201, 'Product created', newProduct);
});

// Seller earnings
app.get('/api/seller/earnings', (req, res) => {
  sendResponse(res, 200, 'Earnings fetched', {
    totalEarnings: 5000,
    completedOrders: 12,
    pendingEarnings: 500
  });
});

// Seller orders
app.get('/api/seller/orders', (req, res) => {
  sendResponse(res, 200, 'Seller orders fetched', mockData.orders);
});

// ============ ADMIN ENDPOINTS ============

// Dashboard stats
app.get('/api/admin/dashboard', (req, res) => {
  sendResponse(res, 200, 'Dashboard stats', {
    totalUsers: 100,
    totalSellers: 10,
    totalOrders: 500,
    totalRevenue: 50000,
    todayOrders: 25,
    pendingOrders: 8
  });
});

// All sellers
app.get('/api/admin/sellers', (req, res) => {
  sendResponse(res, 200, 'All sellers fetched', mockData.sellers);
});

// All users
app.get('/api/admin/users', (req, res) => {
  sendResponse(res, 200, 'All users fetched', mockData.users);
});

// ============ ERROR HANDLER ============

app.use((req, res) => {
  sendResponse(res, 404, 'Endpoint not found');
});

// Start server
app.listen(PORT, () => {
  console.log(`\n✅ MOCK SERVER READY!`);
  console.log(`🚀 Running on http://localhost:${PORT}`);
  console.log(`🌐 Network: http://192.168.1.15:${PORT}`);
  console.log(`\n📝 Mock credentials:`);
  console.log(`   Customer: user@kirana.com / password123`);
  console.log(`   Seller: seller@kirana.com / password123`);
  console.log(`   Admin: admin@kirana.com / admin123\n`);
});
