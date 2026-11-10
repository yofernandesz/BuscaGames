import { DAY, transaction, upsertGames, setState } from './catalog.js';
import { GAME_FIELDS } from './igdb.js';

// IGDB PopScore type 5 is a normalized Steam 24-hour peak indicator, not raw CCU.
export async function syncSteam(db, query, now = Math.floor(Date.now() / 1000)) {
  const rows = await query('popularity_primitives', 'fields game_id,value,calculated_at; where popularity_type = 5; sort value desc; limit 100;');
  if (!rows.length || rows.some((row) => !Number.isSafeInteger(row.game_id) || row.game_id <= 0 || !Number.isFinite(row.value) || row.value < 0 || !Number.isFinite(row.calculated_at))) {
    throw new Error('Steam via IGDB: ranking ausente ou inválido');
  }
  const fresh = rows.filter((row) => row.calculated_at >= now - 2 * DAY && row.calculated_at <= now + 3600);
  if (!fresh.length) throw new Error('Steam via IGDB: ranking desatualizado');
  const ids = [...new Set(fresh.map((row) => row.game_id))];
  const games = await query('games', `fields ${GAME_FIELDS}; where id = (${ids.join(',')}); limit 500;`);
  const available = new Set(games.map((game) => game.id));
  const ranked = fresh.filter((row) => available.has(row.game_id));
  if (!ranked.length) throw new Error('Steam via IGDB: metadados indisponíveis');
  transaction(db, () => {
    upsertGames(db, games);
    db.exec('DELETE FROM steam_popularity');
    const write = db.prepare('INSERT OR REPLACE INTO steam_popularity VALUES (?, ?, ?)');
    for (const row of ranked) write.run(row.game_id, row.value, row.calculated_at);
    setState(db, 'steamLastSuccess', new Date(now * 1000).toISOString());
    setState(db, 'steamLastError', null);
  });
  return ranked.length;
}
