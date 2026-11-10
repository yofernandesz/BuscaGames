import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, scryptSync } from 'node:crypto';
import { openCatalog } from '../src/catalog/catalog.js';
import { createApp } from '../src/server.js';
import { validateAccount, passwordRequirements } from '../../shared/accountPolicy.mjs';

const password = 'café violeta lunar';
const credentials = { name: 'Ana', email: 'ana@example.com', password, passwordConfirmation: password };
const hash = (value) => createHash('sha256').update(value).digest('hex');

async function fixture(t) {
  const db = openCatalog(':memory:');
  let app;
  const start = async () => {
    app = createApp(db);
    await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
  };
  await start();
  t.after(async () => { await new Promise((resolve) => app.close(resolve)); db.close(); });
  return {
    db,
    restart: async () => { await new Promise((resolve) => app.close(resolve)); await start(); },
    async request(path, body, headers = {}, method = 'POST') {
      const response = await fetch(`http://127.0.0.1:${app.address().port}${path}`, {
        method, headers: { 'Content-Type': 'application/json', 'X-BuscaGames-Request': '1', ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie'), retry: response.headers.get('retry-after') };
    },
  };
}

test('registration policy: length, confirmation, common patterns, personal data and Unicode', () => {
  assert.equal(validateAccount(credentials, true), null);
  for (const length of [7, 8, 20, 21]) {
    const value = 'Lua!9xZ?' + 'v'.repeat(Math.max(0, length - 8));
    const candidate = value.slice(0, length);
    const result = validateAccount({ ...credentials, password: candidate, passwordConfirmation: candidate }, true);
    assert.equal(result?.field ?? null, length >= 8 && length <= 20 ? null : 'password');
  }
  for (const value of ['curta', 'x'.repeat(21), 'x'.repeat(128)]) {
    assert.equal(validateAccount({ email: credentials.email, password: value }, false), null);
  }
  for (const value of ['a'.repeat(15), '123456789012345', 'Password123456789!', 'qwertyqwertyqwerty', 'BuscaGames super secreto', 'abcdefghijklmnop', 'qwertyuiopasdfghjkl']) {
    assert.equal(validateAccount({ ...credentials, password: value, passwordConfirmation: value }, true).field, 'password');
  }
  for (const value of ['curta', 'ab'.repeat(65)]) assert.equal(validateAccount({ ...credentials, password: value }, true).field, 'password');
  assert.equal(validateAccount({ ...credentials, name: 'Mariana', password: 'Mariana em outro planeta' }, true).field, 'password');
  assert.equal(validateAccount({ ...credentials, passwordConfirmation: undefined }, true).field, 'passwordConfirmation');
  assert.equal(validateAccount({ ...credentials, passwordConfirmation: password + ' ' }, true).field, 'passwordConfirmation');
  for (const email of ['a..b@example.com', '.ana@example.com', 'ana@-example.com', 'ana@example..com', 'ana\0@example.com', 'a'.repeat(65) + '@example.com']) {
    assert.equal(validateAccount({ ...credentials, email }, true).field, 'email');
  }
  for (const name of [' ', 'A', 'A'.repeat(61), 'Ana\0Maria', 'Ana\u202eMaria']) assert.equal(validateAccount({ ...credentials, name }, true).field, 'name');
  const unicode = '🌌🚀🎮🎲🏆🌠🌙🌞🪐☄️✨🔥❄️🍀';
  assert.equal(passwordRequirements(unicode)[0].met, true);
  assert.equal(validateAccount({ ...credentials, password: unicode, passwordConfirmation: unicode }, true), null);
  assert.equal(validateAccount({ email: credentials.email, password: 'antiga' }, false), null);
});

test('API rejects bypasses and oversized requests; hashes secrets and rotates/revokes sessions', async (t) => {
  const { db, request } = await fixture(t);
  const register = (body, headers) => request('/api/auth/register', body, headers);
  for (const body of [null, [], { ...credentials, password: 'curta' }, { ...credentials, passwordConfirmation: 'diferente' }, { ...credentials, name: 'A\0B' }]) {
    assert.equal((await register(body)).status, 400);
  }
  assert.equal((await register(credentials, { 'X-BuscaGames-Request': '' })).status, 403);
  assert.equal((await register(credentials, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await register(credentials, { 'Content-Type': 'text/plain' })).status, 403);
  assert.equal((await register({ ...credentials, extra: 'x'.repeat(9000) })).status, 413);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 0);
  const created = await register({ ...credentials, email: ' ANA@EXAMPLE.COM ', role: 'admin', id: 99 });
  assert.equal(created.status, 201);
  assert.equal(created.data.user.email, credentials.email);
  assert.notEqual(created.data.user.id, 99);
  assert.equal(created.data.user.password_hash, undefined);
  assert.match(created.cookie, /HttpOnly; SameSite=Lax/);
  const stored = db.prepare('SELECT * FROM users').get();
  assert.match(stored.password_hash, /^scrypt-v2\$[a-f0-9]{128}$/);
  assert.equal(stored.salt.length, 32);
  const cookie = created.cookie.split(';')[0];
  assert.equal(db.prepare('SELECT token FROM sessions').get().token, hash(cookie.split('=')[1]));
  const duplicate = await register(credentials);
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.cookie, null);
  const logged = await request('/api/auth/login', credentials, { Cookie: cookie });
  assert.equal(logged.status, 200);
  assert.notEqual(logged.cookie, created.cookie);
  assert.equal((await request('/api/auth/me', undefined, { Cookie: cookie }, 'GET')).data.user, null);
  const nextCookie = logged.cookie.split(';')[0];
  await request('/api/auth/logout', {}, { Cookie: nextCookie });
  assert.equal((await request('/api/auth/me', undefined, { Cookie: nextCookie }, 'GET')).data.user, null);
  const unknown = await request('/api/auth/login', { email: 'unknown@example.com', password });
  const wrong = await request('/api/auth/login', { email: credentials.email, password: 'wrong' });
  assert.equal(unknown.status, 401);
  assert.deepEqual(unknown.data, wrong.data);
});

test('existing accounts outside the new length range can log in without profile changes', async (t) => {
  const { db, request } = await fixture(t);
  for (const [index, value] of ['curta', 'uma-senha-antiga-com-mais-de-vinte-caracteres'].entries()) {
    const email = `existing${index}@example.com`;
    const encoded = 'scrypt-v2$' + scryptSync(value, 'saved-salt', 64, { N: 16384, r: 8, p: 5 }).toString('hex');
    db.prepare('INSERT INTO users(name,email,password_hash,salt) VALUES (?,?,?,?)').run(`Jogador ${index}`, email, encoded, 'saved-salt');
    const before = db.prepare('SELECT * FROM users WHERE email=?').get(email);
    assert.equal((await request('/api/auth/login', { email, password: value })).status, 200);
    assert.deepEqual(db.prepare('SELECT * FROM users WHERE email=?').get(email), before);
  }
});

test('legacy passwords remain valid and upgrade only after authentication; Secure cookies and expiration', async (t) => {
  const { db, request } = await fixture(t);
  const previous = process.env.SESSION_COOKIE_SECURE;
  process.env.SESSION_COOKIE_SECURE = 'true';
  t.after(() => { if (previous === undefined) delete process.env.SESSION_COOKIE_SECURE; else process.env.SESSION_COOKIE_SECURE = previous; });
  const legacy = scryptSync('senha-antiga', 'old-salt', 64).toString('hex');
  db.prepare('INSERT INTO users(name,email,password_hash,salt) VALUES (?,?,?,?)').run('Ana', credentials.email, legacy, 'old-salt');
  assert.equal((await request('/api/auth/login', { email: credentials.email, password: 'wrong' })).status, 401);
  assert.equal(db.prepare('SELECT password_hash FROM users').get().password_hash, legacy);
  const logged = await request('/api/auth/login', { email: credentials.email, password: 'senha-antiga' });
  assert.equal(logged.status, 200);
  assert.match(logged.cookie, /; Secure/);
  assert.match(db.prepare('SELECT password_hash FROM users').get().password_hash, /^scrypt-v2\$/);
  assert.equal((await request('/api/auth/login', { email: credentials.email, password: 'senha-antiga' })).status, 200);
  db.prepare('UPDATE sessions SET expires=0').run();
  assert.equal((await request('/api/auth/me', undefined, { Cookie: logged.cookie.split(';')[0] }, 'GET')).data.user, null);
});

test('IP/account throttling survives restarts, expires and ignores spoofed forwarding headers', async (t) => {
  const { db, request, restart } = await fixture(t);
  for (let index = 0; index < 10; index++) {
    const response = await request('/api/auth/login', { email: credentials.email, password }, { 'X-Forwarded-For': `192.0.2.${index + 1}` });
    assert.equal(response.status, 401);
  }
  await restart();
  const limited = await request('/api/auth/login', { email: ' ANA@EXAMPLE.COM ', password });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.retry) > 0);
  assert.equal((await request('/api/auth/login', { email: 'other@example.com', password })).status, 401);
  db.prepare('UPDATE auth_attempts SET count=30 WHERE key=?').run(hash('ip:127.0.0.1'));
  assert.equal((await request('/api/auth/register', credentials, { 'X-BuscaGames-Client-IP': '192.0.2.99' })).status, 429);
  db.prepare('UPDATE auth_attempts SET expires=0').run();
  assert.equal((await request('/api/auth/register', credentials)).status, 201);
});

test('concurrent duplicate registrations create exactly one account', async (t) => {
  const { db, request } = await fixture(t);
  const responses = await Promise.all([request('/api/auth/register', credentials), request('/api/auth/register', credentials)]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 1);
});

test('nickname uniqueness rejects equivalent names and concurrent requests with different emails', async (t) => {
  const { db, request } = await fixture(t);
  const responses = await Promise.all(['Ána Maria', '  A\u0301NA  MARIA  '].map((name, index) =>
    request('/api/auth/register', { ...credentials, name, email: `player${index}@example.com` })));
  assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
  const rejected = responses.find(response => response.status === 409);
  assert.equal(rejected.data.field, 'name');
  assert.match(rejected.data.error, /nickname já está em uso/);
  assert.equal(rejected.cookie, null);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 1);
  for (const [index, name] of ['ÁNA MARIA', 'Ána\u00a0Maria', 'Áｎａ Maria'].entries()) {
    const response = await request('/api/auth/register', { ...credentials, name, email: `other${index}@example.com` });
    assert.equal(response.status, 409);
    assert.equal(response.data.field, 'name');
  }
  assert.equal((await request('/api/auth/register', { ...credentials, name: 'Ána Maria-2', email: 'distinct@example.com' })).status, 201);
});
