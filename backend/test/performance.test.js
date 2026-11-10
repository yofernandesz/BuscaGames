import test from 'node:test';
import assert from 'node:assert/strict';
import { openCatalog, upsertGames, listGames } from '../src/catalog/catalog.js';
import { localizeGame, localizationHash } from '../src/catalog/localization.js';
import { enqueuePrice, fetchSteamApp, saveSteamPrice } from '../src/catalog/prices.js';

test('batched list metadata matches individual reads with a fixed number of SELECTs', () => {
  const db = openCatalog(':memory:');
  try {
    upsertGames(db, Array.from({ length: 48 }, (_, i) => ({
      id: i + 1, name: `Game ${i}`, summary: 'Original',
      websites: [{ url: `https://store.steampowered.com/app/${i + 1}/` }],
    })));
    const games = db.prepare('SELECT data FROM games ORDER BY id').all().map(({ data }) => JSON.parse(data));
    saveSteamPrice(db, games[0], '1', { is_free: true });
    saveSteamPrice(db, games[1], '2', { is_free: false });
    db.prepare('INSERT INTO game_localization VALUES (?, ?, ?, ?, ?, ?)')
      .run(1, localizationHash(games[0]), 'Traduzido', 'Requisitos', 'Steam', new Date().toISOString());
    db.prepare('INSERT INTO localization_attempts VALUES (?, ?, ?)').run(3, 'quota', '2099-01-01');
    let selects = 0;
    const counted = { prepare(sql) { if (sql.startsWith('SELECT')) selects++; return db.prepare(sql); } };
    const result = listGames(counted, { limit: 48 });
    assert.equal(selects, 6);
    assert.deepEqual(result.games, games.map((game) => {
      const localized = localizeGame(db, game);
      for (const key of ['description', 'images', 'releaseDates', 'websites']) delete localized[key];
      return { ...localized, metric: null };
    }));
    assert.equal(db.prepare('SELECT COUNT(*) n FROM price_queue').get().n, 46);
    const before = db.prepare('SELECT total_changes() n').get().n;
    listGames(db, { limit: 48 });
    assert.equal(db.prepare('SELECT total_changes() n').get().n, before);
    enqueuePrice(db, games[2], 1);
    assert.equal(db.prepare('SELECT priority FROM price_queue WHERE game_id=3').get().priority, 1);
  } finally { db.close(); }
});

test('catalog ordering uses indexes without temporary sorting and keeps tie order', () => {
  const db = openCatalog(':memory:');
  try {
    for (const order of ['rating_count DESC, id', 'released DESC, id']) {
      const plan = db.prepare(`EXPLAIN QUERY PLAN SELECT data FROM games ORDER BY ${order} LIMIT 48`).all();
      assert.ok(plan.some((row) => row.detail.includes('USING INDEX')));
      assert.ok(plan.every((row) => !row.detail.includes('TEMP B-TREE')));
    }
    upsertGames(db, [{ id: 2, name: 'Second' }, { id: 1, name: 'First' }]);
    assert.deepEqual(listGames(db).games.map((game) => game.id), ['igdb-1', 'igdb-2']);
  } finally { db.close(); }
});

test('Steam coalesces concurrent requests, separates languages and releases failed requests', async () => {
  const db = openCatalog(':memory:');
  try {
    let calls = 0;
    const fetcher = async () => { calls++; return Response.json({ 1: { success: true, data: { is_free: true } } }); };
    const [first, second] = await Promise.all([
      fetchSteamApp(db, '1', 'brazilian', fetcher), fetchSteamApp(db, '1', 'brazilian', fetcher),
      fetchSteamApp(db, '1', 'english', fetcher),
    ]);
    assert.deepEqual(first, second);
    assert.equal(calls, 2);
    await fetchSteamApp(db, '1', 'brazilian', fetcher);
    assert.equal(calls, 3);
    const failed = await Promise.allSettled([0, 1].map(() => fetchSteamApp(db, '1', 'brazilian', async () => {
      calls++; return new Response('', { status: 500 });
    })));
    assert.ok(failed.every((result) => result.status === 'rejected'));
    assert.equal(calls, 4);
    await assert.rejects(fetchSteamApp(db, '1', 'brazilian', fetcher), /aguardando/);
    assert.equal(calls, 4);
    db.prepare("DELETE FROM state WHERE key='priceRetryAt'").run();
    await fetchSteamApp(db, '1', 'brazilian', fetcher);
    assert.equal(calls, 5);
  } finally { db.close(); }
});
