import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openCatalog, upsertGames } from '../src/catalog/catalog.js';
import { createApp } from '../src/server.js';

test('public profiles, follows and likes: privacy, ownership, pagination, validation and persistence', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'buscagames-social-'));
  const file = join(directory, 'catalog.sqlite');
  let db = openCatalog(file), app = createApp(db);
  const start = () => new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  const stop = async () => { await new Promise(resolve => app.close(resolve)); db.close(); };
  await start();
  const token = 'a'.repeat(64), secondToken = 'b'.repeat(64);
  async function request(path, method = 'GET', body, session = '', headers = {}) {
    const response = await fetch(`http://127.0.0.1:${app.address().port}${path}`, {
      method, headers: { 'Content-Type': 'application/json', 'X-BuscaGames-Request': '1', cookie: session ? `bg_session=${session}` : '', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json(), cache: response.headers.get('cache-control') };
  }
  try {
    for (let id = 1; id <= 15; id++) db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(id, id === 2 ? 'Ágata' : `Jogador ${id}`, `private${id}@example.com`, 'secret-hash', 'secret-salt');
    for (const [id, value] of [[1, token], [2, secondToken]]) db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(createHash('sha256').update(value).digest('hex'), id, Date.now() + 60000);
    upsertGames(db, Array.from({ length: 14 }, (_, index) => ({ id: index + 1, name: `Jogo ${String(index + 1).padStart(2, '0')}` })));
    for (let id = 1; id <= 13; id++) db.prepare('INSERT INTO user_favorites VALUES (2,?)').run(id);
    db.prepare('INSERT INTO user_ratings VALUES (2,1,5), (2,14,3), (1,1,1)').run();
    const listing = await request('/api/users');
    assert.equal(listing.data.users.length, 12);
    assert.equal(listing.data.total, 15);
    assert.equal((await request('/api/users?page=2')).data.users.length, 3);
    assert.equal((await request('/api/users?q=AGATA')).data.users[0].id, 2);
    assert.equal((await request('/api/users?q=%25')).data.total, 0);
    const publicProfile = await request('/api/users/2');
    assert.equal(publicProfile.cache, 'no-store');
    assert.equal(publicProfile.data.profile.averageRating, 4);
    assert.deepEqual(Object.keys(publicProfile.data.profile).sort(), ['id', 'name', 'avatarUrl', 'backgroundUrl', 'reviewed', 'favoriteCount', 'ratingCount', 'averageRating', 'followerCount', 'followingCount', 'commentCount', 'receivedLikeCount', 'isFollowing'].sort());
    assert.doesNotMatch(JSON.stringify(listing.data), /private\d|secret|email|password|salt|googleLinked/);
    const library = (await request('/api/users/2/library')).data;
    assert.equal(library.total, 14); assert.equal(library.games.length, 12);
    assert.equal(library.games[0].rating, 5); // Never the viewer's rating of 1.
    assert.equal((await request('/api/users/2/library?page=2')).data.games.length, 2);
    assert.equal((await request('/api/users/2/library?filter=rated')).data.total, 2);
    assert.equal((await request('/api/users/2/library?filter=favorites')).data.total, 13);
    assert.equal((await request('/api/users/999')).status, 404);
    assert.equal((await request('/api/users/nope')).status, 404);
    assert.equal((await request('/api/users?page=-1')).status, 400);
    assert.equal((await request('/api/users/2/library?filter=invalid')).status, 400);
    assert.equal((await request('/api/users/2/follow', 'PUT', { following: true })).status, 401);
    assert.equal((await request('/api/users/2/follow', 'PUT', { following: true }, token, { 'X-BuscaGames-Request': '' })).status, 403);
    assert.equal((await request('/api/users/2/follow', 'PUT', { following: true }, token, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    assert.equal((await request('/api/users/1/follow', 'PUT', { following: true }, token)).status, 400);
    assert.equal((await request('/api/users/2/follow', 'PUT', { following: 'yes' }, token)).status, 400);
    for (let repeat = 0; repeat < 2; repeat++) {
      const followed = await request('/api/users/2/follow', 'PUT', { following: true, userId: 3 }, token);
      assert.equal(followed.status, 200); assert.equal(followed.data.profile.followerCount, 1);
    }
    assert.equal((await request('/api/users/1/following')).data.users[0].id, 2);
    assert.equal((await request('/api/users/2/followers')).data.users[0].id, 1);
    assert.equal((await request('/api/users/3/following')).data.total, 0);
    assert.equal((await request('/api/users/2', 'GET', undefined, token)).data.profile.isFollowing, 1);
    assert.equal((await request('/api/users/2')).data.profile.isFollowing, 0);
    await request('/api/users/1/follow', 'PUT', { following: true }, secondToken); // Reciprocal follows.
    db.prepare("INSERT INTO comments(user_id,game_id,body,created_at) VALUES (2,1,'Ótimo jogo','2026-11-05T12:00:00Z')").run();
    assert.equal((await request('/api/comments/1/like', 'PUT', { liked: true })).status, 401);
    assert.equal((await request('/api/comments/1/like', 'PUT', { liked: 'yes' }, token)).status, 400);
    for (let repeat = 0; repeat < 2; repeat++) assert.deepEqual((await request('/api/comments/1/like', 'PUT', { liked: true }, token)).data, { liked: true, likeCount: 1 });
    assert.equal((await request('/api/games/igdb-1/comments', 'GET', undefined, token)).data.comments[0].liked, 1);
    assert.equal((await request('/api/games/igdb-1/comments')).data.comments[0].liked, 0);
    assert.equal((await request('/api/comments/1', 'PATCH', { body: 'Intrusão', version: 1 }, token)).status, 403);
    db.prepare('INSERT INTO blocked_users VALUES (1)').run();
    assert.equal((await request('/api/users/2/follow', 'PUT', { following: false }, token)).status, 401);
    db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(createHash('sha256').update(token).digest('hex'), 1, Date.now() + 60000);
    assert.equal((await request('/api/users/2/follow', 'PUT', { following: false }, token)).status, 403);
    assert.equal((await request('/api/comments/1/like', 'PUT', { liked: false }, token)).status, 403);
    db.prepare('DELETE FROM blocked_users WHERE user_id=1').run();
    await stop(); db = openCatalog(file); app = createApp(db); await start();
    assert.equal((await request('/api/users/2', 'GET', undefined, token)).data.profile.isFollowing, 1);
    assert.equal((await request('/api/games/igdb-1/comments')).data.comments[0].likeCount, 1);
    const likedComments = (await request('/api/users/2/likes?page=99')).data;
    assert.equal(likedComments.total, 1);
    assert.equal(likedComments.page, 1);
    assert.equal(likedComments.comments[0].game.id, 'igdb-1');
    assert.equal(likedComments.comments[0].body, 'Ótimo jogo');
    assert.equal(likedComments.comments[0].likeCount, 1);
    assert.doesNotMatch(JSON.stringify(likedComments), /private\d|secret|email|password|salt|googleLinked/);
    assert.equal((await request('/api/users/2')).data.profile.receivedLikeCount, 1);
    assert.equal((await request('/api/users/2')).data.profile.commentCount, 1);
    assert.equal((await request('/api/users/1/likes')).data.total, 0);
    assert.equal((await request('/api/users/2/comments')).data.total, 1);
    assert.equal((await request('/api/users/2/likes?page=0')).status, 400);
    assert.equal((await request('/api/users/2/follow', 'PUT', { following: false }, token)).data.profile.followerCount, 0);
    assert.equal((await request('/api/comments/1/like', 'PUT', { liked: false }, token)).data.likeCount, 0);
    assert.equal((await request('/api/users/2/likes')).data.total, 0);
    assert.equal((await request('/api/users/2/comments')).data.total, 1);
    await request('/api/comments/1/like', 'PUT', { liked: true }, token);
    assert.equal((await request('/api/comments/1', 'DELETE', { version: 1 }, secondToken)).status, 200);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM comment_likes').get().n, 0);
    assert.equal((await request('/api/users/2/comments')).data.total, 0);
    assert.equal((await request('/api/users/2')).data.profile.receivedLikeCount, 0);
    assert.equal((await request('/api/comments/1/like', 'PUT', { liked: true }, token)).status, 404);
    db.prepare('UPDATE sessions SET expires=0').run();
    assert.equal((await request('/api/users/2/follow', 'PUT', { following: true }, token)).status, 401);
  } finally { await stop(); rmSync(directory, { recursive: true, force: true }); }
});
