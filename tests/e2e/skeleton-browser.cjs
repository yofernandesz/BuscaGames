const assert = require('node:assert/strict');
const { writeFileSync } = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const { createServer } = await import('../../frontend/node_modules/vite/dist/node/index.js');
  const server = await createServer({ root: 'frontend', server: { host: '127.0.0.1', port: 0 } });
  await server.listen();
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const errors = [];
  const checks = [];
  try {
    for (const width of [1440, 320]) {
      for (const [path, variant] of [['/', 'cards'], ['/?q=teste', 'cards'], ['/jogo/igdb-42', 'details'], ['/biblioteca', 'library'], ['/perfil', 'profile'], ['/perfil/1', 'profile'], ['/comunidade', 'players'], ['/admin', 'dashboard'], ['/admin/usuarios', 'table']]) {
        const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
        await context.addInitScript(() => localStorage.setItem('buscagames:cookie-choice', 'rejected'));
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        let release;
        const held = new Promise(resolve => { release = resolve; });
        await page.route('**/api/**', async route => {
          await held;
          const session = route.request().url().includes('/auth/me');
          await route.fulfill({ status: session ? 200 : 503, contentType: 'application/json', body: JSON.stringify(session ? { user: null } : { error: 'Serviço temporariamente indisponível.' }) });
        });
        await page.goto(`http://127.0.0.1:${server.httpServer.address().port}${path}`);
        const skeleton = page.locator(`.skeleton--${variant}`).first();
        await skeleton.waitFor();
        assert.equal(await skeleton.getAttribute('role'), 'status');
        assert.equal(await skeleton.locator('button, a, input, [tabindex]').count(), 0);
        assert.equal(await skeleton.locator('.skeleton-block').first().evaluate(el => getComputedStyle(el).animationName), 'none');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        if (['/', '/perfil', '/admin'].includes(path)) await page.screenshot({ path: `evidencias/capturas/skeleton-${variant}-${width}.png`, fullPage: true });
        release();
        await skeleton.waitFor({ state: 'detached' });
        assert.equal(await page.locator('.skeleton').count(), 0);
        checks.push({ path, width, variant });
        await context.close();
      }
    }
    assert.deepEqual(errors, []);
    writeFileSync('evidencias/resultados/skeleton-results.json', JSON.stringify({ passed: true, checks, errors }, null, 2));
  } finally { await browser.close(); await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
