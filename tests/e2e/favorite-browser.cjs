const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const { createServer } = await import('../../frontend/node_modules/vite/dist/node/index.js');
  const server = await createServer({ root: 'frontend', server: { host: '127.0.0.1', port: 5177 } });
  await server.listen();
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.addInitScript(() => localStorage.setItem('buscagames:cookie-choice', 'rejected'));
    let user = { id: 1, name: 'Teste visual', favorites: [], ratings: {}, commentCount: 0 };
    let fail = false;
    const game = { id: 'igdb-1', title: 'Aventura', modes: ['Um jogador'], genres: ['Aventura'], platforms: ['PC'], description: 'Jogo de teste para verificar a interação de favoritos.', priceStatus: 'no_source' };
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let data = {};
      if (path === '/api/auth/me') data = { user };
      else if (path.endsWith('/favorite')) {
        if (fail) return route.fulfill({ status: 503, json: { error: 'Não foi possível salvar.' } });
        user = { ...user, favorites: route.request().postDataJSON().favorite ? ['igdb-1'] : [] };
        data = { user };
      } else if (path.endsWith('/comments')) data = { comments: [], own: null, nextCursor: null };
      else if (path === '/api/games/igdb-1') data = game;
      else data = { games: [game], sections: [], catalog: { games: [game] } };
      return route.fulfill({ json: data });
    });
    await page.goto('http://127.0.0.1:5177/jogo/igdb-1');
    const button = page.locator('.favorite-button');
    await button.waitFor();
    await button.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('.favorite-button').getAttribute('aria-pressed') === 'true');
    const animations = await button.evaluate(el => el.getAnimations({ subtree: true }).map(a => a.animationName));
    assert(animations.includes('favorite-balloon-pop'));
    await button.evaluate(el => el.getAnimations({ subtree: true }).forEach(a => { a.pause(); a.currentTime = 320; }));
    assert(Number(await button.locator('.favorite-particle').first().evaluate(el => getComputedStyle(el).opacity)) > .9);
    await page.screenshot({ path: 'evidencias/capturas/favorite-desktop.png' });
    await button.evaluate(el => el.getAnimations({ subtree: true }).forEach(a => a.finish()));
    await page.waitForFunction(() => !document.querySelector('.is-bursting'));
    await button.click();
    await page.waitForFunction(() => document.querySelector('.favorite-button').getAttribute('aria-pressed') === 'false');
    assert.equal(await page.locator('.is-bursting').count(), 0);
    await page.setViewportSize({ width: 360, height: 800 });
    await button.focus();
    await page.keyboard.press('Space');
    await page.waitForFunction(() => document.querySelector('.favorite-button').getAttribute('aria-pressed') === 'true');
    await button.evaluate(el => el.getAnimations({ subtree: true }).forEach(a => { a.pause(); a.currentTime = 320; }));
    await page.screenshot({ path: 'evidencias/capturas/favorite-mobile.png' });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await button.evaluate(el => el.getAnimations({ subtree: true }).forEach(a => a.finish()));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await button.click();
    await page.waitForFunction(() => document.querySelector('.favorite-button').getAttribute('aria-pressed') === 'false');
    await button.click();
    await page.waitForFunction(() => document.querySelector('.favorite-button').getAttribute('aria-pressed') === 'true');
    assert.equal(await button.evaluate(el => el.getAnimations({ subtree: true }).length), 0);
    await button.click();
    await page.waitForFunction(() => document.querySelector('.favorite-button').getAttribute('aria-pressed') === 'false');
    fail = true;
    await button.click();
    await page.getByRole('alert').filter({ hasText: 'Não foi possível salvar.' }).waitFor();
    assert.equal(await button.getAttribute('aria-pressed'), 'false');
    console.log('PASS: desktop, mobile, keyboard, repeat, reduced motion, failure; mocked API.');
  } finally { await browser.close(); await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
