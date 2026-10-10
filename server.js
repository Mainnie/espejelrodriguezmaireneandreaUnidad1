const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const publicDir = path.resolve(__dirname, 'public');
const imagesDir = path.resolve(__dirname, 'img');
const catalogFile = path.resolve(__dirname, 'catalog', 'products.json');
const dataDir = path.resolve(__dirname, 'data');
const ordersFile = path.join(dataDir, 'orders.json');
const products = JSON.parse(fs.readFileSync(catalogFile, 'utf8'));
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(value));
}
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 16_384) { reject(new Error('La solicitud excede 16 KB.')); req.destroy(); }
    });
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('El contenido JSON no es válido.')); } });
    req.on('error', reject);
  });
}
function loadOrders() {
  try { return JSON.parse(fs.readFileSync(ordersFile, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/api/products') return json(res, 200, products);
  if (req.method === 'POST' && url.pathname === '/api/orders') {
    try {
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
      const order = { id: `MB-${crypto.randomInt(100000, 1_000_000)}`, createdAt: new Date().toISOString(), customer: { name, address }, items, total, status: 'DEMO_ONLY' };
      fs.mkdirSync(dataDir, { recursive: true });
      const orders = loadOrders();
      orders.push(order);
      const temporaryFile = `${ordersFile}.tmp`;
      fs.writeFileSync(temporaryFile, JSON.stringify(orders, null, 2), { mode: 0o600 });
      fs.renameSync(temporaryFile, ordersFile);
      return json(res, 201, { id: order.id, createdAt: order.createdAt, items, total, status: order.status });
    } catch (error) { return json(res, 400, { error: error.message || 'No fue posible guardar el pedido.' }); }
  }
  if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Ruta API no encontrada.' });
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end('Método no permitido'); return; }
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { res.writeHead(400).end('Solicitud inválida'); return; }
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
});
const port = Number(process.env.PORT || 3000);
server.listen(port, '0.0.0.0', () => console.log(`Mainnie's Beauty escuchando en el puerto ${port}`));
