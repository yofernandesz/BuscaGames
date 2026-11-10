import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openCatalog, upsertGames } from '../src/catalog/catalog.js';
import { enqueueLocalization, localizationHash, processLocalization } from '../src/catalog/localization.js';
import { createApp } from '../src/server.js';

test('upgrades existing queues without losing jobs and preserves priority after reopening', () => {
  const dir = mkdtempSync(join(tmpdir(), 'buscagames-queue-'));
  const path = join(dir, 'catalog.sqlite');
  let db = new DatabaseSync(path);
  try {
    db.exec("CREATE TABLE localization_queue (game_id INTEGER PRIMARY KEY, requested TEXT NOT NULL); INSERT INTO localization_queue VALUES (1, '2026-01-01')");
    db.close(); db = openCatalog(path);
    assert.equal(db.prepare('SELECT priority FROM localization_queue').get().priority, 0);
    enqueueLocalization(db, 1, 1);
    const first = { ...db.prepare('SELECT * FROM localization_queue').get() };
    enqueueLocalization(db, 1); enqueueLocalization(db, 1, 1);
    db.close(); db = openCatalog(path);
    assert.deepEqual({ ...db.prepare('SELECT * FROM localization_queue').get() }, first);
    assert.equal(first.priority, 1);
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('visits are FIFO ahead of background work, including visits arriving during a batch', async () => {
  const db = openCatalog(':memory:');
  try {
    upsertGames(db, Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: `Game ${i + 1}`, summary: `Summary ${i + 1}.` })));
    enqueueLocalization(db, 1);
    enqueueLocalization(db, 2, 1); enqueueLocalization(db, 3, 1); enqueueLocalization(db, 4, 1);
    db.prepare("UPDATE localization_queue SET requested='2000-01-01' WHERE game_id=1").run();
    db.prepare("UPDATE localization_queue SET requested='2001-01-01' WHERE game_id=2").run();
    db.prepare("UPDATE localization_queue SET requested='2002-01-01' WHERE game_id=3").run();
    enqueueLocalization(db, 2, 1);
    const retry = new Date(Date.now() + 86400000).toISOString();
    db.prepare("INSERT INTO localization_attempts VALUES (4, 'quota', ?)").run(retry);
    const order = [];
    await processLocalization(db, async (url) => {
      order.push(Number(url.searchParams.get('q').match(/\d+/)[0]));
      if (order.length === 1) enqueueLocalization(db, 12, 1);
      return Response.json({ responseStatus: 200, responseData: { translatedText: 'Texto traduzido.' } });
    });
    assert.deepEqual(order.slice(0, 4), [2, 3, 12, 1]);
    assert.equal(order.length, 10);
    assert.equal(order.includes(4), false);
    assert.equal(db.prepare('SELECT priority FROM localization_queue WHERE game_id=4').get().priority, 1);
    assert.equal(db.prepare('SELECT retry_at FROM localization_attempts WHERE game_id=4').get().retry_at, retry);
  } finally { db.close(); }
});

test('detail views promote pending translations on cache hits without resetting quota or requeuing ready text', async () => {
  const db = openCatalog(':memory:');
  upsertGames(db, [{ id: 1, name: 'Game', summary: 'English summary' }]);
  const game = JSON.parse(db.prepare('SELECT data FROM games WHERE id=1').get().data);
  const now = new Date().toISOString();
  db.prepare('INSERT INTO game_localization VALUES (?, ?, NULL, ?, NULL, ?)').run(1, localizationHash(game), '8 GB', now);
  const retry = new Date(Date.now() + 86400000).toISOString();
  db.prepare("INSERT INTO localization_attempts VALUES (1, 'quota', ?)").run(retry);
  const app = createApp(db);
  await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${app.address().port}/api/games/igdb-1`;
  try {
    await fetch(`${url}?preview=1`);
    await fetch(url, { method: 'HEAD' });
    assert.equal(db.prepare('SELECT COUNT(*) n FROM localization_queue').get().n, 0);
    enqueueLocalization(db, 1);
    const response = await fetch(url);
    assert.equal((await response.json()).summaryStatus, 'quota');
    const visit = { ...db.prepare('SELECT * FROM localization_queue').get() };
    assert.equal(visit.priority, 1);
    assert.equal((await fetch(url, { headers: { 'If-None-Match': response.headers.get('etag') } })).status, 304);
    assert.deepEqual({ ...db.prepare('SELECT * FROM localization_queue').get() }, visit);
    assert.equal(db.prepare('SELECT retry_at FROM localization_attempts').get().retry_at, retry);
    db.prepare("UPDATE game_localization SET summary='Descrição pronta'").run();
    db.prepare('DELETE FROM localization_queue').run();
    await fetch(url);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM localization_queue').get().n, 0);
  } finally { await new Promise((resolve) => app.close(resolve)); db.close(); }
});
