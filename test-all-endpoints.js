const axios = require('axios');

const API_URL = 'http://192.168.1.33:3000/api';

// Test credentials
const adminCreds = { login: 'admin@123', password: 'Ajeet@123' };
const sellerCreds = { login: 'seller@kirana.com', password: 'password123' };

let adminToken = null;
let sellerId = 14; // seller@kirana.com user_id

const tests = [];

async function test(name, fn) {
  try {
    console.log(`\n🧪 Testing: ${name}`);
    await fn();
    console.log(`✅ ${name} PASSED`);
    tests.push({ name, status: 'PASSED' });
  } catch (error) {
    console.error(`❌ ${name} FAILED: ${error.message}`);
    tests.push({ name, status: 'FAILED', error: error.message });
  }
}

async function runTests() {
  try {
    // 1. Admin Login
    await test('Admin Login', async () => {
      const response = await axios.post(`${API_URL}/auth/login`, adminCreds);
      const { token, statusCode, user } = response.data;
      if (!token || statusCode !== 200 || user.role !== 'admin') {
        throw new Error('Admin login failed or invalid response');
      }
      adminToken = token;
      console.log(`   Token: ${token.substring(0, 50)}...`);
      console.log(`   User: ${user.name} (${user.email})`);
    });

    // 2. Admin Dashboard
    await test('Admin Dashboard', async () => {
      const response = await axios.get(`${API_URL}/admin/dashboard`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const { users, sellers, orders, revenue, pendingSellers } = response.data;
      if (!users || !sellers || !orders) {
        throw new Error('Missing dashboard fields');
      }
      console.log(`   Users: ${users}, Sellers: ${sellers}, Orders: ${orders}, Revenue: ${revenue}, Pending: ${pendingSellers}`);
    });

    // 3. Admin Sellers List
    await test('Admin Sellers List (Field Names)', async () => {
      const response = await axios.get(`${API_URL}/admin/sellers`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      if (!Array.isArray(response.data) || response.data.length === 0) {
        throw new Error('No sellers returned');
      }
      const seller = response.data[0];
      // Check for required field names
      const hasStoreName = 'storeName' in seller;
      const hasOwnerName = 'ownerName' in seller;
      const hasMobile = 'mobile' in seller;
      const hasStatus = 'status' in seller;
      
      if (!hasStoreName || !hasOwnerName || !hasMobile || !hasStatus) {
        throw new Error(`Missing fields. Has: storeName=${hasStoreName}, ownerName=${hasOwnerName}, mobile=${hasMobile}, status=${hasStatus}`);
      }
      console.log(`   First Seller: ${seller.storeName} (${seller.ownerName}) - Status: ${seller.status}`);
      console.log(`   Fields: ${Object.keys(seller).join(', ')}`);
    });

    // 4. Admin Users List
    await test('Admin Users List', async () => {
      const response = await axios.get(`${API_URL}/admin/users`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      if (!Array.isArray(response.data) || response.data.length === 0) {
        throw new Error('No users returned');
      }
      console.log(`   Total Users: ${response.data.length}`);
      console.log(`   Sample User: ${response.data[0].name || 'N/A'} (${response.data[0].email || 'N/A'})`);
    });

    // 5. Admin Orders List
    await test('Admin Orders List', async () => {
      const response = await axios.get(`${API_URL}/admin/orders`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      if (!Array.isArray(response.data)) {
        throw new Error('Orders not returned as array');
      }
      console.log(`   Total Orders: ${response.data.length}`);
    });

    // 6. Seller Login
    let sellerToken = null;
    await test('Seller Login', async () => {
      const response = await axios.post(`${API_URL}/auth/login`, sellerCreds);
      const { token, statusCode, user } = response.data;
      if (!token || statusCode !== 200 || user.role !== 'seller') {
        throw new Error('Seller login failed or invalid response');
      }
      sellerToken = token;
      sellerId = user.id;
      console.log(`   Token: ${token.substring(0, 50)}...`);
      console.log(`   Seller ID: ${sellerId}`);
      console.log(`   User: ${user.name} (${user.email})`);
    });

    // 7. Seller Status
    await test('Seller Status Endpoint', async () => {
      const response = await axios.get(`${API_URL}/seller/status`, {
        headers: { Authorization: `Bearer ${sellerToken}` }
      });
      const { seller_id, status, shop_name, is_verified } = response.data;
      if (!seller_id || !status) {
        throw new Error('Missing seller status fields');
      }
      console.log(`   Seller ID: ${seller_id}, Status: ${status}, Shop: ${shop_name}, Verified: ${is_verified}`);
    });

    // 8. Seller Products
    await test('Seller Products List', async () => {
      const response = await axios.get(`${API_URL}/seller/products`, {
        headers: { Authorization: `Bearer ${sellerToken}` }
      });
      if (!Array.isArray(response.data)) {
        throw new Error('Products not returned as array');
      }
      console.log(`   Total Products: ${response.data.length}`);
      if (response.data.length > 0) {
        console.log(`   Sample: ${response.data[0].name || 'N/A'} - Rs. ${response.data[0].price || 'N/A'}`);
      }
    });

    // 9. Seller Delivery Boys
    await test('Seller Delivery Boys List', async () => {
      const response = await axios.get(`${API_URL}/seller/delivery-boys`, {
        headers: { Authorization: `Bearer ${sellerToken}` }
      });
      if (!Array.isArray(response.data)) {
        throw new Error('Delivery boys not returned as array');
      }
      console.log(`   Total Delivery Boys: ${response.data.length}`);
    });

    // 10. Seller Orders
    await test('Seller Orders List', async () => {
      const response = await axios.get(`${API_URL}/seller/orders`, {
        headers: { Authorization: `Bearer ${sellerToken}` }
      });
      if (!Array.isArray(response.data)) {
        throw new Error('Orders not returned as array');
      }
      console.log(`   Total Orders: ${response.data.length}`);
    });

    // 11. Seller Tracking
    await test('Seller Tracking', async () => {
      const response = await axios.get(`${API_URL}/seller/tracking`, {
        headers: { Authorization: `Bearer ${sellerToken}` }
      });
      if (!Array.isArray(response.data)) {
        throw new Error('Tracking data not returned as array');
      }
      console.log(`   Total Tracking Records: ${response.data.length}`);
    });

    // 12. Seller Store Profile
    await test('Seller Store Profile', async () => {
      const response = await axios.get(`${API_URL}/seller/store`, {
        headers: { Authorization: `Bearer ${sellerToken}` }
      });
      const { id, shop_name, email, phone } = response.data;
      if (!id || !shop_name) {
        throw new Error('Missing store profile fields');
      }
      console.log(`   Store: ${shop_name} (ID: ${id})`);
      console.log(`   Contact: ${email} / ${phone}`);
    });

    // 13. Public Products
    await test('Public Products List', async () => {
      const response = await axios.get(`${API_URL}/products`);
      if (!Array.isArray(response.data)) {
        throw new Error('Products not returned as array');
      }
      console.log(`   Total Products: ${response.data.length}`);
    });

  } catch (error) {
    console.error('\n❌ Critical Error:', error.message);
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  
  const passed = tests.filter(t => t.status === 'PASSED').length;
  const failed = tests.filter(t => t.status === 'FAILED').length;
  
  tests.forEach(t => {
    const icon = t.status === 'PASSED' ? '✅' : '❌';
    console.log(`${icon} ${t.name}`);
    if (t.error) {
      console.log(`   Error: ${t.error}`);
    }
  });
  
  console.log('\n' + '='.repeat(60));
  console.log(`✅ PASSED: ${passed}/${tests.length}`);
  console.log(`❌ FAILED: ${failed}/${tests.length}`);
  console.log('='.repeat(60));

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
