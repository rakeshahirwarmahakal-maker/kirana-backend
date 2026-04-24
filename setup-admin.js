const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function setupAdmin() {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'Ajeet@143',
    database: 'kirana_store',
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0
  });

  try {
    const conn = await pool.getConnection();

    // New admin credentials
    const adminEmail = 'admin@123';
    const adminPassword = 'Ajeet@123';
    
    console.log('\n🔧 Setting up admin account...');
    console.log('   Email: ' + adminEmail);
    console.log('   Password: ' + adminPassword);

    // Hash the password
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    console.log('   Password hashed ✅');

    // Check if admin exists
    const [existing] = await conn.execute('SELECT id FROM users WHERE email = ?', [adminEmail]);

    if (existing.length > 0) {
      // Update existing admin
      console.log('\n📝 Updating existing admin account...');
      await conn.execute(
        'UPDATE users SET password = ?, role = ?, is_approved = 1 WHERE email = ?',
        [hashedPassword, 'admin', adminEmail]
      );
      console.log('✅ Admin account updated!');
    } else {
      // Create new admin
      console.log('\n✨ Creating new admin account...');
      const [result] = await conn.execute(
        'INSERT INTO users (name, email, phone, password, role, is_approved) VALUES (?, ?, ?, ?, ?, ?)',
        ['Admin', adminEmail, '9999999998', hashedPassword, 'admin', 1]
      );
      console.log('✅ Admin account created! (ID: ' + result.insertId + ')');
    }

    // Verify the admin account
    const [admin] = await conn.execute('SELECT id, name, email, role, is_approved FROM users WHERE email = ?', [adminEmail]);
    
    console.log('\n✅ ADMIN ACCOUNT VERIFIED:');
    console.table(admin);

    // Show all users
    const [allUsers] = await conn.execute('SELECT id, name, email, role FROM users ORDER BY id');
    console.log('\n📋 All users in database:');
    console.table(allUsers);

    conn.release();
    pool.end();
    
    console.log('\n✅ Setup complete! Ready for login test.');
    console.log('\n🔑 Login credentials:');
    console.log('   Email:    ' + adminEmail);
    console.log('   Password: ' + adminPassword);

  } catch (error) {
    console.error('❌ Error:', error.message);
    pool.end();
  }
}

setupAdmin();
