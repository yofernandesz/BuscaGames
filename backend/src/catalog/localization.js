import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { fetchSteamApp, priceFields, saveSteamPrice, steamAppId } from './prices.js';

const LABELS = {
  Action: 'Ação', Fantasy: 'Fantasia', 'Science fiction': 'Ficção científica', Horror: 'Terror',
  Thriller: 'Suspense', Survival: 'Sobrevivência', Historical: 'Histórico', Stealth: 'Furtividade',
  Comedy: 'Comédia', Business: 'Negócios', Drama: 'Drama', 'Non-fiction': 'Não ficção',
  Sandbox: 'Mundo livre', Educational: 'Educativo', Kids: 'Infantil', 'Open world': 'Mundo aberto',
  Warfare: 'Guerra', Party: 'Festa', '4X (explore, expand, exploit, and exterminate)': '4X (explorar, expandir, explorar recursos e exterminar)',
  'Erotic': 'Erótico', Mystery: 'Mistério', Romance: 'Romance',
  'Point-and-click': 'Aponte e clique', Fighting: 'Luta', Shooter: 'Tiro', Music: 'Música',
  Platform: 'Plataforma', Puzzle: 'Quebra-cabeça', Racing: 'Corrida', 'Real Time Strategy (RTS)': 'Estratégia em tempo real',
  'Role-playing (RPG)': 'RPG', Simulator: 'Simulação', Sport: 'Esportes', Strategy: 'Estratégia',
  'Turn-based strategy (TBS)': 'Estratégia por turnos', Tactical: 'Tática', 'Hack and slash/Beat em up': 'Combate corpo a corpo',
  Quiz: 'Perguntas e respostas', 'Quiz/Trivia': 'Perguntas e respostas', 'Pinball': 'Pinball', Adventure: 'Aventura', Indie: 'Independente',
  Arcade: 'Arcade', 'Visual Novel': 'Romance visual', 'Card & Board Game': 'Cartas e tabuleiro', MOBA: 'Arena de batalha multijogador',
  'Single player': 'Um jogador', Multiplayer: 'Multijogador', 'Co-operative': 'Cooperativo',
  'Split screen': 'Tela dividida', 'Massively Multiplayer Online (MMO)': 'Multijogador massivo on-line', 'Battle Royale': 'Batalha real',
  'Main Game': 'Jogo base', 'Main game': 'Jogo base', 'DLC Addon': 'Conteúdo adicional', 'DLC addon': 'Conteúdo adicional',
  Expansion: 'Expansão', Bundle: 'Pacote', 'Standalone Expansion': 'Expansão independente', 'Standalone expansion': 'Expansão independente',
  Mod: 'Modificação', Episode: 'Episódio', Season: 'Temporada', Remake: 'Recriação', Remaster: 'Remasterização',
  'Expanded Game': 'Edição expandida', 'Expanded game': 'Edição expandida', Port: 'Conversão', Fork: 'Derivado',
  Pack: 'Pacote', Update: 'Atualização', 'PC (Microsoft Windows)': 'PC (Windows)',
};
export const label = (value) => LABELS[value] || (/^Hack and slash\/Beat ['’]?em up$/.test(value) ? 'Combate corpo a corpo' : value);

export function plainText(html = '') {
  return String(html).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?\s*>|<\/li>|<\/p>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code) => {
      const n = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
    }).replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, name) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[name])
    .replace(/\n\s*\n/g, '\n').trim();
}

export const localizationHash = (game) => createHash('sha256').update(JSON.stringify([game.summary, game.companies, game.websites])).digest('hex');

export function enqueueLocalization(db, id, priority = 0) {
  db.prepare(`INSERT INTO localization_queue (game_id, requested, priority) VALUES (?, ?, ?)
    ON CONFLICT(game_id) DO UPDATE SET
      requested=CASE WHEN excluded.priority > priority THEN excluded.requested ELSE requested END,
      priority=MAX(priority, excluded.priority)`).run(id, new Date().toISOString(), priority);
}

export async function translate(text, names, db, fetcher = fetch) {
  if (!text.trim()) return '';
  const protectedNames = [...new Set(names.filter(Boolean))].sort((a, b) => b.length - a.length);
  let masked = text;
  const replacements = [];
  for (const name of protectedNames) {
    if (!masked.includes(name)) continue;
    const token = `ZXQ${replacements.length}QXZ`;
    masked = masked.replaceAll(name, token); replacements.push([token, name]);
  }
  const chunks = [];
  let chunk = '';
  for (const word of masked.split(/\s+/)) {
    if (Buffer.byteLength(word, 'utf8') > 450) throw new Error('Trecho excede limite de tradução');
    if (Buffer.byteLength(`${chunk} ${word}`, 'utf8') > 450) { chunks.push(chunk); chunk = ''; }
    chunk += (chunk ? ' ' : '') + word;
  }
  if (chunk) chunks.push(chunk);
  const day = new Date().toISOString().slice(0, 10);
  const output = [];
  for (const part of chunks) {
    const key = createHash('sha256').update(part).digest('hex');
    const cached = db.prepare('SELECT text FROM translations WHERE hash=?').get(key);
    if (cached) { output.push(cached.text); continue; }
    const used = db.prepare('SELECT used FROM translation_budget WHERE day=?').get(day)?.used || 0;
    if (used + part.length > 4500) throw new Error('Cota diária de tradução atingida');
    db.prepare('INSERT INTO translation_budget VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET used=used+excluded.used').run(day, part.length);
    await sleep(350);
    const url = new URL('https://api.mymemory.translated.net/get');
    url.search = new URLSearchParams({ q: part, langpair: 'en|pt-BR' }).toString();
    const response = await fetcher(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Tradução HTTP ${response.status}`);
    const result = await response.json();
    if (Number(result.responseStatus) !== 200 || result.quotaFinished || !result.responseData?.translatedText) throw new Error('Tradução indisponível');
    const translated = plainText(result.responseData.translatedText);
    db.prepare('INSERT OR REPLACE INTO translations VALUES (?, ?)').run(key, translated);
    output.push(translated);
  }
  let translated = output.join(' ');
  for (const [token, name] of replacements) {
    if (!translated.includes(token)) throw new Error('Tradução não preservou nomes próprios');
    translated = translated.replaceAll(token, name);
  }
  return translated;
}

export function localizeGame(db, game, stored) {
  const extra = stored ? stored.extra : db.prepare('SELECT * FROM game_localization WHERE game_id=?').get(game.sourceId);
  const attempt = stored ? stored.attempt : db.prepare('SELECT * FROM localization_attempts WHERE game_id=?').get(game.sourceId);
  const valid = extra && extra.hash === localizationHash(game);
  const genres = [...new Set([...(game.genres || []), ...(game.themes || [])].map(label))];
  return { ...game, ...priceFields(db, game, stored?.saved, stored?.retryAt), genres, genre: genres.length ? genres.join(', ') : game.genre,
    themes: (game.themes || []).map(label),
    modes: (game.modes || []).map(label), type: label(game.type), platforms: (game.platforms || []).map(label),
    summary: valid && extra.summary ? extra.summary : '',
    summaryPending: Boolean(game.summary && !(valid && extra.summary)),
    summaryStatus: valid && extra.summary ? 'ready' : attempt?.status || (game.summary ? 'pending' : 'missing'),
    localizationRetryAt: attempt?.retry_at || null,
    requirementsStatus: extra?.requirements ? 'ready' : attempt?.status === 'unavailable' ? 'unavailable' : extra ? 'missing' : 'pending',
    pcRequirements: extra?.requirements || null, requirementsSource: extra?.source || null,
    requirementsCheckedAt: extra?.checked_at || null };
}

export async function enrichGame(db, game, fetcher = fetch) {
  const hash = localizationHash(game);
  const current = db.prepare('SELECT * FROM game_localization WHERE game_id=?').get(game.sourceId);
  let summary = current?.hash === hash ? current.summary : '';
  let requirements = current?.requirements || null;
  let source = current?.source || null;
  const names = [game.title, ...(game.companies || [])];
  const appId = steamAppId(game);
  if (appId) {
    const get = async (language) => {
      const payload = await fetchSteamApp(db, appId, language, fetcher);
      if (!payload?.success) throw new Error('Steam: dados indisponíveis');
      return payload.data;
    };
    const pt = await get('brazilian');
    if ('is_free' in pt || 'price_overview' in pt) saveSteamPrice(db, game, appId, pt);
    source = `https://store.steampowered.com/app/${appId}/?l=brazilian`;
    requirements = plainText(pt.pc_requirements?.minimum || '') || null;
    // Preserve requirements even if the second request or translation fails.
    db.prepare('INSERT OR REPLACE INTO game_localization VALUES (?, ?, ?, ?, ?, ?)')
      .run(game.sourceId, hash, summary || null, requirements, source, new Date().toISOString());
    const en = await get('english');
    const localized = plainText(pt.short_description);
    if (localized && localized !== plainText(en.short_description)) summary = localized;
    // Save official requirements even if the translation service is unavailable.
    db.prepare('INSERT OR REPLACE INTO game_localization VALUES (?, ?, ?, ?, ?, ?)')
      .run(game.sourceId, hash, summary || null, requirements, source, new Date().toISOString());
    if (!summary && localized) summary = await translate(localized, names, db, fetcher);
  }
  if (!summary && game.summary) summary = await translate(game.summary, names, db, fetcher);
  db.prepare('INSERT OR REPLACE INTO game_localization VALUES (?, ?, ?, ?, ?, ?)')
    .run(game.sourceId, hash, summary || null, requirements, source, new Date().toISOString());
}

export async function processLocalization(db, fetcher = fetch) {
  const next = db.prepare(`SELECT g.data FROM games g LEFT JOIN localization_queue q ON q.game_id=g.id
    LEFT JOIN game_localization l ON l.game_id=g.id
    LEFT JOIN localization_attempts a ON a.game_id=g.id
    LEFT JOIN steam_popularity s ON s.game_id=g.id
    WHERE (a.retry_at IS NULL OR julianday(a.retry_at) <= julianday('now'))
      AND (q.requested IS NOT NULL OR l.game_id IS NULL OR julianday(l.checked_at) < julianday('now', '-30 days')
        OR (l.summary IS NULL AND julianday(l.checked_at) < julianday('now', '-1 day')))
    ORDER BY COALESCE(q.priority, 0) DESC, (q.game_id IS NOT NULL) DESC, q.requested ASC,
      (g.id=52189) DESC, (s.game_id IS NOT NULL) DESC, s.value DESC, g.rating_count DESC, g.id ASC LIMIT 1`);
  for (let count = 0; count < 10; count++) {
    // Recheck between jobs so a visit can take precedence over the remaining background work.
    const row = next.get();
    if (!row) break;
    const game = JSON.parse(row.data);
    try {
      await enrichGame(db, game, fetcher);
      db.prepare('DELETE FROM localization_attempts WHERE game_id=?').run(game.sourceId);
      db.prepare('DELETE FROM localization_queue WHERE game_id=?').run(game.sourceId);
    } catch (error) {
      const quota = /Cota diária/.test(error.message);
      const retry = quota ? new Date().setUTCHours(24, 0, 0, 0) : Date.now() + 3600000;
      db.prepare('INSERT OR REPLACE INTO localization_attempts VALUES (?, ?, ?)')
        .run(game.sourceId, quota ? 'quota' : 'unavailable', new Date(retry).toISOString());
      // Keep a failed job queued, with an explicit backoff, including existing rows.
      enqueueLocalization(db, game.sourceId);
      console.warn(`Localização ${game.id}: ${error.message}`);
    }
  }
}

export function startLocalization(db) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await processLocalization(db);
    } catch (error) {
      console.warn('Fila de localização:', error.message);
    } finally { running = false; }
  };
  void tick();
  const timer = setInterval(tick, 60000);
  return () => clearInterval(timer);
}
