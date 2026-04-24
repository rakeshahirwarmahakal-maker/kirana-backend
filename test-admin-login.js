const http = require('http');

function testAdminLogin() {
  const postData = JSON.stringify({
    login: 'admin@123',
    password: 'Ajeet@123'
  });

  const options = {
    hostname: '192.168.1.33',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  console.log('\n🔐 Testing Admin Login...');
  console.log('   URL: http://192.168.1.33:3000/api/auth/login');
  console.log('   Email: admin@123');
  console.log('   Password: Ajeet@123\n');

  const req = http.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      console.log('📤 Server Response (Status: ' + res.statusCode + '):');
      
      try {
        const response = JSON.parse(data);
        
        if (res.statusCode === 200 && response.token) {
          console.log('\n✅ LOGIN SUCCESSFUL! 🎉\n');
          console.log('📋 Response:');
          console.log('   Status Code: ' + response.statusCode);
          console.log('   User ID: ' + response.user.id);
          console.log('   Name: ' + response.user.name);
          console.log('   Email: ' + response.user.email);
          console.log('   Role: ' + response.user.role);
          console.log('   Token: ' + response.token.substring(0, 30) + '...');
          console.log('\n✅ ADMIN IS READY TO LOGIN!');
        } else if (res.statusCode === 401) {
          console.log('\n❌ LOGIN FAILED - Invalid Credentials');
          console.log('   Message: ' + (response.message || response.error));
        } else {
          console.log('\n⚠️  Unexpected response:');
          console.log(response);
        }
      } catch (e) {
        console.log(data);
      }
    });
  });

  req.on('error', (error) => {
    console.error('❌ Connection Error:', error.message);
  });

  req.write(postData);
  req.end();
}

testAdminLogin();
