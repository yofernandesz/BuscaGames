// Isolated, repeatable benchmark: no credentials, network or persistent database.
import { performance } from 'node:perf_hooks';
import { openCatalog, upsertGames, transaction, listGames } from '../src/catalog/catalog.js';

const db = openCatalog(':memory:');
try {
  transaction(db, () => upsertGames(db, Array.from({ length: 20000 }, (_, i) => ({
    id: i + 1, name: `Game ${i}`, total_rating_count: (i * 37) % 10000,
    first_release_date: 1794000000 - (i % 100) * 86400,
    websites: [{ url: `https://store.steampowered.com/app/${i + 1}/` }],
  }))));
  for (const options of [{ limit: 48 }, { section: 'new', limit: 48 }, { query: 'Game 12', limit: 48 }]) {
    const samples = [];
    for (let i = 0; i < 35; i++) {
      const start = performance.now();
      listGames(db, options, 1794000000);
      if (i >= 5) samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    console.log(JSON.stringify({ options, medianMs: Number(samples[15].toFixed(2)) }));
  }
} finally { db.close(); }
