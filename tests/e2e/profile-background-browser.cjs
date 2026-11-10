const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { writeFileSync } = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const { openCatalog } = await import('../../backend/src/catalog/catalog.js');
  const { createApp } = await import('../../backend/src/server.js');
  const { createServer } = await import('../../frontend/node_modules/vite/dist/node/index.js');
  const db = openCatalog(':memory:');
  db.prepare('INSERT INTO users VALUES (1,?,?,?,?)').run('Lia Martins', 'lia@example.com', 'unused', 'unused');
  const token = 'c'.repeat(64);
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
    await page.locator('.profile-background-tools summary').click();
    const picker = page.getByLabel('Selecionar plano de fundo', { exact: true });
    await page.getByRole('button', { name: 'Adicionar plano de fundo', exact: true }).waitFor();
    const png = Buffer.from(await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 400;
      const ctx = canvas.getContext('2d');
      const gradient = ctx.createLinearGradient(0, 0, 1200, 400);
      gradient.addColorStop(0, '#164e63'); gradient.addColorStop(.45, '#7c3aed'); gradient.addColorStop(1, '#f59e70');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1200, 400);
      ctx.fillStyle = '#ffe5bc'; ctx.beginPath(); ctx.arc(850, 130, 65, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = ['#375574', '#23394f', '#132738'][i];
        ctx.beginPath(); ctx.moveTo(0, 400);
        for (let x = 0; x <= 1200; x += 100) ctx.lineTo(x, 210 + i * 45 - Math.sin(x / 130 + i) * 65);
        ctx.lineTo(1200, 400); ctx.fill();
      }
      return canvas.toDataURL('image/png').split(',')[1];
    }), 'base64');
    const file = { name: 'paisagem.png', mimeType: 'image/png', buffer: png };
    await picker.setInputFiles({ name: 'invalid.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
    await page.getByRole('alert').filter({ hasText: 'Escolha uma imagem' }).waitFor();
    await picker.setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
    await page.getByRole('alert').filter({ hasText: 'Não foi possível ler' }).waitFor();
    await picker.setInputFiles({ name: 'large.png', mimeType: 'image/png', buffer: Buffer.alloc(8 * 1024 * 1024 + 1) });
    await page.getByRole('alert').filter({ hasText: 'até 8 MB' }).waitFor();
    // Selecting and cancelling never sends the original image.
    let uploads = 0;
    page.on('request', req => { if (req.method() === 'PUT' && /api\/auth\/(avatar|background)$/.test(req.url())) uploads++; });
    await picker.setInputFiles(file);
    const crop = page.getByRole('dialog', { name: 'Ajustar plano de fundo' });
    await crop.waitFor();
    assert.equal(uploads, 0);
    await page.getByLabel('Zoom', { exact: true }).fill('2');
    await page.getByLabel('Horizontal', { exact: true }).fill('80');
    await page.getByLabel('Vertical', { exact: true }).fill('20');
    const frame = page.locator('.photo-crop-frame');
    const before = await frame.locator('img').getAttribute('style');
    const bounds = await frame.boundingBox();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width / 2 + 20, bounds.y + bounds.height / 2 + 10); await page.mouse.up();
    assert.notEqual(await frame.locator('img').getAttribute('style'), before);
    await page.screenshot({ path: 'evidencias/capturas/photo-crop-desktop.png' });
    await page.getByRole('button', { name: 'Redefinir enquadramento' }).click();
    assert.equal(await page.getByLabel('Zoom', { exact: true }).inputValue(), '1');
    await page.keyboard.press('Escape');
    assert.equal(await crop.count(), 0);
    assert.equal(uploads, 0);
    // Avatar shares the same workflow, including narrow layouts and keyboard controls.
    await page.getByLabel('Selecionar foto de perfil', { exact: true }).setInputFiles(file);
    await page.getByRole('dialog', { name: 'Ajustar foto de perfil' }).waitFor();
    await page.setViewportSize({ width: 320, height: 740 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.getByLabel('Zoom', { exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.getByLabel('Zoom', { exact: true }).inputValue(), '1.01');
    await page.screenshot({ path: 'evidencias/capturas/photo-crop-mobile.png' });
    await page.getByRole('button', { name: 'Salvar recorte', exact: true }).click();
    await page.getByText('Foto atualizada.', { exact: true }).waitFor();
    assert.equal(await page.locator('.profile-avatar img').evaluate(img => img.naturalWidth), 128);
    await page.setViewportSize({ width: 1440, height: 1000 });
    // A flat gradient cannot reproduce size failures. Noise exercises a large PNG/JSON upload.
    const densePng = Buffer.from(await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 900; canvas.height = 300;
      const ctx = canvas.getContext('2d');
      const pixels = ctx.createImageData(900, 300);
      let seed = 42;
      for (let i = 0; i < pixels.data.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        pixels.data[i] = i % 4 === 3 ? 255 : seed >>> 24;
      }
      ctx.putImageData(pixels, 0, 0);
      return canvas.toDataURL('image/png').split(',')[1];
    }), 'base64');
    const denseRequest = page.waitForRequest(req => req.url().endsWith('/api/auth/background') && req.method() === 'PUT');
    await picker.setInputFiles({ name: 'detalhada.png', mimeType: 'image/png', buffer: densePng });
    await page.getByRole('button', { name: 'Salvar recorte', exact: true }).click();
    const uploadBytes = Buffer.byteLength((await denseRequest).postData());
    assert.ok(uploadBytes > 1024 * 1024 && uploadBytes < 2 * 1024 * 1024);
    await page.getByText('Plano de fundo atualizado.', { exact: true }).waitFor();
    writeFileSync('evidencias/resultados/profile-background-size-results.json', JSON.stringify({ passed: true, inputBytes: densePng.length, uploadBytes, limitBytes: 2 * 1024 * 1024 }, null, 2));
    await page.getByRole('button', { name: 'Remover fundo', exact: true }).click();
    await page.getByText('Plano de fundo removido.', { exact: true }).waitFor();
    let release;
    const held = new Promise(resolve => { release = resolve; });
    await page.route('**/api/auth/background', async route => { await held; await route.continue(); }, { times: 1 });
    await picker.setInputFiles(file);
    await page.getByRole('button', { name: 'Salvar recorte', exact: true }).click();
    await page.getByText('Salvando plano de fundo…', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Adicionar plano de fundo', exact: true }).isDisabled(), true);
    release();
    await page.getByText('Plano de fundo atualizado.', { exact: true }).waitFor();
    const background = page.locator('.profile-background img');
    await background.waitFor();
    assert.equal(await background.evaluate(img => img.complete && img.naturalWidth === 900), true);
    const source = await background.getAttribute('src');
    await page.reload();
    await background.waitFor();
    assert.equal(await background.getAttribute('src'), source);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: 'evidencias/capturas/profile-background-desktop.png', fullPage: true, animations: 'disabled' });
    await page.locator('.profile-pass').screenshot({ path: 'evidencias/capturas/profile-background-card.png', animations: 'disabled' });
    await page.locator('.profile-background-tools summary').click();
    const edit = page.getByRole('button', { name: 'Alterar plano de fundo', exact: true });
    await page.keyboard.press('Tab');
    assert.equal(await edit.evaluate(el => document.activeElement === el), true);
    assert.equal(await edit.evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
    const chooser = page.waitForEvent('filechooser'); await page.keyboard.press('Enter');
    await (await chooser).setFiles(file);
    await page.getByRole('button', { name: 'Salvar recorte', exact: true }).click();
    await page.getByText('Plano de fundo atualizado.', { exact: true }).waitFor();
    await context.setOffline(true);
    await picker.setInputFiles(file);
    await page.getByRole('button', { name: 'Salvar recorte', exact: true }).click();
    await page.getByRole('dialog').getByRole('alert').filter({ hasText: 'Falha de comunicação' }).waitFor();
    assert.equal(await background.getAttribute('src'), source);
    await context.setOffline(false);
    await page.getByRole('button', { name: 'Salvar recorte', exact: true }).click();
    await page.getByText('Plano de fundo atualizado.', { exact: true }).waitFor();
    for (const width of [320, 390, 650]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await edit.isVisible(), true);
      const panel = await page.locator('.profile-background-editor').boundingBox();
      const card = await page.locator('.profile-identity').boundingBox();
      assert.ok(panel.x >= card.x && panel.x + panel.width <= card.x + card.width);
      if (width === 390) {
        await page.locator('.profile-background-tools summary').focus();
        await page.keyboard.press('Escape');
        await page.screenshot({ path: 'evidencias/capturas/profile-background-mobile.png', fullPage: true, animations: 'disabled' });
        await page.locator('.profile-background-tools summary').click();
      }
    }
    const guest = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    await guest.addInitScript(() => localStorage.setItem('buscagames:cookie-choice', 'rejected'));
    const publicPage = await guest.newPage();
    await publicPage.goto(`${origin}/perfil/1`);
    await publicPage.locator('.profile-background img').waitFor();
    assert.equal(await publicPage.locator('.profile-background img').getAttribute('src'), source);
    assert.equal(await publicPage.getByRole('button', { name: /plano de fundo/ }).count(), 0);
    assert.equal(await publicPage.getByText('lia@example.com').count(), 0);
    // The public cover preserves the saved crop and never sits behind identity text.
    for (const width of [1440, 650, 390, 320]) {
      await publicPage.setViewportSize({ width, height: 1000 });
      const cover = await publicPage.locator('.profile-background').boundingBox();
      const avatar = await publicPage.locator('.community-profile > .community-avatar').boundingBox();
      assert.ok(Math.abs(cover.width / cover.height - 3) < .02, 'Preserve the 3:1 crop');
      assert.ok(avatar.y >= cover.y + cover.height, 'Identity must not obscure the cover');
      assert.equal(await publicPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await publicPage.screenshot({ path: `evidencias/capturas/profile-cover-visible-${width}.png`, fullPage: true, animations: 'disabled' });
    }
    const coverBeforeFailure = await publicPage.locator('.profile-background').boundingBox();
    await publicPage.route('**/api/backgrounds/**', route => route.abort());
    await publicPage.reload();
    await publicPage.getByRole('heading', { name: 'Lia Martins', exact: true }).waitFor();
    await publicPage.waitForFunction(() => !document.querySelector('.profile-background img'));
    assert.deepEqual(await publicPage.locator('.profile-background').boundingBox(), coverBeforeFailure);
    await publicPage.unroute('**/api/backgrounds/**');
    await publicPage.reload();
    await publicPage.locator('.profile-background img').waitFor();
    await publicPage.setViewportSize({ width: 1440, height: 1000 });
    await publicPage.screenshot({ path: 'evidencias/capturas/profile-background-public.png', fullPage: true, animations: 'disabled' });
    await publicPage.setViewportSize({ width: 320, height: 900 });
    assert.equal(await publicPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.getByRole('button', { name: 'Remover fundo', exact: true }).click();
    await page.getByText('Plano de fundo removido.', { exact: true }).waitFor();
    assert.equal(await page.locator('.profile-background').count(), 0);
    await publicPage.reload();
    await publicPage.getByRole('heading', { name: 'Lia Martins', exact: true }).waitFor();
    assert.equal(await publicPage.locator('.profile-background').count(), 0);
    await picker.setInputFiles(file);
    await page.getByRole('button', { name: 'Salvar recorte', exact: true }).click();
    await page.getByText('Plano de fundo atualizado.', { exact: true }).waitFor();
    db.prepare('DELETE FROM sessions').run();
    await page.getByRole('button', { name: 'Remover fundo', exact: true }).click();
    await page.getByRole('dialog').waitFor();
    await page.getByText('Sua sessão expirou. Entre novamente para continuar.').waitFor();
    assert.deepEqual(errors, []);
    writeFileSync('evidencias/resultados/profile-background-results.json', JSON.stringify({ passed: true, checks: ['upload real com PNG validado', 'tipo, tamanho e imagem corrompida', 'ocupado e teclado', 'persistência após recarga', 'falha offline e recuperação', '320/390/650px sem overflow', 'visibilidade pública sem sessão', 'e-mail privado e edição ausente para visitante', 'remoção pública', 'sessão expirada', 'movimento reduzido'], errors }, null, 2));
  } finally { await browser.close(); await server.close(); await new Promise(resolve => api.close(resolve)); db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
