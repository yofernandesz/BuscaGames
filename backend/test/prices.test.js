import test from 'node:test';
import assert from 'node:assert/strict';
import { openCatalog, upsertGames, listGames } from '../src/catalog/catalog.js';
import { enqueuePrice, priceFields, processPrices, saveSteamPrice, steamAppId, fetchSteamApp } from '../src/catalog/prices.js';
import { createApp } from '../src/server.js';

const seed = (db, id = 1) => {
  upsertGames(db, [{ id, name: `Game ${id}`, websites: [{ url: `https://store.steampowered.com/app/${id}/` }] }]);
  return JSON.parse(db.prepare('SELECT data FROM games WHERE id=?').get(id).data);
};
const paid = { is_free: false, price_overview: { currency: 'BRL', initial: 19990, final: 5997 } };

test('Steam URL variants use exact IDs and unlinked editions have an explicit status', () => {
  const db = openCatalog(':memory:');
  try {
    for (const url of ['https://store.steampowered.com/app/730?cc=br', 'https://www.steampowered.com/app/730/', 'https://store.steampowered.com.evil.test/app/730/']) {
      assert.equal(steamAppId({ websites: [{ url }] }), url.includes('?cc=br') ? '730' : null);
    }
    assert.equal(priceFields(db, { sourceId: 1 }).priceStatus, 'no_source');
  } finally { db.close(); }
});

test('bad product data does not block other prices and old prices never cross app IDs', async () => {
  const db = openCatalog(':memory:');
  try {
    const first = seed(db, 1); const second = seed(db, 2);
    saveSteamPrice(db, first, '1', paid);
    upsertGames(db, [{ id: 1, name: 'Corrected edition', websites: [{ url: 'https://store.steampowered.com/app/3/' }] }]);
    const changed = JSON.parse(db.prepare('SELECT data FROM games WHERE id=1').get().data);
    enqueuePrice(db, changed); enqueuePrice(db, second);
    const order = [];
    await processPrices(db, async (url) => {
      const id = new URL(url).searchParams.get('appids'); order.push(id);
      return Response.json({ [id]: { success: true, data: id === '3' ? {} : paid } });
    });
    assert.deepEqual(order, ['3', '2']);
    assert.equal(priceFields(db, changed).price, null);
    assert.equal(priceFields(db, changed).priceStatus, 'error');
    assert.equal(priceFields(db, second).price, 59.97);
    assert.equal(db.prepare("SELECT value FROM state WHERE key='priceRetryAt'").get(), undefined);
    assert.equal(db.prepare('SELECT app_id FROM game_prices WHERE game_id=1').get().app_id, '3');
    assert.equal(db.prepare('SELECT count(*) n FROM price_queue').get().n, 1);
  } finally { db.close(); }
});

test('localization shares Steam cooldown and unavailable prices are reused for a day', async () => {
  const { enrichGame } = await import('../src/catalog/localization.js');
  const db = openCatalog(':memory:');
  try {
    const game = seed(db);
    await assert.rejects(fetchSteamApp(db, '1', 'brazilian', async () => new Response('', {status:429,headers:{'Retry-After':'7200'}})), /429/);
    await assert.rejects(enrichGame(db, game, () => { throw new Error('must not request during cooldown'); }), /aguardando/);
    const fields = priceFields(db, game);
    assert.equal(fields.priceStatus, 'error');
    assert.ok(Date.parse(fields.priceRetryAt) > Date.now() + 7100000);
    db.prepare("DELETE FROM state WHERE key='priceRetryAt'").run();
    saveSteamPrice(db, game, '1', {is_free:false});
    db.prepare('UPDATE game_prices SET checked_at=?').run(new Date(Date.now()-7*3600000).toISOString());
    enqueuePrice(db, game);
    assert.equal(db.prepare('SELECT count(*) n FROM price_queue').get().n, 0);
    db.prepare("UPDATE game_prices SET checked_at='2000-01-01T00:00:00Z'").run();
    enqueuePrice(db, game);
    assert.equal(db.prepare('SELECT count(*) n FROM price_queue').get().n, 1);
  } finally { db.close(); }
});

test('prices use exact app IDs and BRL cents, distinguish free games, zero offers and missing prices', () => {
  const db = openCatalog(':memory:');
  try {
    const game = seed(db);
    assert.equal(priceFields(db, game).priceStatus, 'pending');
    saveSteamPrice(db, game, '1', paid);
    assert.equal(priceFields(db, game).price, 59.97);
    assert.equal(priceFields(db, game).priceInitial, 199.9);
    assert.equal(priceFields(db, game).priceCurrency, 'BRL');
    assert.equal(priceFields(db, game).priceSource, 'https://store.steampowered.com/app/1/?cc=br&l=brazilian');
    enqueuePrice(db, game);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM price_queue').get().n, 0);
    assert.throws(() => saveSteamPrice(db, game, '1', { ...paid, steam_appid: 2 }), /divergente/);
    assert.throws(() => saveSteamPrice(db, game, '1', { price_overview: { currency: 'BRL', initial: 10, final: -1 } }), /inválido/);
    saveSteamPrice(db, game, '1', { is_free: true });
    assert.equal(priceFields(db, game).price, 0);
    assert.equal(priceFields(db, game).priceIsFree, true);
    saveSteamPrice(db, game, '1', { ...paid, price_overview: { currency: 'BRL', initial: 1000, final: 0 } });
    assert.equal(priceFields(db, game).price, 0);
    assert.equal(priceFields(db, game).priceIsFree, false);
    for (const data of [{ is_free: false }, { is_free: false, price_overview: { currency: 'USD', initial: 5999, final: 1999 } }]) {
      saveSteamPrice(db, game, '1', data);
      assert.equal(priceFields(db, game).price, null);
      assert.equal(priceFields(db, game).priceStatus, 'unavailable');
    }
    const otherApp = { ...game, websites: [{ url: 'https://store.steampowered.com/app/99/' }] };
    assert.equal(priceFields(db, otherApp).price, null);
    assert.equal(priceFields(db, { ...game, websites: [] }).priceSource, null);
  } finally { db.close(); }
});

test('price queue is independent of translation quota, prioritizes visits and stops on provider throttling', async () => {
  const db = openCatalog(':memory:');
  try {
    const first = seed(db, 1); const second = seed(db, 2);
    db.prepare('INSERT INTO translation_budget VALUES (?, 4500)').run(new Date().toISOString().slice(0, 10));
    enqueuePrice(db, first); enqueuePrice(db, second, 1);
    const order = [];
    await processPrices(db, async (url) => {
      const id = new URL(url).searchParams.get('appids'); order.push(id);
      return Response.json({ [id]: { success: true, data: { ...paid, steam_appid: Number(id) } } });
    });
    assert.deepEqual(order, ['2', '1']);
    db.prepare("UPDATE game_prices SET checked_at='2000-01-01T00:00:00Z'").run();
    enqueuePrice(db, first); enqueuePrice(db, second);
    let calls = 0;
    await processPrices(db, async () => { calls++; return new Response('', { status: 429, headers: { 'Retry-After': '7200' } }); });
    assert.equal(calls, 1);
    assert.equal(priceFields(db, first).price, 59.97);
    assert.equal(priceFields(db, first).priceStatus, 'stale');
    assert.ok(Date.parse(db.prepare('SELECT retry_at FROM game_prices WHERE game_id=1').get().retry_at) > Date.now() + 7100000);
    await processPrices(db, () => { throw new Error('must respect global cooldown'); });
    assert.equal(db.prepare('SELECT COUNT(*) n FROM price_queue').get().n, 2);
  } finally { db.close(); }
});

test('missing Steam products never become free, malformed responses retain the last known price', async () => {
  const db = openCatalog(':memory:');
  try {
    const game = seed(db);
    enqueuePrice(db, game);
    await processPrices(db, async () => Response.json({ 1: { success: false } }));
    assert.equal(priceFields(db, game).price, null);
    assert.equal(priceFields(db, game).priceStatus, 'unavailable');
    saveSteamPrice(db, game, '1', paid);
    db.prepare("UPDATE game_prices SET checked_at='2000-01-01T00:00:00Z'").run();
    enqueuePrice(db, game);
    await processPrices(db, async () => Response.json({ 1: { success: true } }));
    assert.equal(priceFields(db, game).price, 59.97);
    assert.equal(priceFields(db, game).priceStatus, 'stale');
  } finally { db.close(); }
});

test('stored prices appear in listings and details and invalidate cached HTTP responses', async () => {
  const db = openCatalog(':memory:'); const game = seed(db);
  const app = createApp(db);
  await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${app.address().port}/api/games/igdb-1`;
  try {
    const initial = await fetch(url); const etag = initial.headers.get('etag');
    assert.equal((await initial.json()).priceStatus, 'pending');
    saveSteamPrice(db, game, '1', paid);
    const updated = await fetch(url, { headers: { 'If-None-Match': etag } });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).price, 59.97);
    assert.equal(listGames(db).games[0].price, 59.97);
    assert.equal((await fetch(url, { headers: { 'If-None-Match': updated.headers.get('etag') } })).status, 304);
  } finally { await new Promise((resolve) => app.close(resolve)); db.close(); }
});
