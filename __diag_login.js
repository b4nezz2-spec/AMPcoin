const fs = require('fs');
const path = require('path');
const LOG = path.join(__dirname, '__diag_output.log');
fs.writeFileSync(LOG, '');
function log(...a) {
  const line = a.map(x => {
    try { return (typeof x === 'string') ? x : require('util').inspect(x, { depth: 3 }); }
    catch (_) { return String(x); }
  }).join(' ');
  fs.appendFileSync(LOG, line + '\n');
  process.stdout.write(line + '\n');
}

process.on('uncaughtException', (e) => {
  log('UNCAUGHT EXCEPTION:', e.message);
  log(e.stack);
  process.exit(1);
});
process.on('unhandledRejection', (r) => {
  log('UNHANDLED REJECTION:', r);
  process.exit(2);
});

const express = require('express');
const http = require('http');

async function run() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', (req, res, next) => {
    log(`[REQ ${req.method}] ${req.path} body =`, JSON.stringify(req.body).slice(0, 300));
    next();
  }, require('./backend/routes/auth'));
  app.use((err, req, res, next) => {
    log('EXPRESS ERROR MW:', err.message, '\n' + err.stack);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Server error (caught): ' + err.message });
    }
  });

  const server = app.listen(0, '127.0.0.1', async () => {
    const port = server.address().port;
    log('Listening on port ' + port);

    const payloads = [
      { robloxUsername: 'DemoUser', password: 'DemoUser123' },
      { robloxUsername: 'POOpPANTSpro', password: 'testpass' },
      { robloxUsername: 'AdminUser', password: 'admin123' }
    ];

    for (const p of payloads) {
      log('---- Trying login', JSON.stringify(p));
      await new Promise((resolve) => {
        const body = JSON.stringify(p);
        const req = http.request({
          hostname: '127.0.0.1', port, method: 'POST',
          path: '/api/auth/login',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body)
          }
        }, (res) => {
          let data = '';
          res.on('data', c => data += c);
          res.on('end', () => {
            log(`<- STATUS ${res.statusCode}`);
            if (data) log('<- BODY  ', data);
            resolve();
          });
        });
        req.on('error', e => { log('REQ ERR', e.message); resolve(); });
        req.write(body);
        req.end();
      });
      await new Promise(r => setTimeout(r, 400));
    }

    setTimeout(() => {
      log('=== DONE ===');
      server.close();
      process.exit(0);
    }, 2500);
  });
}

run().catch((e) => {
  log('RUN FATAL:', e.message);
  log(e.stack);
  process.exit(99);
});
