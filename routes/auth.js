const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const twilio = require('twilio');

module.exports = (pool) => {
  const router = express.Router();

  const isTwilioConfigured = () => {
    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER } = process.env;
    return Boolean(
      TWILIO_ACCOUNT_SID &&
      TWILIO_AUTH_TOKEN &&
      TWILIO_PHONE_NUMBER &&
      !TWILIO_ACCOUNT_SID.startsWith('your_') &&
      !TWILIO_AUTH_TOKEN.startsWith('your_') &&
      !TWILIO_PHONE_NUMBER.startsWith('+123')
    );
  };

  // Helper function to verify JWT
  const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_key');
      req.user = decoded;
      next();
    } catch (error) {
      res.status(401).json({ error: 'Invalid token' });
    }
  };

  // Send OTP (Phone)
  router.post('/send-otp', async (req, res) => {
    try {
      const { phone } = req.body;
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      const conn = await pool.getConnection();
      await conn.execute(
        'INSERT INTO otp_records (phone, otp, expires_at) VALUES (?, ?, ?)',
        [phone, otp, expiresAt]
      );
      conn.release();

      if (isTwilioConfigured()) {
        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        await client.messages.create({
          body: `Your OTP is ${otp}. It expires in 10 minutes.`,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: phone
        });
      } else {
        console.log(`OTP for ${phone}: ${otp}`);
      }

      const response = { success: true, message: 'OTP sent' };
      if (!isTwilioConfigured()) response.otp = otp;
      res.json(response);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Verify OTP (Login/Register)
  router.post('/verify-otp', async (req, res) => {
    try {
      const { phone, otp, name } = req.body;
      const conn = await pool.getConnection();

      const [otpRecords] = await conn.execute(
        'SELECT * FROM otp_records WHERE phone = ? AND otp = ? AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
        [phone, otp]
      );

      if (!otpRecords.length) {
        conn.release();
        return res.status(400).json({ error: 'Invalid or expired OTP' });
      }

      let [users] = await conn.execute('SELECT * FROM users WHERE phone = ? LIMIT 1', [phone]);
      let userId;
      let role = 'user';
      let userData = {};

      if (users.length) {
        userId = users[0].id;
        role = users[0].role || 'user';
        userData = {
          id: users[0].id,
          name: users[0].name,
          email: users[0].email,
          phone: users[0].phone
        };
      } else {
        if (!name) {
          conn.release();
          return res.status(400).json({ error: 'Name is required for new users' });
        }
        const hashedPassword = await bcrypt.hash(phone, 10);
        const [result] = await conn.execute(
          'INSERT INTO users (phone, name, password) VALUES (?, ?, ?)',
          [phone, name, hashedPassword]
        );
        userId = result.insertId;
        userData = {
          id: userId,
          name: name,
          email: '',
          phone: phone
        };
      }

      await conn.execute('DELETE FROM otp_records WHERE phone = ?', [phone]);

      const token = jwt.sign({ id: userId, phone, role }, process.env.JWT_SECRET || 'secret_key', { expiresIn: '30d' });
      conn.release();
      res.json({ success: true, token, userId, user: userData });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Verify OTP & Register
  router.post('/register-phone', async (req, res) => {
    try {
      const { phone, otp, name } = req.body;
      const conn = await pool.getConnection();

      // Verify OTP
      const [otpRecords] = await conn.execute(
        'SELECT * FROM otp_records WHERE phone = ? AND otp = ? AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
        [phone, otp]
      );

      if (!otpRecords.length) {
        conn.release();
        return res.status(400).json({ error: 'Invalid or expired OTP' });
      }

      // Create user
      const hashedPassword = await bcrypt.hash(phone, 10);
      const [result] = await conn.execute(
        'INSERT INTO users (phone, name, password) VALUES (?, ?, ?)',
        [phone, name, hashedPassword]
      );

      const token = jwt.sign({ id: result.insertId, phone }, process.env.JWT_SECRET || 'secret_key', { expiresIn: '30d' });

      await conn.execute('DELETE FROM otp_records WHERE phone = ?', [phone]);

      conn.release();
      res.json({ success: true, token, userId: result.insertId });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Register with Email
  router.post('/register-email', async (req, res) => {
    try {
      const { email, password, name } = req.body;
      const conn = await pool.getConnection();

      const hashedPassword = await bcrypt.hash(password, 10);
      const [result] = await conn.execute(
        'INSERT INTO users (email, name, password) VALUES (?, ?, ?)',
        [email ?? null, name ?? null, hashedPassword]
      );

      const token = jwt.sign({ id: result.insertId, email }, process.env.JWT_SECRET || 'secret_key', { expiresIn: '30d' });

      conn.release();
      res.json({ success: true, token, userId: result.insertId });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Signup with Email & Password
  router.post('/signup', async (req, res) => {
    try {
      const { email, password, phone, name } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: 'Email and password required', statusCode: 400 });
      }

      const conn = await pool.getConnection();

      // Check if email already exists
      const [existing] = await conn.execute('SELECT id FROM users WHERE email = ?', [email]);
      if (existing.length) {
        conn.release();
        return res.status(400).json({ message: 'Email already registered', statusCode: 400 });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const [result] = await conn.execute(
        'INSERT INTO users (name, email, phone, password, role) VALUES (?, ?, ?, ?, ?)',
        [name || 'User', email, phone || null, hashedPassword, 'user']
      );

      const userData = {
        id: result.insertId,
        userId: result.insertId,
        name: name || 'User',
        email: email,
        phone: phone || '',
        role: 'user'
      };

      const token = jwt.sign(
        { id: result.insertId, email, role: 'user' },
        process.env.JWT_SECRET || 'secret_key',
        { expiresIn: '30d' }
      );

      conn.release();

      res.status(201).json({
        token,
        accessToken: token,
        data: { token },
        user: userData,
        statusCode: 201
      });
    } catch (error) {
      res.status(500).json({ message: error.message, statusCode: 500 });
    }
  });

  // Google Sign-in
  router.post('/google-signin', async (req, res) => {
    try {
      const { email, name, googleId } = req.body;
      const conn = await pool.getConnection();

      let [users] = await conn.execute('SELECT * FROM users WHERE email = ?', [email ?? null]);

      let userId;
      let role = 'user';
      let userData = {};
      if (users.length) {
        userId = users[0].id;
        role = users[0].role || 'user';
        userData = {
          id: users[0].id,
          name: users[0].name,
          email: users[0].email,
          phone: users[0].phone
        };
      } else {
        const [result] = await conn.execute(
          'INSERT INTO users (email, name, password, role) VALUES (?, ?, ?, ?)',
          [email, name, 'google_' + googleId, role]
        );
        userId = result.insertId;
        userData = {
          id: userId,
          name: name,
          email: email,
          phone: ''
        };
      }

      const token = jwt.sign({ id: userId, email, role }, process.env.JWT_SECRET || 'secret_key', { expiresIn: '30d' });

      conn.release();
      res.json({ success: true, token, userId, user: userData });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Register seller
  router.post('/register-seller', async (req, res) => {
    try {
      const {
        name,
        email,
        phone,
        password,
        shop_name,
        address,
        latitude,
        longitude,
        category,
        delivery_radius
      } = req.body;

      if (!name || !email || !password || !shop_name) {
        return res.status(400).json({ message: 'Required fields missing', statusCode: 400 });
      }

      const conn = await pool.getConnection();

      // Check if email already exists
      const [existing] = await conn.execute('SELECT id FROM users WHERE email = ?', [email]);
      if (existing.length) {
        conn.release();
        return res.status(400).json({ message: 'Email already registered', statusCode: 400 });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const [result] = await conn.execute(
        'INSERT INTO users (name, email, phone, password, role, kyc_status, is_approved, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [name, email, phone || null, hashedPassword, 'seller', 'pending', 0, 1]
      );

      const [sellerResult] = await conn.execute(
        `INSERT INTO sellers (user_id, shop_name, address, latitude, longitude, category, delivery_radius, is_active, is_verified) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [result.insertId, shop_name, address || null, latitude || null, longitude || null, category || null, delivery_radius || 3, 1, 0]
      );

      const token = jwt.sign(
        { id: result.insertId, email, role: 'seller', seller_id: sellerResult.insertId },
        process.env.JWT_SECRET || 'secret_key',
        { expiresIn: '7d' }
      );

      conn.release();

      res.status(201).json({
        token,
        accessToken: token,
        data: { token },
        user: {
          userId: result.insertId,
          name,
          email,
          seller_id: sellerResult.insertId
        },
        statusCode: 201
      });
    } catch (error) {
      res.status(500).json({ message: error.message, statusCode: 500 });
    }
  });

  // Unified Login for Admin, Seller, and Users
  router.post('/login', async (req, res) => {
    try {
      const { login, password } = req.body;
      const conn = await pool.getConnection();

      const [users] = await conn.execute('SELECT * FROM users WHERE email = ? OR phone = ? LIMIT 1', [login, login]);

      if (!users.length) {
        conn.release();
        return res.status(401).json({ message: 'Invalid credentials', statusCode: 401 });
      }

      const user = users[0];
      const isValid = await bcrypt.compare(password, user.password);

      if (!isValid) {
        conn.release();
        return res.status(401).json({ message: 'Invalid credentials', statusCode: 401 });
      }

      // For sellers, get seller info
      let userData = {
        id: user.id,
        userId: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role || 'user'
      };

      if (user.role === 'seller') {
        const [sellers] = await conn.execute('SELECT id, shop_name FROM sellers WHERE user_id = ? LIMIT 1', [user.id]);
        if (sellers.length) {
          userData.seller_id = sellers[0].id;
          userData.shop_name = sellers[0].shop_name;
        }
      }

      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role || 'user', seller_id: userData.seller_id },
        process.env.JWT_SECRET || 'secret_key',
        { expiresIn: '7d' }
      );

      conn.release();

      // Return token in multiple formats for flexibility
      res.json({
        token,
        accessToken: token,
        data: { token },
        user: userData,
        statusCode: 200
      });
    } catch (error) {
      res.status(500).json({ message: error.message, statusCode: 500 });
    }
  });

  // Get User Profile
  router.get('/profile', verifyToken, async (req, res) => {
    try {
      const conn = await pool.getConnection();
      const [users] = await conn.execute('SELECT id, name, email, phone, avatar, role FROM users WHERE id = ?', [req.user.id]);

      conn.release();
      if (!users.length) return res.status(404).json({ error: 'User not found' });
      res.json(users[0]);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update Profile
  router.put('/profile', verifyToken, async (req, res) => {
    try {
      const { name, avatar } = req.body;
      const conn = await pool.getConnection();

      await conn.execute('UPDATE users SET name = ?, avatar = ? WHERE id = ?', [name ?? null, avatar ?? null, req.user.id]);

      conn.release();
      res.json({ success: true, message: 'Profile updated' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Forgot Password - Send OTP
  router.post('/forgot-password', async (req, res) => {
    try {
      const { email, phone } = req.body;
      if (!email && !phone) {
        return res.status(400).json({ message: 'Email or phone required', statusCode: 400 });
      }

      const conn = await pool.getConnection();
      const identifier = email || phone;
      const field = email ? 'email' : 'phone';

      const [users] = await conn.execute(`SELECT id FROM users WHERE ${field} = ?`, [identifier]);
      if (!users.length) {
        conn.release();
        return res.status(404).json({ message: 'User not found', statusCode: 404 });
      }

      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      if (phone) {
        await conn.execute(
          'INSERT INTO otp_records (phone, otp, expires_at) VALUES (?, ?, ?)',
          [phone, otp, expiresAt]
        );

        if (isTwilioConfigured()) {
          const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
          await client.messages.create({
            body: `Your password reset OTP is ${otp}. It expires in 10 minutes.`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: phone
          });
        } else {
          console.log(`Password Reset OTP for ${phone}: ${otp}`);
        }
      }

      conn.release();

      const response = { success: true, message: 'OTP sent' };
      if (!isTwilioConfigured() && phone) response.otp = otp;
      res.json(response);
    } catch (error) {
      res.status(500).json({ message: error.message, statusCode: 500 });
    }
  });

  // Reset Password with OTP
  router.post('/reset-password', async (req, res) => {
    try {
      const { phone, otp, newPassword } = req.body;

      if (!phone || !otp || !newPassword) {
        return res.status(400).json({ message: 'Phone, OTP, and new password required', statusCode: 400 });
      }

      const conn = await pool.getConnection();

      // Verify OTP
      const [otpRecords] = await conn.execute(
        'SELECT * FROM otp_records WHERE phone = ? AND otp = ? AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
        [phone, otp]
      );

      if (!otpRecords.length) {
        conn.release();
        return res.status(400).json({ message: 'Invalid or expired OTP', statusCode: 400 });
      }

      // Get user and update password
      const [users] = await conn.execute('SELECT id FROM users WHERE phone = ?', [phone]);
      if (!users.length) {
        conn.release();
        return res.status(404).json({ message: 'User not found', statusCode: 404 });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await conn.execute('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, users[0].id]);

      // Delete used OTP
      await conn.execute('DELETE FROM otp_records WHERE phone = ?', [phone]);

      conn.release();

      res.json({ success: true, message: 'Password reset successfully' });
    } catch (error) {
      res.status(500).json({ message: error.message, statusCode: 500 });
    }
  });

  // Send OTP for Login (Fallback when password is wrong)
  router.post('/send-otp-login', async (req, res) => {
    try {
      const { phone, email } = req.body;
      
      if (!phone && !email) {
        return res.status(400).json({ 
          error: 'Phone or email required',
          statusCode: 400 
        });
      }

      const conn = await pool.getConnection();
      
      // Check if user exists
      const identifier = phone || email;
      const field = phone ? 'phone' : 'email';
      const [users] = await conn.execute(
        `SELECT id FROM users WHERE ${field} = ? LIMIT 1`,
        [identifier]
      );

      if (!users.length) {
        conn.release();
        return res.status(404).json({ 
          error: 'User not found. Please create an account first.',
          statusCode: 404 
        });
      }

      // Generate OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      // Store OTP
      if (phone) {
        await conn.execute(
          'INSERT INTO otp_records (phone, otp, expires_at) VALUES (?, ?, ?)',
          [phone, otp, expiresAt]
        );

        // Send via Twilio if configured
        if (isTwilioConfigured()) {
          const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
          await client.messages.create({
            body: `Your login OTP is ${otp}. It expires in 10 minutes. Kirana Store`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: phone
          });
        } else {
          console.log(`Login OTP for ${phone}: ${otp}`);
        }
      }

      conn.release();

      const response = { 
        success: true, 
        message: 'OTP sent successfully',
        statusCode: 200
      };
      
      // Return OTP for demo/testing if Twilio not configured
      if (!isTwilioConfigured() && phone) {
        response.otp = otp;
      }
      
      res.json(response);
    } catch (error) {
      res.status(500).json({ 
        error: error.message,
        statusCode: 500
      });
    }
  });

  return router;
};
