import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createApp } from '../src/server.js';
import { openCatalog, upsertGames } from '../src/catalog/catalog.js';
import { availableNickname, changeNickname, nicknameAvailability } from '../src/community/nicknames.js';

test('nickname API authenticates, ignores supplied roles and IDs, and publishes saved names', async () => {
  const db = openCatalog(':memory:');
  const token = 'e'.repeat(64);
  db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(1, 'Ana', 'ana@example.com', '', '');
  db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(2, 'Bia', 'bia@example.com', '', '');
  db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(createHash('sha256').update(token).digest('hex'), 1, Date.now() + 60000);
  const app = createApp(db);
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.address().port}`;
  const put = (body, cookie = token, headers = {}) => fetch(`${origin}/api/auth/nickname`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-BuscaGames-Request': '1', Cookie: `bg_session=${cookie}`, ...headers }, body: JSON.stringify(body),
  });
  try {
    assert.equal((await put({ name: 'Nova' }, '')).status, 401);
    assert.equal((await put({ name: 'Nova' }, token, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    assert.equal((await put({ name: 'Bia', isAdmin: true })).status, 409);
    const saved = await put({ name: 'Nova', userId: 2 });
    assert.equal(saved.status, 200);
    assert.ok((await saved.json()).user.nicknameAvailableAt > Date.now());
    assert.equal(db.prepare('SELECT name FROM users WHERE id=2').get().name, 'Bia');
    assert.equal((await (await fetch(`${origin}/api/users/1`)).json()).profile.name, 'Nova');
    assert.equal((await put({ name: 'Outra', isAdmin: true })).status, 409);
    db.prepare('INSERT INTO administrators VALUES (1)').run();
    assert.equal((await put({ name: 'Bia' })).status, 200);
    db.prepare('INSERT INTO blocked_users VALUES (1)').run();
    assert.equal((await put({ name: 'Bloqueada' })).status, 401);
    db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(createHash('sha256').update(token).digest('hex'), 1, Date.now() + 60000);
    assert.equal((await put({ name: 'Bloqueada' })).status, 403);
  } finally { await new Promise(resolve => app.close(resolve)); db.close(); }
});

test('database rejects duplicate nicknames on insert/update, including another connection and reopen', () => {
  const directory = mkdtempSync(join(tmpdir(), 'buscagames-nicknames-'));
  const file = join(directory, 'catalog.sqlite');
  let db, other;
  try {
    db = openCatalog(file);
    other = openCatalog(file);
    db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(1, 'Ána Maria', 'one@example.com', '', '');
    const duplicate = /Nickname já está em uso/;
    assert.throws(() => other.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(2, ' A\u0301NA  MARIA ', 'two@example.com', '', ''), duplicate);
    other.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(2, 'Outra', 'two@example.com', '', '');
    assert.throws(() => other.prepare('UPDATE users SET name=? WHERE id=2').run('ÁNA MARIA'), duplicate);
    assert.equal(db.prepare('SELECT name FROM users WHERE id=2').get().name, 'Outra');
    other.close(); other = null;
    db.close(); db = openCatalog(file);
    assert.throws(() => db.prepare('UPDATE users SET name=? WHERE id=2').run('Áｎａ\u00a0Maria'), duplicate);
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  } finally {
    other?.close(); db?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('legacy migration resolves duplicates and suffix collisions without losing accounts or relationships', () => {
  const directory = mkdtempSync(join(tmpdir(), 'buscagames-nicknames-'));
  const file = join(directory, 'catalog.sqlite');
  let db;
  try {
    db = openCatalog(file);
    db.exec('DROP TRIGGER users_nickname_insert; DROP TRIGGER users_nickname_update');
    const long = 'X'.repeat(60);
    for (const [index, name] of ['Ana', ' ANA ', 'ana-2', 'ana', long, long.toLowerCase()].entries()) {
      db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(index + 1, name, `${index}@example.com`, 'saved-hash', 'saved-salt');
    }
    upsertGames(db, [{ id: 1, name: 'Teste' }]);
    db.exec(`INSERT INTO sessions VALUES ('saved-session',2,9999999999999);
      INSERT INTO google_accounts VALUES ('saved-google',2);
      INSERT INTO user_favorites VALUES (2,1);
      INSERT INTO user_follows VALUES (1,2);`);
    db.close(); db = openCatalog(file);
    const users = db.prepare('SELECT * FROM users ORDER BY id').all();
    assert.deepEqual(users.map(user => user.name), ['Ana', 'ANA-3', 'ana-2', 'ana-4', long, 'x'.repeat(58) + '-2']);
    assert.ok(users.every(user => user.password_hash === 'saved-hash' && user.salt === 'saved-salt'));
    assert.equal(db.prepare('SELECT user_id FROM sessions').get().user_id, 2);
    assert.equal(db.prepare('SELECT user_id FROM google_accounts').get().user_id, 2);
    assert.equal(db.prepare('SELECT user_id FROM user_favorites').get().user_id, 2);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM user_follows').get().n, 1);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(availableNickname(db, 'Ana'), 'Ana-5');
    assert.equal(availableNickname(db, undefined), 'Jogador');
    assert.equal(availableNickname(db, '\u200b'), 'Jogador');
    db.close(); db = openCatalog(file);
    assert.deepEqual(db.prepare('SELECT * FROM users ORDER BY id').all(), users);
  } finally {
    db?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('nickname changes enforce availability and exactly 30 days, with administrator exceptions', () => {
  const db = openCatalog(':memory:');
  try {
    db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(1, 'Ana', 'ana@example.com', '', '');
    db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(2, 'Bia', 'bia@example.com', '', '');
    const now = 1800000000000;
    assert.equal(nicknameAvailability(db, 1).nicknameAvailableAt, null);
    assert.throws(() => changeNickname(db, 1, ' ＢIA ', now), { status: 409 });
    assert.throws(() => changeNickname(db, 1, '\u200b', now), { status: 400 });
    changeNickname(db, 1, 'Nova Ana', now);
    changeNickname(db, 1, 'Nova Ana', now + 1);
    assert.equal(nicknameAvailability(db, 1).nicknameAvailableAt, now + 30 * 86400000);
    assert.throws(() => changeNickname(db, 1, 'Outra Ana', now + 30 * 86400000 - 1), { status: 409 });
    changeNickname(db, 1, 'Outra Ana', now + 30 * 86400000);
    db.prepare('INSERT INTO administrators VALUES (1)').run();
    changeNickname(db, 1, 'Bia', now + 30 * 86400000 + 1);
    changeNickname(db, 1, 'Admin', now + 30 * 86400000 + 2);
    assert.equal(nicknameAvailability(db, 1).nicknameAvailableAt, null);
    db.prepare('DELETE FROM administrators WHERE user_id=1').run();
    assert.throws(() => changeNickname(db, 1, 'Outra', now + 30 * 86400000 + 3), { status: 409 });
  } finally { db.close(); }
});
