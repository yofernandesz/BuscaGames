import test from 'node:test';
import assert from 'node:assert/strict';
import { openCatalog, upsertGames } from '../src/catalog/catalog.js';
import { createApp } from '../src/server.js';
import { initializeCommunity } from '../src/community/community.js';

test('auth: favorites ownership, Google PKCE/state, replay, linking and callback recovery', async (t) => {
  const db = openCatalog(':memory:');
  upsertGames(db, [{ id: 1, name: 'Teste' }]);
  const app = createApp(db);
  await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.address().port}`;
  const realFetch = globalThis.fetch;
  const previous = Object.fromEntries(['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'GOOGLE_REDIRECT_URIS'].map((key) => [key, process.env[key]]));
  let expectedRedirect = `${base}/api/auth/google/callback`;
  let identity = { sub: 'google-1', name: 'Ana Google', picture: 'https://lh3.googleusercontent.com/ana', email: 'google@example.com', email_verified: true };
  let idToken;
  let failProvider = false;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).startsWith(base)) return realFetch(url, options);
    if (failProvider) return Response.json({}, { status: 503 });
    if (url === 'https://oauth2.googleapis.com/token') {
      assert.ok(options.body.get('code_verifier'));
      assert.equal(options.body.get('client_secret'), 'test-secret');
      assert.equal(options.body.get('redirect_uri'), expectedRedirect);
      return Response.json({ access_token: 'test-access', id_token: idToken });
    }
    assert.equal(url, 'https://openidconnect.googleapis.com/v1/userinfo');
    assert.equal(options.headers.Authorization, 'Bearer test-access');
    return Response.json(identity);
  });
  async function request(path, method = 'GET', body, cookie = '', headers = {}) {
    const response = await fetch(base + path, { method, redirect: 'manual', headers: {
      'Content-Type': 'application/json', 'X-BuscaGames-Request': '1', Cookie: cookie, ...headers,
    }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: response.status === 303 ? null : await response.json(),
      location: response.headers.get('location'), cookies: response.headers.getSetCookie().map((value) => value.split(';')[0]) };
  }
  async function start(body = {}, cookie = '') {
    const response = await request('/api/auth/google/start', 'POST', body, cookie);
    assert.equal(response.status, 200);
    const url = new URL(response.data.url);
    assert.equal(url.origin, 'https://accounts.google.com');
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(url.searchParams.get('scope'), 'openid email profile');
    assert.equal(url.searchParams.has('client_secret'), false);
    return { state: url.searchParams.get('state'), cookie: response.cookies[0], path: `/api/auth/google/callback?code=test&state=${url.searchParams.get('state')}` };
  }
  try {
    for (const key of Object.keys(previous)) delete process.env[key];
    assert.equal((await request('/api/auth/me')).data.googleEnabled, false);
    assert.equal((await request('/api/auth/google/start', 'POST', {})).status, 503);
    assert.equal((await request('/api/games/igdb-1/favorite', 'PUT', { favorite: true })).status, 401);
    Object.assign(process.env, { GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret', GOOGLE_REDIRECT_URI: `${base}/api/auth/google/callback` });
    const credentials = { name: 'Ana', email: 'ana@example.com', password: 'nuvem-lunar-unica', passwordConfirmation: 'nuvem-lunar-unica' };
    const registered = await request('/api/auth/register', 'POST', credentials);
    const cookie = registered.cookies[0];
    assert.equal((await request('/api/games/igdb-1/favorite', 'PUT', { favorite: true }, cookie)).status, 200);
    assert.deepEqual((await request('/api/games/igdb-1/favorite', 'PUT', { favorite: true }, cookie)).data.user.favorites, ['igdb-1']);
    assert.equal((await request('/api/games/igdb-1/favorite', 'PUT', { favorite: 'yes' }, cookie)).status, 400);
    assert.equal((await request('/api/auth/google/start', 'POST', { link: true })).status, 401);

    let flow = await start({ returnTo: '/biblioteca?q=Teste#jogos' });
    assert.match((await request(flow.path)).location, /google_failed/);
    let response = await request(flow.path, 'GET', undefined, flow.cookie);
    assert.equal(response.location, '/biblioteca?q=Teste&auth=google_success#jogos');
    const googleCookie = response.cookies.find((value) => value.startsWith('bg_session='));
    const googleUser = (await request('/api/auth/me', 'GET', undefined, googleCookie)).data.user;
    assert.equal(googleUser.googleLinked, true);
    assert.equal(googleUser.avatarUrl, identity.picture);
    const photo = 'iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAAAAADmVT4XAAAAJklEQVR4nO3BAQEAAACCIP+vbkhAAQAAAAAAAAAAAAAAAAAAAO8GQIAAAfnHrWYAAAAASUVORK5CYII=';
    const avatar = '/api/auth/avatar';
    assert.equal((await request(avatar, 'PUT', { photo })).status, 401);
    assert.equal((await request(avatar, 'PUT', { photo: 'invalid' }, googleCookie)).status, 400);
    const uploaded = await request(avatar, 'PUT', { photo }, googleCookie);
    const customUrl = uploaded.data.user.avatarUrl;
    assert.match(customUrl, /^\/api\/avatars\//);
    const publicPhoto = await fetch(base + customUrl);
    assert.equal(publicPhoto.headers.get('content-type'), 'image/png');
    assert.equal(Buffer.from(await publicPhoto.arrayBuffer()).toString('base64'), photo);
    await request('/api/games/igdb-1/comments', 'POST', { body: 'Teste de avatar' }, googleCookie);
    const publicAvatar = async () => (await request('/api/games/igdb-1/comments')).data.comments[0].avatarUrl;
    assert.equal(await publicAvatar(), customUrl);
    identity.picture += '-updated';
    const nextLogin = await start();
    await request(nextLogin.path, 'GET', undefined, nextLogin.cookie);
    assert.equal(await publicAvatar(), customUrl);
    assert.equal((await request(avatar, 'PUT', { photo: null }, googleCookie)).data.user.avatarUrl, identity.picture);
    assert.equal(await publicAvatar(), identity.picture);
    assert.deepEqual(googleUser.favorites, []);
    assert.match((await request(flow.path, 'GET', undefined, flow.cookie)).location, /google_failed/);
    assert.equal((await request('/api/auth/login', 'POST', { email: identity.email, password: 'no-google-password' })).status, 401);

    const adminGoogle = async () => {
      const pending = await start({ adminLogin: true });
      return request(pending.path, 'GET', undefined, pending.cookie);
    };
    const denied = await adminGoogle();
    assert.equal(denied.location, '/admin?adminAuth=google_admin_denied');
    assert.ok(!denied.cookies.some(value => value.startsWith('bg_admin=')));
    db.prepare('INSERT INTO administrators VALUES (?)').run(registered.data.user.id);
    const owner = await request('/api/admin/login', 'POST', credentials);
    const ownerCookie = owner.cookies[0];
    const grant = { action: 'grant', email: googleUser.email };
    assert.equal((await request('/api/admin/administradores', 'POST', grant, ownerCookie)).status, 200);
    const adminLogin = await adminGoogle();
    assert.equal(adminLogin.location, '/admin');
    const adminCookie = adminLogin.cookies.find(value => value.startsWith('bg_admin='));
    assert.ok(adminCookie);
    assert.ok(!adminLogin.cookies.some(value => value.startsWith('bg_session=')));
    assert.equal((await request('/api/admin/dashboard', 'GET', undefined, adminCookie)).data.admin.id, googleUser.id);
    assert.equal((await request('/api/admin/dashboard', 'GET', undefined, googleCookie)).status, 401);
    const pending = await start({ adminLogin: true });
    assert.equal((await request('/api/admin/administradores', 'POST', { ...grant, action: 'revoke' }, ownerCookie)).status, 200);
    assert.equal((await request('/api/admin/dashboard', 'GET', undefined, adminCookie)).status, 401);
    assert.equal((await request(pending.path, 'GET', undefined, pending.cookie)).location, '/admin?adminAuth=google_admin_denied');

    // A normal Google login also fills missing photos on accounts created before avatars.
    db.prepare('DELETE FROM profile_photos WHERE user_id=?').run(googleUser.id);
    const picture = identity.picture;
    delete identity.picture;
    idToken = 'header.' + Buffer.from(JSON.stringify({ sub: identity.sub, picture })).toString('base64url') + '.signature';
    const login = await start({ returnTo: '/perfil' });
    const signedIn = await request(login.path, 'GET', undefined, login.cookie);
    assert.equal(signedIn.location, '/perfil?auth=google_success');
    const session = signedIn.cookies.find((value) => value.startsWith('bg_session='));
    assert.equal((await request('/api/auth/me', 'GET', undefined, session)).data.user.avatarUrl, picture);
    assert.equal(await publicAvatar(), picture);
    idToken = undefined;
    const withoutPicture = await start();
    await request(withoutPicture.path, 'GET', undefined, withoutPicture.cookie);
    assert.equal(await publicAvatar(), picture);

    // Mobile/public and desktop/local requests must return to their own origin.
    const publicOrigin = 'https://buscagames.example';
    process.env.GOOGLE_REDIRECT_URIS = `${publicOrigin}/api/auth/google/callback`;
    for (const origin of [base, publicOrigin]) {
      expectedRedirect = `${origin}/api/auth/google/callback`;
      const started = await request('/api/auth/google/start', 'POST', { returnTo: '/perfil' }, '', { Origin: origin });
      assert.equal(started.status, 200);
      const target = new URL(started.data.url);
      assert.equal(target.searchParams.get('redirect_uri'), expectedRedirect);
      // Changing the default during a flow must not change its token exchange URI.
      process.env.GOOGLE_REDIRECT_URI = `${publicOrigin}/api/auth/google/callback`;
      process.env.GOOGLE_REDIRECT_URIS = `${base}/api/auth/google/callback`;
      assert.equal((await request(`/api/auth/google/callback?code=test&state=${target.searchParams.get('state')}`, 'GET', undefined, started.cookies[0])).location, '/perfil?auth=google_success');
    }
    for (const origin of ['https://attacker.example', 'null', `${publicOrigin}.attacker.example`]) {
      const rejected = await request('/api/auth/google/start', 'POST', {}, '', { Origin: origin, 'X-Forwarded-Host': new URL(base).host });
      assert.equal(rejected.status, 503);
      assert.equal(rejected.data.url, undefined);
    }
    process.env.GOOGLE_REDIRECT_URI = `${base}/api/auth/google/callback`;
    expectedRedirect = process.env.GOOGLE_REDIRECT_URI;
    delete process.env.GOOGLE_REDIRECT_URIS;

    identity = { ...identity, sub: 'google-ana', email: credentials.email };
    flow = await start();
    assert.match((await request(flow.path, 'GET', undefined, flow.cookie)).location, /google_existing/);
    flow = await start({ link: true }, cookie);
    response = await request(flow.path, 'GET', undefined, `${cookie}; ${flow.cookie}`);
    assert.match(response.location, /google_linked/);
    const linkedCookie = response.cookies.find((value) => value.startsWith('bg_session='));
    assert.deepEqual((await request('/api/auth/me', 'GET', undefined, linkedCookie)).data.user.favorites, ['igdb-1']);
    flow = await start();
    response = await request(flow.path, 'GET', undefined, flow.cookie);
    assert.equal((await request('/api/auth/me', 'GET', undefined, response.cookies.find((value) => value.startsWith('bg_session=')))).data.user.id, registered.data.user.id);

    identity = { ...identity, sub: 'google-1' };
    flow = await start({ link: true }, linkedCookie);
    assert.match((await request(flow.path, 'GET', undefined, `${linkedCookie}; ${flow.cookie}`)).location, /google_conflict/);
    flow = await start({ link: true }, linkedCookie);
    await request('/api/auth/logout', 'POST', {}, linkedCookie);
    assert.match((await request(flow.path, 'GET', undefined, `${linkedCookie}; ${flow.cookie}`)).location, /google_failed/);
    flow = await start({ returnTo: '//attacker.example' });
    assert.equal((await request(`/api/auth/google/callback?error=access_denied&state=${flow.state}`, 'GET', undefined, flow.cookie)).location, '/perfil?auth=google_cancelled');
    flow = await start();
    db.prepare('UPDATE google_flows SET expires=0').run();
    assert.match((await request(flow.path, 'GET', undefined, flow.cookie)).location, /google_failed/);
    flow = await start(); failProvider = true;
    assert.match((await request(flow.path, 'GET', undefined, flow.cookie)).location, /google_failed/);
    failProvider = false; identity = { ...identity, sub: 'unverified', email_verified: false };
    flow = await start();
    assert.match((await request(flow.path, 'GET', undefined, flow.cookie)).location, /google_failed/);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 2);

    // Google identities with an occupied nickname get their own unique name.
    for (const [index, expected] of ['ANA-2', 'ANA-3'].entries()) {
      identity = { sub: `same-name-${index}`, name: ' ANA ', email: `same-name-${index}@example.com`, email_verified: true };
      flow = await start();
      response = await request(flow.path, 'GET', undefined, flow.cookie);
      assert.match(response.location, /google_success/);
      const accountCookie = response.cookies.find(value => value.startsWith('bg_session='));
      const account = (await request('/api/auth/me', 'GET', undefined, accountCookie)).data.user;
      assert.equal(account.name, expected);
      flow = await start();
      response = await request(flow.path, 'GET', undefined, flow.cookie);
      const repeatCookie = response.cookies.find(value => value.startsWith('bg_session='));
      const repeated = (await request('/api/auth/me', 'GET', undefined, repeatCookie)).data.user;
      assert.equal(repeated.id, account.id);
      assert.equal(repeated.name, expected);
    }
  } finally {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await new Promise((resolve) => app.close(resolve)); db.close();
  }
});

test('existing OAuth tables gain the redirect column without losing accounts or sessions', () => {
  const db = openCatalog(':memory:');
  try {
    db.exec(`DROP TABLE google_flows;
      CREATE TABLE google_flows (state TEXT PRIMARY KEY, verifier TEXT NOT NULL, browser TEXT NOT NULL,
        return_to TEXT NOT NULL, session_token TEXT, expires INTEGER NOT NULL);
      INSERT INTO users(id,name,email,password_hash,salt) VALUES (1,'Ana','ana@example.com','','');
      INSERT INTO sessions VALUES ('existing-session',1,9999999999999);`);
    initializeCommunity(db);
    initializeCommunity(db);
    assert.ok(db.prepare('PRAGMA table_info(google_flows)').all().some((column) => column.name === 'redirect_uri'));
    assert.equal(db.prepare('SELECT name FROM users WHERE id=1').get().name, 'Ana');
    assert.equal(db.prepare('SELECT user_id FROM sessions WHERE token=?').get('existing-session').user_id, 1);
  } finally { db.close(); }
});
