import test from 'node:test';
import assert from 'node:assert/strict';
import { openCatalog, upsertGames } from '../src/catalog/catalog.js';
import { createApp } from '../src/server.js';
import { activateTestAccount, testMailbox } from '../test-support/accountEmail.js';

test('administration requires independent authorized login, rechecks roles and persists actions', async () => {
  const db = openCatalog(':memory:');
  const mailbox = testMailbox();
  const server = createApp(db, false, mailbox.deliver);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const call = (path, cookie = '', body) => fetch(`http://127.0.0.1:${server.address().port}/api/${path}`, {
    method: body ? 'POST' : 'GET', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-BuscaGames-Request': '1' },
    body: body && JSON.stringify(body),
  });
  const password = 'Galáxias sob luas';
  const account = { name: 'Equipe', email: 'teste@example.org', password, passwordConfirmation: password };
  try {
    const activate = (data) => activateTestAccount((path, _method, body) => call(path.slice('/api/'.length), '', body), mailbox, data);
    assert.equal((await call('auth/register', '', account)).status, 201);
    const registered = await activate(account);
    const regular = registered.headers.get('set-cookie').split(';')[0];
    assert.equal((await call('admin/login', '', account)).status, 401);
    db.prepare('INSERT INTO administrators VALUES (1)').run();
    assert.equal((await call('admin/dashboard', regular)).status, 401);
    const login = await call('admin/login', '', account);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    for (const section of ['dashboard','usuarios','verificacoes','administradores','registros','atividades','rotina','vinculos','chat','relatorios']) {
      assert.equal((await call('admin/' + section, cookie)).status, 200);
    }
    assert.equal((await call('admin/verificacoes', cookie, { id: 1 })).status, 200);
    assert.deepEqual((await (await call('admin/verificacoes', cookie)).json()).rows, []);
    const { charts } = await (await call('admin/dashboard', cookie)).json();
    assert.equal(charts.history.length, 30);
    assert.equal(charts.history.reduce((n, day) => n + day.registrations, 0), 1);
    assert.equal(charts.history.reduce((n, day) => n + day.reviews, 0), 1);
    assert.equal(charts.users, 1);
    assert.equal(charts.reviewed, 1);
    assert.equal(charts.blocked, 0);
    assert.deepEqual(charts.ratings, []);

    await call('admin/chat', cookie, { message: 'Revisão concluída' });
    assert.equal((await (await call('admin/chat', cookie)).json()).rows[0].Mensagem, 'Revisão concluída');
    const other = { ...account, name: 'Segunda conta', email: 'outra@example.org' };
    assert.equal((await call('auth/register', '', other)).status, 201);
    const otherCookie = (await activate(other)).headers.get('set-cookie').split(';')[0];
    assert.equal((await (await call('auth/me', regular)).json()).user.reviewed, true);
    assert.equal((await (await call('auth/me', otherCookie)).json()).user.reviewed, false);
    assert.equal((await call('admin/usuarios', cookie, { id: 1, action: 'block' })).status, 400);
    assert.equal((await call('admin/usuarios', otherCookie, { id: 1, action: 'block' })).status, 401);

    assert.equal((await call('admin/administradores', cookie, { email: other.email, action: 'grant' })).status, 200);
    const second = (await call('admin/login', '', other)).headers.get('set-cookie').split(';')[0];
    assert.equal((await call('admin/usuarios', cookie, { id: 2, action: 'block' })).status, 200);
    assert.equal((await call('admin/dashboard', second)).status, 401);
    assert.equal((await (await call('auth/me', otherCookie)).json()).user, null);
    assert.equal((await call('auth/login', '', other)).status, 403);
    assert.equal((await call('admin/login', '', other)).status, 403);
    assert.equal((await call('admin/usuarios', cookie, { id: 2, action: 'unblock' })).status, 200);
    assert.equal((await call('auth/login', '', other)).status, 200);
    assert.equal((await (await call('auth/me', otherCookie)).json()).user, null);
    const renewed = (await call('admin/login', '', other)).headers.get('set-cookie').split(';')[0];
    await call('admin/administradores', cookie, { email: other.email, action: 'revoke' });
    assert.equal((await call('admin/dashboard', renewed)).status, 401);
    assert.equal((await call('admin/dashboard', second)).status, 401);
    assert.equal((await call('admin/administradores', cookie, { email: account.email, action: 'revoke' })).status, 400);
    await call('admin/administradores', cookie, { email: other.email, action: 'revoke' });
    const logs = (await (await call('admin/registros', cookie)).json()).rows;
    for (const event of ['Acesso administrativo concedido', 'Acesso administrativo revogado', 'Conta bloqueada', 'Conta desbloqueada']) {
      const entries = logs.filter(row => row.Ação === event);
      assert.equal(entries.length, 1);
      assert.equal(entries[0].Conta, 'Segunda conta (#2)');
      assert.equal(entries[0].Responsável, 'Equipe (#1)');
    }
    assert.ok(logs.some(row => row.Ação === 'Entrada no painel'));
    assert.ok(logs.some(row => row.Ação === 'Mensagem enviada ao chat da equipe'));

    // Create public activity and connections on both accounts before removing the target.
    upsertGames(db, [{ id: 1, name: 'Jogo de teste' }]);
    const suffix = 'a'.repeat(64) + '.png';
    const avatar = 'avatars/2/' + suffix;
    const background = 'backgrounds/2/' + suffix;
    db.exec(`
      INSERT INTO comments(user_id,game_id,body,created_at) VALUES (1,1,'Comentário mantido',CURRENT_TIMESTAMP),(2,1,'Comentário removido',CURRENT_TIMESTAMP);
      INSERT INTO comment_replies(comment_id,user_id,body,created_at) VALUES (1,2,'Resposta removida',CURRENT_TIMESTAMP),(2,1,'Resposta em comentário removido',CURRENT_TIMESTAMP);
      INSERT INTO comment_likes VALUES (2,1),(1,2);
      INSERT INTO user_follows VALUES (1,2),(2,1);
      INSERT INTO user_ratings VALUES (2,1,5);
      INSERT INTO user_favorites VALUES (2,1);
      INSERT INTO admin_reviews VALUES (2,1);
    `);
    db.prepare("INSERT INTO profile_photos(user_id,custom_png,custom_url) VALUES (2,X'00',?)").run('/api/' + avatar);
    db.prepare("INSERT INTO profile_backgrounds VALUES (2,X'00',?)").run('/api/' + background);
    const latestLogin = await call('auth/login', '', other);
    const targetRegular = latestLogin.headers.get('set-cookie').split(';')[0];
    await call('admin/administradores', cookie, { email: other.email, action: 'grant' });
    const targetAdmin = (await call('admin/login', '', other)).headers.get('set-cookie').split(';')[0];
    const ban = { id: 2, action: 'ban' };
    assert.equal((await call('admin/usuarios', targetRegular, ban)).status, 401);
    assert.equal((await call('admin/usuarios', cookie, { ...ban, id: 1 })).status, 400);
    assert.equal((await call('users/2', regular)).status, 200);
    assert.ok((await (await call('notifications', regular)).json()).notifications.length > 0);
    assert.equal((await call(avatar)).headers.get('cache-control'), 'no-store');
    assert.equal((await call('admin/usuarios', cookie, ban)).status, 200);
    assert.equal((await call('admin/usuarios', cookie, ban)).status, 404);
    assert.equal((await call('admin/dashboard', targetAdmin)).status, 401);
    assert.equal((await (await call('auth/me', targetRegular)).json()).user, null);
    assert.equal((await call('auth/login', '', other)).status, 401);
    assert.equal((await call('auth/register', '', { ...other, email: other.email.toUpperCase() })).status, 409);
    assert.equal((await call('auth/register', '', { ...other, email: 'nova@example.org' })).status, 201);
    for (const path of ['users/2', 'users/2/library', 'users/2/comments', 'comments/2/replies', avatar, background]) {
      assert.equal((await call(path, regular)).status, 404, path);
    }
    const { profile } = await (await call('users/1', regular)).json();
    assert.equal(profile.followerCount + profile.followingCount + profile.receivedLikeCount, 0);
    const { comments } = await (await call('games/igdb-1/comments', regular)).json();
    assert.deepEqual(comments.map(({ body, likeCount }) => [body, likeCount]), [['Comentário mantido', 0]]);
    assert.deepEqual((await (await call('comments/1/replies', regular)).json()).replies, []);
    assert.deepEqual((await (await call('notifications', regular)).json()).notifications, []);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM user_ratings WHERE user_id=2').get().total, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM user_favorites WHERE user_id=2').get().total, 0);
    assert.doesNotMatch(JSON.stringify((await (await call('admin/registros', cookie)).json()).rows), /Segunda conta \(#2\)/);
    await call('admin/logout', cookie, {});
    assert.equal(db.prepare('SELECT event FROM account_events ORDER BY id DESC LIMIT 1').get().event, 'Saída do painel');
    assert.equal((await call('admin/dashboard', cookie)).status, 401);
  } finally { await new Promise(resolve => server.close(resolve)); db.close(); }
});

