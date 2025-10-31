#!/usr/bin/env node

// VTiger Diagnostic Script - Using HTTP API calls to test VTiger functionality
const http = require('http');

function makeRequest(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function runDiagnostics() {
  console.log('🔍 VTIGER DIAGNOSTIC TESTS STARTING...\n');
  
  try {
    // TEST 1: Check VTiger connection status
    console.log('🔐 TEST 1: VTiger Connection Status');
    const connectionTest = await makeRequest('/api/vtiger/test-connection');
    console.log('   Status:', connectionTest.status);
    console.log('   Response:', JSON.stringify(connectionTest.data, null, 2));
    console.log();
    
    // TEST 2: Manual query test - let's try a direct API call
    console.log('📊 TEST 2: Direct Query Tests');
    
    // Test basic count query via our API
    console.log('   2a: Testing count query through API');
    try {
      const result = await makeRequest('/api/vtiger/raw-query', 'POST', {
        query: 'SELECT count(*) FROM Contacts;'
      });
      console.log('   Status:', result.status);
      console.log('   Result:', JSON.stringify(result.data, null, 2));
    } catch (error) {
      console.log('   ❌ API call failed:', error.message);
    }
    
    console.log();
    
    // TEST 3: Check what modules are available 
    console.log('📂 TEST 3: Available Modules');
    try {
      const result = await makeRequest('/api/vtiger/modules');
      console.log('   Status:', result.status);
      console.log('   Modules:', JSON.stringify(result.data, null, 2));
    } catch (error) {
      console.log('   ❌ Module check failed:', error.message);
    }
    
    console.log();
    
    // TEST 4: Try alternative query syntax
    console.log('🔍 TEST 4: Alternative Query Syntax');
    
    const testQueries = [
      'SELECT COUNT(*) FROM Contacts',
      'SELECT count(*) FROM Contacts',
      'SELECT id FROM Contacts LIMIT 1',
      'SELECT firstname, lastname FROM Contacts LIMIT 1',
      'SELECT * FROM Contacts LIMIT 1'
    ];
    
    for (let i = 0; i < testQueries.length; i++) {
      const query = testQueries[i];
      console.log(`   4${String.fromCharCode(97 + i)}: ${query}`);
      try {
        const result = await makeRequest('/api/vtiger/raw-query', 'POST', { query });
        console.log(`      ✅ Status: ${result.status}`);
        console.log(`      📋 Result: ${JSON.stringify(result.data, null, 2)}`);
      } catch (error) {
        console.log(`      ❌ Failed: ${error.message}`);
      }
    }
    
    console.log();
    
    // TEST 5: Check VTiger permissions and user info
    console.log('👤 TEST 5: User Permissions & Info');
    try {
      const result = await makeRequest('/api/vtiger/user-info');
      console.log('   Status:', result.status);
      console.log('   User Info:', JSON.stringify(result.data, null, 2));
    } catch (error) {
      console.log('   ❌ User info failed:', error.message);
    }
    
    console.log();
    console.log('✅ Diagnostic tests completed!');
    
  } catch (error) {
    console.error('❌ Diagnostic test failed:', error);
  }
}

// Run diagnostics
runDiagnostics().catch(console.error);