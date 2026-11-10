import test from 'node:test';
import assert from 'node:assert/strict';
import { crc32, deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { openCatalog } from '../src/catalog/catalog.js';
import { createApp } from '../src/server.js';
import { validateBackground } from '../src/community/profileBackground.js';

function chunk(type, data) {
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length);
  result.write(type, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(result.subarray(4, -4)), result.length - 4);
  return result;
}
function image(width = 900, height = 300, filter = 0) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const pixels = Buffer.alloc((width * 4 + 1) * height);
  pixels[0] = filter;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}

test('background PNG validation rejects corrupt, oversized and malformed images', () => {
  const png = image();
  assert.deepEqual(validateBackground(png.toString('base64')), png);
  const corrupt = Buffer.from(png); corrupt[40] ^= 1;
  for (const value of [undefined, {}, '', 'a'.repeat(1600001), '<svg/>', corrupt.toString('base64'), image(128, 128).toString('base64'), image(900, 300, 5).toString('base64'), png.subarray(0, -1).toString('base64')]) {
    assert.equal(validateBackground(value), null);
  }
});

test('background is public, account-owned, persists on reload and can be replaced or removed', async () => {
  const db = openCatalog(':memory:');
  const tokens = ['a'.repeat(64), 'b'.repeat(64)];
  for (const [index, token] of tokens.entries()) {
    db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(index + 1, `Player ${index}`, `player${index}@example.com`, 'unused', 'unused');
    db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(createHash('sha256').update(token).digest('hex'), index + 1, Date.now() + 60000);
  }
  const app = createApp(db);
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.address().port}`;
  const put = (body, token = tokens[0], headers = {}) => fetch(`${origin}/api/auth/background`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-BuscaGames-Request': '1', Cookie: `bg_session=${token}`, ...headers }, body: JSON.stringify(body),
  });
  const profile = async id => (await (await fetch(`${origin}/api/users/${id}`)).json()).profile;
  try {
    assert.equal((await put({ photo: null }, '')).status, 401);
    assert.equal((await put({ photo: null }, tokens[0], { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    assert.equal((await put({ photo: 'invalid' })).status, 400);
    assert.equal((await put({ photo: 'a'.repeat(2 * 1024 * 1024) })).status, 413);
    const png = image();
    const saved = await put({ photo: png.toString('base64'), userId: 2 });
    assert.equal(saved.status, 200);
    const url = (await saved.json()).user.backgroundUrl;
    assert.equal((await profile(1)).backgroundUrl, url);
    assert.equal((await profile(2)).backgroundUrl, null);
    assert.equal((await profile(1)).email, undefined);
    assert.equal((await (await fetch(`${origin}/api/auth/me`, { headers: { Cookie: `bg_session=${tokens[0]}` } })).json()).user.backgroundUrl, url);
    const publicImage = await fetch(origin + url);
    assert.equal(publicImage.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await publicImage.arrayBuffer()), png);
    assert.equal((await put({ photo: 'invalid' })).status, 400);
    assert.equal((await profile(1)).backgroundUrl, url);
    await put({ photo: image(900, 300, 1).toString('base64') });
    assert.notEqual((await profile(1)).backgroundUrl, url);
    assert.equal((await fetch(origin + url)).status, 404);
    await put({ photo: null }, tokens[1]);
    assert.ok((await profile(1)).backgroundUrl);
    db.prepare('INSERT INTO blocked_users VALUES (1)').run();
    db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(createHash('sha256').update(tokens[0]).digest('hex'), 1, Date.now() + 60000);
    assert.equal((await put({ photo: null })).status, 403);
    db.prepare('DELETE FROM blocked_users WHERE user_id=1').run();
    const removed = await put({ photo: null });
    assert.equal((await removed.json()).user.backgroundUrl, null);
    assert.equal((await profile(1)).backgroundUrl, null);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM profile_backgrounds').get().n, 0);
  } finally { await new Promise(resolve => app.close(resolve)); db.close(); }
});
