import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, scryptSync } from 'node:crypto';
import { openCatalog, upsertGames } from '../src/catalog/catalog.js';
import { accountEmailDelivery } from '../src/community/accountEmail.js';
import { createApp } from '../src/server.js';
import { testMailbox } from '../test-support/accountEmail.js';

const password = 'Órbitas!47-Luas';
const credentials = { name: 'Jogador Lunar', email: 'jogador@example.com', password, passwordConfirmation: password };
const nextPassword = 'Cometas!93-Névoa';
const newPassword = { password: nextPassword, passwordConfirmation: nextPassword };
const hash = (token) => createHash('sha256').update(token).digest('hex');

test('Brevo sends both account emails and rejects provider failures', async () => {
  const env = { AUTH_EMAIL_PROVIDER: 'brevo', BREVO_API_KEY: 'test-brevo',
    AUTH_EMAIL_FROM: 'BuscaGames <sender@example.com>', PUBLIC_SITE_URL: 'https://buscagames.example' };
  assert.equal(accountEmailDelivery({ ...env, BREVO_API_KEY: '' }), null);
  assert.equal(accountEmailDelivery({ ...env, AUTH_EMAIL_PROVIDER: 'unknown' }), null);
  for (const purpose of ['verify', 'reset']) {
    const deliver = accountEmailDelivery(env, async (url, request) => {
      assert.equal(url, 'https://api.brevo.com/v3/smtp/email');
      assert.equal(request.headers['api-key'], 'test-brevo');
      const body = JSON.parse(request.body);
      assert.deepEqual(body.sender, { name: 'BuscaGames', email: 'sender@example.com' });
      assert.deepEqual(body.to, [{ email: 'player@example.com' }]);
      assert.ok(body.textContent.includes('#' + 'a'.repeat(43)));
      assert.ok(body.htmlContent.includes(purpose === 'verify' ? '/verificar-email' : '/redefinir-senha'));
      return Response.json({ messageId: 'accepted' }, { status: 201 });
    });
    assert.equal(await deliver({ email: 'player@example.com', purpose, token: 'a'.repeat(43) }), true);
  }
  for (const response of [Response.json({}, { status: 401 }), Response.json({}, { status: 429 }), Response.json({})]) {
    const deliver = accountEmailDelivery(env, async () => response);
    assert.equal(await deliver({ email: 'player@example.com', purpose: 'reset', token: 'a'.repeat(43) }), false);
  }
});

async function setup(t, configured = true) {
  const db = openCatalog(':memory:');
  const mailbox = testMailbox();
  const app = createApp(db, false, configured ? mailbox.deliver : null);
  upsertGames(db, [{ id: 1, name: 'Órbita' }]);
  await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise((resolve) => app.close(resolve)); db.close(); });
  async function request(path, body, { cookie = '', method = body ? 'POST' : 'GET', headers = {} } = {}) {
    const response = await fetch(`http://127.0.0.1:${app.address().port}/api/${path}`, {
      method, headers: { 'Content-Type': 'application/json', 'X-BuscaGames-Request': '1', Cookie: cookie, ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, data: await response.json(), headers: response.headers,
      cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  return { db, mailbox, request };
}

test('configuration requires an explicit HTTPS site or local development address', async (t) => {
  const env = { AUTH_EMAIL_FROM: 'BuscaGames <conta@example.com>', RESEND_API_KEY: 'test' };
  for (const PUBLIC_SITE_URL of ['', 'http://public.example', 'https://host.example/user', 'https://user:pass@host.example', 'https://host.example/#x']) {
    assert.equal(accountEmailDelivery({ ...env, PUBLIC_SITE_URL }), null);
  }
  assert.ok(accountEmailDelivery({ ...env, PUBLIC_SITE_URL: 'http://localhost:5173' }));
  assert.equal(accountEmailDelivery({ ...env, PUBLIC_SITE_URL: 'http://localhost:5173', NODE_ENV: 'production' }), null);
  assert.ok(accountEmailDelivery({ ...env, PUBLIC_SITE_URL: 'http://localhost:8080', NODE_ENV: 'production', SESSION_COOKIE_SECURE: 'false' }));
  const { db, request } = await setup(t, false);
  assert.equal((await request('auth/register', credentials)).status, 503);
  assert.equal((await request('auth/forgot-password', credentials)).status, 503);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 0);
});

test('pending accounts require confirmation and can resend limited, expiring, single-use links', async (t) => {
  const { db, mailbox, request } = await setup(t);
  const registrationStarted = Date.now();
  const register = await request('auth/register', credentials, { headers: { 'X-Forwarded-Host': 'other.example' } });
  const registrationFinished = Date.now();
  assert.equal(register.status, 201);
  assert.deepEqual(register.data, { user: null, verificationRequired: true, emailSent: true });
  assert.equal(register.cookie, undefined);
  assert.equal((await request('auth/login', credentials)).status, 202);
  assert.equal((await request('auth/login', { ...credentials, password: 'incorrect' })).status, 401);
  const userId = db.prepare('SELECT id FROM users').get().id;
  const fakeSession = 'a'.repeat(64);
  db.prepare('INSERT INTO administrators VALUES (?)').run(userId);
  db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hash(fakeSession), userId, Date.now() + 60_000);
  assert.equal((await request('admin/login', credentials)).status, 403);
  assert.equal((await request('auth/me', null, { cookie: `bg_session=${fakeSession}` })).data.user, null);
  assert.equal((await request('games/igdb-1/favorite', { favorite: true }, { method: 'PUT', cookie: `bg_session=${fakeSession}` })).status, 401);

  const { link, html } = mailbox.messages[0];
  assert.equal(link.origin, 'https://buscagames.example');
  assert.equal(link.pathname, '/verificar-email');
  assert.equal(link.search, '');
  assert.match(html, /Verificar meu e-mail/);
  assert.ok(!html.includes(password));
  const token = mailbox.token(credentials.email);
  const stored = db.prepare('SELECT digest,expires FROM account_email_tokens').get();
  assert.equal(stored.digest, hash(token));
  assert.ok(stored.expires >= registrationStarted + 900_000 && stored.expires <= registrationFinished + 900_000);
  assert.equal((await request('auth/reset-password', { token, ...newPassword })).status, 400);
  assert.equal((await request('auth/verify-email')).status, 405);
  assert.equal((await request('auth/verify-email', { token }, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  assert.equal((await request('auth/resend-verification', credentials)).status, 202);
  assert.equal(mailbox.messages.length, 1);

  db.prepare('UPDATE account_email_tokens SET expires=0').run();
  assert.equal((await request('auth/verify-email', { token })).status, 400);
  assert.equal((await request('auth/resend-verification', credentials)).status, 202);
  const resent = mailbox.token(credentials.email);
  assert.notEqual(resent, token);
  const attempts = await Promise.all([request('auth/verify-email', { token: resent }), request('auth/verify-email', { token: resent })]);
  assert.deepEqual(attempts.map(({ status }) => status).sort(), [200, 400]);
  assert.ok(attempts.every(({ cookie }) => !cookie));
  const loggedIn = await request('auth/login', credentials);
  assert.equal(loggedIn.data.user.id, userId);
  assert.equal(loggedIn.data.user.emailVerified, true);
  for (let index = 0; index < 3; index++) assert.equal((await request('auth/resend-verification', credentials)).status, 202);
  const limited = await request('auth/resend-verification', credentials);
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('Retry-After')) > 0);
  assert.equal(mailbox.messages.length, 2);
});

test('password reset is generic, validates tokens and passwords, and revokes both session types atomically', async (t) => {
  const { db, mailbox, request } = await setup(t);
  await request('auth/register', credentials);
  await request('auth/verify-email', { token: mailbox.token(credentials.email) });
  const user = await request('auth/login', credentials);
  const anotherSession = await request('auth/login', credentials);
  db.prepare('INSERT INTO administrators VALUES (?)').run(user.data.user.id);
  const admin = await request('admin/login', credentials);
  await request('games/igdb-1/favorite', { favorite: true }, { cookie: user.cookie, method: 'PUT' });
  await request('games/igdb-1/comments', { body: 'Meu comentário' }, { cookie: user.cookie });

  const unknown = await request('auth/forgot-password', { email: 'unknown@example.com' });
  const eligible = await request('auth/forgot-password', { email: ' JOGADOR@EXAMPLE.COM ' });
  assert.equal(unknown.status, 202);
  assert.equal(unknown.status, eligible.status);
  assert.deepEqual(unknown.data, eligible.data);
  assert.equal(eligible.headers.get('Cache-Control'), 'no-store');
  assert.equal(mailbox.messages.length, 2);
  assert.equal(mailbox.messages.at(-1).link.pathname, '/redefinir-senha');
  const expired = mailbox.token(credentials.email);
  db.prepare("UPDATE account_email_tokens SET expires=0 WHERE purpose='reset'").run();
  assert.equal((await request('auth/reset-password', { token: expired, ...newPassword })).status, 400);
  await request('auth/forgot-password', credentials);
  const token = mailbox.token(credentials.email);
  assert.equal(db.prepare('SELECT digest FROM account_email_tokens').get().digest, hash(token));
  assert.equal((await request('auth/verify-email', { token })).status, 400);
  assert.equal((await request('auth/reset-password', { token, ...newPassword, passwordConfirmation: 'diferente' })).data.field, 'passwordConfirmation');
  assert.equal((await request('auth/reset-password', { token, password: 'Jogador nas nuvens', passwordConfirmation: 'Jogador nas nuvens' })).data.field, 'password');

  db.prepare("UPDATE account_email_tokens SET expires=? WHERE purpose='reset'").run(Date.now() + 830_000);
  await request('auth/forgot-password', credentials);
  const second = mailbox.token(credentials.email);
  assert.notEqual(second, token);
  const results = await Promise.all([token, second].map((value) => request('auth/reset-password', { token: value, ...newPassword })));
  assert.deepEqual(results.map(({ status }) => status).sort(), [200, 400]);
  assert.equal((await request('auth/reset-password', { token, ...newPassword })).status, 400);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM account_email_tokens').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0);
  assert.equal((await request('auth/me', null, { cookie: user.cookie })).data.user, null);
  assert.equal((await request('auth/me', null, { cookie: anotherSession.cookie })).data.user, null);
  assert.equal((await request('admin/dashboard', null, { cookie: admin.cookie })).status, 401);
  assert.equal((await request('auth/login', credentials)).status, 401);
  const relogin = await request('auth/login', { ...credentials, password: nextPassword });
  assert.equal(relogin.data.user.id, user.data.user.id);
  assert.deepEqual(relogin.data.user.favorites, ['igdb-1']);
  assert.equal(relogin.data.user.commentCount, 1);
});

test('legacy password accounts keep access and prove their mailbox from a valid session first', async (t) => {
  const { db, mailbox, request } = await setup(t);
  const legacy = scryptSync(password, 'test-salt', 64).toString('hex');
  db.prepare('INSERT INTO users VALUES (1,?,?,?,?)').run(credentials.name, credentials.email, legacy, 'test-salt');
  const loggedIn = await request('auth/login', credentials);
  assert.equal(loggedIn.data.user.emailVerified, false);
  assert.equal((await request('auth/resend-verification', credentials)).status, 202);
  assert.equal((await request('auth/forgot-password', credentials)).status, 202);
  assert.equal(mailbox.messages.length, 0);
  await request('auth/resend-verification', credentials, { cookie: loggedIn.cookie });
  await request('auth/verify-email', { token: mailbox.token(credentials.email) });
  assert.equal((await request('auth/me', null, { cookie: loggedIn.cookie })).data.user.emailVerified, true);
  await request('auth/forgot-password', credentials);
  assert.equal(mailbox.messages.at(-1).link.pathname, '/redefinir-senha');
});
