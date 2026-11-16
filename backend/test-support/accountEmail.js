import assert from 'node:assert/strict';
import { accountEmailDelivery } from '../src/community/accountEmail.js';

export function testMailbox(site = 'https://buscagames.example') {
  const messages = [];
  const deliver = accountEmailDelivery({
    PUBLIC_SITE_URL: site, RESEND_API_KEY: 'test', AUTH_EMAIL_FROM: 'BuscaGames <conta@example.com>',
  }, async (url, request) => {
    assert.equal(url, 'https://api.resend.com/emails');
    const message = JSON.parse(request.body);
    message.link = new URL(message.text.match(/^https?:\/\/[^\s]+/m)[0]);
    messages.push(message);
    return Response.json({ id: 'test-mail' });
  });
  return { deliver, messages, token: (email) => messages.findLast((message) => message.to.includes(email))?.link.hash.slice(1) };
}

export async function activateTestAccount(request, mailbox, credentials) {
  const { email, password } = credentials;
  const verified = await request('/api/auth/verify-email', 'POST', { token: mailbox.token(email.trim().toLowerCase()) });
  assert.equal(verified.status, 200);
  const login = await request('/api/auth/login', 'POST', { email, password });
  assert.equal(login.status, 200);
  return login;
}
