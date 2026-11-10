const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { writeFileSync } = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const { openCatalog, upsertGames } = await import('../../backend/src/catalog/catalog.js');
  const { createApp } = await import('../../backend/src/server.js');
  const { createServer } = await import('../../frontend/node_modules/vite/dist/node/index.js');
  const db = openCatalog(':memory:');
  for (const [id, name] of [[1, 'Lia Martins'], [2, 'Bruno'], [3, 'Jogadora com um nome longo para verificar todas as informações']]) {
    db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(id, name, `jogador${id}@example.com`, 'unused', 'unused');
  }
  upsertGames(db, [{ id: 1, name: 'Hollow Knight', platforms: [{ name: 'PC' }] }, { id: 2, name: 'Celeste', platforms: [{ name: 'PC' }] }]);
  db.prepare('INSERT INTO user_favorites VALUES (1,1), (1,2)').run();
  db.prepare('INSERT INTO user_ratings VALUES (1,1,5), (1,2,4)').run();
  db.prepare('INSERT INTO user_follows VALUES (2,1), (3,1), (1,2)').run();
  db.prepare("INSERT INTO comments(user_id,game_id,body,created_at) VALUES (1,1,'Cada caminho esconde uma descoberta. A trilha sonora faz toda a diferença.','2026-11-05T12:00:00Z'), (1,2,'Uma escalada que fica com você depois dos créditos.','2026-11-05T13:00:00Z')").run();
  db.prepare('INSERT INTO comment_likes VALUES (2,1), (3,1), (2,2)').run();
  const token = 'd'.repeat(64);
  db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(createHash('sha256').update(token).digest('hex'), 1, Date.now() + 600000);
  const api = createApp(db);
  await new Promise(resolve => api.listen(0, '127.0.0.1', resolve));
  const server = await createServer({ root: 'frontend', server: { host: '127.0.0.1', port: 0, proxy: { '/api': `http://127.0.0.1:${api.address().port}` } } });
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addCookies([{ name: 'bg_session', value: token, url: origin }]);
    await context.addInitScript(() => localStorage.setItem('buscagames:cookie-choice', 'rejected'));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/perfil`);
    const followers = page.getByRole('link', { name: 'Seguidores: 2. Ver seguidores' });
    await followers.waitFor();
    await page.getByText('jogador1@example.com').waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: 'evidencias/capturas/profile-social-desktop.png', fullPage: true, animations: 'disabled' });
    await followers.focus();
    assert.equal(await followers.evaluate(element => getComputedStyle(element).outlineStyle), 'solid');
    await page.keyboard.press('Enter');
    await page.waitForURL('**/perfil/1?aba=followers');
    await page.locator('.community-player-link').filter({ hasText: 'Bruno' }).click();
    await page.waitForURL('**/perfil/2');
    await page.getByRole('heading', { level: 1, name: 'Bruno' }).waitFor();
    assert.equal(await page.getByText('jogador2@example.com').count(), 0);
    await page.goBack();
    await page.getByRole('link', { name: 'Seguindo: 1. Ver seguindo' }).click();
    await page.getByRole('button', { name: 'Deixar de seguir' }).click();
    await page.getByRole('link', { name: 'Seguindo: 0. Ver seguindo' }).waitFor();
    await page.getByText('Nada por aqui ainda.').waitFor();
    await page.getByRole('link', { name: 'Curtidas recebidas: 3. Ver curtidas recebidas' }).click();
    await page.locator('.profile-comment-likes').filter({ hasText: '2 curtidas' }).waitFor();
    await page.screenshot({ path: 'evidencias/capturas/profile-likes-desktop.png', fullPage: true, animations: 'disabled' });
    await page.getByRole('link', { name: 'Abrir conversa sobre Hollow Knight' }).click();
    await page.waitForURL('**/jogo/igdb-1#comentarios');
    await page.getByRole('heading', { name: 'Seu comentário' }).waitFor();
    await page.goBack();
    await page.getByRole('link', { name: 'Comentários', exact: true }).click();
    await page.getByRole('heading', { name: 'Comentários de Lia Martins' }).waitFor();

    // Failure and slow response stay scoped to the social panel; account remains readable.
    await page.route('**/api/users/1', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Conexões indisponíveis. Tente novamente.' }) }));
    await page.goto(`${origin}/perfil`);
    await page.getByText('Conexões indisponíveis. Tente novamente.').waitFor();
    await page.getByText('jogador1@example.com').waitFor();
    await page.unroute('**/api/users/1');
    let release;
    const held = new Promise(resolve => { release = resolve; });
    await page.route('**/api/users/1', async route => { await held; await route.continue(); }, { times: 1 });
    await page.getByRole('button', { name: 'Tentar novamente' }).click();
    await page.getByText('Carregando conexões…').waitFor();
    release();
    await page.getByRole('link', { name: 'Seguidores: 2. Ver seguidores' }).waitFor();
    await context.setOffline(true);
    await page.getByRole('link', { name: 'Curtidas recebidas: 3. Ver curtidas recebidas' }).click();
    await page.getByRole('alert').filter({ hasText: 'Falha de comunicação' }).waitFor();
    await context.setOffline(false);
    await page.getByRole('button', { name: 'Tentar novamente' }).click();
    await page.getByRole('heading', { level: 1, name: 'Lia Martins' }).waitFor();
    // Collection failed independently while offline and can be retried in place.
    const retry = page.getByRole('button', { name: 'Tentar novamente' });
    if (await retry.count()) await retry.click();
    await page.locator('.profile-comment-likes').filter({ hasText: '2 curtidas' }).waitFor();

    const widths = [];
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 850 });
      for (const path of ['/perfil', '/perfil/1?aba=likes', '/perfil/3?aba=followers']) {
        await page.goto(origin + path);
        await page.getByRole('navigation', { name: 'Conexões do perfil' }).waitFor();
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow ${width} ${path}`);
        for (const link of await page.locator('.profile-social-link').all()) {
          const box = await link.boundingBox();
          assert(box.width >= 44 && box.height >= 44);
        }
        widths.push({ width, path, overflow: false });
        if (width === 320 && path === '/perfil') await page.screenshot({ path: 'evidencias/capturas/profile-social-mobile.png', fullPage: true, animations: 'disabled' });
        if (width === 320 && path === '/perfil/1?aba=likes') await page.screenshot({ path: 'evidencias/capturas/profile-likes-mobile.png', fullPage: true, animations: 'disabled' });
      }
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${origin}/perfil`);
    await page.locator('.profile-social-link').first().waitFor();
    assert.equal(await page.locator('.profile-social-link').first().evaluate(element => getComputedStyle(element).animationName), 'none');
    assert.equal(await page.locator('.profile-pass').evaluate(element => getComputedStyle(element).animationName), 'none');
    await page.goto(`${origin}/comunidade`);
    await page.getByRole('heading', { name: 'Bruno', exact: true }).waitFor();
    await context.clearCookies();
    await page.goto(`${origin}/perfil`);
    await page.getByText('Sem sessão iniciada').waitFor();
    assert.equal(await page.getByRole('navigation', { name: 'Conexões do perfil' }).count(), 0);
    assert.deepEqual(errors, []);
    writeFileSync('evidencias/resultados/profile-social-results.json', JSON.stringify({ browser: 'Edge headless', api: 'real, SQLite em memória', checks: ['links', 'keyboard', 'back', 'unfollow counts', 'likes', 'comments', 'private fields', 'failure/retry', 'loading', 'offline/retry', 'empty', 'reduced motion', 'visitor', 'sibling community'], widths, errors }, null, 2));
    console.log('Profile social browser: all checks passed.');
  } finally { await browser.close(); await server.close(); await new Promise(resolve => api.close(resolve)); db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
