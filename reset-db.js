const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

async function resetDatabase() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  });

  try {
    console.log('🗑️  Dropping existing database...');
    await conn.execute('DROP DATABASE IF EXISTS kirana_store');
    
    console.log('📊 Creating fresh database...');
    await conn.execute('CREATE DATABASE kirana_store');
    
    console.log('✅ Database reset successfully!');
    console.log('⚠️  Please restart the server to reinitialize with fresh schema and data.\n');
    
  } catch (error) {
    console.error('❌ Error resetting database:', error.message);
  } finally {
    await conn.end();
  }
}

resetDatabase();
