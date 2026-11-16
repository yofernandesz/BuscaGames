import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { openCatalog, upsertGames } from '../src/catalog/catalog.js';
import { createApp } from '../src/server.js';
import { deliverNotificationEmails } from '../src/community/notifications.js';

test('notifications: real actions, ownership, read snapshot, pagination and email retry', async () => {
  const db = openCatalog(':memory:');
  const app = createApp(db);
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  const tokens = ['a'.repeat(64), 'b'.repeat(64)];
  for (let id = 1; id <= 2; id++) {
    db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(id, `Player ${id}`, `player${id}@example.com`, '', '');
    db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(createHash('sha256').update(tokens[id - 1]).digest('hex'), id, Date.now() + 60000);
  }
  upsertGames(db, [{ id: 1, name: 'Jogo' }]);
  const request = async (path, method = 'GET', body, user = 1, csrf = '1') => {
    const response = await fetch(`http://127.0.0.1:${app.address().port}${path}`, { method,
      headers: { cookie: user ? `bg_session=${tokens[user - 1]}` : '', 'Content-Type': 'application/json', 'X-BuscaGames-Request': csrf },
      body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, data: await response.json() };
  };
  try {
    assert.equal((await request('/api/notifications', 'GET', undefined, 0)).status, 401);
    assert.equal((await request('/api/notifications')).data.unreadCount, 0);
    await request('/api/games/igdb-1/comments', 'POST', { body: 'Olá!' }, 2);
    for (let i = 0; i < 2; i++) {
      await request('/api/users/2/follow', 'PUT', { following: true });
      await request('/api/comments/1/like', 'PUT', { liked: true });
    }
    await request('/api/comments/1/replies', 'POST', { body: 'Concordo!' });
    await request('/api/comments/1/like', 'PUT', { liked: true }, 2);
    await request('/api/comments/1/replies', 'POST', { body: 'Obrigado!' }, 2);
    const inbox = (await request('/api/notifications', 'GET', undefined, 2)).data;
    assert.equal(inbox.unreadCount, 3);
    assert.equal(inbox.notifications[0].gameTitle, 'Jogo');
    assert.equal(inbox.notifications[0].commentBody, 'Olá!');
    assert.equal(inbox.notifications[0].followerCount, 0);
    assert.equal(inbox.notifications[0].avatarUrl, null);
    assert.deepEqual(inbox.notifications.map(row => row.kind), ['reply', 'like', 'follow']);
    assert.equal(inbox.notifications[0].path, '/jogo/igdb-1#comentarios');
    assert.doesNotMatch(JSON.stringify(inbox.notifications), /email|password|salt/);
    assert.equal((await request('/api/notifications')).data.notifications.length, 0);
    await request('/api/notifications/read', 'PUT', { id: inbox.latestId });
    assert.equal((await request('/api/notifications/count', 'GET', undefined, 2)).data.unreadCount, 3);
    assert.equal((await request('/api/notifications/read', 'PUT', { id: inbox.latestId }, 2, '')).status, 403);
    assert.equal((await request('/api/notifications/read', 'PUT', { id: -1 }, 2)).status, 400);
    await request('/api/comments/1/replies', 'POST', { body: 'Outra resposta' });
    await request('/api/notifications/read', 'PUT', { throughId: inbox.latestId }, 2);
    assert.equal((await request('/api/notifications/count', 'GET', undefined, 2)).data.unreadCount, 1);
    // Undoing an interaction is not a new notification.
    await request('/api/users/2/follow', 'PUT', { following: false });
    await request('/api/comments/1/like', 'PUT', { liked: false });
    assert.equal((await request('/api/notifications', 'GET', undefined, 2)).data.notifications.length, 4);
    for (let i = 0; i < 21; i++) db.prepare("INSERT INTO notifications(recipient_id,actor_id,kind) VALUES (2,1,'follow')").run();
    const page = (await request('/api/notifications', 'GET', undefined, 2)).data;
    assert.equal(page.notifications.length, 20);
    const older = (await request(`/api/notifications?before=${page.nextCursor}`, 'GET', undefined, 2)).data;
    assert.equal(older.notifications.length, 5);
    assert.ok(older.notifications.every(row => row.id < page.nextCursor));

    const sent = [];
    const env = { RESEND_API_KEY: 'test', NOTIFICATIONS_EMAIL_FROM: 'BuscaGames <notify@example.com>', PUBLIC_SITE_URL: 'https://example.com' };
    await deliverNotificationEmails(db, { env: {}, fetcher: () => assert.fail('Disabled email must not send') });
    await deliverNotificationEmails(db, { env, fetcher: async (url, options) => { sent.push({ url, ...options }); return { ok: false }; } });
    assert.equal(sent.length, 10);
    db.prepare("UPDATE users SET name='New nickname' WHERE id=1").run();
    await deliverNotificationEmails(db, { env, fetcher: async (url, options) => {
      const previous = sent.find(item => item.headers['Idempotency-Key'] === options.headers['Idempotency-Key']);
      assert.equal(options.body, previous.body);
      assert.deepEqual(JSON.parse(options.body).to, ['player2@example.com']);
      assert.equal(url, 'https://api.resend.com/emails');
      return { ok: true };
    } });
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE email_sent=1').get().n, 10);
    await request('/api/notifications/preferences', 'PUT', { emailEnabled: false }, 2);
    db.prepare("INSERT INTO notifications(recipient_id,actor_id,kind) VALUES (2,1,'follow')").run();
    const optedOut = db.prepare('SELECT id,email_sent FROM notifications ORDER BY id DESC LIMIT 1').get();
    assert.equal(optedOut.email_sent, 1);
    await deliverNotificationEmails(db, { env, fetcher: () => assert.fail('Opted out email must not send') });
    assert.equal((await request('/api/notifications', 'GET', undefined, 2)).data.emailEnabled, false);
    await request('/api/notifications/preferences', 'PUT', { emailEnabled: true }, 2);
    assert.equal(db.prepare('SELECT email_sent FROM notifications WHERE id=?').get(optedOut.id).email_sent, 1);
    assert.equal((await request('/api/notifications/preferences', 'PUT', { emailEnabled: 'yes' }, 2)).status, 400);
    assert.equal((await request('/api/notifications?before=bad')).status, 400);
    await request('/api/comments/1', 'DELETE', { version: 1 }, 2);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE kind IN ('reply','like')").get().n, 0);
  } finally {
    await new Promise(resolve => app.close(resolve));
    db.close();
  }
});
