process.on('uncaughtException', (e) => {
  console.error('UNCAUGHT EXCEPTION:', e.message);
  console.error(e.stack);
  process.exit(1);
});
process.on('unhandledRejection', (r) => {
  console.error('UNHANDLED REJECTION:', r);
  process.exit(2);
});

const http = require('http');
const path = require('path');

function postLogin(robloxUsername, password, port = 5000) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ robloxUsername, password });
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/auth/login',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: 8000
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          resolve({ statusCode: res.statusCode, body: data });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

async function main() {
  const port = process.env.PORT || 5001;
  process.env.PORT = String(port);

  console.log('[test] Starting server on port', port);
  require('./server.js');

  await new Promise((r) => setTimeout(r, 2500));

  console.log('[test] Attempting login DemoUser/demo123');
  try {
    const r1 = await postLogin('DemoUser', 'demo123', port);
    console.log('[test] Response status:', r1.statusCode);
    console.log('[test] Response body:  ', r1.body);
  } catch (e) {
    console.error('[test] Login request failed:', e.message);
  }

  await new Promise((r) => setTimeout(r, 500));
  process.exit(0);
}

main().catch((e) => {
  console.error('[test] FATAL:', e.message);
  console.error(e.stack);
  process.exit(99);
});
