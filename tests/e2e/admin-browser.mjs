import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { openCatalog } from '../../backend/src/catalog/catalog.js';
import { createApp } from '../../backend/src/server.js';
import { activateTestAccount, testMailbox } from '../../backend/test-support/accountEmail.js';
import { createServer } from '../../frontend/node_modules/vite/dist/node/index.js';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const captures = process.env.E2E_CAPTURE_DIR || 'evidencias/capturas';
const db = openCatalog(':memory:');
const mailbox = testMailbox();
const api = createApp(db, false, mailbox.deliver);
await new Promise(resolve => api.listen(0, '127.0.0.1', resolve));
const target = 'http://127.0.0.1:' + api.address().port;
const vite = await createServer({ root: 'frontend', server: { host: '127.0.0.1', port: 0, proxy: { '/api': target } } });
let browser;
try {
  await vite.listen();
  const email = 'equipe@example.org';
  const password = 'Orbitas!47-Luas';
  const registered = await fetch(target + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-BuscaGames-Request': '1' }, body: JSON.stringify({ name: 'Equipe BuscaGames', email, password, passwordConfirmation: password }) });
  assert.equal(registered.status, 201);
  await activateTestAccount((path, method, body) => fetch(target + path, { method,
    headers: { 'Content-Type': 'application/json', 'X-BuscaGames-Request': '1' }, body: JSON.stringify(body),
  }), mailbox, { email, password });
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await page.addInitScript(() => localStorage.setItem('buscagames:cookie-choice', 'rejected'));
  await page.goto(vite.resolvedUrls.local[0] + 'admin');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar no painel' }).click();
  await page.getByText('E-mail ou senha incorretos.').waitFor();
  db.prepare('INSERT INTO administrators VALUES (1)').run();
  await page.getByRole('button', { name: 'Entrar no painel' }).click();
  await page.getByRole('heading', { name: 'Dashboard' }).waitFor();
  await page.getByRole('button', { name: '30 dias' }).click();
  await page.getByText('Ver valores por dia').click();
  assert.equal(await page.locator('.dash-daily tbody tr').count(), 30);
  await page.getByText('Ver valores por dia').click();
  await page.getByRole('button', { name: 'Acesso', exact: true }).click();
  await page.getByText('Bloqueados', { exact: true }).waitFor();
  await page.setViewportSize({ width: 320, height: 800 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: '7 dias' }).click();
  await page.getByRole('button', { name: 'Revisão', exact: true }).click();
  await page.screenshot({ path: join(captures, 'admin-desktop.png') });
  const player = await page.request.post(target + '/api/auth/register', {
    headers: { 'X-BuscaGames-Request': '1' },
    data: { name: 'Jogador Beta', email: 'beta@example.org', password, passwordConfirmation: password },
  });
  assert.equal(player.status(), 201);
  await activateTestAccount(async (path, method, data) => {
    const response = await page.request.fetch(target + path, { method, headers: { 'X-BuscaGames-Request': '1' }, data });
    return { status: response.status() };
  }, mailbox, { email: 'beta@example.org', password });
  const photo = 'iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAAAAADmVT4XAAAAJklEQVR4nO3BAQEAAACCIP+vbkhAAQAAAAAAAAAAAAAAAAAAAO8GQIAAAfnHrWYAAAAASUVORK5CYII=';
  const uploaded = await page.request.put(target + '/api/auth/avatar', {
    headers: { 'X-BuscaGames-Request': '1' }, data: { photo },
  });
  assert.equal(uploaded.status(), 200);
  const avatarUrl = (await uploaded.json()).user.avatarUrl;
  const googlePhoto = 'https://lh3.googleusercontent.com/test-admin-photo';
  db.prepare('INSERT INTO profile_photos(user_id, google_url) VALUES (?,?)').run(1, googlePhoto);
  await page.route(googlePhoto, route => route.fulfill({ contentType: 'image/png', body: Buffer.from(photo, 'base64') }));
  await page.getByRole('link', { name: 'Verificações', exact: true }).click();
  const adminPhoto = page.locator('.admin-identity img');
  await adminPhoto.waitFor();
  assert.equal(await adminPhoto.getAttribute('src'), googlePhoto);
  await adminPhoto.evaluate(img => img.decode());

  await page.getByRole('row').filter({ hasText: 'beta@example.org' }).getByRole('button', { name: 'Marcar como revisado' }).click();
  await page.getByText('Cadastro marcado como revisado.').waitFor();
  await page.getByRole('link', { name: 'Usuários', exact: true }).click();
  const playerRow = page.getByRole('row').filter({ hasText: 'beta@example.org' });
  const playerPhoto = playerRow.locator('img.player-photo');
  await playerPhoto.waitFor();
  assert.equal(await playerPhoto.getAttribute('src'), avatarUrl);
  await playerPhoto.evaluate(img => img.decode());
  await playerRow.getByRole('img', { name: 'Perfil revisado por um administrador' }).waitFor();
  for (const action of ['Bloquear', 'Desbloquear']) {
    await playerRow.getByRole('button', { name: action, exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: action + ' usuário' }).click();
    await playerRow.getByRole('cell', { name: action === 'Bloquear' ? 'Bloqueado' : 'Ativo', exact: true }).waitFor();
  }
  await page.setViewportSize({ width: 320, height: 800 });
  const ban = playerRow.getByRole('button', { name: 'Banir', exact: true });
  await page.route('**/api/admin/usuarios?page=*', async route => {
    const response = await route.fetch();
    const { canBanUsers, ...legacy } = await response.json();
    assert.equal(canBanUsers, true);
    await route.fulfill({ response, json: legacy });
  }, { times: 1 });
  const refresh = page.getByRole('button', { name: /Atualizar dados/ });
  await refresh.click();
  await page.getByRole('status').getByText(/Banimento indisponível/).waitFor();
  assert.equal(await ban.count(), 0);
  assert.ok(await playerRow.getByRole('button', { name: 'Bloquear', exact: true }).isEnabled());
  await refresh.click();
  await ban.waitFor();
  const confirmation = page.getByRole('dialog', { name: 'Banir usuário?' });
  await ban.click();
  await confirmation.getByText('beta@example.org', { exact: true }).waitFor();
  assert.ok(await confirmation.getByRole('button', { name: 'Cancelar' }).evaluate(node => node === document.activeElement));
  await page.keyboard.press('Escape');
  await confirmation.waitFor({ state: 'hidden' });
  assert.ok(await ban.evaluate(node => node === document.activeElement));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.route('**/api/admin/usuarios', route => route.fulfill({ status: 503, json: { error: 'Serviço indisponível. Tente novamente.' } }), { times: 1 });
  await ban.click();
  const confirmBan = confirmation.getByRole('button', { name: 'Banir usuário' });
  await confirmBan.click();
  await confirmation.getByRole('alert').getByText('Serviço indisponível. Tente novamente.').waitFor();
  await confirmBan.click();
  await page.getByRole('status').getByText('Usuário banido e removido da comunidade.').waitFor();
  await playerRow.waitFor({ state: 'hidden' });
  assert.ok(await page.getByRole('heading', { name: 'Usuários' }).evaluate(node => node === document.activeElement));
  assert.equal((await page.request.get(target + '/api/users/2')).status(), 404);
  assert.equal((await page.request.get(target + avatarUrl)).status(), 404);
  await page.getByRole('link', { name: 'Chat', exact: true }).click();
  await page.getByLabel('Mensagem para a equipe').fill('Revisão concluída.');
  await page.getByRole('button', { name: 'Enviar mensagem' }).click();
  await page.getByRole('cell', { name: 'Revisão concluída.' }).waitFor();
  await page.setViewportSize({ width: 320, height: 800 });
  await page.getByRole('button', { name: 'Recolher menu' }).click();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: join(captures, 'admin-mobile.png') });
  await page.getByRole('button', { name: 'Sair do painel' }).click();
  await page.getByRole('heading', { name: 'Acesso administrativo' }).waitFor();
  console.log('Login, painel, banimento com cancelamento e nova tentativa, chat, menu móvel e logout verificados.');
} finally {
  await browser?.close(); await vite.close(); await new Promise(resolve => api.close(resolve)); db.close();
}
