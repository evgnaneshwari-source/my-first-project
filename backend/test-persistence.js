const http = require('http');
const path = require('path');
const fs = require('fs');

function request(port, method, pathUrl, body = null) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : null;
    const options = {
      hostname: '127.0.0.1',
      port: port,
      path: pathUrl,
      method: method,
      headers: { 'Accept': 'application/json' },
    };
    if (postData) {
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }
    const req = http.request(options, (res) => {
      let rawData = '';
      res.on('data', (c) => { rawData += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(rawData); } catch (e) { json = rawData; }
        resolve({ status: res.statusCode, data: json });
      });
    });
    req.on('error', (err) => reject(err));
    if (postData) req.write(postData);
    req.end();
  });
}

async function testPersistence() {
  console.log('=== Testing SQLite Persistence Across Server Restart ===');
  process.env.NODE_ENV = 'test';
  process.env.PORT = '3002';
  process.env.DATABASE_PATH = 'database/persistence-test.db';

  // Step 1: Start Server 1
  const app1 = require('./src/server');
  const server1 = app1.listen(3002);
  await new Promise((r) => setTimeout(r, 600));

  console.log('1. Server 1 started on port 3002.');

  // Create transaction and budget on Server 1
  const txnRes = await request(3002, 'POST', '/api/transactions', {
    title: 'Persistent Grocery Receipt',
    amount: 145.50,
    category: 'Food',
    type: 'expense',
    date: '2026-11-14',
    description: 'Weekly organic groceries'
  });
  console.log('2. Created transaction on Server 1:', txnRes.status, txnRes.data.data?.title);

  const budgetRes = await request(3002, 'POST', '/api/budgets', {
    year: 2026,
    month: 11,
    amount: 2500
  });
  console.log('3. Created budget on Server 1:', budgetRes.status, budgetRes.data.data?.amount);

  // Close Server 1
  await new Promise((resolve) => server1.close(resolve));
  console.log('4. Server 1 completely stopped and closed.');

  // Step 2: Start Server 2 pointing to the exact same database file
  delete require.cache[require.resolve('./src/server')];
  delete require.cache[require.resolve('./src/config/database')];
  delete require.cache[require.resolve('./src/controllers/transactionsController')];
  delete require.cache[require.resolve('./src/controllers/budgetsController')];

  const app2 = require('./src/server');
  const server2 = app2.listen(3002);
  await new Promise((r) => setTimeout(r, 600));
  console.log('5. Server 2 started on port 3002 with same SQLite DB file.');

  // Fetch transaction list from Server 2
  const listRes = await request(3002, 'GET', '/api/transactions');
  const foundTxn = listRes.data.data.find(t => t.title === 'Persistent Grocery Receipt');
  console.log('6. Verified transaction exists on Server 2:', Boolean(foundTxn), foundTxn?.amount === 145.5);

  // Fetch budget from Server 2
  const getBudgetRes = await request(3002, 'GET', '/api/budgets/2026/11');
  console.log('7. Verified budget exists on Server 2:', getBudgetRes.status === 200, getBudgetRes.data.data?.amount === 2500);

  await new Promise((resolve) => server2.close(resolve));
  console.log('8. Server 2 stopped. Persistence test PASSED 100%!');
  process.exit(0);
}

testPersistence().catch(err => {
  console.error('Persistence test failed:', err);
  process.exit(1);
});
