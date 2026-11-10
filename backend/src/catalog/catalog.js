import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { label, localizeGame } from './localization.js';
import { enqueuePrice, steamRetryAt } from './prices.js';
import { initializeCommunity } from '../community/community.js';

export const DAY = 86400;
export const normalize = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const names = (items = []) => items.map((item) => item.name).filter(Boolean);
const image = (id, size) => typeof id === 'string' && /^[\w-]+$/.test(id)
  ? `https://images.igdb.com/igdb/image/upload/${size}/${id}.jpg` : '';

function mapGame(raw) {
  if (!Number.isSafeInteger(raw.id) || raw.id <= 0 || typeof raw.name !== 'string' || !raw.name.trim()) {
    throw new Error('Registro de jogo inválido recebido da IGDB');
  }
  const genres = names(raw.genres);
  const cover = image(raw.cover?.image_id, 't_cover_big');
  return {
    id: `igdb-${raw.id}`, sourceId: raw.id, source: 'IGDB',
    sourceUrl: `https://www.igdb.com/games/${encodeURIComponent(raw.slug || String(raw.id))}`,
    title: raw.name, genre: genres.join(', ') || 'Gênero não informado', genres, themes: names(raw.themes),
    modes: names(raw.game_modes), platforms: names(raw.platforms),
    platformGenerations: (raw.platforms || []).map((p) => p.generation).filter(Number.isFinite),
    cover, images: [cover, ...(raw.screenshots || []).map((s) => image(s.image_id, 't_screenshot_big'))].filter(Boolean),
    summary: raw.summary || '', description: [raw.summary, raw.storyline].filter(Boolean).join('\n\n'),
    price: null, rating: 0,
    sourceRating: Number.isFinite(raw.total_rating) ? raw.total_rating : null,
    sourceRatingCount: raw.total_rating_count ?? 0,
    releaseDate: raw.first_release_date ? new Date(raw.first_release_date * 1000).toISOString().slice(0, 10) : null,
    type: raw.game_type?.type || 'Tipo não informado',
    parentId: raw.parent_game ? `igdb-${raw.parent_game}` : null,
    relatedIds: [...new Set([...(raw.dlcs || []), ...(raw.expansions || []), ...(raw.standalone_expansions || [])])].map((id) => `igdb-${id}`),
    companies: (raw.involved_companies || []).map((c) => c.company?.name).filter(Boolean),
    releaseDates: raw.release_dates || [], websites: raw.websites || [],
  };
}

export function openCatalog(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY, title TEXT NOT NULL, search TEXT NOT NULL,
      released INTEGER, rating REAL, rating_count INTEGER NOT NULL, retro INTEGER NOT NULL,
      updated INTEGER NOT NULL, data TEXT NOT NULL, raw TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS games_release ON games(released);
    CREATE INDEX IF NOT EXISTS games_rating ON games(rating DESC);
    CREATE INDEX IF NOT EXISTS games_rating_count ON games(rating_count DESC, id);
    CREATE INDEX IF NOT EXISTS games_release_recent ON games(released DESC, id);
    CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS popularity (
      game_id INTEGER NOT NULL, day TEXT NOT NULL, value REAL NOT NULL, calculated INTEGER NOT NULL,
      PRIMARY KEY(game_id, day)
    );
    CREATE INDEX IF NOT EXISTS popularity_day ON popularity(day);
    CREATE TABLE IF NOT EXISTS steam_popularity (
      game_id INTEGER PRIMARY KEY, value REAL NOT NULL, calculated INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS lease (id INTEGER PRIMARY KEY CHECK(id = 1), owner TEXT, expires INTEGER);
    CREATE TABLE IF NOT EXISTS game_localization (game_id INTEGER PRIMARY KEY, hash TEXT NOT NULL, summary TEXT, requirements TEXT, source TEXT, checked_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS localization_queue (game_id INTEGER PRIMARY KEY, requested TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS translations (hash TEXT PRIMARY KEY, text TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS translation_budget (day TEXT PRIMARY KEY, used INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS localization_attempts (game_id INTEGER PRIMARY KEY, status TEXT NOT NULL, retry_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS game_prices (game_id INTEGER PRIMARY KEY, app_id TEXT NOT NULL, amount INTEGER, initial INTEGER, status TEXT NOT NULL, checked_at TEXT, retry_at TEXT);
    CREATE TABLE IF NOT EXISTS price_queue (game_id INTEGER PRIMARY KEY, requested TEXT NOT NULL, priority INTEGER NOT NULL DEFAULT 0);
  `);
  if (!db.prepare('PRAGMA table_info(localization_queue)').all().some((column) => column.name === 'priority')) {
    db.exec('ALTER TABLE localization_queue ADD COLUMN priority INTEGER NOT NULL DEFAULT 0');
  }
  // Existing imports also need the localized genre in their search index.
  db.prepare("UPDATE games SET search = search || ' combate corpo a corpo' WHERE search LIKE '%hack and slash/beat%' AND search NOT LIKE '%combate corpo a corpo%'").run();
  initializeCommunity(db);
  return db;
}

export const getState = (db, key, fallback = null) => {
  const row = db.prepare('SELECT value FROM state WHERE key=?').get(key);
  return row ? JSON.parse(row.value) : fallback;
};
export const setState = (db, key, value) => db.prepare('INSERT OR REPLACE INTO state VALUES (?, ?)').run(key, JSON.stringify(value));
export function transaction(db, work) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = work(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function upsertGames(db, rows) {
  const write = db.prepare(`INSERT INTO games VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET title=excluded.title, search=excluded.search,
    released=excluded.released, rating=excluded.rating, rating_count=excluded.rating_count,
    retro=excluded.retro, updated=excluded.updated, data=excluded.data, raw=excluded.raw
    WHERE excluded.updated >= games.updated`);
  for (const raw of rows) {
    const game = mapGame(raw);
    const categories = [...game.genres, ...game.themes];
    write.run(raw.id, game.title, normalize([game.title, ...categories, ...categories.map(label), ...game.modes, ...game.platforms, game.summary].join(' ')),
      raw.first_release_date ?? null, game.sourceRating, game.sourceRatingCount,
      Number(game.platformGenerations.some((n) => n >= 1 && n <= 6)), raw.updated_at || 0,
      JSON.stringify(game), JSON.stringify(raw));
  }
}

export const SECTIONS = [
  { id: 'weekly', title: 'Interesse da semana', description: 'Média do índice de visitas da IGDB nas amostras disponíveis dos últimos 7 dias. Indicador de interesse, não de jogadores ativos; cobertura dos títulos monitorados.' },
  { id: 'new', title: 'Lançamentos', description: 'Primeiro lançamento nos últimos 90 dias, conforme as datas informadas pela IGDB.' },
  { id: 'trending', title: 'Em alta', description: 'Popularidade na Steam: índice IGDB baseado no pico de jogadores simultâneos nas últimas 24 horas, em ordem decrescente. Não representa crescimento semanal nem contagem bruta de jogadores. Atualização diária; em caso de falha, a última coleta é preservada e sua data aparece nos cards.' },
  { id: 'retro', title: 'Retrô', description: 'Jogos lançados há pelo menos 15 anos em plataformas das gerações 1 a 6 ou lançados até 2000.' },
  { id: 'classics', title: 'Clássicos', description: 'Seleção por critério: pelo menos 10 anos, nota IGDB de 80/100 ou mais e pelo menos 50 avaliações.' },
  { id: 'upcoming', title: 'Próximos lançamentos', description: 'Primeiro lançamento previsto nos próximos 365 dias. Datas sujeitas a alteração.' },
];

export function listGames(db, { section = '', query = '', page = 1, limit = 12 } = {}, now = Math.floor(Date.now() / 1000)) {
  let from = 'games g';
  let where = '1=1';
  let order = 'g.rating_count DESC, g.id';
  let extra = '';
  const params = [];
  const today = new Date(now * 1000).toISOString().slice(0, 10);
  const dateAgo = (days) => new Date((now - days * DAY) * 1000).toISOString().slice(0, 10);
  let selection = null;
  if (section === 'weekly') {
    const latest = db.prepare('SELECT MAX(day) AS day FROM popularity p JOIN games g ON g.id=p.game_id WHERE day <= ?').get(today).day;
    const end = latest && latest < dateAgo(6) ? latest : today;
    const start = new Date(Date.parse(end) - 6 * DAY * 1000).toISOString().slice(0, 10);
    selection = latest ? (end === today ? 'weekly' : 'saved') : 'catalog';
    if (latest) {
      from += ` JOIN (SELECT game_id, AVG(value) AS score, COUNT(*) AS samples, MAX(calculated) AS calculated FROM popularity
      WHERE day >= ? AND day <= ? GROUP BY game_id) p ON p.game_id=g.id`;
      params.push(start, end);
      extra = ', p.score, p.samples, p.calculated'; order = 'p.score DESC, g.id';
    }
  } else if (section === 'trending') {
    from += ' JOIN steam_popularity p ON p.game_id=g.id';
    extra = ', p.value AS score, p.calculated'; order = 'score DESC, g.id';
  } else if (section === 'retro') {
    where = 'g.released <= ? AND (g.retro=1 OR g.released < 978307200)'; params.push(now - 15 * 365.25 * DAY);
  } else if (section === 'classics') {
    where = 'g.released <= ? AND g.rating >= 80 AND g.rating_count >= 50'; params.push(now - 10 * 365.25 * DAY);
    order = 'g.rating DESC, g.rating_count DESC, g.id';
  } else if (section === 'new') {
    where = 'g.released BETWEEN ? AND ?'; params.push(now - 90 * DAY, now); order = 'g.released DESC, g.id';
  } else if (section === 'upcoming') {
    where = 'g.released > ? AND g.released <= ?'; params.push(now, now + 365 * DAY); order = 'g.released ASC, g.id';
  }
  if (query) {
    where += " AND g.search LIKE ? ESCAPE '\\'";
    params.push(`%${normalize(query).replace(/[\\%_]/g, '\\$&')}%`);
  }
  const total = db.prepare(`SELECT COUNT(*) AS count FROM ${from} WHERE ${where}`).get(...params).count;
  const rows = db.prepare(`SELECT g.data${extra} FROM ${from} WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .all(...params, limit, (page - 1) * limit);
  const games = rows.map((row) => JSON.parse(row.data));
  const ids = games.map((game) => game.sourceId);
  // Read page metadata in batches, not four or five SQL queries per card.
  const metadata = (table) => new Map(ids.length ? db.prepare(
    `SELECT * FROM ${table} WHERE game_id IN (${ids.map(() => '?').join(',')})`
  ).all(...ids).map((row) => [row.game_id, row]) : []);
  const localized = metadata('game_localization');
  const attempts = metadata('localization_attempts');
  const prices = metadata('game_prices');
  const retryAt = steamRetryAt(db);
  return { games: rows.map(({ score, samples, calculated }, index) => {
    const original = games[index];
    const saved = prices.get(original.sourceId) || null;
    const game = localizeGame(db, original, {
      extra: localized.get(original.sourceId), attempt: attempts.get(original.sourceId), saved, retryAt,
    });
    enqueuePrice(db, game, 0, saved);
    // Lists omit long descriptions and galleries; details are read on demand.
    delete game.description; delete game.images; delete game.releaseDates; delete game.websites;
    return { ...game, metric: score === undefined ? null : { value: score, samples, kind: section, ...(['trending', 'weekly'].includes(section) ? { source: section === 'weekly' ? 'IGDB' : 'Steam via IGDB', measuredAt: new Date(calculated * 1000).toISOString(), stale: now - calculated > 2 * DAY } : {}) } };
  }), total, page, limit, hasMore: page * limit < total, ...(selection ? { selection, notice: selection === 'saved' ? 'Atualização pendente: exibindo a última seleção de interesse disponível.' : selection === 'catalog' ? 'Enquanto o interesse da semana é atualizado, explore os jogos com mais avaliações no catálogo.' : null } : {}) };
}
