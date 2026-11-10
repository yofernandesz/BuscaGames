import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openCatalog, upsertGames } from '../src/catalog/catalog.js';
import { createApp } from '../src/server.js';

test('comments: authentication, ownership, validation, ratings, pagination, counts and restart persistence', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'buscagames-comments-'));
  const path = join(dir, 'catalog.sqlite');
  let db = openCatalog(path);
  upsertGames(db, [{ id: 1, name: 'Jogo original' }, { id: 2, name: 'Outro jogo' }]);
  let app = createApp(db);
  async function start() { await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve)); }
  async function stop() { await new Promise((resolve) => app.close(resolve)); db.close(); }
  await start();
  async function request(path, method = 'GET', body, cookie = '', headers = {}) {
    const response = await fetch(`http://127.0.0.1:${app.address().port}${path}`, {
      method, headers: { 'Content-Type': 'application/json', 'X-BuscaGames-Request': '1', Cookie: cookie, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  const endpoint = '/api/games/igdb-1/comments';
  const credentials = { name: 'Ana', email: 'ana@example.com', password: 'nuvem-lunar-unica', passwordConfirmation: 'nuvem-lunar-unica' };
  try {
    assert.equal((await request(endpoint, 'POST', { body: 'Olá' })).status, 401);
    assert.equal((await request('/api/auth/register', 'POST', credentials, '', { 'X-BuscaGames-Request': '' })).status, 403);
    const registered = await request('/api/auth/register', 'POST', credentials);
    assert.equal(registered.status, 201);
    assert.equal(registered.data.user.commentCount, 0);
    const cookie = registered.cookie;
    await request('/api/games/igdb-1/favorite', 'PUT', { favorite: true }, cookie);
    assert.equal((await request('/api/auth/register', 'POST', credentials)).status, 409);
    assert.equal((await request('/api/auth/login', 'POST', { ...credentials, password: 'senha-incorreta' })).status, 401);
    for (const body of ['', '  \n ', 'a'.repeat(501), null, 42, 'a\0b']) {
      assert.equal((await request(endpoint, 'POST', { body }, cookie)).status, 400);
    }
    assert.equal((await request('/api/games/igdb-999/comments', 'POST', { body: 'Olá' }, cookie)).status, 404);
    assert.equal((await request(endpoint, 'POST', { body: 'a'.repeat(500), userId: 999 }, cookie)).status, 201);
    assert.equal((await request(endpoint, 'POST', { body: 'Duplicado' }, cookie)).status, 409);
    let listing = (await request(endpoint, 'GET', undefined, cookie)).data;
    assert.equal(listing.own.userId, registered.data.user.id);
    assert.equal(listing.own.body.length, 500);
    assert.equal(listing.own.rating, null);
    const id = listing.own.id;
    assert.equal((await request('/api/games/igdb-1/rating', 'PUT', { rating: 5 }, cookie)).status, 200);
    assert.equal((await request(endpoint)).data.comments[0].rating, 5);
    const other = await request('/api/auth/register', 'POST', { ...credentials, name: 'Bruno', email: 'bruno@example.com' });
    const replies = `/api/comments/${id}/replies`;
    assert.equal((await request(replies, 'POST', { body: 'Olá' })).status, 401);
    for (const body of ['', '  ', 'a'.repeat(36), null, 42, 'a\0b']) {
      assert.equal((await request(replies, 'POST', { body }, other.cookie)).status, 400);
    }
    assert.equal((await request('/api/comments/999999/replies', 'POST', { body: 'Oi' }, cookie)).status, 404);
    assert.equal((await request(replies, 'POST', { body: '😀'.repeat(35), userId: registered.data.user.id }, other.cookie)).status, 201);
    const concurrent = await Promise.all([1, 2].map(() => request(replies, 'POST', { body: 'Concordo!' }, other.cookie)));
    assert.deepEqual(concurrent.map(result => result.status).sort(), [201, 409]);
    assert.equal((await request(replies, 'GET', undefined, other.cookie)).data.ownCount, 2);
    assert.equal((await request(replies)).data.replies[0].userId, other.data.user.id);
    assert.equal((await request(replies, 'POST', { body: 'Obrigado!' }, cookie)).status, 201);
    assert.throws(() => db.prepare('INSERT INTO comment_replies(comment_id,user_id,body,created_at) VALUES (?,?,?,?)').run(id, other.data.user.id, 'Terceira', new Date().toISOString()), /reply_limit/);
    for (const method of ['PATCH', 'DELETE']) assert.equal((await request(`/api/comments/${id}`, method, { body: 'Ataque', version: 1 }, other.cookie)).status, 403);
    const edited = await request(`/api/comments/${id}`, 'PATCH', { body: '<script>alert(1)</script>', version: 1 }, cookie);
    assert.equal(edited.status, 200);
    assert.equal(edited.data.user.commentCount, 1);
    assert.equal((await request(`/api/comments/${id}`, 'PATCH', { body: 'Desatualizado', version: 1 }, cookie)).status, 409);
    // A second game counts independently; removing a rating never removes a comment.
    await request('/api/games/igdb-2/comments', 'POST', { body: 'Outro comentário' }, cookie);
    await request('/api/games/igdb-1/rating', 'PUT', { rating: 0 }, cookie);
    assert.equal((await request('/api/auth/me', 'GET', undefined, cookie)).data.user.commentCount, 2);
    assert.equal((await request(endpoint)).data.comments[0].rating, null);
    assert.throws(() => db.prepare('INSERT INTO comments(user_id,game_id,body,created_at) VALUES (999,1,?,?)').run('Órfão', new Date().toISOString()), /FOREIGN KEY/);
    assert.throws(() => db.prepare('DELETE FROM games WHERE id=1').run(), /FOREIGN KEY/);
    // Multiple authors exercise deterministic keyset pages, including same-time publication.
    for (let i = 0; i < 12; i++) {
      const author = db.prepare('INSERT INTO users(name,email,password_hash,salt) VALUES (?,?,?,?)').run(`Autor ${i}`, `${i}@example.com`, 'unused', 'unused').lastInsertRowid;
      db.prepare('INSERT INTO comments(user_id,game_id,body,created_at) VALUES (?,1,?,?)').run(author, `Comentário ${i}`, new Date().toISOString());
    }
    listing = (await request(endpoint)).data;
    assert.equal(listing.comments.length, 10);
    const second = (await request(`${endpoint}?before=${listing.nextCursor}`)).data;
    assert.equal(second.comments.length, 3);
    assert.equal(second.nextCursor, null);
    assert.equal(new Set([...listing.comments, ...second.comments].map((c) => c.id)).size, 13);
    assert.ok(listing.comments[0].id > listing.comments[9].id);
    assert.equal((await request(`${endpoint}?before=-1`)).status, 400);
    assert.equal((await request(endpoint, 'GET', undefined, cookie)).data.own.id, id);
    await stop(); db = openCatalog(path); app = createApp(db); await start();
    assert.equal((await request(replies)).data.replies.length, 3);
    assert.deepEqual((await request('/api/auth/me', 'GET', undefined, cookie)).data.user.favorites, ['igdb-1']);
    assert.equal((await request('/api/auth/me', 'GET', undefined, cookie)).data.user.commentCount, 2);
    assert.equal((await request(endpoint, 'GET', undefined, cookie)).data.own.body, '<script>alert(1)</script>');
    await request('/api/auth/logout', 'POST', {}, cookie);
    assert.equal((await request('/api/auth/me', 'GET', undefined, cookie)).data.user, null);
    assert.equal((await request(`/api/comments/${id}`, 'DELETE', { version: 2 }, cookie)).status, 401);
    const login = await request('/api/auth/login', 'POST', credentials);
    assert.equal(login.data.user.commentCount, 2);
    const deleted = await request(`/api/comments/${id}`, 'DELETE', { version: 2 }, login.cookie);
    assert.equal(deleted.status, 200);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM comment_replies WHERE comment_id=?').get(id).n, 0);
    assert.equal(deleted.data.user.commentCount, 1);
    assert.deepEqual(deleted.data.user.commentGameIds, ['igdb-2']);
    assert.equal((await request(`/api/comments/${id}`, 'DELETE', { version: 2 }, login.cookie)).status, 404);
    assert.equal(db.prepare('SELECT title FROM games WHERE id=1').get().title, 'Jogo original');
  } finally { await stop(); rmSync(dir, { recursive: true, force: true }); }
});
