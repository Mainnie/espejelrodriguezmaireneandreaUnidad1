const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);
const publicDir = path.resolve(__dirname, 'public');
const imagesDir = path.resolve(__dirname, 'img');
const catalogFile = path.resolve(__dirname, 'catalog', 'products.json');
const dataDir = path.resolve(__dirname, 'data');
const ordersFile = path.join(dataDir, 'orders.json');
const usersFile = path.join(dataDir, 'users.json');
const products = JSON.parse(fs.readFileSync(catalogFile, 'utf8'));
const secureCookies = process.env.COOKIE_SECURE === 'true';
const cookieName = secureCookies ? '__Host-mainnie_session' : 'mainnie_session';
const sessionLifetimeMs = 8 * 60 * 60 * 1000;
const sessionLifetimeSeconds = sessionLifetimeMs / 1000;
const sessions = new Map();
const loginAttempts = new Map();
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

function json(res, status, value, extraHeaders = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extraHeaders });
  res.end(JSON.stringify(value));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (Buffer.byteLength(body) > 16_384) { reject(new Error('La solicitud excede el tamaño permitido.')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch { reject(new Error('El contenido enviado no es válido.')); }
    });
    req.on('error', reject);
  });
}

function loadJsonArray(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(value)) throw new Error('El archivo de datos no tiene un formato válido.');
    return value;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function saveJsonArray(file, value) {
  fs.mkdirSync(dataDir, { recursive: true });
  const temporaryFile = `${file}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporaryFile, file);
}

function getCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(separator + 1).trim()); }
    catch { return ''; }
  }
  return '';
}

function sessionFor(req) {
  const token = getCookie(req, cookieName);
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const session = sessions.get(tokenHash);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(tokenHash);
    return null;
  }
  return { ...session, tokenHash };
}

function cookieHeader(token, maxAge) {
  return `${cookieName}=${token}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Strict${secureCookies ? '; Secure' : ''}`;
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin || !req.headers.host) return false;
  try {
    const originUrl = new URL(origin);
    const forwardedProto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
    const expectedProtocol = forwardedProto === 'https' ? 'https:' : 'http:';
    return originUrl.origin === `${expectedProtocol}//${req.headers.host}`;
  } catch { return false; }
}

function hasCsrfToken(req, session) {
  const supplied = req.headers['x-csrf-token'];
  if (typeof supplied !== 'string') return false;
  const expected = Buffer.from(session.csrfToken);
  const actual = Buffer.from(supplied);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function authRateLimitKey(req, email) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',').pop().trim();
  return `${forwarded || req.socket.remoteAddress || 'unknown'}:${email}`;
}

function rateLimited(req, email) {
  const now = Date.now();
  for (const [key, value] of loginAttempts) if (value.resetAt <= now) loginAttempts.delete(key);
  if (loginAttempts.size > 5000) loginAttempts.delete(loginAttempts.keys().next().value);
  const key = authRateLimitKey(req, email);
  const record = loginAttempts.get(key);
  if (record && record.resetAt > now && record.count >= 8) return true;
  if (!record || record.resetAt <= now) loginAttempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
  else record.count++;
  return false;
}

function clearRateLimit(req, email) { loginAttempts.delete(authRateLimitKey(req, email)); }

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$16384$8$1$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

async function verifyPassword(password, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt' || parts[1] !== '16384' || parts[2] !== '8' || parts[3] !== '1') return false;
  try {
    const salt = Buffer.from(parts[4], 'base64url');
    const expected = Buffer.from(parts[5], 'base64url');
    if (salt.length !== 16 || expected.length !== 64) return false;
    const actual = await scrypt(password, salt, expected.length, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    return crypto.timingSafeEqual(actual, expected);
  } catch { return false; }
}

function startSession(res, user) {
  const now = Date.now();
  for (const [key, session] of sessions) if (session.expiresAt <= now) sessions.delete(key);
  if (sessions.size >= 10000) sessions.delete(sessions.keys().next().value);
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const session = { userId: user.id, email: user.email, name: user.name, csrfToken: crypto.randomBytes(32).toString('base64url'), expiresAt: Date.now() + sessionLifetimeMs };
  sessions.set(tokenHash, session);
  res.setHeader('Set-Cookie', cookieHeader(token, sessionLifetimeSeconds));
  return session;
}

function loadOrders() { return loadJsonArray(ordersFile); }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET' && url.pathname === '/api/auth/session') {
      const session = sessionFor(req);
      if (!session) return json(res, 200, { authenticated: false });
      return json(res, 200, { authenticated: true, user: { name: session.name, email: session.email }, csrfToken: session.csrfToken });
    }

    if (req.method === 'POST' && (url.pathname === '/api/auth/register' || url.pathname === '/api/auth/login')) {
      if (!sameOrigin(req)) return json(res, 403, { error: 'Solicitud de origen no permitido.' });
      const input = await parseBody(req);
      const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
      const password = typeof input.password === 'string' ? input.password : '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length > 128) return json(res, 400, { error: 'Revisa el correo y la contraseña.' });
      if (rateLimited(req, email)) return json(res, 429, { error: 'Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.' });

      const users = loadJsonArray(usersFile);
      if (url.pathname === '/api/auth/register') {
        const name = typeof input.name === 'string' ? input.name.trim() : '';
        if (name.length < 2 || name.length > 80 || password.length < 12) return json(res, 400, { error: 'Usa un nombre de 2 a 80 caracteres y una contraseña de al menos 12 caracteres.' });
        if (users.some(user => user.email === email)) return json(res, 400, { error: 'No se pudo crear la cuenta. Revisa los datos o intenta iniciar sesión.' });
        const passwordHash = await hashPassword(password);
        const latestUsers = loadJsonArray(usersFile);
        if (latestUsers.some(user => user.email === email)) return json(res, 400, { error: 'No se pudo crear la cuenta. Revisa los datos o intenta iniciar sesión.' });
        const user = { id: crypto.randomUUID(), name, email, passwordHash, createdAt: new Date().toISOString() };
        latestUsers.push(user);
        saveJsonArray(usersFile, latestUsers);
        clearRateLimit(req, email);
        const session = startSession(res, user);
        return json(res, 201, { authenticated: true, user: { name: user.name, email: user.email }, csrfToken: session.csrfToken });
      }

      const user = users.find(candidate => candidate.email === email);
      const valid = user
        ? await verifyPassword(password, user.passwordHash)
        : (await scrypt(password, Buffer.alloc(16), 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }), false);
      if (!user || !valid) return json(res, 401, { error: 'Correo o contraseña incorrectos.' });
      clearRateLimit(req, email);
      const session = startSession(res, user);
      return json(res, 200, { authenticated: true, user: { name: user.name, email: user.email }, csrfToken: session.csrfToken });
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
      if (!sameOrigin(req)) return json(res, 403, { error: 'Solicitud de origen no permitido.' });
      const session = sessionFor(req);
      if (!session) { res.writeHead(204, { 'Set-Cookie': cookieHeader('', 0), 'Cache-Control': 'no-store' }).end(); return; }
      if (!hasCsrfToken(req, session)) return json(res, 403, { error: 'La sesión expiró. Recarga la página e inténtalo de nuevo.' });
      sessions.delete(session.tokenHash);
      res.writeHead(204, { 'Set-Cookie': cookieHeader('', 0), 'Cache-Control': 'no-store' }).end();
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/products') {
      if (!sessionFor(req)) return json(res, 401, { error: 'Inicia sesión para continuar.' });
      return json(res, 200, products);
    }

    if (req.method === 'POST' && url.pathname === '/api/orders') {
      if (!sameOrigin(req)) return json(res, 403, { error: 'Solicitud de origen no permitido.' });
      const session = sessionFor(req);
      if (!session) return json(res, 401, { error: 'Inicia sesión para continuar.' });
      if (!hasCsrfToken(req, session)) return json(res, 403, { error: 'La sesión expiró. Recarga la página e inténtalo de nuevo.' });
      const input = await parseBody(req);
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      const address = typeof input.address === 'string' ? input.address.trim() : '';
      if (name.length < 2 || name.length > 100 || address.length < 5 || address.length > 250) return json(res, 400, { error: 'Escribe un nombre y una dirección válidos.' });
      if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 30) return json(res, 400, { error: 'El carrito está vacío o no es válido.' });
      const items = [];
      for (const inputItem of input.items) {
        const product = products.find(item => item.id === Number(inputItem.id));
        const quantity = Number(inputItem.quantity);
        if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) return json(res, 400, { error: 'Un producto o cantidad no es válido.' });
        items.push({ id: product.id, name: product.name, price: product.price, quantity });
      }
      const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const order = { id: `MB-${crypto.randomInt(100000, 1_000_000)}`, createdAt: new Date().toISOString(), accountEmail: session.email, customer: { name, address }, items, total, status: 'DEMO_ONLY' };
      const orders = loadOrders();
      orders.push(order);
      saveJsonArray(ordersFile, orders);
      return json(res, 201, { id: order.id, createdAt: order.createdAt, items, total, status: order.status });
    }

    if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Ruta API no encontrada.' });
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end('Método no permitido'); return; }
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); }
    catch { res.writeHead(400).end('Solicitud inválida'); return; }
    if (pathname === '/') pathname = '/index.html';
    const imageRequest = pathname.startsWith('/img/');
    const rootDir = imageRequest ? imagesDir : publicDir;
    const relativePath = imageRequest ? pathname.slice('/img'.length) : pathname;
    const file = path.resolve(rootDir, `.${relativePath}`);
    if (file !== rootDir && !file.startsWith(rootDir + path.sep)) { res.writeHead(403).end('Prohibido'); return; }
    fs.readFile(file, (error, content) => {
      if (error) { res.writeHead(error.code === 'ENOENT' ? 404 : 500).end(error.code === 'ENOENT' ? 'No encontrado' : 'Error del servidor'); return; }
      res.writeHead(200, { 'Content-Type': mimeTypes[path.extname(file).toLowerCase()] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : content);
    });
  } catch (error) {
    if (!res.headersSent) json(res, 500, { error: 'Ocurrió un error interno. Inténtalo de nuevo.' });
    else res.destroy();
    console.error('Error procesando solicitud:', error.message);
  }
});

const port = Number(process.env.PORT || 3000);
server.listen(port, '0.0.0.0', () => console.log(`Mainnie's Beauty escuchando en el puerto ${port}`));
