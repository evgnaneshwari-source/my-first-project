const http = require('http');
const path = require('path');
const fs = require('fs');

// We will launch the server and test every endpoint
process.env.PORT = '3001';
process.env.DATABASE_PATH = 'database/test-expense-tracker.db';

const app = require('./src/server');

const results = [];

function logResult(name, status, expected, actual, details = '') {
  results.push({ name, status, expected, actual, details });
  console.log(`[${status}] ${name} -> Expected: ${expected}, Got: ${actual} ${details ? '(' + details + ')' : ''}`);
}

function request(method, pathUrl, body = null) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : null;
    const options = {
      hostname: '127.0.0.1',
      port: 3001,
      path: pathUrl,
      method: method,
      headers: {
        'Accept': 'application/json',
      },
    };

    if (postData) {
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request(options, (res) => {
      let rawData = '';
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(rawData);
        } catch (e) {
          json = rawData;
        }
        resolve({ status: res.statusCode, data: json, headers: res.headers });
      });
    });

    req.on('error', (err) => reject(err));
    if (postData) req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log('=== Starting Test Suite for Expense Tracker Backend ===\n');

  const server = app.listen(3001, async () => {
    try {
      console.log('Server started on port 3001. Running endpoint checks...\n');

      // 1. Health check
      {
        const res = await request('GET', '/api/health');
        const pass = res.status === 200 && res.data.status === 'ok';
        logResult('GET /api/health', pass ? 'PASS' : 'FAIL', '200 { status: "ok" }', `${res.status} ${JSON.stringify(res.data)}`);
      }

      // 2. Initial transactions listing
      {
        const res = await request('GET', '/api/transactions');
        const pass = res.status === 200 && Array.isArray(res.data.data);
        logResult('GET /api/transactions', pass ? 'PASS' : 'FAIL', '200 with array', `${res.status} array length: ${res.data.data ? res.data.data.length : 'n/a'}`);
      }

      // 3. POST /api/transactions valid income
      let incomeId = null;
      {
        const payload = {
          title: 'Consulting Gig',
          amount: 1500,
          category: 'Freelance',
          type: 'income',
          date: '2026-11-10',
          description: 'Client web advisory project',
        };
        const res = await request('POST', '/api/transactions', payload);
        const pass = res.status === 201 && res.data.success === true && res.data.data.id;
        incomeId = res.data.data ? res.data.data.id : null;
        logResult('POST /api/transactions (valid income)', pass ? 'PASS' : 'FAIL', '201 Created with ID', `${res.status} ID: ${incomeId}`);
      }

      // 4. POST /api/transactions valid expense
      let expenseId = null;
      {
        const payload = {
          title: 'Office Monitor',
          amount: 299.99,
          category: 'Shopping',
          type: 'expense',
          date: '2026-11-12',
          description: '4K IPS display for workstation',
        };
        const res = await request('POST', '/api/transactions', payload);
        const pass = res.status === 201 && res.data.success === true && res.data.data.id;
        expenseId = res.data.data ? res.data.data.id : null;
        logResult('POST /api/transactions (valid expense)', pass ? 'PASS' : 'FAIL', '201 Created with ID', `${res.status} ID: ${expenseId}`);
      }

      // 5. POST /api/transactions missing title
      {
        const payload = {
          amount: 50,
          category: 'Food',
          type: 'expense',
          date: '2026-11-12',
        };
        const res = await request('POST', '/api/transactions', payload);
        const pass = res.status === 400 && res.data.success === false;
        logResult('POST /api/transactions (missing title)', pass ? 'PASS' : 'FAIL', '400 Bad Request', `${res.status} "${res.data.error}"`);
      }

      // 6. POST /api/transactions negative amount
      {
        const payload = {
          title: 'Test',
          amount: -25,
          category: 'Food',
          type: 'expense',
          date: '2026-11-12',
        };
        const res = await request('POST', '/api/transactions', payload);
        const pass = res.status === 400 && res.data.success === false;
        logResult('POST /api/transactions (negative amount)', pass ? 'PASS' : 'FAIL', '400 Bad Request', `${res.status} "${res.data.error}"`);
      }

      // 7. POST /api/transactions invalid type
      {
        const payload = {
          title: 'Test',
          amount: 25,
          category: 'Food',
          type: 'donation', // invalid
          date: '2026-11-12',
        };
        const res = await request('POST', '/api/transactions', payload);
        const pass = res.status === 400 && res.data.success === false;
        logResult('POST /api/transactions (invalid type)', pass ? 'PASS' : 'FAIL', '400 Bad Request', `${res.status} "${res.data.error}"`);
      }

      // 8. POST /api/transactions invalid date
      {
        const payload = {
          title: 'Test',
          amount: 25,
          category: 'Food',
          type: 'expense',
          date: 'invalid-date',
        };
        const res = await request('POST', '/api/transactions', payload);
        const pass = res.status === 400 && res.data.success === false;
        logResult('POST /api/transactions (invalid date)', pass ? 'PASS' : 'FAIL', '400 Bad Request', `${res.status} "${res.data.error}"`);
      }

      // 9. GET /api/transactions/:id (existing)
      {
        const res = await request('GET', `/api/transactions/${incomeId}`);
        const pass = res.status === 200 && res.data.data.title === 'Consulting Gig';
        logResult('GET /api/transactions/:id (existing)', pass ? 'PASS' : 'FAIL', '200 with record', `${res.status} title: ${res.data.data?.title}`);
      }

      // 10. GET /api/transactions/:id (non-existent)
      {
        const res = await request('GET', '/api/transactions/999999');
        const pass = res.status === 404 && res.data.success === false;
        logResult('GET /api/transactions/:id (unknown ID)', pass ? 'PASS' : 'FAIL', '404 Not Found', `${res.status} "${res.data.error}"`);
      }

      // 11. GET /api/transactions/:id (invalid ID string)
      {
        const res = await request('GET', '/api/transactions/abc');
        const pass = res.status === 400 && res.data.success === false;
        logResult('GET /api/transactions/:id (invalid ID)', pass ? 'PASS' : 'FAIL', '400 Bad Request', `${res.status} "${res.data.error}"`);
      }

      // 12. PUT /api/transactions/:id (update existing)
      {
        const updatePayload = {
          title: 'Consulting Gig - Extended',
          amount: 1800,
          category: 'Freelance',
          type: 'income',
          date: '2026-11-10',
          description: 'Client web advisory project with extra sprint',
        };
        const res = await request('PUT', `/api/transactions/${incomeId}`, updatePayload);
        const pass = res.status === 200 && res.data.data.amount === 1800;
        logResult('PUT /api/transactions/:id (valid update)', pass ? 'PASS' : 'FAIL', '200 amount: 1800', `${res.status} amount: ${res.data.data?.amount}`);
      }

      // 13. PUT /api/transactions/:id (non-existent)
      {
        const res = await request('PUT', '/api/transactions/999999', {
          title: 'Foo', amount: 10, category: 'Food', type: 'expense', date: '2026-11-10'
        });
        const pass = res.status === 404;
        logResult('PUT /api/transactions/:id (unknown ID)', pass ? 'PASS' : 'FAIL', '404 Not Found', `${res.status}`);
      }

      // 14. DELETE /api/transactions/:id
      {
        const res = await request('DELETE', `/api/transactions/${incomeId}`);
        const pass = res.status === 200 && res.data.success === true;
        logResult('DELETE /api/transactions/:id (existing)', pass ? 'PASS' : 'FAIL', '200 Success', `${res.status}`);

        // Verify it was removed
        const verifyRes = await request('GET', `/api/transactions/${incomeId}`);
        const verifyPass = verifyRes.status === 404;
        logResult('Verify deletion (GET deleted ID)', verifyPass ? 'PASS' : 'FAIL', '404 Not Found', `${verifyRes.status}`);
      }

      // 15. DELETE /api/transactions/:id (non-existent)
      {
        const res = await request('DELETE', '/api/transactions/999999');
        const pass = res.status === 404;
        logResult('DELETE /api/transactions/:id (unknown ID)', pass ? 'PASS' : 'FAIL', '404 Not Found', `${res.status}`);
      }

      // 16. Budgets: GET /api/budgets/2026/11 (before creating)
      {
        const res = await request('GET', '/api/budgets/2026/11');
        const pass = res.status === 404;
        logResult('GET /api/budgets/2026/11 (not yet created)', pass ? 'PASS' : 'FAIL', '404 Not Found', `${res.status}`);
      }

      // 17. Budgets: POST /api/budgets (valid)
      let budgetId = null;
      {
        const res = await request('POST', '/api/budgets', { year: 2026, month: 11, amount: 3500 });
        const pass = res.status === 201 && res.data.data.amount === 3500;
        budgetId = res.data.data?.id;
        logResult('POST /api/budgets (create budget)', pass ? 'PASS' : 'FAIL', '201 Created with ID', `${res.status} ID: ${budgetId}`);
      }

      // 18. Budgets: POST /api/budgets (duplicate month -> 409 conflict)
      {
        const res = await request('POST', '/api/budgets', { year: 2026, month: 11, amount: 4000 });
        const pass = res.status === 409;
        logResult('POST /api/budgets (duplicate month conflict)', pass ? 'PASS' : 'FAIL', '409 Conflict', `${res.status} "${res.data.error}"`);
      }

      // 19. Budgets: GET /api/budgets/2026/11 (after creating)
      {
        const res = await request('GET', '/api/budgets/2026/11');
        const pass = res.status === 200 && res.data.data.amount === 3500;
        logResult('GET /api/budgets/2026/11 (existing)', pass ? 'PASS' : 'FAIL', '200 amount: 3500', `${res.status} amount: ${res.data.data?.amount}`);
      }

      // 20. Budgets: PUT /api/budgets/:id (update budget)
      {
        const res = await request('PUT', `/api/budgets/${budgetId}`, { amount: 3800 });
        const pass = res.status === 200 && res.data.data.amount === 3800;
        logResult('PUT /api/budgets/:id (update amount)', pass ? 'PASS' : 'FAIL', '200 amount: 3800', `${res.status} amount: ${res.data.data?.amount}`);
      }

      // 21. Budgets: PUT /api/budgets/:id (invalid amount <= 0)
      {
        const res = await request('PUT', `/api/budgets/${budgetId}`, { amount: -500 });
        const pass = res.status === 400;
        logResult('PUT /api/budgets/:id (negative amount)', pass ? 'PASS' : 'FAIL', '400 Bad Request', `${res.status} "${res.data.error}"`);
      }

      // 22. Unknown API route -> 404 JSON
      {
        const res = await request('GET', '/api/non-existent-route');
        const pass = res.status === 404 && res.data.success === false;
        logResult('GET /api/non-existent-route', pass ? 'PASS' : 'FAIL', '404 JSON error', `${res.status} "${res.data.error}"`);
      }

      // 23. Static Frontend File Check: index.html
      {
        const res = await request('GET', '/');
        const pass = res.status === 200 && typeof res.data === 'string' && res.data.includes('ClearLedger');
        logResult('Static Frontend: GET /', pass ? 'PASS' : 'FAIL', '200 HTML with ClearLedger', `${res.status} length: ${res.data.length}`);
      }

      // 24. Static Frontend File Check: css/style.css
      {
        const res = await request('GET', '/css/style.css');
        const pass = res.status === 200 && typeof res.data === 'string' && res.data.includes('--radius-lg');
        logResult('Static Frontend: GET /css/style.css', pass ? 'PASS' : 'FAIL', '200 CSS stylesheet', `${res.status}`);
      }

      // 25. Static Frontend File Check: js/app.js
      {
        const res = await request('GET', '/js/app.js');
        const pass = res.status === 200 && typeof res.data === 'string' && res.data.includes('initApp');
        logResult('Static Frontend: GET /js/app.js', pass ? 'PASS' : 'FAIL', '200 JS module', `${res.status}`);
      }

      // 26. Subscriptions: GET /api/subscriptions
      {
        const res = await request('GET', '/api/subscriptions');
        const pass = res.status === 200 && Array.isArray(res.data.data);
        logResult('GET /api/subscriptions', pass ? 'PASS' : 'FAIL', '200 with array', `${res.status}`);
      }

      // 27. Subscriptions: POST /api/subscriptions (valid)
      let subId = null;
      {
        const payload = {
          name: 'Netflix Premium',
          amount: 15.49,
          billing_cycle: 'monthly',
          category: 'Entertainment',
          renewal_date: '2026-11-20',
          status: 'active',
          is_unused: 0,
          description: '4K Ultra HD family tier',
        };
        const res = await request('POST', '/api/subscriptions', payload);
        const pass = res.status === 201 && res.data.data.name === 'Netflix Premium';
        subId = res.data.data?.id;
        logResult('POST /api/subscriptions (create valid)', pass ? 'PASS' : 'FAIL', '201 Created with ID', `${res.status} ID: ${subId}`);
      }

      // 28. Subscriptions: POST /api/subscriptions (missing name)
      {
        const payload = {
          amount: 15.49,
          billing_cycle: 'monthly',
          category: 'Entertainment',
          renewal_date: '2026-11-20',
        };
        const res = await request('POST', '/api/subscriptions', payload);
        const pass = res.status === 400 && res.data.success === false;
        logResult('POST /api/subscriptions (missing name)', pass ? 'PASS' : 'FAIL', '400 Bad Request', `${res.status} "${res.data.error}"`);
      }

      // 29. Subscriptions: POST /api/subscriptions (invalid cycle)
      {
        const payload = {
          name: 'Test Sub',
          amount: 15.49,
          billing_cycle: 'weekly', // invalid
          category: 'Entertainment',
          renewal_date: '2026-11-20',
        };
        const res = await request('POST', '/api/subscriptions', payload);
        const pass = res.status === 400 && res.data.success === false;
        logResult('POST /api/subscriptions (invalid cycle)', pass ? 'PASS' : 'FAIL', '400 Bad Request', `${res.status} "${res.data.error}"`);
      }

      // 30. Subscriptions: GET /api/subscriptions/:id
      {
        const res = await request('GET', `/api/subscriptions/${subId}`);
        const pass = res.status === 200 && res.data.data.name === 'Netflix Premium';
        logResult('GET /api/subscriptions/:id (existing)', pass ? 'PASS' : 'FAIL', '200 with record', `${res.status} name: ${res.data.data?.name}`);
      }

      // 31. Subscriptions: PUT /api/subscriptions/:id (update status & unused flag)
      {
        const updatePayload = {
          name: 'Netflix Premium 4K',
          amount: 19.99,
          billing_cycle: 'monthly',
          category: 'Entertainment',
          renewal_date: '2026-11-22',
          status: 'active',
          is_unused: 1,
          description: 'Upgraded tier, flagged for review',
        };
        const res = await request('PUT', `/api/subscriptions/${subId}`, updatePayload);
        const pass = res.status === 200 && res.data.data.amount === 19.99 && res.data.data.is_unused === 1;
        logResult('PUT /api/subscriptions/:id (update record)', pass ? 'PASS' : 'FAIL', '200 amount: 19.99 unused: 1', `${res.status}`);
      }

      // 32. Subscriptions: DELETE /api/subscriptions/:id
      {
        const res = await request('DELETE', `/api/subscriptions/${subId}`);
        const pass = res.status === 200 && res.data.success === true;
        logResult('DELETE /api/subscriptions/:id', pass ? 'PASS' : 'FAIL', '200 Deleted', `${res.status}`);

        const verifyRes = await request('GET', `/api/subscriptions/${subId}`);
        const verifyPass = verifyRes.status === 404;
        logResult('Verify subscription deletion', verifyPass ? 'PASS' : 'FAIL', '404 Not Found', `${verifyRes.status}`);
      }

      console.log('\nAll test cases executed.');
      server.close(() => {
        process.exit(0);
      });
    } catch (err) {
      console.error('Test run failed with error:', err);
      server.close();
      process.exit(1);
    }
  });
}

runTests();
