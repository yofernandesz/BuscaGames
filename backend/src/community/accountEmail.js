import { createHash, randomBytes } from 'node:crypto';
import { normalizeEmail, validAccountEmail, validateNewPassword } from '../../../shared/accountPolicy.mjs';

const lifetime = 15 * 60_000;
const tokenHash = (token) => createHash('sha256').update(token).digest('hex');
const emailPaths = {
  verify: { path: '/verificar-email', action: 'Verificar meu e-mail', subject: 'Confirme seu e-mail no BuscaGames' },
  reset: { path: '/redefinir-senha', action: 'Redefinir minha senha', subject: 'Redefina sua senha no BuscaGames' },
};

export function initializeAccountEmail(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS account_emails (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      verified_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS account_email_tokens (
      digest TEXT PRIMARY KEY NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      purpose TEXT NOT NULL CHECK(purpose IN ('verify', 'reset')),
      expires INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS account_email_tokens_owner ON account_email_tokens(user_id, purpose, expires);
    CREATE INDEX IF NOT EXISTS account_email_tokens_expiry ON account_email_tokens(expires);
  `);
}

export function accountTransaction(db, action) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = action();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function markEmailVerified(db, id) {
  db.prepare(`INSERT INTO account_emails VALUES (?,?)
    ON CONFLICT(user_id) DO UPDATE SET verified_at=excluded.verified_at WHERE verified_at IS NULL`).run(id, Date.now());
  db.prepare("DELETE FROM account_email_tokens WHERE user_id=? AND purpose='verify'").run(id);
}

export function accountEmailDelivery(env = process.env, fetcher = fetch) {
  const { PUBLIC_SITE_URL, AUTH_EMAIL_FROM, RESEND_API_KEY, BREVO_API_KEY } = env;
  const provider = env.AUTH_EMAIL_PROVIDER || 'resend';
  if (!['resend', 'brevo'].includes(provider)) return null;
  const apiKey = provider === 'brevo' ? BREVO_API_KEY : RESEND_API_KEY;
  const senderMatch = /^(.*?)\s*<([^<>]+)>$/.exec(AUTH_EMAIL_FROM || '');
  const sender = { name: senderMatch?.[1]?.trim() || 'BuscaGames', email: senderMatch?.[2] || AUTH_EMAIL_FROM };
  const url = URL.canParse(PUBLIC_SITE_URL || '') ? new URL(PUBLIC_SITE_URL) : null;
  if (!url || !apiKey || !validAccountEmail(sender.email) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    && (env.NODE_ENV !== 'production' || env.SESSION_COOKIE_SECURE === 'false');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return null;

  return async ({ email, purpose, token }) => {
    const { path, action, subject } = emailPaths[purpose];
    // Fragments stay out of HTTP requests, proxy access logs and Referer headers.
    const link = `${url.origin}${path}#${token}`;
    const instruction = purpose === 'verify'
      ? 'Confirme somente se você criou esta conta ou solicitou a confirmação.'
      : 'Use o link para escolher uma nova senha.';
    const text = `${instruction}\n\n${link}\n\nO link expira em 15 minutos. Se você não fez a solicitação, ignore este e-mail.`;
    const html = `<p>${instruction}</p><p><a style="display:inline-block;padding:12px 20px;background:#121026;color:#fff;border-radius:8px" href="${link}">${action}</a></p><p>O link expira em 15 minutos. Se você não fez a solicitação, ignore este e-mail.</p>`;
    try {
      const brevo = provider === 'brevo';
      const response = await fetcher(brevo ? 'https://api.brevo.com/v3/smtp/email' : 'https://api.resend.com/emails', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
        headers: brevo ? { 'api-key': apiKey, 'Content-Type': 'application/json' }
          : { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `account-${purpose}-${tokenHash(token)}` },
        body: JSON.stringify(brevo
          ? { sender, to: [{ email }], subject, textContent: text, htmlContent: html }
          : { from: AUTH_EMAIL_FROM, to: [email], subject, text, html }),
      });
      if (response.ok && (provider !== 'brevo' || typeof (await response.json()).messageId === 'string')) return true;
    } catch { /* Provider responses and errors may contain private data. */ }
    console.warn('Falha no envio de e-mail de autenticação.');
    return false;
  };
}

export function issueAccountEmailToken(db, user, purpose) {
  const now = Date.now();
  db.prepare('DELETE FROM account_email_tokens WHERE expires<=?').run(now);
  const { count, latest } = db.prepare(`SELECT COUNT(*) AS count, MAX(expires) AS latest FROM account_email_tokens
    WHERE user_id=? AND purpose=?`).get(user.id, purpose);
  // Keep previous usable links when someone requests another message.
  if (count >= 3 || latest > now + lifetime - 60_000) return null;
  const token = randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO account_email_tokens VALUES (?,?,?,?)').run(tokenHash(token), user.id, purpose, now + lifetime);
  return { email: user.email, purpose, token };
}

export const accountEmailRoutes = new Set(['verify-email', 'resend-verification', 'forgot-password', 'reset-password']);

export async function handleAccountEmail(db, route, data, { currentUserId, send, fail, limit, deliver, derivePassword }) {
  const purpose = ['forgot-password', 'reset-password'].includes(route) ? 'reset' : 'verify';
  const localPassword = "(u.password_hash GLOB 'scrypt-v2$*' OR length(u.password_hash)=128)";
  if (route === 'resend-verification' || route === 'forgot-password') {
    const email = normalizeEmail(data.email);
    if (!validAccountEmail(email)) fail(400, 'Informe um e-mail válido.', 'email');
    limit(`${route}:${email}`, 5);
    if (!deliver) fail(503, 'Envio de e-mail indisponível no momento. Tente entrar com o Google.');
    send(202, { accepted: true });
    // Account lookup and delivery happen after the same response for every address.
    setImmediate(async () => {
      try {
        const message = accountTransaction(db, () => {
          const eligibility = purpose === 'reset'
            ? `e.verified_at IS NOT NULL AND ${localPassword}`
            : 'e.verified_at IS NULL AND (e.user_id IS NOT NULL OR u.id=?)';
          const user = db.prepare(`SELECT u.id,u.email FROM users u LEFT JOIN account_emails e ON e.user_id=u.id
            WHERE u.email=? AND ${eligibility} AND NOT EXISTS (SELECT 1 FROM blocked_users WHERE user_id=u.id)`)
            .get(...(purpose === 'reset' ? [email] : [email, currentUserId()]));
          return user ? issueAccountEmailToken(db, user, purpose) : null;
        });
        if (message) await deliver(message);
      } catch { console.warn('Falha ao processar solicitação de e-mail de autenticação.'); }
    });
    return;
  }

  const rejectToken = () => fail(400, 'Este link é inválido, expirou ou já foi usado. Solicite um novo link.', 'token');
  if (typeof data.token !== 'string' || !/^[\w-]{43}$/.test(data.token)) rejectToken();
  const digest = tokenHash(data.token);
  const findAccount = () => {
    const account = db.prepare(`SELECT u.id,u.name,u.email FROM account_email_tokens t JOIN users u ON u.id=t.user_id
      LEFT JOIN account_emails e ON e.user_id=u.id
      WHERE t.digest=? AND t.purpose=? AND t.expires>?
      AND ${purpose === 'reset' ? `e.verified_at IS NOT NULL AND ${localPassword}` : 'e.verified_at IS NULL'}
      AND NOT EXISTS (SELECT 1 FROM blocked_users WHERE user_id=u.id)`).get(digest, purpose, Date.now());
    if (!account) rejectToken();
    return account;
  };
  if (purpose === 'verify') {
    accountTransaction(db, () => markEmailVerified(db, findAccount().id));
    send(200, { emailVerified: true });
    return;
  }

  const account = findAccount();
  const invalid = validateNewPassword(data, account);
  if (invalid) fail(400, invalid.message, invalid.field);
  const { passwordHash, salt } = await derivePassword(data.password);
  accountTransaction(db, () => {
    const current = findAccount();
    const invalidNow = validateNewPassword(data, current);
    if (invalidNow) fail(400, invalidNow.message, invalidNow.field);
    db.prepare('UPDATE users SET password_hash=?,salt=? WHERE id=?').run(passwordHash, salt, current.id);
    db.prepare("DELETE FROM account_email_tokens WHERE user_id=? AND purpose='reset'").run(current.id);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(current.id);
    db.prepare('DELETE FROM admin_sessions WHERE user_id=?').run(current.id);
  });
  send(200, { passwordReset: true });
}
