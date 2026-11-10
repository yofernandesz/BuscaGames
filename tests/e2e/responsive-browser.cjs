const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const { createServer } = await import('../../frontend/node_modules/vite/dist/node/index.js');
  const server = await createServer({ root: 'frontend', server: { host: '127.0.0.1', port: 5179, strictPort: true } });
  await server.listen();
  let browser;
  const results = [];
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 320, height: 800 }, hasTouch: true, reducedMotion: 'reduce' });
    await page.addInitScript(() => localStorage.setItem('buscagames:cookie-choice', 'rejected'));
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let signedIn = true;
    const game = { id: 'igdb-1', title: 'Uma aventura extraordinária: a edição definitiva de uma longa jornada', modes: ['Um jogador', 'Multijogador'], genres: ['Aventura', 'RPG'], platforms: ['PC', 'PlayStation 5'], summary: 'Uma descrição de jogo para verificar a quebra de linhas e o acesso aos controles em todas as telas.', priceStatus: 'no_source', cover: '', releaseDate: '2026-01-01' };
    const games = [game, { ...game, id: 'igdb-2', title: 'Outro jogo' }];
    const user = { id: 1, name: 'JogadorComUmNomeExtensoParaValidarQuebrasDeLinha', email: 'jogador.com.endereco.extenso.para.validar.layout@example.com', favorites: ['igdb-1', 'igdb-2'], ratings: { 'igdb-1': 5, 'igdb-2': 2 }, commentCount: 1 };
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      let data;
      if (path === '/api/auth/me') data = { user: signedIn ? user : null };
      else if (path.endsWith('/comments')) data = { comments: [{ id: 1, userId: 2, author: 'Outro jogador', body: 'Comentário para validar o conteúdo. '.repeat(10), createdAt: '2026-11-03T12:00:00Z', rating: 4 }], own: null, nextCursor: null };
      else if (/\/games\/igdb-/.test(path)) data = games.find(g => path.endsWith(g.id)) || { ...game, id: 'igdb-52189' };
      else data = { games, total: 2, hasMore: false, status: {}, sections: ['weekly', 'trending', 'retro', 'classics', 'new', 'upcoming'].map((id, index) => ({ id, title: ['Interesse da semana', 'Em alta', 'Retrô', 'Clássicos', 'Novidades', 'Próximos lançamentos'][index], games, total: 2, hasMore: false })), catalog: { games, total: 2, hasMore: false } };
      return route.fulfill({ json: data });
    });
    await page.route('https://images.igdb.com/**', route => route.abort());
    async function inspect(label, screenshot = false) {
      await page.evaluate(() => document.fonts.ready);
      const findings = await page.evaluate(() => {
        const width = document.documentElement.clientWidth;
        const outside = [...document.querySelectorAll('body *')].filter(el => {
          if (!(el instanceof HTMLElement) || el.matches('option, script, style') || !el.getClientRects().length) return false;
          let parent = el.parentElement;
          while (parent && parent !== document.body) {
            const css = getComputedStyle(parent);
            if (['auto', 'scroll'].includes(css.overflowX) && parent.scrollWidth > parent.clientWidth + 2) return false;
            parent = parent.parentElement;
          }
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && (rect.left < -1 || rect.right > width + 1);
        }).map(el => ({ element: `${el.tagName.toLowerCase()}.${el.className}`, text: el.textContent.trim().slice(0, 70), right: Math.round(el.getBoundingClientRect().right) })).slice(0, 12);
        const wrappedStars = [...document.querySelectorAll('.star-rating-group')].filter(el => new Set([...el.children].map(child => Math.round(child.getBoundingClientRect().top))).size > 1).length;
        return { overflow: document.documentElement.scrollWidth > width + 1, outside, wrappedStars };
      });
      results.push({ label, viewport: page.viewportSize(), ...findings });
      fs.writeFileSync('evidencias/resultados/responsive-results.json', JSON.stringify({ errors, results }, null, 2));
      if (screenshot) await page.screenshot({ path: `evidencias/capturas/responsive-${label}.png`, fullPage: true });
    }
    async function open(path) {
      await page.goto(`http://127.0.0.1:5179${path}`);
      if (path === '/' || path.startsWith('/?')) await page.locator('.card').first().waitFor();
      if (path === '/biblioteca') await page.locator('.library-card').first().waitFor();
      if (path.startsWith('/jogo')) await page.locator('.details-title').waitFor();
    }
    const routes = [['catalogo', '/'], ['busca', '/?q=aventura'], ['biblioteca', '/biblioteca'], ['detalhes', '/jogo/igdb-1'], ['perfil', '/perfil'], ['privacidade', '/privacidade']];
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [label, path] of routes) {
        await open(path);
        await inspect(`${label}-${width}`, width === 320 && ['biblioteca', 'perfil'].includes(label));
        if (label === 'biblioteca' && [320, 768].includes(width)) {
          await page.getByRole('button', { name: 'Visualizar estatísticas' }).click();
          await inspect(`estatisticas-${width}`);
          await page.getByRole('button', { name: /Ver comentários/ }).first().click();
          await page.locator('.comment-list').first().waitFor();
          await inspect(`comentarios-${width}`);
        }
        if (label === 'catalogo' && width === 320) {
          await page.locator('.filter-trigger').click();
          await inspect('filtros-320');
          await page.locator('#categoryFilter').focus();
          await page.keyboard.press('ArrowDown');
          await page.keyboard.press('Escape');
        }
      }
    }
    signedIn = false;
    for (const size of [{ width: 320, height: 640 }, { width: 768, height: 1024 }, { width: 812, height: 375 }]) {
      await page.setViewportSize(size);
      await open('/perfil');
      await inspect(`visitante-${size.width}`);
      await page.locator('.header-login').click();
      await page.getByRole('dialog').waitFor();
      await inspect(`login-${size.width}`);
      await page.getByRole('dialog').getByRole('button', { name: 'Criar uma conta', exact: true }).click();
      await page.getByRole('dialog').getByLabel('Confirmar senha').scrollIntoViewIfNeeded();
      await inspect(`cadastro-${size.width}`, size.width === 320);
      const dialog = page.getByRole('dialog');
      assert(await dialog.evaluate(el => el.clientHeight <= innerHeight && el.scrollWidth <= el.clientWidth + 1));
      await page.keyboard.press('Escape');
      assert.equal(await dialog.count(), 0);
    }
    // 640 CSS px corresponds to the reflow area of a 1280px window at 200% zoom.
    signedIn = true;
    await page.setViewportSize({ width: 640, height: 450 });
    await open('/biblioteca'); await inspect('reflow-640');
    await page.getByRole('button', { name: 'Visualizar estatísticas' }).click(); await inspect('reflow-estatisticas-640');
    fs.writeFileSync('evidencias/resultados/responsive-results.json', JSON.stringify({ errors, results }, null, 2));
    const findings = results.filter(r => r.overflow || r.outside.length || r.wrappedStars);
    console.log(JSON.stringify({ errors, scenarios: results.length, findings }, null, 2));
    assert.equal(errors.length, 0, 'Erros de execução no navegador');
    assert.equal(findings.length, 0, 'Falhas de responsividade; consulte responsive-results.json');
  } finally { await browser?.close(); await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
