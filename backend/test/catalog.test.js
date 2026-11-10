import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openCatalog, upsertGames, listGames, getState, setState, transaction, DAY } from '../src/catalog/catalog.js';
import { synchronize, syncDue, syncWeekly } from '../src/catalog/sync.js';
import { GAME_FIELDS, IgdbClient } from '../src/catalog/igdb.js';
import { createApp } from '../src/server.js';
import { syncSteam } from '../src/catalog/steam.js';

const now = new Date('2026-10-23T12:00:00Z');
const epoch = now.getTime() / 1000;
const game = (id, patch = {}) => ({ id, name: `Jogo ${id}`, updated_at: epoch - 100, ...patch });

test('genres and themes appear in lists and details and are searchable in Portuguese', async () => {
  const db = openCatalog(':memory:');
  const app = createApp(db);
  try {
    assert.ok(GAME_FIELDS.includes('themes.name'));
    upsertGames(db, [game(1, { genres: [{ name: 'Adventure' }], themes: [{ name: 'Horror' }, { name: 'Thriller' }, { name: 'Adventure' }] }),
      game(2, { themes: [{ name: 'Action' }] }), game(3)]);
    const result = listGames(db).games[0];
    assert.equal(result.genre, 'Aventura, Terror, Suspense');
    assert.deepEqual(result.genres, ['Aventura', 'Terror', 'Suspense']);
    for (const query of ['terror', 'suspense', 'horror', 'thriller', 'aventura']) {
      assert.equal(listGames(db, { query }).games[0].id, 'igdb-1');
    }
    assert.equal(listGames(db, { query: 'acao' }).games[0].genre, 'Ação');
    assert.equal(listGames(db).games[2].genre, 'Gênero não informado');
    await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
    const detail = await fetch(`http://127.0.0.1:${app.address().port}/api/games/igdb-1`).then((r) => r.json());
    assert.equal(detail.genre, result.genre);
  } finally { if (app.listening) await new Promise((resolve) => app.close(resolve)); db.close(); }
});

test('theme backfill refreshes old unchanged games and resumes after failure', async () => {
  const db = openCatalog(':memory:');
  try {
    upsertGames(db, [game(1), game(2), game(3)]);
    db.exec("UPDATE games SET data=json_remove(data, '$.themes')");
    setState(db, 'importComplete', true);
    let fail = true;
    const requested = [];
    const client = { query: async (endpoint, body) => {
      const match = body.match(/where id = \((\d+)\); limit 1;/);
      if (!match) return [];
      const id = Number(match[1]); requested.push(id);
      if (id === 2 && fail) throw new Error('theme outage');
      return [game(id, { themes: [{ name: 'Horror' }] })];
    } };
    await assert.rejects(synchronize(db, client, { now, pageSize: 1 }), /theme outage/);
    assert.equal(getState(db, 'themesCursor'), 1);
    fail = false;
    await synchronize(db, client, { now, pageSize: 1 });
    assert.deepEqual(requested, [1, 2, 2, 3]);
    assert.equal(listGames(db, { query: 'terror' }).total, 3);
    await synchronize(db, client, { now, pageSize: 1 });
    assert.deepEqual(requested, [1, 2, 2, 3]);
  } finally { db.close(); }
});

test('persistent upsert, optional data, accent search, literal wildcards and atomic rollback', () => {
  const dir = mkdtempSync(join(tmpdir(), 'buscagames-'));
  let db = openCatalog(join(dir, 'catalog.sqlite'));
  try {
    transaction(db, () => upsertGames(db, [game(1, { name: 'Ação 100%', dlcs: [2], game_type: { type: 'Main Game' } }), game(2, { parent_game: 1, game_type: { type: 'DLC' } })]));
    upsertGames(db, [game(1, { name: 'Do not overwrite', updated_at: 1 })]);
    assert.equal(listGames(db, { query: 'acao' }).total, 1);
    assert.equal(listGames(db, { query: '%' }).total, 1);
    assert.equal(listGames(db, { limit: 1 }).hasMore, true);
    assert.equal(listGames(db, { limit: 1, page: 2 }).games[0].id, 'igdb-2');
    const first = listGames(db).games[0];
    assert.equal(first.price, null); assert.equal(first.sourceRating, null);
    assert.deepEqual(first.relatedIds, ['igdb-2']);
    assert.throws(() => transaction(db, () => upsertGames(db, [game(3), { id: 4 }])));
    assert.equal(listGames(db).total, 2);
    db.close(); db = openCatalog(join(dir, 'catalog.sqlite'));
    assert.equal(listGames(db).total, 2);
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('shelves use dates, rating thresholds and measured growth; missing baseline never becomes zero', () => {
  const db = openCatalog(':memory:');
  try {
    upsertGames(db, [
      game(1, { first_release_date: epoch - 2 * DAY }),
      game(2, { first_release_date: epoch + 20 * DAY }),
      game(3, { first_release_date: 946684800, total_rating: 95, total_rating_count: 100 }),
      game(4, { first_release_date: 946684800, total_rating: 99, total_rating_count: 2 }),
      game(5),
    ]);
    const ids = (section) => listGames(db, { section }, epoch).games.map((g) => g.id);
    assert.deepEqual(ids('new'), ['igdb-1']); assert.deepEqual(ids('upcoming'), ['igdb-2']);
    assert.deepEqual(ids('classics'), ['igdb-3']); assert.equal(ids('retro').length, 2);
    const add = db.prepare('INSERT INTO popularity VALUES (?, ?, ?, ?)');
    add.run(1, '2026-10-16', 0.1, epoch - 7 * DAY); add.run(1, '2026-10-23', 0.3, epoch);
    add.run(2, '2026-10-23', 0.9, epoch); // no baseline
    add.run(3, '2026-10-16', 0.4, epoch - 7 * DAY); add.run(3, '2026-10-23', 0.2, epoch);
    assert.deepEqual(ids('trending'), []);
    db.prepare('INSERT INTO steam_popularity VALUES (?, ?, ?)').run(2, 0.9, epoch);
    db.prepare('INSERT INTO steam_popularity VALUES (?, ?, ?)').run(1, 0.2, epoch);
    assert.deepEqual(ids('trending'), ['igdb-2', 'igdb-1']);
    assert.equal(listGames(db, { section: 'trending' }, epoch + 3 * DAY).games[0].metric.stale, true);
    assert.equal(ids('weekly')[0], 'igdb-2');
    assert.equal(listGames(db, { section: 'weekly' }, epoch).games[0].metric.samples, 1);
    assert.equal(listGames(db, { section: 'weekly' }, epoch + 8 * DAY).selection, 'saved');
    assert.equal(listGames(db, { section: 'weekly' }, epoch + 8 * DAY).games[0].metric.stale, true);
  } finally { db.close(); }
});

test('incremental cursor resumes after failure; watermark advances only at end; locks prevent overlap', async () => {
  const db = openCatalog(':memory:');
  try {
    setState(db, 'watermark', epoch - 2 * DAY);
    setState(db, 'importComplete', true);
    const queries = [];
    let fail = true;
    const client = { query: async (endpoint, body) => {
      queries.push(body);
      if (body.includes('updated_at >=')) {
        if (body.includes('id > 0;')) return [game(10), game(20)];
        if (fail) throw new Error('simulated outage');
        return [game(30)];
      }
      return [];
    } };
    await assert.rejects(synchronize(db, client, { now, pageSize: 2 }), /simulated/);
    assert.equal(getState(db, 'watermark'), epoch - 2 * DAY);
    assert.equal(getState(db, 'pendingWindow').cursor, 20);
    assert.equal(listGames(db).total, 2);
    fail = false;
    await synchronize(db, client, { now, pageSize: 2 });
    assert.equal(listGames(db).total, 3);
    assert.equal(getState(db, 'watermark'), epoch);
    assert.equal(getState(db, 'pendingWindow'), null);
    assert.equal(queries.filter((q) => q.includes('updated_at >=') && q.includes('id > 0;')).length, 1);
    db.prepare('INSERT INTO lease VALUES (1, ?, ?)').run('other-worker', Date.now() + 60000);
    assert.deepEqual(await synchronize(db, client, { now }), { skipped: true });
  } finally { db.close(); }
});

test('daily sampling uses provider dates, rejects stale measurements and does not duplicate reruns', async () => {
  const db = openCatalog(':memory:');
  try {
    setState(db, 'importComplete', true);
    const client = { query: async (endpoint, body) => {
      if (endpoint === 'popularity_primitives') return [
        { game_id: 1, value: 0.4, calculated_at: epoch - DAY },
        { game_id: 2, value: 0.9, calculated_at: epoch - 4 * DAY },
      ];
      if (body.includes('where id =')) return [game(1), game(2)];
      return [];
    } };
    await synchronize(db, client, { now }); await synchronize(db, client, { now });
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM popularity').get().n, 1);
    assert.equal(db.prepare('SELECT day FROM popularity').get().day, '2026-10-22');
  } finally { db.close(); }
});

test('scheduler catches up after downtime and respects daily UTC boundary', () => {
  const db = openCatalog(':memory:');
  try {
    assert.equal(syncDue(db, now), true);
    setState(db, 'lastSuccess', '2026-10-22T06:01:00Z');
    assert.equal(syncDue(db, new Date('2026-10-23T05:59:00Z')), false);
    assert.equal(syncDue(db, new Date('2026-10-23T06:00:00Z')), true);
    assert.equal(syncDue(db, new Date('2026-10-25T03:00:00Z')), true);
  } finally { db.close(); }
});

test('HTTP reads only stored data, validates pagination and supports ETags and direct details', async () => {
  const db = openCatalog(':memory:'); upsertGames(db, [game(42)]);
  const app = createApp(db);
  await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.address().port}`;
  try {
    const home = await fetch(`${base}/api/home`);
    assert.equal(home.status, 200); assert.equal((await home.json()).sections.length, 6);
    const cached = await fetch(`${base}/api/home`, { headers: { 'If-None-Match': home.headers.get('etag') } });
    assert.equal(cached.status, 304);
    for (const query of ['page=0', 'limit=999', 'section=invalid', 'page=NaN', 'q=' + 'x'.repeat(121)]) {
      assert.equal((await fetch(`${base}/api/games?${query}`)).status, 400);
    }
    assert.equal((await (await fetch(`${base}/api/games/igdb-42`)).json()).id, 'igdb-42');
    assert.equal((await fetch(`${base}/api/games/igdb-999`)).status, 404);
    assert.equal((await fetch(`${base}/api/home`, { method: 'POST' })).status, 405);
  } finally { await new Promise((resolve) => app.close(resolve)); db.close(); }
});

test('IGDB honors Retry-After, renews OAuth after 401 and never leaks provider response bodies', async () => {
  const sleeps = [];
  let authCalls = 0; let calls = 0;
  const client = new IgdbClient({ clientId: 'id', clientSecret: 'secret', wait: async (ms) => sleeps.push(ms), fetcher: async (url) => {
    if (url.includes('oauth2')) { authCalls++; return Response.json({ access_token: `token-${authCalls}`, expires_in: 3600 }); }
    calls++;
    if (calls === 1) return new Response('secret must not appear', { status: 401 });
    if (calls === 2) return new Response('', { status: 429, headers: { 'Retry-After': '2' } });
    return Response.json([game(1)]);
  } });
  assert.equal((await client.query('games', 'fields name;'))[0].id, 1);
  assert.equal(authCalls, 2); assert.ok(sleeps.includes(2000));
  client.fetcher = async () => new Response('secret must not appear', { status: 403 });
  await assert.rejects(client.query('games', 'fields name;'), { message: 'IGDB: HTTP 403' });
  client.fetcher = async () => Response.json({ invalid: true });
  await assert.rejects(client.query('games', 'fields name;'), /resposta inválida/);
  client.fetcher = async () => new Response('', { status: 429, headers: { 'Retry-After': '7200' } });
  await assert.rejects(client.query('games', 'fields name;'), (error) => error.retryAt > Date.now() + 7100000);
  client.token = null;
  client.fetcher = async () => Response.json({ message: 'invalid client secret', secret: 'do not log' }, { status: 403 });
  await assert.rejects(client.authenticate(), (error) => {
    assert.match(error.message, /^Twitch OAuth: HTTP 403/);
    assert.match(error.message, /Client ID e o Client Secret/);
    assert.equal(error.message.includes('do not log'), false);
    return true;
  });
});

test('Steam snapshot is atomic and preserves the prior ranking on missing or stale data', async () => {
  const db = openCatalog(':memory:');
  try {
    const query = async (endpoint) => endpoint === 'games' ? [game(7)] : [{ game_id: 7, value: 0.5, calculated_at: epoch }];
    assert.equal(await syncSteam(db, query, epoch), 1);
    assert.equal(listGames(db, { section: 'trending' }, epoch).games[0].metric.source, 'Steam via IGDB');
    await assert.rejects(syncSteam(db, async () => [], epoch), /ausente/);
    await assert.rejects(syncSteam(db, async () => [{ game_id: 8, value: 1, calculated_at: epoch - 4 * DAY }], epoch), /desatualizado/);
    assert.equal(listGames(db, { section: 'trending' }, epoch).games[0].id, 'igdb-7');
  } finally { db.close(); }
});

test('localized Steam description and PC requirements are stored safely without changing names', async () => {
  const { enrichGame, localizeGame, plainText } = await import('../src/catalog/localization.js');
  const db = openCatalog(':memory:');
  try {
    const g = { sourceId: 7, title: 'Original Title', companies: ['Original Studio'], summary: 'English summary', genres: ['Shooter'], modes: ['Single player'], platforms: ['PC (Microsoft Windows)'], websites: [{ url: 'https://store.steampowered.com/app/730/' }] };
    const fetcher = async (url) => Response.json({ 730: { success: true, data: { short_description: url.includes('brazilian') ? 'Uma aventura com Original Title.' : 'An adventure with Original Title.', pc_requirements: { minimum: '<strong>Memória:</strong><br>8 GB<script>bad()</script>' } } } });
    await enrichGame(db, g, fetcher);
    const localized = localizeGame(db, g);
    assert.equal(localized.title, 'Original Title');
    assert.deepEqual(localized.companies, ['Original Studio']);
    assert.equal(localized.summary, 'Uma aventura com Original Title.');
    assert.equal(localized.genre, 'Tiro');
    assert.equal(localized.pcRequirements, 'Memória:\n8 GB');
    assert.equal(localizeGame(db, { ...g, summary: 'Changed' }).summaryPending, true);
    assert.equal(plainText('A &amp; B &#65;'), 'A & B A');
  } finally { db.close(); }
});


test('localization backs off failures, retains requirements and resumes queued jobs', async () => {
  const { processLocalization, localizeGame } = await import('../src/catalog/localization.js');
  const db = openCatalog(':memory:');
  try {
    upsertGames(db, [game(730, { summary: 'English', websites: [{url:'https://store.steampowered.com/app/730/'}] })]);
    let calls = 0;
    const failing = async () => { calls++; if (calls === 2) throw new Error('network'); return Response.json({730:{success:true,data:{pc_requirements:{minimum:'8 GB'},short_description:'Uma aventura.'}}}); };
    await processLocalization(db, failing);
    const g = JSON.parse(db.prepare('SELECT data FROM games').get().data);
    assert.equal(localizeGame(db,g).pcRequirements, '8 GB');
    assert.equal(localizeGame(db,g).summaryStatus, 'unavailable');
    await processLocalization(db, failing);
    assert.equal(calls, 2);
    db.prepare("UPDATE localization_attempts SET retry_at='2000-01-01T00:00:00Z'").run();
    db.prepare("DELETE FROM state WHERE key='priceRetryAt'").run();
    await processLocalization(db, async (url) => Response.json({730:{success:true,data:{pc_requirements:{minimum:'8 GB'},short_description:url.includes('brazilian')?'Uma aventura.':'An adventure.'}}}));
    assert.equal(localizeGame(db,g).summaryStatus, 'ready');
    assert.equal(db.prepare('SELECT count(*) n FROM localization_queue').get().n, 0);
  } finally { db.close(); }
});

test('exhausted quota has an explicit status and retries at the next UTC day', async () => {
  const { processLocalization, localizeGame } = await import('../src/catalog/localization.js');
  const db = openCatalog(':memory:');
  try {
    upsertGames(db, [game(1, {summary:'An English summary'})]);
    db.prepare('INSERT INTO translation_budget VALUES (?,4500)').run(new Date().toISOString().slice(0,10));
    await processLocalization(db, () => { throw new Error('must not fetch'); });
    const localized = localizeGame(db, JSON.parse(db.prepare('SELECT data FROM games').get().data));
    assert.equal(localized.summaryStatus, 'quota');
    assert.ok(Date.parse(localized.localizationRetryAt) > Date.now());
  } finally { db.close(); }
});


test('weekly fallback is paginated, searchable, honest and replaced by fresh measurements', async () => {
  const db = openCatalog(':memory:');
  try {
    assert.equal(listGames(db, { section: 'weekly' }, epoch).total, 0);
    upsertGames(db, [game(1, { total_rating_count: 100 }), game(2)]);
    const fallback = listGames(db, { section: 'weekly', limit: 1 }, epoch);
    assert.equal(fallback.selection, 'catalog');
    assert.equal(fallback.hasMore, true);
    assert.equal(fallback.games[0].metric, null);
    assert.equal(listGames(db, { section: 'weekly', page: 2, limit: 1 }, epoch).games[0].id, 'igdb-2');
    assert.equal(listGames(db, { section: 'weekly', query: 'absent' }, epoch).total, 0);
    const query = async (endpoint) => endpoint === 'games' ? [game(2)] : [{ game_id: 2, value: 0.9, calculated_at: epoch }];
    await syncWeekly(db, query, epoch);
    assert.equal(listGames(db, { section: 'weekly' }, epoch).selection, 'weekly');
    assert.equal(listGames(db, { section: 'weekly' }, epoch).games[0].id, 'igdb-2');
    await assert.rejects(syncWeekly(db, async () => [], epoch + 20 * DAY), /ausente/);
    const saved = listGames(db, { section: 'weekly' }, epoch + 20 * DAY);
    assert.equal(saved.selection, 'saved');
    assert.equal(saved.games[0].metric.measuredAt, now.toISOString());
    assert.equal(saved.games[0].metric.stale, true);
    setState(db, 'lastSuccess', now.toISOString());
    setState(db, 'weeklyLastError', 'empty');
    assert.equal(syncDue(db, now), true);
  } finally { db.close(); }
});

test('weekly collection commits before a later catalog failure', async () => {
  const db = openCatalog(':memory:');
  try {
    const client = { query: async (endpoint, body) => {
      if (endpoint === 'popularity_primitives') return [{ game_id: 1, value: 0.5, calculated_at: epoch }];
      if (body.includes('where id =')) return [game(1)];
      throw new Error('catalog outage');
    } };
    await assert.rejects(synchronize(db, client, { now }), /catalog outage/);
    assert.equal(listGames(db, { section: 'weekly' }, epoch).games[0].id, 'igdb-1');
  } finally { db.close(); }
});


test('hack and slash spelling variants share the Portuguese genre and search', async () => {
  const { label, localizeGame } = await import('../src/catalog/localization.js');
  const db = openCatalog(':memory:');
  try {
    for (const name of ["Hack and slash/Beat 'em up", 'Hack and slash/Beat em up', 'Hack and slash/Beat ’em up']) {
      assert.equal(label(name), 'Combate corpo a corpo');
      upsertGames(db, [game(1, { genres: [{ name }] })]);
      assert.equal(listGames(db, { query: 'combate corpo a corpo' }).games[0].genre, 'Combate corpo a corpo');
      assert.equal(localizeGame(db, JSON.parse(db.prepare('SELECT data FROM games WHERE id=1').get().data)).genre, 'Combate corpo a corpo');
    }
  } finally { db.close(); }
});
