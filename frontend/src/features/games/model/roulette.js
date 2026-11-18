export const MAX_GAMES = 6;
export const SPIN_DURATION = 10000;
export const cleanTitle = (title) => title.trim().replace(/\s+/g, ' ');
export const titleKey = (title) => cleanTitle(title).normalize('NFC').toLocaleLowerCase('pt-BR');
export const hasDetails = (game) => /^igdb-\d+$/.test(game?.id);

export const GENRES = [
  ['Adventure', 'Aventura'], ['Arcade', 'Arcade'], ['Card & Board Game', 'Cartas e tabuleiro'],
  ['Racing', 'Corrida'], ['Sport', 'Esportes'], ['Strategy', 'Estratégia'], ['Indie', 'Independente'],
  ['Fighting', 'Luta'], ['Music', 'Música'], ['Platform', 'Plataforma'], ['Puzzle', 'Quebra-cabeça'],
  ['Role-playing (RPG)', 'RPG'], ['Simulator', 'Simulação'], ['Shooter', 'Tiro'],
];

export function uniqueGames(games) {
  const ids = new Set();
  const titles = new Set();
  return games.filter((game) => {
    if (!hasDetails(game) || typeof game.title !== 'string') return false;
    const key = titleKey(game.title);
    if (!key || titles.has(key) || ids.has(game.id)) return false;
    ids.add(game.id);
    titles.add(key);
    return true;
  });
}

export function sampleGames(games, previous = [], random = Math.random) {
  const pool = [...games];
  for (let index = 0; index < MAX_GAMES; index++) {
    const next = index + Math.floor(random() * (pool.length - index));
    [pool[index], pool[next]] = [pool[next], pool[index]];
  }
  const sample = pool.slice(0, MAX_GAMES);
  const previousIds = new Set(previous.map((game) => game.id));
  if (pool.length > MAX_GAMES && sample.every((game) => previousIds.has(game.id))) {
    sample[MAX_GAMES - 1] = pool[MAX_GAMES + Math.floor(random() * (pool.length - MAX_GAMES))];
  }
  return sample;
}

const fullTurn = 360;
const wrap = (angle) => ((angle % fullTurn) + fullTurn) % fullTurn;
export const segmentCenter = (index, count) => (index + 0.5) * fullTurn / count;

export function drawSpin(count, from, random = Math.random) {
  const index = Math.floor(random() * count);
  const restingAngle = wrap(-segmentCenter(index, count));
  const endAngle = from + 7 * fullTurn + wrap(restingAngle - from);
  return { index, restingAngle, endAngle };
}
