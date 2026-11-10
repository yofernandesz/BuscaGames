import { randomUUID } from 'node:crypto';
import { DAY, getState, setState, transaction, upsertGames } from './catalog.js';
import { GAME_FIELDS } from './igdb.js';
import { syncSteam } from './steam.js';

const chunks = function* (values, size = 200) {
  for (let i = 0; i < values.length; i += size) yield values.slice(i, i + size);
};

export function syncDue(db, now = new Date(), hour = 6) {
  const last = getState(db, 'lastSuccess');
  if (!last || getState(db, 'weeklyLastError')) return true;
  const due = new Date(now); due.setUTCHours(hour, 0, 0, 0);
  if (now < due) due.setUTCDate(due.getUTCDate() - 1);
  return new Date(last) < due;
}

export async function synchronize(db, client, { now = new Date(), maxPages = 20, pageSize = 500 } = {}) {
  const owner = randomUUID();
  const lock = db.prepare(`INSERT INTO lease VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE
    SET owner=excluded.owner, expires=excluded.expires WHERE lease.expires < ?`)
    .run(owner, Date.now() + 300000, Date.now());
  if (!lock.changes) return { skipped: true };
  const epoch = Math.floor(now.getTime() / 1000);
  const day = now.toISOString().slice(0, 10);
  setState(db, 'lastAttempt', now.toISOString());
  setState(db, 'syncing', true);
  const query = async (endpoint, body) => {
    const renewed = db.prepare('UPDATE lease SET expires=? WHERE id=1 AND owner=?').run(Date.now() + 300000, owner);
    if (!renewed.changes) throw new Error('Sincronização perdeu a exclusividade');
    return client.query(endpoint, body);
  };
  const save = (rows) => transaction(db, () => upsertGames(db, rows));
  try {
    try { await syncWeekly(db, query, epoch); }
    catch (error) {
      setState(db, 'weeklyLastError', error.message);
      console.warn('Interesse semanal preservado:', error.message);
      if (error.retryAt) throw error;
    }
    try { await syncSteam(db, query, epoch); }
    catch (error) {
      setState(db, 'steamLastError', error.message);
      console.warn('Ranking Steam preservado:', error.message);
      if (error.retryAt) throw error;
    }
    if (!getState(db, 'watermark')) setState(db, 'watermark', epoch - DAY);

    // Refresh useful shelves first, even while the full import is still progressing.
    const filters = [
      `first_release_date >= ${epoch - 90 * DAY} & first_release_date <= ${epoch}; sort first_release_date desc`,
      `first_release_date > ${epoch} & first_release_date <= ${epoch + 365 * DAY}; sort first_release_date asc`,
      `first_release_date <= ${Math.floor(epoch - 10 * 365.25 * DAY)} & total_rating >= 80 & total_rating_count >= 50; sort total_rating desc`,
      `first_release_date <= ${Math.floor(epoch - 15 * 365.25 * DAY)} & (platforms.generation = (1,2,3,4,5,6) | first_release_date < 978307200); sort total_rating_count desc`,
    ];
    const related = new Set();
    for (const filter of filters) {
      const rows = await query('games', `fields ${GAME_FIELDS}; where ${filter}; limit 100;`);
      save(rows);
      for (const row of rows) for (const id of [...(row.dlcs || []), ...(row.expansions || []), ...(row.standalone_expansions || []), ...(row.parent_game ? [row.parent_game] : [])]) related.add(id);
    }

    // Fixed update window plus an ID cursor: bounded work, no offset drift or lost watermark on failure.
    const window = getState(db, 'pendingWindow') || { since: Math.max(0, getState(db, 'watermark') - DAY), until: epoch, cursor: 0 };
    for (let page = 0; page < maxPages; page++) {
      const rows = await query('games', `fields ${GAME_FIELDS}; where updated_at >= ${window.since} & updated_at <= ${window.until} & id > ${window.cursor}; sort id asc; limit ${pageSize};`);
      transaction(db, () => {
        upsertGames(db, rows);
        if (rows.length < pageSize) {
          setState(db, 'watermark', window.until); setState(db, 'pendingWindow', null);
        } else {
          window.cursor = rows.at(-1).id; setState(db, 'pendingWindow', window);
        }
      });
      if (rows.length < pageSize) break;
    }

    if (!getState(db, 'importComplete', false)) {
      for (let page = 0; page < maxPages; page++) {
        const cursor = getState(db, 'importCursor', 0);
        const rows = await query('games', `fields ${GAME_FIELDS}; where id > ${cursor}; sort id asc; limit ${pageSize};`);
        transaction(db, () => {
          upsertGames(db, rows);
          if (rows.length) setState(db, 'importCursor', rows.at(-1).id);
          if (rows.length < pageSize) setState(db, 'importComplete', true);
        });
        if (rows.length < pageSize) break;
      }
    }

    // Older imports never requested themes. Refresh them even without an IGDB updated_at change.
    for (let page = 0; page < maxPages; page++) {
      const ids = db.prepare("SELECT id FROM games WHERE id > ? AND json_type(data, '$.themes') IS NULL ORDER BY id LIMIT ?")
        .all(getState(db, 'themesCursor', 0), pageSize).map((row) => row.id);
      if (!ids.length) break;
      const rows = await query('games', `fields ${GAME_FIELDS}; where id = (${ids.join(',')}); limit ${pageSize};`);
      transaction(db, () => {
        upsertGames(db, rows);
        setState(db, 'themesCursor', ids.at(-1));
      });
    }

    for (const ids of chunks([...related])) save(await query('games', `fields ${GAME_FIELDS}; where id = (${ids.join(',')}); limit 500;`));
    transaction(db, () => {
      setState(db, 'lastSuccess', now.toISOString()); setState(db, 'lastError', null);
      setState(db, 'retryAfter', null);
    });
    console.info(`Catálogo sincronizado: ${day}`);
    return { success: true };
  } catch (error) {
    setState(db, 'lastError', error.message);
    if (error.retryAt) setState(db, 'retryAfter', error.retryAt);
    throw error;
  } finally {
    setState(db, 'syncing', false);
    db.prepare('DELETE FROM lease WHERE owner=?').run(owner);
  }
}

export async function syncWeekly(db, query, epoch) {
  const fields = 'game_id,value,calculated_at,popularity_type';
  const popular = await query('popularity_primitives', `fields ${fields}; where popularity_type = 1; sort value desc; limit 200;`);
  const seen = new Set(popular.map((row) => row.game_id));
  const previous = db.prepare('SELECT DISTINCT game_id FROM popularity WHERE day >= ?')
    .all(new Date((epoch - 8 * DAY) * 1000).toISOString().slice(0, 10)).map((row) => row.game_id).filter((id) => !seen.has(id));
  // Observe former leaders too: falling out of today's top 200 does not mean zero interest.
  for (const ids of chunks(previous)) popular.push(...await query('popularity_primitives',
    `fields ${fields}; where popularity_type = 1 & game_id = (${ids.join(',')}); limit 500;`));
  for (const row of popular) {
    if (!Number.isSafeInteger(row.game_id) || row.game_id <= 0 || !Number.isFinite(row.value) || row.value < 0 || !Number.isFinite(row.calculated_at)) {
      throw new Error('IGDB: indicador de popularidade inválido');
    }
  }
  const fresh = popular.filter((row) => row.calculated_at >= epoch - 2 * DAY && row.calculated_at <= epoch + 3600);
  if (!fresh.length) throw new Error('IGDB: interesse semanal ausente ou desatualizado');
  const games = [];
  for (const ids of chunks([...new Set(fresh.map((row) => row.game_id))])) games.push(...await query('games', `fields ${GAME_FIELDS}; where id = (${ids.join(',')}); limit 500;`));
  const available = new Set(games.map((game) => game.id));
  if (!fresh.some((row) => available.has(row.game_id))) throw new Error('IGDB: metadados do interesse semanal indisponíveis');
  transaction(db, () => {
    upsertGames(db, games);
    const write = db.prepare('INSERT OR REPLACE INTO popularity VALUES (?, ?, ?, ?)');
    for (const row of fresh) {
      if (!available.has(row.game_id)) continue;
      // A stale provider snapshot must never be presented as today's measurement.
      const sampleDay = new Date(row.calculated_at * 1000).toISOString().slice(0, 10);
      write.run(row.game_id, sampleDay, row.value, row.calculated_at);
    }
    db.prepare('DELETE FROM popularity WHERE day < ?').run(new Date((epoch - 15 * DAY) * 1000).toISOString().slice(0, 10));
    setState(db, 'weeklyLastError', null);
  });
}

export function startScheduler(db, client, hour = 6) {
  let running = false;
  const tick = async () => {
    const lastAttempt = getState(db, 'lastAttempt');
    if (running || Date.now() < getState(db, 'retryAfter', 0) || !syncDue(db, new Date(), hour) || (lastAttempt && Date.now() - Date.parse(lastAttempt) < 3600000)) return;
    running = true;
    try { await synchronize(db, client); }
    catch (error) { console.error(`Sincronização adiada: ${error.message}`); }
    finally { running = false; }
  };
  void tick();
  const timer = setInterval(tick, 60000);
  return () => clearInterval(timer);
}
