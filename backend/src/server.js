import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { openCatalog, getState, listGames, SECTIONS } from './catalog/catalog.js';
import { IgdbClient } from './catalog/igdb.js';
import { startScheduler, synchronize } from './catalog/sync.js';
import { enqueueLocalization, localizeGame, localizationHash, startLocalization } from './catalog/localization.js';
import { enqueuePrice, startPrices } from './catalog/prices.js';
import { communityHandler } from './community/community.js';

export function createApp(db, configured = false) {
  // Bounded response cache; all external traffic is confined to the background worker.
  const cache = new Map();
  let priceRevision = 0;
  const handleCommunity = communityHandler(db);
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (await handleCommunity(req, res, url)) return;
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end();
      }
      if (url.pathname === '/api/health') {
        db.prepare('SELECT 1').get();
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        return res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ ok: true }));
      }
      const key = url.pathname + url.search;
      const revision = getState(db, 'priceRevision', 0);
      if (revision !== priceRevision) { cache.clear(); priceRevision = revision; }
      const detailId = /^\/api\/games\/igdb-\d+$/.test(url.pathname) ? Number(url.pathname.split('igdb-')[1]) : null;
      const detailRow = Number.isSafeInteger(detailId) && db.prepare('SELECT data FROM games WHERE id=?').get(detailId);
      const detailGame = detailRow ? JSON.parse(detailRow.data) : null;
      if (detailGame && req.method === 'GET') enqueuePrice(db, detailGame, url.searchParams.get('preview') === '1' ? 0 : 1);
      // Record actual detail views even on a cache hit. Home previews and HEAD requests are not visits.
      if (detailGame && req.method === 'GET' && url.searchParams.get('preview') !== '1') {
        const localized = db.prepare('SELECT * FROM game_localization WHERE game_id=?').get(detailId);
        if (!localized || localized.hash !== localizationHash(detailGame) || (!localized.summary && detailGame.summary)
          || Date.now() - Date.parse(localized.checked_at) > (localized.summary ? 30 : 1) * 86400000) {
          enqueueLocalization(db, detailId, 1);
        }
      }
      let entry = cache.get(key);
      if (!entry || entry.expires < Date.now()) {
        let data;
        if (url.pathname === '/api/home') {
          const lastSuccess = getState(db, 'lastSuccess');
          data = {
            sections: SECTIONS.map((section) => ({ ...section, ...listGames(db, { section: section.id, limit: 6 }) })),
            catalog: listGames(db),
            status: { configured, lastSuccess, stale: !lastSuccess || Date.now() - Date.parse(lastSuccess) > 36 * 3600000,
              syncing: Boolean(db.prepare('SELECT 1 FROM lease WHERE expires > ?').get(Date.now())),
              degraded: Boolean(getState(db, 'lastError') || getState(db, 'weeklyLastError')),
              importComplete: getState(db, 'importComplete', false), pendingUpdates: Boolean(getState(db, 'pendingWindow')) },
          };
        } else if (url.pathname === '/api/games') {
          const page = Number(url.searchParams.get('page') || 1);
          const limit = Number(url.searchParams.get('limit') || 12);
          const section = url.searchParams.get('section') || '';
          const query = (url.searchParams.get('q') || '').trim();
          if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 48 || query.length > 120 || (section && !SECTIONS.some((s) => s.id === section))) {
            res.writeHead(400); return res.end('Parâmetros inválidos');
          }
          data = listGames(db, { page, limit, section, query });
        } else if (detailGame) {
          data = localizeGame(db, detailGame);
        }
        if (!data) { res.writeHead(404); return res.end('Não encontrado'); }
        const body = JSON.stringify(data);
        entry = { body, etag: `"${createHash('sha256').update(body).digest('hex')}"`, expires: Date.now() + 60000 };
        if (cache.size >= 200) cache.delete(cache.keys().next().value);
        cache.set(key, entry);
      }
      const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=0, must-revalidate', ETag: entry.etag, 'X-Content-Type-Options': 'nosniff' };
      if (req.headers['if-none-match'] === entry.etag) { res.writeHead(304, headers); return res.end(); }
      res.writeHead(200, headers); res.end(req.method === 'HEAD' ? undefined : entry.body);
    } catch (error) {
      console.error('Falha ao consultar catálogo:', error.message);
      res.writeHead(500, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: 'Catálogo temporariamente indisponível' }));
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const db = openCatalog(process.env.DATABASE_PATH || fileURLToPath(new URL('../data/catalog.sqlite', import.meta.url)));
  const configured = Boolean(process.env.IGDB_CLIENT_ID && process.env.IGDB_CLIENT_SECRET);
  const hour = Number(process.env.SYNC_HOUR_UTC ?? 6);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error('SYNC_HOUR_UTC deve ser um inteiro de 0 a 23');
  const client = new IgdbClient({ clientId: process.env.IGDB_CLIENT_ID, clientSecret: process.env.IGDB_CLIENT_SECRET });
  if (process.argv.includes('--sync')) {
    try {
      if (!configured) throw new Error('Configure IGDB_CLIENT_ID e IGDB_CLIENT_SECRET');
      await synchronize(db, client);
    } catch (error) { console.error(error.message); process.exitCode = 1; }
    finally { db.close(); }
  } else {
    const app = createApp(db, configured);
    const stop = configured ? startScheduler(db, client, hour) : () => {};
    // Prewarm every home shelf independently of visits, without re-fetching fresh entries.
    for (const section of ['', ...SECTIONS.map((item) => item.id)]) {
      for (const game of listGames(db, { section, limit: 6 }).games) {
        if (!game.requirementsCheckedAt || game.summaryPending) {
          enqueueLocalization(db, game.sourceId);
        }
      }
    }
    const stopLocalization = startLocalization(db);
    const stopPrices = startPrices(db);
    if (!configured) console.warn('IGDB não configurada. Catálogo persistido continua disponível.');
    app.listen(Number(process.env.PORT || 3001), '0.0.0.0', () => console.info('API BuscaGames pronta'));
    for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
      stop(); stopLocalization(); stopPrices(); app.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 5000).unref();
    });
  }
}
