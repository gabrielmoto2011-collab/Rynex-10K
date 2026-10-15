const SESSION_COOKIE = 'rzk_session';
const SESSION_TTL_DAYS = 14;
const encoder = new TextEncoder();

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
});
const fail = (message, status = 400, headers = {}) => json({ error: message }, status, headers);
const nowIso = () => new Date().toISOString();
const bytesToHex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
const hexToBytes = (hex) => new Uint8Array(String(hex).match(/.{1,2}/g)?.map((x) => parseInt(x, 16)) || []);
const base64ToBytes = (value) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
const bytesToBase64 = (value) => btoa(String.fromCharCode(...new Uint8Array(value)));
const randomId = () => crypto.randomUUID();
const digest = async (value) => bytesToHex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
const safeEqual = (a, b) => {
  const aa = encoder.encode(String(a));
  const bb = encoder.encode(String(b));
  let diff = aa.length ^ bb.length;
  const len = Math.max(aa.length, bb.length);
  for (let i = 0; i < len; i++) diff |= (aa[i % (aa.length || 1)] || 0) ^ (bb[i % (bb.length || 1)] || 0);
  return diff === 0;
};
const slugify = (value) => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
const moneyCents = (value) => Math.round(Number(value) * 100);

async function readBody(request, maxBytes = 64_000) {
  const text = await request.text();
  if (text.length > maxBytes) throw Object.assign(new Error('Corpo da solicitação muito grande.'), { status: 413 });
  try { return text ? JSON.parse(text) : {}; }
  catch { throw Object.assign(new Error('JSON inválido.'), { status: 400 }); }
}
function cookieValue(request, key) {
  const raw = request.headers.get('cookie') || '';
  const part = raw.split(';').map((x) => x.trim()).find((x) => x.startsWith(`${key}=`));
  return part ? decodeURIComponent(part.slice(key.length + 1)) : '';
}
function cookieHeader(request, token = '', clear = false) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${clear ? '' : encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict${secure}; Max-Age=${clear ? 0 : SESSION_TTL_DAYS * 86400}`;
}
async function session(request, env) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return null;
  return env.DB.prepare('SELECT actor_id, actor_role, expires_at FROM sessions WHERE token_hash=? AND expires_at>?').bind(await digest(token), nowIso()).first();
}
async function requireRole(request, env, role = 'customer') {
  const current = await session(request, env);
  if (!current || (role !== 'any' && current.actor_role !== role)) return null;
  return current;
}
async function startSession(env, actorId, role) {
  const token = `${randomId()}${randomId().replaceAll('-', '')}`;
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86400_000).toISOString();
  await env.DB.prepare('INSERT INTO sessions(token_hash,actor_id,actor_role,expires_at) VALUES(?,?,?,?)')
    .bind(await digest(token), actorId, role, expiresAt).run();
  return token;
}
async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const result = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(salt), iterations: 210_000 }, key, 256);
  return bytesToHex(result);
}
async function requireBot(request, env) {
  const expected = env.BOT_SHARED_SECRET;
  if (!expected) return true;
  const received = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  return Boolean(received && safeEqual(await digest(received), await digest(expected)));
}
async function rateLimit(env, request, action, limit = 20, seconds = 60) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const bucket = `${action}:${await digest(ip)}`;
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare('SELECT hits,window_started_at FROM rate_limits WHERE bucket=?').bind(bucket).first();
  if (!row || now - row.window_started_at >= seconds) {
    await env.DB.prepare('INSERT INTO rate_limits(bucket,hits,window_started_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET hits=1,window_started_at=excluded.window_started_at').bind(bucket, now).run();
    return true;
  }
  if (row.hits >= limit) return false;
  await env.DB.prepare('UPDATE rate_limits SET hits=hits+1 WHERE bucket=?').bind(bucket).run();
  return true;
}
async function encryptPayload(env, payload) {
  if (!env.DELIVERY_ENCRYPTION_KEY) throw new Error('A chave de criptografia de entregas não está configurada.');
  const keyBytes = base64ToBytes(env.DELIVERY_ENCRYPTION_KEY);
  if (keyBytes.length !== 32) throw new Error('DELIVERY_ENCRYPTION_KEY precisa ser uma chave Base64 de 32 bytes.');
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(payload)));
  return { encrypted: bytesToBase64(encrypted), iv: bytesToBase64(iv) };
}
async function decryptPayload(env, row) {
  if (!env.DELIVERY_ENCRYPTION_KEY) throw new Error('Chave de entrega indisponível.');
  const key = await crypto.subtle.importKey('raw', base64ToBytes(env.DELIVERY_ENCRYPTION_KEY), 'AES-GCM', false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(row.iv) }, key, base64ToBytes(row.encrypted_payload));
  return JSON.parse(new TextDecoder().decode(plain));
}
async function getSetting(env, key) {
  const row = await env.DB.prepare('SELECT encrypted_payload,iv FROM settings WHERE key=?').bind(key).first();
  if (!row) return '';
  try { return String((await decryptPayload(env, row)).value || ''); } catch { return ''; }
}
async function setSetting(env, key, value) {
  const encrypted = await encryptPayload(env, { value });
  await env.DB.prepare('INSERT INTO settings(key,encrypted_payload,iv,updated_at) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET encrypted_payload=excluded.encrypted_payload,iv=excluded.iv,updated_at=excluded.updated_at').bind(key, encrypted.encrypted, encrypted.iv, nowIso()).run();
}
async function mpAccessToken(env) { return (await getSetting(env, 'mp_access_token')) || env.MP_ACCESS_TOKEN || ''; }

function priceLabel(cents) { return (Number(cents) / 100).toFixed(2); }
function publicProduct(row, stock = null) {
  return {
    id: row.id, slug: row.slug, name: row.name, category: row.category,
    description: row.description, price: Number(row.price_cents) / 100,
    duration: row.duration_label, deliveryMode: row.delivery_mode,
    image: row.image_url, stock, active: Boolean(row.active),
  };
}
async function catalog(env) {
  const { results = [] } = await env.DB.prepare('SELECT * FROM products WHERE active=1 ORDER BY category,name').all();
  const products = await Promise.all(results.map(async (p) => {
    let stock = null;
    if (p.delivery_mode === 'automatic') {
      const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM inventory WHERE product_id=? AND status='available'").bind(p.id).first();
      stock = Number(count?.n || 0);
    }
    return publicProduct(p, stock);
  }));
  return { products, categories: [...new Set(products.map((p) => p.category))] };
}
async function ownsOrder(env, orderId, current) {
  if (current.actor_role === 'admin') return env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(orderId).first();
  return env.DB.prepare('SELECT * FROM orders WHERE id=? AND user_id=?').bind(orderId, current.actor_id).first();
}
async function orderSummary(env, order, includeCredentials = false) {
  const { results: items = [] } = await env.DB.prepare('SELECT * FROM order_items WHERE order_id=?').bind(order.id).all();
  const output = { ...order, items: items.map((x) => ({
    id: x.id, productId: x.product_id, productName: x.product_name, category: x.category,
    price: Number(x.unit_price_cents) / 100, quantity: x.quantity, duration: x.duration_label,
    deliveryMode: x.delivery_mode,
  })) };
  if (includeCredentials && order.status === 'paid') {
    const { results: stock = [] } = await env.DB.prepare("SELECT encrypted_payload,iv FROM inventory WHERE order_id=? AND status='delivered'").bind(order.id).all();
    output.deliveredAccounts = await Promise.all(stock.map((row) => decryptPayload(env, row)));
  }
  const conversation = await env.DB.prepare('SELECT id,discord_thread_id,created_at FROM conversations WHERE order_id=?').bind(order.id).first();
  output.conversation = conversation ? { id: conversation.id, available: true, updatedAt: conversation.created_at } : null;
  return output;
}
async function userOrders(env, userId) {
  const { results = [] } = await env.DB.prepare('SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC LIMIT 100').bind(userId).all();
  return Promise.all(results.map(async (o) => {
    const summary = await orderSummary(env, o, true);
    return { id: summary.id, status: summary.status, amount_cents: summary.amount_cents, currency: summary.currency, paid_at: summary.paid_at, created_at: summary.created_at, expires_at: summary.expires_at, items: summary.items, deliveredAccounts: summary.deliveredAccounts, conversation: summary.conversation };
  }));
}
async function checkMpSignature(request, env, dataId) {
  if (!env.MP_WEBHOOK_SECRET) return false;
  const signature = request.headers.get('x-signature') || '';
  const requestId = request.headers.get('x-request-id') || '';
  const parts = Object.fromEntries(signature.split(',').map((p) => p.trim().split('=')));
  if (!parts.ts || !parts.v1 || !requestId || !dataId) return false;
  const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${parts.ts};`;
  const key = await crypto.subtle.importKey('raw', encoder.encode(env.MP_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = bytesToHex(await crypto.subtle.sign('HMAC', key, encoder.encode(manifest)));
  return safeEqual(expected.toLowerCase(), parts.v1.toLowerCase());
}
async function processPaymentWebhook(request, env, url) {
  let payload = {};
  try { payload = await request.json(); } catch {}
  const paymentId = url.searchParams.get('data.id') || url.searchParams.get('id') || payload?.data?.id;
  const topic = payload?.type || payload?.topic || url.searchParams.get('topic');
  if (topic && !['payment','payment.created','payment.updated'].includes(topic)) return json({ ok: true, ignored: true });
  if (!paymentId) return json({ ok: true, ignored: true });
  const accessToken = await mpAccessToken(env);
  if (!accessToken) return fail('Mercado Pago não está configurado.', 503);
  if (!(await checkMpSignature(request, env, paymentId))) return fail('Assinatura do pagamento inválida.', 401);
  const verify = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!verify.ok) return fail('Não foi possível confirmar o pagamento.', 502);
  const payment = await verify.json();
  const orderId = String(payment.external_reference || '');
  const order = await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(orderId).first();
  if (!order || Math.round(Number(payment.transaction_amount) * 100) !== Number(order.amount_cents) || payment.currency_id !== 'BRL') return fail('Pagamento não corresponde ao pedido.', 409);
  const eventId = `${paymentId}:${payment.status}:${payment.status_detail || ''}`;
  const prior = await env.DB.prepare('SELECT event_id FROM webhook_events WHERE event_id=?').bind(eventId).first();
  if (prior || (order.status === 'paid' && payment.status === 'approved')) return json({ ok: true, duplicate: true });
  if (payment.status === 'approved') {
    const { results: items = [] } = await env.DB.prepare("SELECT * FROM order_items WHERE order_id=? AND delivery_mode='automatic'").bind(orderId).all();
    const hasManual = await env.DB.prepare("SELECT COUNT(*) AS n FROM order_items WHERE order_id=? AND delivery_mode='manual'").bind(orderId).first();
    await env.DB.prepare("UPDATE orders SET status='paid',mp_payment_id=?,buyer_email=?,paid_at=? WHERE id=? AND status IN ('pending','cancelled','fulfillment_pending')")
      .bind(String(paymentId), payment.payer?.email || null, nowIso(), orderId).run();
    await env.DB.prepare("UPDATE inventory SET status='delivered',delivered_at=? WHERE order_id=? AND status='reserved'").bind(nowIso(), orderId).run();
    if (Number(hasManual?.n || 0) > 0) {
      await env.DB.prepare('INSERT OR IGNORE INTO conversations(id,order_id) VALUES(?,?)').bind(orderId, orderId).run();
    }
    for (const item of items) {
      const reserved = await env.DB.prepare("SELECT COUNT(*) AS n FROM inventory WHERE order_id=? AND product_id=? AND status='delivered'").bind(orderId, item.product_id).first();
      if (Number(reserved?.n || 0) < Number(item.quantity)) {
        await env.DB.prepare("UPDATE orders SET status='fulfillment_pending' WHERE id=?").bind(orderId).run();
        break;
      }
    }
  } else if (['rejected','cancelled','refunded','charged_back'].includes(payment.status)) {
    const status = payment.status === 'refunded' || payment.status === 'charged_back' ? 'refunded' : 'cancelled';
    await env.DB.prepare('UPDATE orders SET status=? WHERE id=? AND status IN (\'pending\',\'paid\')').bind(status, orderId).run();
    await env.DB.prepare("UPDATE inventory SET status='available',order_id=NULL WHERE order_id=? AND status='reserved'").bind(orderId).run();
  }
  await env.DB.prepare('INSERT OR IGNORE INTO webhook_events(event_id,payment_id,event_type) VALUES(?,?,?)').bind(eventId, paymentId, `payment.${payment.status}`).run();
  return json({ ok: true });
}
async function createCheckout(request, env, current, url) {
  const accessToken = await mpAccessToken(env);
  if (!accessToken) return fail('Configure o token do Mercado Pago no painel administrativo.', 503);
  const body = await readBody(request); const requested = Array.isArray(body.items) ? body.items.slice(0, 20) : [];
  if (!requested.length) return fail('Seu carrinho está vazio.');
  const items = [];
  for (const line of requested) {
    const qty = Math.max(1, Math.min(10, Number.parseInt(line.quantity, 10) || 1));
    const product = await env.DB.prepare('SELECT * FROM products WHERE id=? AND active=1').bind(String(line.productId || '')).first();
    if (!product) return fail('Um produto do carrinho não está mais disponível.', 409);
    const stock = product.delivery_mode === 'automatic' ? Number((await env.DB.prepare("SELECT COUNT(*) AS n FROM inventory WHERE product_id=? AND status='available'").bind(product.id).first())?.n || 0) : 999;
    if (stock < qty) return fail(`Estoque insuficiente para ${product.name}.`, 409);
    items.push({ product, qty });
  }
  const orderId = randomId(); const total = items.reduce((sum, x) => sum + Number(x.product.price_cents) * x.qty, 0); const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
  await env.DB.prepare("UPDATE inventory SET status='available',order_id=NULL WHERE status='reserved' AND order_id IN (SELECT id FROM orders WHERE status='pending' AND expires_at<?)").bind(nowIso()).run();
  await env.DB.prepare("UPDATE orders SET status='cancelled' WHERE status='pending' AND expires_at<?").bind(nowIso()).run();
  const buyerEmail = (await env.DB.prepare('SELECT email FROM users WHERE id=?').bind(current.actor_id).first())?.email || null;
  await env.DB.prepare("INSERT INTO orders(id,user_id,status,amount_cents,buyer_email,expires_at) VALUES(?,?, 'pending',?,?,?)").bind(orderId, current.actor_id, total, buyerEmail, expiresAt).run();
  for (const item of items) {
    await env.DB.prepare('INSERT INTO order_items(id,order_id,product_id,product_name,category,unit_price_cents,quantity,duration_label,delivery_mode) VALUES(?,?,?,?,?,?,?,?,?)').bind(randomId(), orderId, item.product.id, item.product.name, item.product.category, item.product.price_cents, item.qty, item.product.duration_label, item.product.delivery_mode).run();
    if (item.product.delivery_mode === 'automatic') {
      await env.DB.prepare("UPDATE inventory SET status='reserved',order_id=? WHERE id IN (SELECT id FROM inventory WHERE product_id=? AND status='available' ORDER BY created_at LIMIT ?) RETURNING id").bind(orderId, item.product.id, item.qty).all();
      const reservedCount = Number((await env.DB.prepare("SELECT COUNT(*) AS n FROM inventory WHERE order_id=? AND product_id=? AND status='reserved'").bind(orderId, item.product.id).first())?.n || 0);
      if (reservedCount !== item.qty) { await env.DB.prepare("UPDATE inventory SET status='available',order_id=NULL WHERE order_id=? AND status='reserved'").bind(orderId).run(); await env.DB.prepare("UPDATE orders SET status='cancelled' WHERE id=?").bind(orderId).run(); return fail(`Estoque insuficiente para ${item.product.name}.`, 409); }
    }
  }
  const payment = await fetch('https://api.mercadopago.com/v1/payments', { method: 'POST', headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json', 'x-idempotency-key': orderId }, body: JSON.stringify({ transaction_amount: Number(priceLabel(total)), description: items.map(({ product, qty }) => `${product.name} x${qty}`).join(', '), payment_method_id: 'pix', payer: { email: buyerEmail || 'cliente@rynex10k.com' }, external_reference: orderId, date_of_expiration: expiresAt }) });
  const result = await payment.json().catch(() => ({}));
  if (!payment.ok || !result.id || !result.point_of_interaction?.transaction_data?.qr_code) { await env.DB.prepare("UPDATE inventory SET status='available',order_id=NULL WHERE order_id=? AND status='reserved'").bind(orderId).run(); await env.DB.prepare("UPDATE orders SET status='cancelled' WHERE id=?").bind(orderId).run(); console.error('Mercado Pago Pix error', payment.status); return fail('Não foi possível gerar o Pix. Tente novamente ou fale com o suporte.', 502); }
  const transaction = result.point_of_interaction.transaction_data;
  await env.DB.prepare('UPDATE orders SET mp_payment_id=? WHERE id=?').bind(String(result.id), orderId).run();
  return json({ orderId, qrCode: transaction.qr_code, qrCodeBase64: transaction.qr_code_base64 || '', ticketUrl: transaction.ticket_url || '', expiresAt });
}

async function pollPayment(env, order) {
  const accessToken = await mpAccessToken(env); if (!accessToken || !order.mp_payment_id || !['pending','fulfillment_pending'].includes(order.status)) return;
  const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(order.mp_payment_id)}`, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!response.ok) return; const payment = await response.json();
  if (payment.status === 'approved') {
    const { results: items = [] } = await env.DB.prepare("SELECT * FROM order_items WHERE order_id=? AND delivery_mode='automatic'").bind(order.id).all();
    const hasManual = await env.DB.prepare("SELECT COUNT(*) AS n FROM order_items WHERE order_id=? AND delivery_mode='manual'").bind(order.id).first();
    await env.DB.prepare("UPDATE orders SET status='paid',paid_at=?,buyer_email=? WHERE id=? AND status IN ('pending','fulfillment_pending')").bind(nowIso(), payment.payer?.email || order.buyer_email || null, order.id).run();
    await env.DB.prepare("UPDATE inventory SET status='delivered',delivered_at=? WHERE order_id=? AND status='reserved'").bind(nowIso(), order.id).run();
    if (Number(hasManual?.n || 0) > 0) await env.DB.prepare('INSERT OR IGNORE INTO conversations(id,order_id) VALUES(?,?)').bind(order.id, order.id).run();
    for (const item of items) { const delivered = Number((await env.DB.prepare("SELECT COUNT(*) AS n FROM inventory WHERE order_id=? AND product_id=? AND status='delivered'").bind(order.id, item.product_id).first())?.n || 0); if (delivered < Number(item.quantity)) { await env.DB.prepare("UPDATE orders SET status='fulfillment_pending' WHERE id=?").bind(order.id).run(); break; } }
  } else if (['rejected','cancelled','refunded','charged_back'].includes(payment.status)) {
    const status = payment.status === 'refunded' || payment.status === 'charged_back' ? 'refunded' : 'cancelled';
    await env.DB.prepare("UPDATE orders SET status=? WHERE id=? AND status IN ('pending','paid')").bind(status, order.id).run();
    await env.DB.prepare("UPDATE inventory SET status='available',order_id=NULL WHERE order_id=? AND status='reserved'").bind(order.id).run();
  }
}

async function isOrderAccessible(env, id, current) {
  const order = await ownsOrder(env, id, current);
  if (!order) return null;
  if (!['paid','fulfillment_pending'].includes(order.status) && current.actor_role !== 'admin') return null;
  return order;
}
async function onApi({ request, env }) {
  if (!env.DB) return fail('Banco de dados não está conectado.', 503);
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
  const method = request.method.toUpperCase();
  if (method === 'GET' && path === 'health') return json({ ok: true, service: 'rynex-store' });
  if (method === 'GET' && path === 'catalog') return json(await catalog(env));
  if (method === 'POST' && path === 'payments/webhook') return processPaymentWebhook(request, env, url);

  if (method === 'GET' && path === 'auth/me') {
    const current = await requireRole(request, env, 'any');
    if (!current) return json({ user: null });
    const user = current.actor_role === 'customer' ? await env.DB.prepare('SELECT id,email FROM users WHERE id=?').bind(current.actor_id).first() : { id: 'admin', email: 'admin' };
    return json({ user: user ? { ...user, role: current.actor_role } : null });
  }
  if (method === 'POST' && path === 'auth/register') {
    if (!(await rateLimit(env, request, 'register', 6, 300))) return fail('Muitas tentativas. Aguarde alguns minutos.', 429);
    const body = await readBody(request);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return fail('Informe um e-mail válido.');
    if (password.length < 12 || password.length > 200) return fail('A senha precisa ter de 12 a 200 caracteres.');
    const exists = await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email).first();
    if (exists) return fail('Este e-mail já tem uma conta. Entre ou use outro e-mail.', 409);
    const id = randomId(); const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
    await env.DB.prepare('INSERT INTO users(id,email,password_salt,password_hash) VALUES(?,?,?,?)').bind(id, email, salt, await passwordHash(password, salt)).run();
    const token = await startSession(env, id, 'customer');
    return json({ user: { id, email, role: 'customer' } }, 201, { 'set-cookie': cookieHeader(request, token) });
  }
  if (method === 'POST' && path === 'auth/login') {
    if (!(await rateLimit(env, request, 'login', 10, 300))) return fail('Muitas tentativas. Aguarde alguns minutos.', 429);
    const body = await readBody(request);
    const email = String(body.email || '').trim().toLowerCase(); const password = String(body.password || '');
    const user = await env.DB.prepare('SELECT id,email,password_salt,password_hash FROM users WHERE email=?').bind(email).first();
    if (!user || !safeEqual(await passwordHash(password, user.password_salt), user.password_hash)) return fail('E-mail ou senha incorretos.', 401);
    const token = await startSession(env, user.id, 'customer');
    return json({ user: { id: user.id, email: user.email, role: 'customer' } }, 200, { 'set-cookie': cookieHeader(request, token) });
  }
  if (method === 'POST' && path === 'admin/login') {
    if (!(await rateLimit(env, request, 'admin-login', 6, 300))) return fail('Muitas tentativas. Aguarde alguns minutos.', 429);
    if (!env.ADMIN_ACCESS_KEY) return fail('A chave de administração ainda não foi configurada no Cloudflare.', 503);
    const body = await readBody(request);
    if (!safeEqual(await digest(String(body.key || '')), await digest(env.ADMIN_ACCESS_KEY))) return fail('Chave incorreta.', 401);
    const token = await startSession(env, 'admin', 'admin');
    return json({ user: { id: 'admin', role: 'admin' } }, 200, { 'set-cookie': cookieHeader(request, token) });
  }
  if (method === 'POST' && path === 'auth/logout') {
    const token = cookieValue(request, SESSION_COOKIE);
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(token)).run();
    return json({ ok: true }, 200, { 'set-cookie': cookieHeader(request, '', true) });
  }
  if (method === 'POST' && path === 'orders') {
    const current = await requireRole(request, env, 'customer');
    if (!current) return fail('Entre na sua conta antes de finalizar a compra.', 401);
    if (!(await rateLimit(env, request, 'checkout', 10, 60))) return fail('Muitas tentativas de compra. Aguarde um instante.', 429);
    return createCheckout(request, env, current, url);
  }
  if (method === 'GET' && path === 'orders/status') {
    const current = await requireRole(request, env, 'customer');
    if (!current) return fail('Faça login para ver seus pedidos.', 401);
    const { results = [] } = await env.DB.prepare('SELECT id,status,paid_at,created_at,expires_at,mp_payment_id,buyer_email FROM orders WHERE user_id=? ORDER BY created_at DESC LIMIT 100').bind(current.actor_id).all();
    for (const order of results) await pollPayment(env, order);
    const { results: fresh = [] } = await env.DB.prepare('SELECT id,status,paid_at,created_at,expires_at FROM orders WHERE user_id=? ORDER BY created_at DESC LIMIT 100').bind(current.actor_id).all();
    return json({ orders: fresh });
  }
  if (method === 'GET' && path === 'orders') {
    const current = await requireRole(request, env, 'customer');
    if (!current) return fail('Faça login para ver seus pedidos.', 401);
    return json({ orders: await userOrders(env, current.actor_id) });
  }
  const orderChatMatch = path.match(/^orders\/([0-9a-f-]+)\/messages$/i);
  if (orderChatMatch && method === 'GET') {
    const current = await requireRole(request, env, 'any');
    if (!current) return fail('Faça login para acessar o atendimento.', 401);
    const order = await isOrderAccessible(env, orderChatMatch[1], current);
    if (!order) return fail('Atendimento indisponível para este pedido.', 404);
    const { results = [] } = await env.DB.prepare('SELECT m.id,m.sender_role,m.sender_label,m.body,m.created_at FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.order_id=? ORDER BY m.id ASC LIMIT 500').bind(order.id).all();
    return json({ messages: results });
  }
  if (orderChatMatch && method === 'POST') {
    const current = await requireRole(request, env, 'customer');
    if (!current) return fail('Faça login para enviar uma mensagem.', 401);
    if (!(await rateLimit(env, request, 'chat', 30, 60))) return fail('Aguarde antes de enviar novas mensagens.', 429);
    const body = await readBody(request); const text = String(body.message || '').trim();
    if (!text || text.length > 4000) return fail('A mensagem deve ter entre 1 e 4.000 caracteres.');
    const order = await isOrderAccessible(env, orderChatMatch[1], current);
    if (!order) return fail('Atendimento indisponível para este pedido.', 404);
    const conversation = await env.DB.prepare('SELECT id FROM conversations WHERE order_id=?').bind(order.id).first();
    if (!conversation) return fail('Este pedido não possui atendimento aberto.', 404);
    await env.DB.prepare('INSERT INTO messages(conversation_id,sender_role,sender_label,body) VALUES(?,?,?,?)').bind(conversation.id, 'customer', current.actor_id, text).run();
    await env.DB.prepare('UPDATE conversations SET updated_at=? WHERE id=?').bind(nowIso(), conversation.id).run();
    return json({ ok: true }, 201);
  }

  if (path.startsWith('admin/')) {
    const admin = await requireRole(request, env, 'admin');
    if (!admin) return fail('Acesso administrativo necessário.', 401);
    if (method === 'POST' && path === 'admin/settings/mercadopago') {
      const body = await readBody(request); const token = String(body.accessToken || '').trim();
      if (token.length < 20 || token.length > 4096) return fail('Informe um Access Token válido do Mercado Pago.');
      await setSetting(env, 'mp_access_token', token);
      return json({ ok: true, configured: true });
    }
    if (method === 'GET' && path === 'admin/settings') {
      return json({ mercadoPagoConfigured: Boolean(await mpAccessToken(env)) });
    }
    if (method === 'GET' && path === 'admin/products') {
      const { results = [] } = await env.DB.prepare('SELECT * FROM products ORDER BY updated_at DESC').all();
      const products = await Promise.all(results.map(async (p) => {
        const counts = await env.DB.prepare("SELECT SUM(CASE WHEN status='available' THEN 1 ELSE 0 END) AS available,SUM(CASE WHEN status='delivered' THEN 1 ELSE 0 END) AS delivered FROM inventory WHERE product_id=?").bind(p.id).first();
        return { ...publicProduct(p, p.delivery_mode === 'automatic' ? Number(counts?.available || 0) : null), deliveredCount: Number(counts?.delivered || 0) };
      }));
      return json({ products });
    }
    if (method === 'POST' && path === 'admin/products') {
      const body = await readBody(request);
      const name = String(body.name || '').trim().slice(0, 140); const category = String(body.category || '').trim().slice(0, 80);
      const description = String(body.description || '').trim().slice(0, 5000); const priceCents = moneyCents(body.price);
      const mode = body.deliveryMode === 'manual' ? 'manual' : body.deliveryMode === 'automatic' ? 'automatic' : '';
      if (!name || !category || !mode || !Number.isSafeInteger(priceCents) || priceCents < 1) return fail('Preencha nome, categoria, preço válido e tipo de entrega.');
      const baseSlug = slugify(body.slug || name) || randomId().slice(0, 8); const slug = `${baseSlug}-${randomId().slice(0, 6)}`;
      const id = randomId();
      await env.DB.prepare('INSERT INTO products(id,slug,name,category,description,price_cents,duration_label,delivery_mode,image_url,active) VALUES(?,?,?,?,?,?,?,?,?,?)')
        .bind(id, slug, name, category, description, priceCents, String(body.duration || '').trim().slice(0, 120), mode, String(body.image || '').trim().slice(0, 1000), body.active === false ? 0 : 1).run();
      return json({ product: publicProduct(await env.DB.prepare('SELECT * FROM products WHERE id=?').bind(id).first(), 0) }, 201);
    }
    const productMatch = path.match(/^admin\/products\/([0-9a-f-]+)$/i);
    if (productMatch && method === 'PUT') {
      const body = await readBody(request); const id = productMatch[1];
      const existing = await env.DB.prepare('SELECT * FROM products WHERE id=?').bind(id).first();
      if (!existing) return fail('Produto não encontrado.', 404);
      const name = String(body.name ?? existing.name).trim().slice(0, 140); const category = String(body.category ?? existing.category).trim().slice(0, 80);
      const mode = body.deliveryMode ?? existing.delivery_mode; const priceCents = body.price === undefined ? existing.price_cents : moneyCents(body.price);
      if (!name || !category || !['automatic','manual'].includes(mode) || !Number.isSafeInteger(priceCents) || priceCents < 1) return fail('Dados do produto inválidos.');
      await env.DB.prepare('UPDATE products SET name=?,category=?,description=?,price_cents=?,duration_label=?,delivery_mode=?,image_url=?,active=?,updated_at=? WHERE id=?')
        .bind(name, category, String(body.description ?? existing.description).trim().slice(0, 5000), priceCents,
          String(body.duration ?? existing.duration_label).trim().slice(0, 120), mode, String(body.image ?? existing.image_url).trim().slice(0, 1000), body.active === undefined ? existing.active : (body.active ? 1 : 0), nowIso(), id).run();
      return json({ product: publicProduct(await env.DB.prepare('SELECT * FROM products WHERE id=?').bind(id).first(), null) });
    }
    const stockMatch = path.match(/^admin\/products\/([0-9a-f-]+)\/stock$/i);
    if (stockMatch && method === 'POST') {
      const product = await env.DB.prepare('SELECT id,delivery_mode FROM products WHERE id=?').bind(stockMatch[1]).first();
      if (!product) return fail('Produto não encontrado.', 404);
      if (product.delivery_mode !== 'automatic') return fail('Estoque de credenciais só existe em produtos automáticos.');
      const body = await readBody(request);
      const payload = { login: String(body.login || '').trim().slice(0, 500), password: String(body.password || '').slice(0, 1000), email: String(body.email || '').trim().slice(0, 254), recovery: String(body.recovery || '').trim().slice(0, 1000), notes: String(body.notes || '').trim().slice(0, 2000) };
      if (!payload.login || !payload.password) return fail('Informe login e senha para o item de estoque.');
      const encrypted = await encryptPayload(env, payload);
      await env.DB.prepare('INSERT INTO inventory(id,product_id,encrypted_payload,iv,status) VALUES(?,?,?, ?,\'available\')').bind(randomId(), product.id, encrypted.encrypted, encrypted.iv).run();
      return json({ ok: true }, 201);
    }
    const fulfillMatch = path.match(/^admin\/orders\/([0-9a-f-]+)\/fulfill$/i);
    if (fulfillMatch && method === 'POST') {
      const orderId = fulfillMatch[1];
      const order = await env.DB.prepare('SELECT id,status FROM orders WHERE id=?').bind(orderId).first();
      if (!order) return fail('Pedido não encontrado.', 404);
      if (order.status !== 'fulfillment_pending') return fail('Este pedido não está aguardando entrega manual.', 409);
      const { results: lines = [] } = await env.DB.prepare("SELECT product_id,SUM(quantity) AS quantity FROM order_items WHERE order_id=? AND delivery_mode='automatic' GROUP BY product_id").bind(orderId).all();
      for (const line of lines) {
        const delivered = Number((await env.DB.prepare("SELECT COUNT(*) AS n FROM inventory WHERE order_id=? AND product_id=? AND status='delivered'").bind(orderId, line.product_id).first())?.n || 0);
        const reserved = Number((await env.DB.prepare("SELECT COUNT(*) AS n FROM inventory WHERE order_id=? AND product_id=? AND status='reserved'").bind(orderId, line.product_id).first())?.n || 0);
        const needed = Number(line.quantity) - delivered - reserved;
        if (needed > 0) {
          await env.DB.prepare("UPDATE inventory SET status='reserved',order_id=? WHERE id IN (SELECT id FROM inventory WHERE product_id=? AND status='available' ORDER BY created_at LIMIT ?) RETURNING id").bind(orderId, line.product_id, needed).all();
          const nowReserved = Number((await env.DB.prepare("SELECT COUNT(*) AS n FROM inventory WHERE order_id=? AND product_id=? AND status='reserved'").bind(orderId, line.product_id).first())?.n || 0);
          if (nowReserved < Number(line.quantity) - delivered) return fail('Ainda não há estoque suficiente para concluir a entrega deste pedido.', 409);
        }
      }
      await env.DB.prepare("UPDATE inventory SET status='delivered',delivered_at=? WHERE order_id=? AND status='reserved'").bind(nowIso(), orderId).run();
      await env.DB.prepare("UPDATE orders SET status='paid' WHERE id=? AND status='fulfillment_pending'").bind(orderId).run();
      return json({ ok: true });
    }
    if (method === 'GET' && path === 'admin/orders') {
      const { results = [] } = await env.DB.prepare('SELECT o.*,u.email FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.created_at DESC LIMIT 250').all();
      const orders = await Promise.all(results.map((o) => orderSummary(env, o, false)));
      return json({ orders });
    }
    if (method === 'GET' && path === 'admin/conversations') {
      const { results = [] } = await env.DB.prepare("SELECT c.id,c.order_id,c.discord_thread_id,c.updated_at,o.status,o.created_at,u.email FROM conversations c JOIN orders o ON o.id=c.order_id JOIN users u ON u.id=o.user_id ORDER BY c.updated_at DESC LIMIT 200").all();
      return json({ conversations: results });
    }
    return fail('Rota administrativa não encontrada.', 404);
  }

  if (path.startsWith('bot/')) {
    if (!(await rateLimit(env, request, 'bot', 120, 60))) return fail('Limite do bot atingido.', 429);
    if (!(await requireBot(request, env))) return fail('Autenticação do bot inválida.', 401);
    if (method === 'GET' && path === 'bot/orders') {
      const { results = [] } = await env.DB.prepare("SELECT c.order_id,c.discord_thread_id,c.created_at,o.user_id,o.paid_at,u.email FROM conversations c JOIN orders o ON o.id=c.order_id JOIN users u ON u.id=o.user_id WHERE o.status IN ('paid','fulfillment_pending') ORDER BY c.created_at ASC LIMIT 100").all();
      const orders = await Promise.all(results.map(async (row) => {
        const { results: items = [] } = await env.DB.prepare("SELECT product_name,quantity,duration_label FROM order_items WHERE order_id=? AND delivery_mode='manual'").bind(row.order_id).all();
        return { ...row, items };
      }));
      return json({ orders });
    }
    const threadMatch = path.match(/^bot\/orders\/([0-9a-f-]+)\/thread$/i);
    if (threadMatch && method === 'PUT') {
      const body = await readBody(request); const threadId = String(body.discordThreadId || '').trim();
      if (!/^\d{15,22}$/.test(threadId)) return fail('ID de tópico Discord inválido.');
      await env.DB.prepare('UPDATE conversations SET discord_thread_id=?,updated_at=? WHERE order_id=?').bind(threadId, nowIso(), threadMatch[1]).run();
      return json({ ok: true });
    }
    if (method === 'GET' && path === 'bot/messages') {
      const after = Math.max(0, Number.parseInt(url.searchParams.get('after') || '0', 10) || 0);
      const { results = [] } = await env.DB.prepare("SELECT m.id,m.body,m.created_at,c.order_id,c.discord_thread_id FROM messages m JOIN conversations c ON c.id=m.conversation_id JOIN orders o ON o.id=c.order_id WHERE m.id>? AND m.sender_role='customer' AND o.status IN ('paid','fulfillment_pending') ORDER BY m.id ASC LIMIT 100").bind(after).all();
      return json({ messages: results });
    }
    if (method === 'POST' && path === 'bot/messages') {
      const body = await readBody(request); const orderId = String(body.orderId || ''); const text = String(body.message || '').trim();
      const discordMessageId = String(body.discordMessageId || '').trim();
      if (!text || text.length > 4000 || !/^\d{15,22}$/.test(discordMessageId)) return fail('Mensagem inválida.');
      const conversation = await env.DB.prepare("SELECT c.id FROM conversations c JOIN orders o ON o.id=c.order_id WHERE c.order_id=? AND o.status IN ('paid','fulfillment_pending')").bind(orderId).first();
      if (!conversation) return fail('Atendimento não encontrado.', 404);
      await env.DB.prepare("INSERT OR IGNORE INTO messages(conversation_id,sender_role,sender_label,body,discord_message_id) VALUES(?,'admin','Suporte Rynex',?,?)").bind(conversation.id, text, discordMessageId).run();
      await env.DB.prepare('UPDATE conversations SET updated_at=? WHERE id=?').bind(nowIso(), conversation.id).run();
      return json({ ok: true }, 201);
    }
    return fail('Rota privada do bot não encontrada.', 404);
  }
  return fail('Rota não encontrada.', 404);
}

export async function onRequest(context) {
  const { request } = context;
  if (!['GET','POST','PUT'].includes(request.method.toUpperCase())) return fail('Método não permitido.', 405, { allow: 'GET, POST, PUT' });
  if (request.method !== 'GET' && request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return fail('Origem não permitida.', 403);
  try { return await onApi(context); }
  catch (error) {
    console.error('Rynex API failure', error?.status || 500, error?.message || 'unknown');
    return fail(error?.status === 413 ? error.message : 'Ocorreu um erro interno. Tente novamente.', error?.status || 500);
  }
}
