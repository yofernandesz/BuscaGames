const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const { createServer } = await import('../../frontend/node_modules/vite/dist/node/index.js');
  const server = await createServer({ root: 'frontend', server: { host: '127.0.0.1', port: 5178, strictPort: true } });
  await server.listen();
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, hasTouch: true });
    await page.addInitScript(() => localStorage.setItem('buscagames:cookie-choice', 'rejected'));
    let user = { id: 1, name: 'Teste visual', favorites: ['igdb-1'], ratings: {}, commentCount: 0 };
    let fail = false;
    let delayed;
    const game = { id: 'igdb-1', title: 'Aventura', modes: ['Um jogador'], genres: ['Aventura'], platforms: ['PC'], summary: 'Jogo de teste para verificar as cinco reações de avaliação.', priceStatus: 'no_source' };
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let data;
      if (path === '/api/auth/me') data = { user };
      else if (path.endsWith('/rating')) {
        if (delayed) await delayed;
        if (fail) return route.fulfill({ status: 503, json: { error: 'Não foi possível salvar.' } });
        user = { ...user, ratings: { 'igdb-1': route.request().postDataJSON().rating } };
        data = { user };
      } else if (path.endsWith('/comments')) data = { comments: [], own: null, nextCursor: null };
      else if (path === '/api/games/igdb-1') data = game;
      else data = { games: [game], total: 1, hasMore: false, status: {}, sections: [], catalog: { games: [game], total: 1, hasMore: false } };
      return route.fulfill({ json: data });
    });
    async function open(path) {
      await page.goto(`http://127.0.0.1:5178${path}`);
      await page.locator('.star-rating').first().waitFor();
    }
    const rating = page.locator('.star-rating').first();
    const star = level => rating.getByRole('radio', { name: level === 1 ? '1 estrela' : `${level} estrelas` });
    async function settled(level) {
      await page.waitForFunction(level => document.querySelector(`.star-rating [aria-label="${level === 1 ? '1 estrela' : `${level} estrelas`}"]`).getAttribute('aria-checked') === 'true' && document.querySelector('.star-rating-group').getAttribute('aria-busy') === 'false', level);
    }
    async function finish() {
      await rating.evaluate(el => el.getAnimations({ subtree: true }).forEach(animation => animation.finish()));
      await page.waitForFunction(() => !document.querySelector('.star-rating[data-reaction]'));
    }
    await open('/jogo/igdb-1');
    assert.equal(await rating.getAttribute('data-reaction'), null);
    const names = ['rating-disappointed', 'rating-unsure', 'rating-happy', 'rating-thrilled', 'rating-legendary'];
    for (let level = 1; level <= 5; level++) {
      await star(level).click();
      await settled(level);
      const active = await rating.evaluate(el => el.getAnimations({ subtree: true }).map(animation => animation.animationName));
      assert(active.includes(names[level - 1]), `Missing animation ${level}`);
      await rating.evaluate((el, level) => el.getAnimations({ subtree: true }).forEach(animation => { animation.pause(); animation.currentTime = level === 5 ? 700 : 300; }), level);
      if (level === 1 || level === 5) await page.screenshot({ path: `evidencias/capturas/rating-${level}-desktop.png` });
      await finish();
    }
    await star(5).focus();
    await page.keyboard.press('Home');
    await settled(1);
    assert(await star(1).evaluate(el => el === document.activeElement));
    assert.equal(await star(1).evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
    await finish();
    await page.keyboard.press('End');
    await settled(5);
    await finish();
    await star(5).click();
    await page.waitForFunction(() => !document.querySelector('.star-rating [aria-checked="true"]'));
    assert.equal(await rating.getAttribute('data-reaction'), null);

    let release;
    delayed = new Promise(resolve => { release = resolve; });
    const pendingClick = star(3).click();
    await page.waitForFunction(() => document.querySelector('.star-rating-group').getAttribute('aria-busy') === 'true');
    assert.equal(await rating.getAttribute('data-reaction'), null);
    release(); delayed = null;
    await pendingClick; await settled(3); await finish();
    fail = true;
    await star(5).click();
    await page.getByRole('alert').filter({ hasText: 'Não foi possível salvar.' }).waitFor();
    assert.equal(await star(3).getAttribute('aria-checked'), 'true');
    assert.equal(await rating.getAttribute('data-reaction'), null);
    fail = false;

    await page.setViewportSize({ width: 360, height: 800 });
    await star(5).click(); await settled(5);
    await rating.evaluate(el => el.getAnimations({ subtree: true }).forEach(animation => { animation.pause(); animation.currentTime = 700; }));
    await page.screenshot({ path: 'evidencias/capturas/rating-5-mobile.png' });
    await finish();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await star(4).click(); await settled(4);
    assert.equal(await rating.evaluate(el => el.getAnimations({ subtree: true }).length), 0);
    assert.equal(await rating.locator('.star-fireworks').evaluate(el => getComputedStyle(el).display), 'none');

    await open('/biblioteca');
    assert.equal(await star(4).getAttribute('aria-checked'), 'true');
    assert.equal(await rating.getAttribute('data-reaction'), null);
    await open('/?q=Aventura');
    await page.setViewportSize({ width: 320, height: 800 });
    await rating.scrollIntoViewIfNeeded();
    const boxes = await rating.getByRole('radio').evaluateAll(elements => elements.map(el => ({ top: el.getBoundingClientRect().top, width: el.getBoundingClientRect().width })));
    assert(boxes.every(box => box.top === boxes[0].top && box.width >= 24));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: 'evidencias/capturas/rating-card-320.png' });
    console.log('PASS: all five animations, cleanup, keyboard/focus, reset, pending, failure, reduced motion, library, compact card at 320px. API mocked.');
  } finally { await browser?.close(); await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
