// Comprehensive Security & Fraud Prevention Verification Suite
const http = require('http');
const crypto = require('crypto');

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(body); } catch(e) { parsed = body; }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: parsed
        });
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function runSuite() {
  console.log('========================================================');
  console.log('SATINOSTITCH Security & Fraud Prevention Verification Suite');
  console.log('========================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`✓ PASS: ${testName} ${details ? '(' + details + ')' : ''}`);
      passed++;
    } else {
      console.error(`✗ FAIL: ${testName} ${details ? '(' + details + ')' : ''}`);
      failed++;
    }
  }

  // --- 1. Security Headers Verification ---
  try {
    const res = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/health',
      method: 'GET'
    });
    assert(res.headers['x-content-type-options'] === 'nosniff', 'Security Header: X-Content-Type-Options is nosniff');
    assert(res.headers['x-frame-options'] === 'SAMEORIGIN', 'Security Header: X-Frame-Options is SAMEORIGIN');
    assert(res.headers['content-security-policy'] !== undefined, 'Security Header: Content-Security-Policy present');
    assert(res.headers['x-powered-by'] === undefined, 'Security Header: X-Powered-By is hidden/removed');
  } catch (err) {
    assert(false, 'Security Headers Test', err.message);
  }

  // --- 2. WAF Protection: XSS and SQL Injection Shield ---
  try {
    const xssPayload = {
      name: 'Hacker<script>alert(1)</script>',
      email: 'hacker@example.com',
      subject: 'Exploit Test',
      message: 'Testing WAF'
    };
    const resXss = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/contact',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, xssPayload);
    assert(resXss.statusCode === 400 && resXss.data && resXss.data.code === 'WAF_SECURITY_BLOCK', 
      'WAF XSS Defense: Blocked <script> tag with HTTP 400');

    const sqliPayload = {
      email: "admin' OR '1'='1",
      password: "password123"
    };
    const resSqli = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, sqliPayload);
    assert(resSqli.statusCode === 400 && resSqli.data && resSqli.data.code === 'WAF_SECURITY_BLOCK', 
      'WAF SQLi Defense: Blocked SQL injection pattern with HTTP 400');
  } catch (err) {
    assert(false, 'WAF Protection Test', err.message);
  }

  // --- 3. Authentication: Password Policy ---
  try {
    const weakPassRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      name: 'Weak Pass User',
      email: `weaktest_${Date.now()}@example.com`,
      password: 'short'
    });
    assert(weakPassRes.statusCode === 400 && weakPassRes.data.error.includes('8 characters'), 
      'Auth Password Policy: Rejected short password (< 8 chars)');

    const simplePassRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      name: 'Letters Only User',
      email: `simpletest_${Date.now()}@example.com`,
      password: 'allletterspassword'
    });
    assert(simplePassRes.statusCode === 400 && simplePassRes.data.error.includes('combination of letters and numbers'), 
      'Auth Password Policy: Rejected password lacking numbers/symbols');
  } catch (err) {
    assert(false, 'Password Policy Test', err.message);
  }

  // --- 4. Brute Force Account Lockout ---
  try {
    const targetEmail = `lockout_test_${Date.now()}@example.com`;
    const regRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      name: 'Lockout Test Target',
      email: targetEmail,
      password: 'ValidPassword123!'
    });
    assert(regRes.statusCode === 201, 'Auth Setup: Registered test account for brute force test');

    // Attempt 5 bad passwords
    for (let i = 1; i <= 5; i++) {
      await request({
        hostname: 'localhost',
        port: 3000,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, {
        email: targetEmail,
        password: 'WrongPassword' + i
      });
    }

    // 6th attempt should return 423 Locked
    const lockRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      email: targetEmail,
      password: 'ValidPassword123!'
    });
    assert(lockRes.statusCode === 423 && lockRes.data.code === 'ACCOUNT_LOCKED', 
      'Brute Force Defense: Account locked after 5 failed attempts (HTTP 423)');
  } catch (err) {
    assert(false, 'Brute Force Test', err.message);
  }

  // --- 5. RBAC (Role-Based Access Control) ---
  let customerToken = '';
  let adminToken = '';
  try {
    // Login customer
    const custLogin = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      email: 'john@example.com',
      password: 'password123'
    });
    customerToken = custLogin.data.token;

    // Login admin (using correct admin credentials)
    const adminLogin = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/admin/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      email: 'admin@satinostitch.com',
      password: 'admin123'
    });
    adminToken = adminLogin.data.token;

    // Customer tries accessing admin security stats -> 403 Forbidden
    const unauthAdminRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/admin/security/stats',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${customerToken}` }
    });
    assert(unauthAdminRes.statusCode === 403, 'RBAC Defense: Customer token blocked from Admin security stats (HTTP 403)');

    // Admin accessing admin security stats -> 200 OK
    const authAdminRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/admin/security/stats',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert(authAdminRes.statusCode === 200 && authAdminRes.data.success === true, 
      'RBAC Success: Admin granted access to Security Intelligence & Stats');

    // Admin accessing audit logs -> 200 OK
    const auditLogsRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/admin/security/audit-logs?limit=5',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert(auditLogsRes.statusCode === 200 && Array.isArray(auditLogsRes.data.logs), 
      'Audit Logging: Retrieved tamper-evident security audit logs from PostgreSQL');
  } catch (err) {
    assert(false, 'RBAC Test', err.message);
  }

  // --- 6. Cryptographic Payment Verification & Fraud Scoring ---
  try {
    const orderId = 'order_test_998877';
    const paymentId = 'pay_test_334455';
    const secret = 'satinostitch_rzp_secret_atelier_2026';
    const validSignature = crypto.createHmac('sha256', secret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    // Verify Payment Signature endpoint
    const validPayRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/orders/verify-payment',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${customerToken}`
      }
    }, {
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: validSignature
    });
    assert(validPayRes.statusCode === 200 && validPayRes.data.verified === true, 
      'Payment Verification: Valid cryptographic HMAC-SHA256 signature accepted');

    const fakePayRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/orders/verify-payment',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${customerToken}`
      }
    }, {
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: 'forged_fake_signature_abc123'
    });
    assert(fakePayRes.statusCode === 400 && fakePayRes.data.verified === false, 
      'Payment Verification: Forged signature rejected with HTTP 400');

    // Fraud Scoring on Order Placement: Disposable Burner Email & anomalous address
    const fraudOrderRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/orders',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${customerToken}`
      }
    }, {
      customer: {
        name: 'Suspicious Bot',
        email: 'disposable_user@mailinator.com', // Burner domain
        phone: '12345',                         // Short anomalous phone
        line1: 'X',                             // Minimal address
        city: 'Delhi',
        state: 'Delhi',
        pincode: '110001'
      },
      paymentMethod: 'COD',
      items: [{ id: 1, qty: 1 }]
    });

    assert(fraudOrderRes.statusCode === 201 && (fraudOrderRes.data.order.fraud_score > 30 || fraudOrderRes.data.order.risk_level !== 'low'), 
      `Fraud Prevention: Suspicious order flagged (Score: ${fraudOrderRes.data?.order?.fraud_score}, Risk: ${fraudOrderRes.data?.order?.risk_level})`);
  } catch (err) {
    assert(false, 'Payment & Fraud Prevention Test', err.message);
  }

  // --- 7. Rate Limiting Verification ---
  try {
    let triggeredRateLimit = false;
    for (let i = 0; i < 15; i++) {
      const res = await request({
        hostname: 'localhost',
        port: 3000,
        path: '/api/newsletter',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, { email: `ratelimit_${i}@example.com` });

      if (res.statusCode === 429) {
        triggeredRateLimit = true;
        assert(res.headers['retry-after'] !== undefined, 'Rate Limiter: Header Retry-After present on 429 response');
        break;
      }
    }
    assert(triggeredRateLimit, 'Rate Limiter: Active sliding window limiter triggered HTTP 429 on rapid requests');
  } catch (err) {
    assert(false, 'Rate Limiting Test', err.message);
  }

  console.log('\n========================================================');
  console.log(`Results: ${passed} PASSED | ${failed} FAILED`);
  console.log('========================================================');
}

runSuite().catch(console.error);
