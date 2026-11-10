import { setTimeout as sleep } from 'node:timers/promises';

const MAX_AGE = 6 * 3600000;
export const steamAppId = (game) => (game.websites || [])
  .map((site) => site.url?.match(/^https?:\/\/(?:www\.)?store\.steampowered\.com\/app\/([1-9]\d*)(?:[/?#]|$)/i)?.[1]).find(Boolean) || null;

export const steamRetryAt = (db) => {
  const row = db.prepare("SELECT value FROM state WHERE key='priceRetryAt'").get();
  const retryAt = row && JSON.parse(row.value);
  return Date.parse(retryAt) > Date.now() ? retryAt : null;
};

// Prices and localization share the provider cooldown; invalid product data only delays that product.
const steamRequests = new WeakMap();

export function fetchSteamApp(db, appId, language, fetcher = fetch) {
  let requests = steamRequests.get(db);
  if (!requests) { requests = new Map(); steamRequests.set(db, requests); }
  const key = `${appId}:${language}`;
  // Share only in-flight requests. Completed prices keep their existing database TTL.
  if (!requests.has(key)) {
    const pending = requestSteamApp(db, appId, language, fetcher).finally(() => requests.delete(key));
    requests.set(key, pending);
  }
  return requests.get(key);
}

async function requestSteamApp(db, appId, language, fetcher) {
  const cooldown = steamRetryAt(db);
  if (cooldown) throw Object.assign(new Error('Steam: aguardando nova tentativa'), { retryAt: Date.parse(cooldown), providerFailure: true });
  await sleep(350);
  const updatedCooldown = steamRetryAt(db);
  if (updatedCooldown) throw Object.assign(new Error('Steam: aguardando nova tentativa'), { retryAt: Date.parse(updatedCooldown), providerFailure: true });
  let response;
  try {
    response = await fetcher(`https://store.steampowered.com/api/appdetails?appids=${appId}&cc=br&l=${language}`, { signal: AbortSignal.timeout(15000) });
  } catch {
    response = null;
  }
  if (!response?.ok) {
    const providerFailure = !response || [403, 429].includes(response.status) || response.status >= 500;
    const retryAfter = response?.headers.get('retry-after');
    const requested = /^\d+$/.test(retryAfter || '') ? Date.now() + Number(retryAfter) * 1000 : Date.parse(retryAfter);
    const delay = response?.status === 429 || response?.status === 403 ? 3600000 : 300000;
    const retryAt = Math.max(Date.now() + delay, Number.isFinite(requested) ? requested : 0);
    await response?.body?.cancel();
    if (providerFailure) {
      db.prepare(`INSERT INTO state VALUES ('priceRetryAt', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`)
        .run(JSON.stringify(new Date(retryAt).toISOString()));
      invalidatePrices(db);
    }
    throw Object.assign(new Error(response ? `Steam: HTTP ${response.status}` : 'Steam: falha de rede'), { retryAt, providerFailure });
  }
  return (await response.json())[appId];
}

export function enqueuePrice(db, game, priority = 0, saved) {
  const appId = steamAppId(game);
  if (!appId) return;
  if (saved === undefined) saved = db.prepare('SELECT * FROM game_prices WHERE game_id=?').get(game.sourceId);
  const maxAge = saved?.status === 'unavailable' ? 24 * 3600000 : MAX_AGE;
  if (saved?.app_id === appId && saved.status !== 'error' && Date.now() - Date.parse(saved.checked_at) < maxAge) return;
  db.prepare(`INSERT INTO price_queue (game_id, requested, priority) VALUES (?, ?, ?)
    ON CONFLICT(game_id) DO UPDATE SET priority=excluded.priority WHERE excluded.priority > price_queue.priority`)
    .run(game.sourceId, new Date().toISOString(), priority);
}

function invalidatePrices(db) {
  db.prepare(`INSERT INTO state VALUES ('priceRevision', '1')
    ON CONFLICT(key) DO UPDATE SET value=CAST(value AS INTEGER)+1`).run();
}

export function saveSteamPrice(db, game, appId, data) {
  if (data.steam_appid != null && String(data.steam_appid) !== appId) throw new Error('Steam: aplicativo divergente');
  const offer = data.price_overview;
  const paid = offer?.currency === 'BRL' && Number.isSafeInteger(offer.final) && offer.final >= 0
    && Number.isSafeInteger(offer.initial) && offer.initial >= offer.final;
  if (offer?.currency === 'BRL' && !paid) throw new Error('Steam: preço inválido');
  const free = data.is_free === true;
  const amount = paid ? offer.final : free ? 0 : null;
  const initial = paid ? offer.initial : free ? 0 : null;
  const status = paid ? 'ready' : free ? 'free' : 'unavailable';
  db.prepare(`INSERT OR REPLACE INTO game_prices
    (game_id, app_id, amount, initial, status, checked_at, retry_at) VALUES (?, ?, ?, ?, ?, ?, NULL)`)
    .run(game.sourceId, appId, amount, initial, status, new Date().toISOString());
  db.prepare('DELETE FROM price_queue WHERE game_id=?').run(game.sourceId);
  invalidatePrices(db);
}

export function priceFields(db, game, saved = db.prepare('SELECT * FROM game_prices WHERE game_id=?').get(game.sourceId), cooldown = steamRetryAt(db)) {
  const appId = steamAppId(game);
  const current = saved?.app_id === appId ? saved : null;
  const stale = current?.amount != null && (current.status === 'error' || Date.now() - Date.parse(current.checked_at) >= MAX_AGE);
  const retryAt = [appId && cooldown, current?.retry_at]
    .filter((value) => Date.parse(value) > Date.now()).sort().at(-1) || null;
  return {
    price: current?.amount == null ? null : current.amount / 100,
    priceInitial: current?.initial == null ? null : current.initial / 100,
    priceCurrency: appId ? 'BRL' : null,
    priceIsFree: current?.status === 'free',
    priceStatus: !appId ? 'no_source' : stale ? 'stale' : current?.status || (retryAt ? 'error' : 'pending'),
    priceRetryAt: retryAt,
    priceCheckedAt: current?.checked_at || null,
    priceSource: appId ? `https://store.steampowered.com/app/${appId}/?cc=br&l=brazilian` : null,
  };
}

export async function processPrices(db, fetcher = fetch) {
  if (steamRetryAt(db)) return;
  const next = db.prepare(`SELECT g.data FROM price_queue q JOIN games g ON g.id=q.game_id
    LEFT JOIN game_prices p ON p.game_id=g.id
    WHERE p.retry_at IS NULL OR julianday(p.retry_at) <= julianday('now')
    ORDER BY q.priority DESC, q.requested ASC, q.game_id ASC LIMIT 1`);
  for (let count = 0; count < 10; count++) {
    const row = next.get();
    if (!row) break;
    const game = JSON.parse(row.data);
    const appId = steamAppId(game);
    if (!appId) { db.prepare('DELETE FROM price_queue WHERE game_id=?').run(game.sourceId); continue; }
    try {
      const payload = await fetchSteamApp(db, appId, 'brazilian', fetcher);
      if (!payload || typeof payload.success !== 'boolean' || (payload.success && typeof payload.data?.is_free !== 'boolean')) {
        throw new Error('Steam: resposta inválida');
      }
      saveSteamPrice(db, game, appId, payload.success ? payload.data : {});
    } catch (error) {
      const retryAt = new Date(Number.isFinite(error.retryAt) ? error.retryAt : Date.now() + 15 * 60000).toISOString();
      db.prepare(`INSERT INTO game_prices (game_id, app_id, status, retry_at) VALUES (?, ?, 'error', ?)
        ON CONFLICT(game_id) DO UPDATE SET status='error', retry_at=excluded.retry_at,
          amount=CASE WHEN app_id=excluded.app_id THEN amount ELSE NULL END,
          initial=CASE WHEN app_id=excluded.app_id THEN initial ELSE NULL END,
          checked_at=CASE WHEN app_id=excluded.app_id THEN checked_at ELSE NULL END,
          app_id=excluded.app_id`)
        .run(game.sourceId, appId, retryAt);
      invalidatePrices(db);
      console.warn(`Preço ${game.id}: ${error.message}`);
      if (error.providerFailure) break;
    }
  }
}

export function startPrices(db) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await processPrices(db); }
    catch (error) { console.warn('Fila de preços:', error.message); }
    finally { running = false; }
  };
  void tick();
  const timer = setInterval(tick, 60000);
  return () => clearInterval(timer);
}
