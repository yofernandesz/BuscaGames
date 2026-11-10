const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const { createServer } = await import('../../frontend/node_modules/vite/dist/node/index.js');
  const server = await createServer({ root: 'frontend', server: { host: '127.0.0.1', port: 5183, strictPort: true } });
  await server.listen();
  let browser;
  const results = [];
  const errors = [];
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    for (const width of [1440, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 800 }, reducedMotion: 'reduce' });
      page.on('pageerror', error => errors.push(error.message));
      let signedIn = false;
      await page.route('**/api/**', route => {
        const path = new URL(route.request().url()).pathname;
        const data = path === '/api/auth/me'
          ? { user: signedIn ? { id: 1, name: 'Jogador', email: 'jogador@example.com', ratings: {}, favorites: [] } : null }
          : { games: [], sections: [], catalog: { games: [], total: 0 }, status: {}, total: 0 };
        return route.fulfill({ json: data });
      });
      const notice = page.getByRole('region', { name: 'Cookies e sua privacidade' });
      await page.goto('http://127.0.0.1:5183/');
      await notice.waitFor();
      await page.getByRole('button', { name: 'Aceitar cookies', exact: true }).click();
      await page.reload();
      await page.waitForFunction(() => document.querySelector('.header-login')?.disabled === false);
      assert.equal(await notice.count(), 0);
      await page.getByRole('button', { name: 'Preferências de cookies', exact: true }).click();
      await notice.waitFor();
      await notice.press('Escape');
      assert.equal(await page.evaluate(() => localStorage.getItem('buscagames:cookie-choice')), 'rejected');
      await page.reload();
      await page.waitForFunction(() => document.querySelector('.header-login')?.disabled === false);
      assert.equal(await notice.count(), 0);
      await page.evaluate(() => localStorage.clear());
      signedIn = true;
      await page.reload();
      await page.waitForFunction(() => !document.querySelector('.header-login'));
      assert.equal(await notice.count(), 0);
      await page.getByRole('button', { name: /Ouvir a música/ }).click();
      assert.equal(await page.locator('iframe').count(), 0);
      await page.getByRole('button', { name: 'Preferências de cookies', exact: true }).click();
      await notice.waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: `evidencias/capturas/cookies-session-${width}.png`, fullPage: true });
      await notice.press('Escape');
      await page.getByRole('link', { name: 'Perfil', exact: true }).click();
      assert.equal(await notice.count(), 0);
      results.push({ width, acceptedReload: true, rejectedReload: true, authenticated: true, manualReview: true, keyboard: true, overflow: false });
      await page.close();
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync('evidencias/resultados/cookies-session-results.json', JSON.stringify({ results, errors }, null, 2));
    console.log(JSON.stringify({ results, errors }, null, 2));
  } finally {
    await browser?.close();
    await server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
