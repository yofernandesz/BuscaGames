const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const { createServer } = await import('../../frontend/node_modules/vite/dist/node/index.js');
  const server = await createServer({ root: 'frontend', server: { host: '127.0.0.1', port: 0 } });
  const games = ['Hollow Knight', 'Celeste', 'A Short Hike', 'Outer Wilds', 'Portal 2', 'The Legend of Zelda: Breath of the Wild', 'Fez'].map((title, index) => ({
    id: `igdb-${index + 1}`, title, genres: ['Aventura'], cover: '/buscagames-mark.png',
  }));
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'no-preference' });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('buscagames:cookie-choice', 'rejected'));
    await page.route('https://**/*', (route) => route.abort());
    let releaseCatalog;
    const catalogReady = new Promise((resolve) => { releaseCatalog = resolve; });
    let catalogCalls = 0;
    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      if (!['Adventure', 'Shooter'].includes(url.searchParams.get('q'))) return route.fulfill({ json: { user: null, games: [] } });
      if (url.searchParams.get('q') === 'Shooter') return route.fulfill({ json: { games: [], hasMore: false } });
      assert.equal(url.searchParams.get('q'), 'Adventure');
      catalogCalls++;
      if (catalogCalls === 1) return route.fulfill({ status: 503, json: { error: 'Indisponível' } });
      await catalogReady;
      return route.fulfill({ json: { games, hasMore: false } });
    });

    const button = (name) => page.getByRole('button', { name, exact: true });
    const disc = page.locator('.roulette-disc');
    const capture = (name) => process.env.ROULETTE_SCREENSHOTS && page.screenshot({ path: path.join(process.env.ROULETTE_SCREENSHOTS, name) });
    await page.goto(`${server.resolvedUrls.local[0]}roleta-gamer`);
    const heading = page.getByRole('heading', { name: 'Roleta Gamer' });
    assert.ok(await heading.evaluate((node) => document.activeElement === node));
    assert.equal(await page.getByRole('link', { name: 'Roleta Gamer' }).getAttribute('aria-current'), 'page');
    await capture('roulette-desktop-empty.png');

    await button('Por gênero').focus();
    await page.keyboard.press('Enter');
    const genres = page.getByLabel('Gênero do catálogo');
    await genres.focus();
    await page.keyboard.press('Alt+ArrowDown');
    await page.keyboard.press('Escape');
    assert.ok(await genres.evaluate((node) => node === document.activeElement));
    await genres.selectOption('Adventure');
    await button('Gerar 6 jogos').click();
    await page.getByRole('alert').filter({ hasText: 'Catálogo temporariamente indisponível.' }).waitFor();
    await button('Tentar novamente').click();
    await page.getByText('Carregando jogos do catálogo…').waitFor({ state: 'attached' });
    assert.equal(await disc.locator('[data-segment]').count(), 0);
    await capture('roulette-desktop-loading.png');
    releaseCatalog();
    await page.getByText('6 de 6 jogos').waitFor();
    assert.equal(await disc.locator('[data-segment]').count(), 6);
    const startedAt = Date.now();
    await button('Girar roleta').focus();
    await page.keyboard.press('Enter');
    assert.equal(await button('Girando…').getAttribute('aria-disabled'), 'true');
    assert.ok(await button('Por gênero').isDisabled());
    await page.keyboard.press('Enter');
    assert.equal(await disc.evaluate((node) => node.getAnimations().length), 1);
    const result = page.locator('.roulette-result');
    await result.waitFor({ timeout: 15000 });
    assert.ok(Date.now() - startedAt >= 9500);
    const selected = await result.getByRole('heading').textContent();
    const alignment = await disc.evaluate((node, title) => {
      const label = [...node.querySelectorAll('[data-segment]')].find((segment) => segment.textContent === title);
      const wheel = node.getBoundingClientRect();
      const segment = label.getBoundingClientRect();
      return { horizontal: Math.abs(segment.x + segment.width / 2 - wheel.x - wheel.width / 2), vertical: segment.y + segment.height / 2 - wheel.y - wheel.height / 2 };
    }, selected);
    assert.ok(alignment.horizontal < 1 && alignment.vertical < 0, JSON.stringify(alignment));
    assert.equal(await result.getByRole('link', { name: 'Ver detalhes' }).getAttribute('href'), `/jogo/${games.find((game) => game.title === selected).id}`);
    await result.locator('img').waitFor();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.roulette-result')).opacity === '1');
    await capture('roulette-desktop-result.png');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const width of [768, 390, 320]) {
      await page.setViewportSize({ width, height: 750 });
      const layout = await page.locator('.roulette-wheel').evaluate((wheel) => {
        const box = wheel.getBoundingClientRect();
        return { square: Math.abs(box.width - box.height) < 1, fits: box.left >= 0 && box.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth };
      });
      assert.deepEqual(layout, { square: true, fits: true });
    }
    await button('Girar novamente').click();
    await result.waitFor({ timeout: 1500 });
    assert.equal(await disc.evaluate((node) => node.getAnimations().length), 0);
    assert.equal(await disc.locator('[data-segment]').first().evaluate((node) => node.getAnimations().length), 0);
    assert.equal(await page.locator('.roulette-sparks').isVisible(), false);
    await capture('roulette-mobile-result.png');
    await button('Personalizada').click();
    const input = page.getByLabel('Nome do jogo');
    await input.fill('Hades');
    await page.keyboard.press('Enter');
    await input.fill('Um título longo para conferir a quebra de linha na legenda mobile');
    await page.keyboard.press('Enter');
    assert.equal(await page.getByRole('list', { name: 'Participantes' }).getByRole('listitem').count(), 2);
    assert.ok(await button('Girar roleta').isEnabled());
    await capture('roulette-mobile-manual.png');
    await button('Por gênero').click();
    await genres.selectOption('Shooter');
    await button('Gerar 6 jogos').click();
    await page.getByRole('alert').filter({ hasText: 'Nenhum jogo encontrado.' }).waitFor();
    assert.equal(catalogCalls, 2);
    assert.deepEqual(errors, []);
    console.log('Roleta Gamer: Edge em 1440, 768, 390 e 320px; teclado, carregamento, erro, recuperação, vazio, giro real, alinhamento, resultado e movimento reduzido aprovados.');
  } finally {
    await browser?.close();
    await server.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
