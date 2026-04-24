const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function checkAndFixAdmin() {
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

    // Check all users
    console.log('\n📋 All users in database:');
    const [users] = await conn.execute('SELECT id, name, email, phone, role FROM users');
    console.table(users);

    // Check if admin exists
    const [adminCheck] = await conn.execute("SELECT * FROM users WHERE email = 'admin@kirana.com'");
    
    if (adminCheck.length === 0) {
      console.log('\n❌ Admin account NOT found! Creating it...');
      
      // Hash password
      const hashedPassword = await bcrypt.hash('password123', 10);
      
      // Insert admin
      await conn.execute(
        'INSERT INTO users (name, email, phone, password, role, is_approved) VALUES (?, ?, ?, ?, ?, ?)',
        ['Admin', 'admin@kirana.com', '9999999999', hashedPassword, 'admin', 1]
      );
      
      console.log('✅ Admin account created!');
      console.log('   Email: admin@kirana.com');
      console.log('   Password: password123');
      console.log('   Role: admin');
    } else {
      console.log('\n✅ Admin account exists!');
      console.log('   ID:', adminCheck[0].id);
      console.log('   Name:', adminCheck[0].name);
      console.log('   Email:', adminCheck[0].email);
      console.log('   Role:', adminCheck[0].role);
      console.log('   Password Hash:', adminCheck[0].password.substring(0, 20) + '...');
      
      // Check if role is admin
      if (adminCheck[0].role !== 'admin') {
        console.log('\n⚠️  Role is NOT admin! Fixing...');
        await conn.execute('UPDATE users SET role = ? WHERE email = ?', ['admin', 'admin@kirana.com']);
        console.log('✅ Role updated to admin');
      }
    }

    conn.release();
    pool.end();
    console.log('\n✅ Database check complete!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    pool.end();
  }
}

checkAndFixAdmin();
