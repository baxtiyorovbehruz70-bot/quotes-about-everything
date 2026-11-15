'use strict';

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const db = require('./db');
const { parseLine, makeKey } = require('./lib/parse');

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
let SESSION_SECRET = process.env.SESSION_SECRET || '';
if (!SESSION_SECRET) {
  SESSION_SECRET = crypto.randomBytes(32).toString('hex');
  console.warn('SESSION_SECRET is not set. A temporary one was generated, so admins are signed out on every restart.');
}
if (!ADMIN_PASSWORD) {
  console.warn('ADMIN_PASSWORD is not set. The admin panel is disabled.');
}

const COOKIE = 'qf_admin';
const SESSION_MS = 12 * 60 * 60 * 1000;

/* ---------- admin session helpers (signed, httpOnly cookie) ---------- */
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const sign = (v) => crypto.createHmac('sha256', SESSION_SECRET).update(v).digest('hex');

function passwordOk(input) {
  if (!ADMIN_PASSWORD) return false;
  return crypto.timingSafeEqual(sha(input), sha(ADMIN_PASSWORD));
}
function makeToken() {
  const exp = String(Date.now() + SESSION_MS);
  return exp + '.' + sign(exp);
}
function validToken(token) {
  if (typeof token !== 'string') return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig) return false;
  const good = sign(exp);
  if (sig.length !== good.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return false;
  return Number(exp) > Date.now();
}
function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}
function cookieHeader(req, value, maxAgeSeconds) {
  const secure = req.secure ? '; Secure' : '';
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`;
}
function requireAdmin(req, res, next) {
  if (validToken(readCookie(req, COOKIE))) {
    res.set('Cache-Control', 'no-store');
    return next();
  }
  res.status(401).json({ error: 'Please sign in.' });
}
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

/* ---------- app ---------- */
const app = express();
app.set('trust proxy', 1); // Render sits behind a proxy
app.disable('x-powered-by');

app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'font-src': ['https://fonts.gstatic.com'],
        'img-src': ["'self'", 'data:'],
        'connect-src': ["'self'"],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"]
      }
    }
  })
);
app.use(express.json({ limit: '200kb' }));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' }
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in a few minutes.' }
});

app.get('/healthz', (req, res) => res.type('text').send('ok'));

/* Block cross-site writes and non-JSON bodies on the API. */
app.use('/api', apiLimiter, (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin) {
    try {
      if (new URL(origin).host !== req.get('host')) {
        return res.status(403).json({ error: 'Cross-site request blocked.' });
      }
    } catch (e) {
      return res.status(403).json({ error: 'Bad origin.' });
    }
  }
  if (req.method !== 'DELETE' && !req.is('application/json')) {
    return res.status(415).json({ error: 'JSON required.' });
  }
  next();
});

/* ---------- public API ---------- */
app.get('/api/quotes', wrap(async (req, res) => {
  const { rows } = await db.query('SELECT text AS t, author AS a, note AS n FROM quotes ORDER BY id');
  res.set('Cache-Control', 'no-cache');
  res.json(rows);
}));

/* ---------- admin API ---------- */
app.post('/api/admin/login', loginLimiter, (req, res) => {
  if (!ADMIN_PASSWORD) return res.status(503).json({ error: 'Admin is not set up on this server.' });
  const pw = req.body && req.body.password;
  if (typeof pw !== 'string' || !passwordOk(pw)) return res.status(401).json({ error: 'Wrong password.' });
  res.set('Set-Cookie', cookieHeader(req, makeToken(), SESSION_MS / 1000));
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  res.set('Set-Cookie', cookieHeader(req, '', 0));
  res.json({ ok: true });
});

app.get('/api/admin/me', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ admin: validToken(readCookie(req, COOKIE)) });
});

app.get('/api/admin/quotes', requireAdmin, wrap(async (req, res) => {
  const { rows } = await db.query('SELECT id, text AS t, author AS a, note AS n FROM quotes ORDER BY id DESC');
  res.json(rows);
}));

app.post('/api/admin/quotes', requireAdmin, wrap(async (req, res) => {
  const input = req.body && req.body.lines;
  const lines = typeof input === 'string' ? input.split(/\r?\n/) : Array.isArray(input) ? input.map(String) : null;
  if (!lines) return res.status(400).json({ error: 'Send the quotes as text, one per line.' });
  const clean = lines.filter((l) => l.trim());
  if (!clean.length) return res.status(400).json({ error: 'Write at least one quote first.' });
  if (clean.length > 500) return res.status(400).json({ error: 'Add at most 500 quotes at a time.' });

  let added = 0;
  let duplicates = 0;
  const rejected = [];
  for (const line of clean) {
    const q = parseLine(line);
    if (!q) { rejected.push(line); continue; }
    const key = makeKey(q.t);
    const exists = await db.query('SELECT 1 FROM quotes WHERE text_key = $1', [key]);
    if (exists.rowCount) { duplicates++; continue; }
    await db.query(
      'INSERT INTO quotes (text, author, note, text_key) VALUES ($1, $2, $3, $4) ON CONFLICT (text_key) DO NOTHING',
      [q.t, q.a, q.n, key]
    );
    added++;
  }
  res.json({ added, duplicates, rejected });
}));

app.delete('/api/admin/quotes/:id', requireAdmin, wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Bad quote id.' });
  const r = await db.query('DELETE FROM quotes WHERE id = $1', [id]);
  res.json({ deleted: r.rowCount });
}));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

/* ---------- website ---------- */
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

/* ---------- errors ---------- */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong. Please try again.' : 'Bad request.' });
});

async function start() {
  await db.init();
  return app.listen(PORT, '0.0.0.0', () => console.log(`Quote site running on port ${PORT}`));
}

if (require.main === module) {
  start().catch((err) => {
    console.error('Could not start:', err.message);
    process.exit(1);
  });
}

module.exports = { app, start };
