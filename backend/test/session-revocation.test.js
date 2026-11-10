import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { openCatalog, upsertGames } from '../src/catalog/catalog.js';
import { communityHandler } from '../src/community/community.js';

for (const revoke of ['logout', 'expiry', 'block']) {
  for (const [path, method, body, table] of [
    ['/api/auth/nickname', 'PUT', { name: 'Alterado' }, 'nickname_changes'],
    ['/api/users/2/follow', 'PUT', { following: true }, 'user_follows'],
    ['/api/comments/1/replies', 'POST', { body: 'Resposta' }, 'comment_replies'],
    ['/api/games/igdb-1/favorite', 'PUT', { favorite: true }, 'user_favorites'],
  ]) {
    test(`${revoke} during request body prevents mutation: ${path}`, async () => {
      const db = openCatalog(':memory:');
      try {
        for (const id of [1, 2]) db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(id, `Player ${id}`, `p${id}@example.com`, '', '');
        upsertGames(db, [{ id: 1, name: 'Game' }]);
        db.prepare('INSERT INTO comments(id,user_id,game_id,body,created_at) VALUES (1,2,1,?,?)').run('Original', new Date().toISOString());
        const token = 'a'.repeat(64);
        db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(createHash('sha256').update(token).digest('hex'), 1, Date.now() + 60000);
        const req = Readable.from((async function* () {
          // Authentication has already run; simulate revocation while receiving the body.
          if (revoke === 'logout') db.prepare('DELETE FROM sessions WHERE user_id=1').run();
          if (revoke === 'expiry') db.prepare('UPDATE sessions SET expires=0').run();
          if (revoke === 'block') db.prepare('INSERT INTO blocked_users VALUES (1)').run();
          yield Buffer.from(JSON.stringify(body));
        })());
        Object.assign(req, { method, headers: { cookie: `bg_session=${token}`, 'content-type': 'application/json', 'x-buscagames-request': '1' }, socket: {} });
        let status;
        const res = { writeHead(code) { status = code; }, end() {}, setHeader() {} };
        await communityHandler(db)(req, res, new URL(path, 'http://localhost'));
        assert.equal(status, 401);
        assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0);
      } finally { db.close(); }
    });
  }
}
