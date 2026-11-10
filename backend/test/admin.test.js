import test from 'node:test';
import assert from 'node:assert/strict';
import { openCatalog } from '../src/catalog/catalog.js';
import { createApp } from '../src/server.js';

test('administration requires independent authorized login, rechecks roles and persists actions', async () => {
  const db = openCatalog(':memory:');
  const server = createApp(db);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const call = (path, cookie = '', body) => fetch(`http://127.0.0.1:${server.address().port}/api/${path}`, {
    method: body ? 'POST' : 'GET', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-BuscaGames-Request': '1' },
    body: body && JSON.stringify(body),
  });
  const password = 'Galáxias sob luas';
  const account = { name: 'Equipe', email: 'teste@example.org', password, passwordConfirmation: password };
  try {
    const registered = await call('auth/register', '', account);
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
    const otherCookie = (await call('auth/register', '', other)).headers.get('set-cookie').split(';')[0];
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
    await call('admin/logout', cookie, {});
    assert.equal(db.prepare('SELECT event FROM account_events ORDER BY id DESC LIMIT 1').get().event, 'Saída do painel');
    assert.equal((await call('admin/dashboard', cookie)).status, 401);
  } finally { await new Promise(resolve => server.close(resolve)); db.close(); }
});

