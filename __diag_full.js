const fs = require('fs');
const path = require('path');
const util = require('util');
const LOG = path.join(__dirname, '__diag_output2.log');
fs.writeFileSync(LOG, '');
function log(...a) {
  const line = a.map(x => {
    try { return (typeof x === 'string') ? x : util.inspect(x, { depth: 3 }); }
    catch (_) { return String(x); }
  }).join(' ');
  fs.appendFileSync(LOG, line + '\n');
  process.stdout.write(line + '\n');
}
process.on('uncaughtException', (e) => { log('UNCAUGHT:', e.message, '\n', e.stack); process.exit(1); });
process.on('unhandledRejection', (r) => { log('UNHANDLED REJ:', r); process.exit(2); });

const express = require('express');
const http = require('http');

function jsonRequest(port, method, p, body, token) {
  return new Promise((resolve) => {
    const bodyStr = body ? JSON.stringify(body) : '';
    const headers = {};
    if (body) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const req = http.request(
      { hostname: '127.0.0.1', port, method, path: p, headers },
      (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on('error', e => resolve({ status: -1, body: e.message }));
    if (body) req.write(bodyStr);
    req.end();
  });
}

async function run() {
  const app = express();
  app.use(express.json());

  function wrapMw(name, router) {
    return (req, res, next) => {
      const s = Date.now();
      const orgEnd = res.end.bind(res);
      res.end = function (chunk) {
        log(`[${name}] ${req.method} ${req.path} -> ${res.statusCode} (${Date.now() - s}ms)`);
        return orgEnd(chunk);
      };
      const orgJson = res.json.bind(res);
      res.json = function (obj) {
        if (res.statusCode >= 500) log(`[${name}] 5xx BODY:`, JSON.stringify(obj));
        return orgJson(obj);
      };
      try { router(req, res, next); }
      catch (e) {
        log(`[${name}] SYNC THROW:`, e.message, '\n', e.stack);
        next(e);
      }
    };
  }

  app.use('/api/auth', wrapMw('auth', require('./backend/routes/auth')));
  app.use('/api/users', wrapMw('users', require('./backend/routes/users')));
  app.use('/api/stats', wrapMw('stats', require('./backend/routes/stats')));
  app.use((err, req, res, next) => {
    log('EXPRESS ERR MW:', err.message, '\n', err.stack);
    if (!res.headersSent) res.status(500).json({ message: 'Server error: ' + err.message });
  });

  const server = app.listen(0, '127.0.0.1', async () => {
    const port = server.address().port;
    log('Listening on port ' + port);
    const rand = Math.floor(Math.random() * 1000000);
    const user = `TestUser_${rand}`;
    const pwd = `P@ssword${rand}!`;
    const display = `Display ${rand}`;

    log('=== 1) REGISTER ===');
    const reg = await jsonRequest(port, 'POST', '/api/auth/register', {
      robloxUsername: user, displayName: display, password: pwd, confirmPassword: pwd
    });
    log('REGISTER status', reg.status, '->', reg.body);

    let token = null;
    try { token = JSON.parse(reg.body).token; } catch (_) {}

    log('=== 2) LOGIN with WRONG password ===');
    const bad = await jsonRequest(port, 'POST', '/api/auth/login', { robloxUsername: user, password: 'WRONG' });
    log('BAD status', bad.status, '->', bad.body);

    log('=== 3) LOGIN with CORRECT password ===');
    const good = await jsonRequest(port, 'POST', '/api/auth/login', { robloxUsername: user, password: pwd });
    log('GOOD status', good.status, '->', good.body.slice(0, 500));

    let tok2 = null;
    try { tok2 = JSON.parse(good.body).token; } catch (_) {}

    log('=== 4) VERIFY TOKEN ===');
    const ver = await jsonRequest(port, 'POST', '/api/auth/verify-token', null, tok2 || token);
    log('VERIFY status', ver.status, '->', ver.body.slice(0, 600));

    log('=== 5) GET USER PROFILE (for avatar + display name) ===');
    const prof = await jsonRequest(port, 'GET', `/api/users/profile/${encodeURIComponent(user)}`, null, tok2 || token);
    log('PROFILE status', prof.status, '->', prof.body.slice(0, 600));

    log('=== 6) GET STATS LEADERBOARD ===');
    const lb = await jsonRequest(port, 'GET', '/api/stats/leaderboard?limit=3');
    log('LB status', lb.status, '->', lb.body.slice(0, 600));

    setTimeout(() => {
      log('=== DONE ===');
      server.close();
      process.exit(0);
    }, 1500);
  });
}

run().catch(e => { log('RUN FATAL:', e.message, '\n', e.stack); process.exit(99); });
