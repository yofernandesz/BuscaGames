const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const { createServer } = await import('../../frontend/node_modules/vite/dist/node/index.js');
  const server = await createServer({ root: 'frontend', server: { host: '127.0.0.1', port: 0 } });
  let browser;
  const results = [];
  try {
    await server.listen();
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => localStorage.setItem('buscagames:cookie-choice', 'rejected'));
    await page.route('https://**/*', route => route.abort());
    const games = Array.from({ length: 8 }, (_, i) => ({ id: `igdb-${i + 1}`, title: `Uma aventura extraordinária ${i + 1}`, genres: ['Aventura', 'RPG'], modes: [], platforms: ['PC'], priceStatus: 'no_source', cover: '' }));
    const sections = ['weekly', 'trending', 'retro', 'classics', 'new', 'upcoming'].map(id => ({ id, title: id === 'weekly' ? 'Interesse da semana' : id, games, total: 8, hasMore: false }));
    await page.route('**/api/**', route => route.fulfill({ json: new URL(route.request().url()).pathname === '/api/home'
      ? { status: {}, sections, catalog: { games, total: 8, hasMore: false } } : { user: null } }));
    await page.goto(server.resolvedUrls.local[0], { waitUntil: 'domcontentloaded' });
    await page.locator('.shelf-navigation').first().waitFor();
    fs.mkdirSync('evidencias/capturas/shelf-responsive', { recursive: true });
    for (const width of [320, 360, 390, 650, 768, 900, 901, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => document.fonts.ready);
      const metrics = await page.locator('.shelf-navigation').evaluateAll(nodes => nodes.map(node => {
        const rect = e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
        return { frame: rect(node), grid: rect(node.querySelector('.games-grid')), card: rect(node.querySelector('.card')), arrows: [...node.querySelectorAll('.shelf-arrow')].map(rect) };
      }));
      for (const m of metrics) {
        assert.ok(m.frame.x >= 0 && m.frame.right <= width + 1);
        assert.ok(m.card.width >= 240, `card too narrow at ${width}: ${m.card.width}`);
        assert.ok(m.arrows.every(a => a.width >= 44 && a.height >= 44));
        if (width <= 900) assert.ok(m.arrows.every(a => a.bottom <= m.grid.y));
        else assert.ok(m.arrows[0].right <= m.grid.x && m.arrows[1].x >= m.grid.right);
      }
      const shelf = page.locator('.shelf-navigation').first();
      const grid = shelf.locator('.games-grid');
      await grid.evaluate(e => { e.scrollLeft = 0; });
      await shelf.locator('button').last().click();
      await page.waitForFunction(() => document.querySelector('.shelf-navigation .games-grid').scrollLeft > 0);
      await page.waitForFunction(() => !document.querySelector('.shelf-navigation > button:first-child').disabled);
      await shelf.locator('button').first().focus();
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelector('.shelf-navigation .games-grid').scrollLeft <= 3);
      await grid.evaluate(e => { e.scrollLeft = e.scrollWidth; });
      await page.waitForFunction(() => document.querySelector('.shelf-navigation > button:last-child').disabled);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await shelf.screenshot({ path: `evidencias/capturas/shelf-responsive/${width}.png` });
      results.push({ width, shelves: metrics });
    }
    assert.deepEqual(errors, []);
    fs.mkdirSync('evidencias/resultados', { recursive: true });
    fs.writeFileSync('evidencias/resultados/shelf-responsive.json', JSON.stringify({ errors, results }, null, 2));
    console.log('9 viewports: layout, 6 shelves, targets, arrows, keyboard and boundaries passed');
  } finally { await browser?.close(); await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
