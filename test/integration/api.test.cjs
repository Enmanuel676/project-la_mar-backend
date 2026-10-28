// Ejecuta HTTP real y MongoDB temporal. No lee ni modifica la base de datos del despliegue.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtemp, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { once } = require('node:events');

Object.assign(process.env, {
  NODE_ENV: 'test', JWT_SECRET: 'integration-secret-only-for-temporary-local-tests',
  ADMIN_EMAILS: 'admin@example.test', ALLOWED_ORIGINS: 'https://admin.example.test',
  TRASH_RETENTION_DAYS: '7', GCS_BUCKET_NAME: 'temporary-test-bucket', LOG_LEVEL: 'error',
});
let mongo;
let mongoExit;
let directory;
let server;
let base;
let mongoose;
let User;
let Article;
let bucketStub;
const images = new Map();
async function freePort() {
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  return port;
}

before(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'lamar-mongo-integration-'));
  const port = await freePort();
  process.env.MONGODB_URI = `mongodb://127.0.0.1:${port}/lamar_integration`;
  mongo = spawn(process.env.MONGOD_BINARY || 'mongod', [
    '--dbpath', directory, '--port', String(port), '--bind_ip', '127.0.0.1',
    '--nounixsocket', '--logpath', path.join(directory, 'mongo.log'),
  ], { stdio: 'ignore' });
  mongoExit = once(mongo, 'exit');
  await new Promise((resolve, reject) => { mongo.once('spawn', resolve); mongo.once('error', reject); });
  const { Storage } = require('@google-cloud/storage');
  bucketStub = require('sinon').stub(Storage.prototype, 'bucket').callsFake(() => ({
    file: (name) => ({
      save: async (buffer) => images.set(name, buffer),
      delete: async () => images.delete(name),
    }),
  }));
  mongoose = require('mongoose');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  User = require('../../src/models/user');
  Article = require('../../src/models/article');
  await Promise.all([User.init(), Article.init()]);
  server = require('../../src/app').listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}/api`;
}, { timeout: 25000 });

after(async () => {
  if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
  if (mongoose) await mongoose.disconnect();
  if (bucketStub) bucketStub.restore();
  if (mongo && mongo.exitCode === null) { mongo.kill('SIGTERM'); await mongoExit; }
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function request(url, { method = 'GET', token, body, headers = {} } = {}) {
  const response = await fetch(base + url, {
    method, headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return { status: response.status, headers: response.headers, data: text ? JSON.parse(text) : null };
}
const password = 'A-test-password-123';
const signup = (email) => request('/signup', { method: 'POST', body: { firstName: 'Test', lastName: 'Account', email, password } });

test('Flujos reales de autorización, catálogo, imágenes y administración', async (t) => {
  let admin;
  let member;
  let second;
  let article;
  await t.test('health y CORS permiten configuración desde el panel', async () => {
    assert.equal((await request('/health')).status, 200);
    const preflight = await request('/config', { method: 'OPTIONS', headers: {
      Origin: 'https://admin.example.test', 'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'authorization',
    } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://admin.example.test');
    assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');
    const config = await request('/config', { headers: { Origin: 'https://admin.example.test' } });
    assert.deepEqual(config.data, { trashRetentionDays: 7 });
    const forbidden = await request('/config', { headers: { Origin: 'https://unknown.example.test' } });
    assert.equal(forbidden.headers.get('access-control-allow-origin'), null);
  });
  await t.test('registro, normalización del correo, login y rutas compatibles', async () => {
    assert.equal((await signup('admin@example.test')).status, 403);
    await User.create({ email: 'admin@example.test', name: 'Admin', role: 'admin', password: await require('bcrypt').hash(password, 10) });
    const a = await request('/signin', { method: 'POST', body: { email: ' ADMIN@example.test ', password } });
    assert.equal(a.status, 200); admin = a.data;
    assert.equal(admin.user.isAdmin, true);
    const m = await signup('member@example.test');
    assert.equal(m.status, 201); member = m.data;
    second = (await signup('second@example.test')).data;
    assert.equal((await signup('member@example.test')).status, 409);
    const logged = await request('/auth/signin', { method: 'POST', body: { email: ' MEMBER@example.test ', password }, headers: { 'X-Forwarded-Proto': 'https' } });
    assert.equal(logged.status, 200);
    assert.match(logged.headers.get('set-cookie'), /HttpOnly/);
    assert.match(logged.headers.get('set-cookie'), /Secure/);
    assert.equal((await request('/signin', { method: 'POST', body: { email: 'member@example.test', password: 'incorrect' } })).status, 401);
  });
  await t.test('rutas privadas y administración rechazan accesos sin permiso', async () => {
    assert.equal((await request('/articles')).status, 401);
    assert.equal((await request('/users', { token: member.token })).status, 403);
    assert.equal((await request('/users', { method: 'POST', token: member.token, body: {} })).status, 403);
    assert.equal((await request('/users/me', { token: member.token })).data.email, member.user.email);
  });
  await t.test('crear cuenta desde administración conserva la sesión y cookie del admin', async () => {
    const created = await request('/users', { method: 'POST', token: admin.token,
      headers: { Cookie: `lamar_token=${admin.token}` },
      body: { firstName: 'Created', lastName: 'By Admin', email: 'created@example.test', password },
    });
    assert.equal(created.status, 201);
    assert.equal(created.data.email, 'created@example.test');
    assert.equal(created.data.token, undefined);
    assert.equal(created.headers.get('set-cookie'), null);
    assert.equal((await request('/users/me', { token: admin.token })).data.email, 'admin@example.test');
  });
  await t.test('crear, listar y publicar un artículo con imagen y propiedad correcta', async () => {
    const image = await require('sharp')({ create: { width: 4, height: 4, channels: 3, background: '#ff0000' } }).png().toBuffer();
    const form = new FormData();
    for (const [key, value] of Object.entries({ name: 'Anillo de prueba', price: '25', category: 'Anillos', stock: '', published: 'true' })) form.append(key, value);
    form.append('image', new Blob([image], { type: 'image/png' }), 'test.png');
    const created = await request('/articles', { method: 'POST', token: member.token, body: form });
    assert.equal(created.status, 201); article = created.data;
    assert.equal(article.ownerId, member.user._id);
    assert.equal(article.stock, null);
    assert.equal(images.size, 1);
    assert.equal((await require('sharp')([...images.values()][0]).metadata()).format, 'webp');
    assert.equal((await request('/articles', { token: member.token })).data.length, 1);
    assert.equal((await request('/articles', { token: second.token })).data.length, 0);
    assert.equal((await request('/articles', { token: admin.token })).data.length, 1);
    const publicList = (await request('/public/articles')).data;
    assert.equal(publicList.length, 1);
    assert.equal(publicList[0].ownerEmail, undefined);
    assert.equal((await request(`/articles/${article.id}`, { method: 'PUT', token: second.token, body: { name: 'No permitido' } })).status, 404);
  });
  await t.test('edición, papelera, restauración y borrado definitivo', async () => {
    const updated = await request(`/articles/${article.id}`, { method: 'PUT', token: member.token, body: { price: 30 } });
    assert.equal(updated.data.price, 30);
    assert.equal((await request(`/articles/${article.id}/permanent`, { method: 'DELETE', token: member.token })).status, 404);
    assert.equal((await request(`/articles/${article.id}`, { method: 'DELETE', token: member.token })).status, 204);
    assert.equal((await request('/public/articles')).data.length, 0);
    assert.equal((await request('/articles/deleted', { token: member.token })).data.length, 1);
    const restored = await request(`/articles/${article.id}/restore`, { method: 'POST', token: member.token });
    assert.equal(restored.status, 200); assert.equal(restored.data.published, false);
    await request(`/articles/${article.id}`, { method: 'DELETE', token: member.token });
    assert.equal((await request(`/articles/${article.id}/permanent`, { method: 'DELETE', token: member.token })).status, 204);
    assert.equal(images.size, 0);
  });
  await t.test('la purga usa el mismo plazo que /config', async () => {
    const fields = { ownerId: member.user._id, name: 'Papelera', price: 1, category: 'Anillos' };
    await Article.create({ ...fields, deletedAt: new Date(Date.now() - 8 * 86400000) });
    const recent = await Article.create({ ...fields, deletedAt: new Date(Date.now() - 6 * 86400000) });
    await require('../../src/utils/purgeTrash').purgeTrash();
    const remaining = await Article.find();
    assert.equal(remaining.length, 1); assert.equal(String(remaining[0]._id), String(recent._id));
  });
  await t.test('usuarios: listado, cambio de datos, contraseña y borrado', async () => {
    assert.equal((await request('/users', { token: admin.token })).data.length, 4);
    assert.equal((await request(`/users/${admin.user._id}`, { method: 'DELETE', token: admin.token })).status, 400);
    assert.equal((await request(`/users/${admin.user._id}`, { method: 'PUT', token: admin.token, body: { role: 'user' } })).status, 400);
    const changed = await request(`/users/${member.user._id}`, { method: 'PUT', token: admin.token, body: { name: 'Updated member' } });
    assert.equal(changed.data.name, 'Updated member');
    assert.equal(changed.data.password, undefined);
    assert.equal((await request(`/users/${member.user._id}/change-password`, { method: 'POST', token: admin.token, body: { password: 'New-password-456' } })).status, 204);
    assert.equal((await request('/users/me', { token: member.token })).status, 401);
    const refreshed = await request('/signin', { method: 'POST', body: { email: member.user.email, password: 'New-password-456' } });
    assert.equal(refreshed.status, 200);
    assert.equal((await request('/users/me', { token: refreshed.data.token })).status, 200);
    assert.equal((await request(`/users/${member.user._id}`, { method: 'DELETE', token: admin.token })).status, 204);
    assert.equal((await request('/articles', { token: member.token })).status, 401);
    assert.equal((await request('/users/me', { token: member.token })).status, 401);
    assert.equal(await Article.countDocuments({ ownerId: member.user._id }), 0);
  });
  await t.test('seed:admin funciona y el servidor arranca y se apaga en producción', async () => {
    const { promisify } = require('node:util');
    const { execFile } = require('node:child_process');
    await promisify(execFile)(process.execPath, ['scripts/createAdmin.js'], {
      cwd: path.resolve(__dirname, '../..'),
      env: { ...process.env, NODE_ENV: 'production', ADMIN_EMAIL: 'seed@example.test', ADMIN_PASSWORD: password },
    });
    const seeded = await User.findOne({ email: 'seed@example.test' });
    assert.equal(seeded.role, 'admin');
    const port = await freePort();
    const child = spawn(process.execPath, ['src/server.js'], {
      cwd: path.resolve(__dirname, '../..'), stdio: 'ignore',
      env: { ...process.env, NODE_ENV: 'production', PORT: String(port) },
    });
    const exited = once(child, 'exit');
    try {
      let ready = false;
      for (let i = 0; i < 50; i += 1) {
        try { ready = (await fetch(`http://127.0.0.1:${port}/api/health`)).ok; } catch {}
        if (ready) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.equal(ready, true, 'El servidor de producción debe arrancar');
    } finally {
      child.kill('SIGTERM');
      const [code] = await exited;
      assert.equal(code, 0);
    }
  });
  await t.test('logout elimina la cookie y los intentos de login están limitados', async () => {
    const loggedOut = await request('/auth/logout', { method: 'POST', token: admin.token });
    assert.equal(loggedOut.status, 204);
    assert.match(loggedOut.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/);
    let response;
    for (let i = 0; i < 16; i += 1) response = await request('/signin', { method: 'POST', body: { email: 'unknown@example.test', password } });
    assert.equal(response.status, 429);
    assert.equal((await request('/config')).status, 200);
  });
});
