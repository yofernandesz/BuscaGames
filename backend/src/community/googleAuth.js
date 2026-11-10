import { createHash, randomBytes } from 'node:crypto';
import { availableNickname } from './nicknames.js';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const random = () => randomBytes(32).toString('base64url');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
function redirectUris() {
  return [process.env.GOOGLE_REDIRECT_URI, ...(process.env.GOOGLE_REDIRECT_URIS || '').split(',')]
    .filter(Boolean).map((value) => value.trim()).filter((value) => {
      try {
        const url = new URL(value);
        return (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
          && url.pathname === '/api/auth/google/callback' && !url.search && !url.hash && !url.username && !url.password;
      } catch { return false; }
    });
}
export const googleConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && redirectUris().length);

function returnPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value) || value.length > 2048) return '/perfil';
  const url = new URL(value, 'https://buscagames.local');
  if (url.pathname.startsWith('/api/')) return '/perfil';
  url.searchParams.delete('auth');
  return url.pathname + url.search + url.hash;
}

function pictureUrl(value) {
  if (typeof value !== 'string' || value.length > 2048 || !URL.canParse(value)) return null;
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
}

function profilePicture(identity, idToken) {
  const picture = pictureUrl(identity.picture);
  if (picture || typeof idToken !== 'string') return picture;
  // The token comes directly from Google's TLS token exchange. UserInfo establishes the account.
  try {
    const claims = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8'));
    return claims.sub === identity.sub ? pictureUrl(claims.picture) : null;
  } catch { return null; }
}

export function googleAuthHandler(db) {
  return async (req, res, url, { userId, token, readBody, startSession, startAdminSession }) => {
    if (!['/api/auth/google/start', '/api/auth/google/callback'].includes(url.pathname)) return false;
    const flowCookie = (value, age) => `bg_google=${value}; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=${age}${process.env.SESSION_COOKIE_SECURE === 'true' || req.socket.encrypted || (process.env.NODE_ENV === 'production' && process.env.SESSION_COOKIE_SECURE !== 'false') ? '; Secure' : ''}`;
    if (url.pathname.endsWith('/start')) {
      if (req.method !== 'POST') fail(405, 'Método não permitido.');
      const data = await readBody(req);
      if (!googleConfigured()) fail(503, 'O login com Google ainda não está disponível. Entre com e-mail e senha.');
      const adminLogin = data.adminLogin === true;
      if (adminLogin && data.link) fail(400, 'Escolha apenas uma forma de acesso.');
      if (data.link && !userId) fail(401, 'Entre na sua conta antes de vincular o Google.');
      // Only explicitly configured origins may receive Google's code. Never derive it from Host/forwarded headers.
      const configured = redirectUris();
      const redirectUri = req.headers.origin
        ? configured.find((value) => new URL(value).origin === req.headers.origin) : configured[0];
      if (!redirectUri) fail(503, 'O login com Google ainda não está configurado para este endereço do site. Entre com e-mail e senha.');
      db.prepare('DELETE FROM google_flows WHERE expires<=?').run(Date.now());
      if (db.prepare('SELECT COUNT(*) AS n FROM google_flows').get().n >= 1000) fail(429, 'Muitas tentativas. Aguarde alguns minutos.');
      const state = random(), verifier = random(), browser = random();
      db.prepare('INSERT INTO google_flows (state,verifier,browser,return_to,session_token,expires,redirect_uri,admin_login) VALUES (?,?,?,?,?,?,?,?)').run(hash(state), verifier, hash(browser), adminLogin ? '/admin' : returnPath(data.returnTo), data.link ? hash(token) : null, Date.now() + 10 * 60000, redirectUri, Number(adminLogin));
      const target = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      target.search = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri,
        response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account',
        code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }).toString();
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Set-Cookie': flowCookie(browser, 600) });
      res.end(JSON.stringify({ url: target.href }));
      return true;
    }
    if (req.method !== 'GET') fail(405, 'Método não permitido.');
    let destination = '/perfil', outcome = 'google_failed', sessionCookie, adminLogin = false;
    try {
      const state = url.searchParams.get('state') || '';
      const browser = /(?:^|;\s*)bg_google=([\w-]{43})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
      const flow = db.prepare('SELECT * FROM google_flows WHERE state=? AND expires>?').get(hash(state), Date.now());
      if (!flow || !browser || flow.browser !== hash(browser)) throw new Error('Invalid OAuth state');
      db.prepare('DELETE FROM google_flows WHERE state=?').run(hash(state));
      destination = flow.return_to;
      adminLogin = Boolean(flow.admin_login);
      if (url.searchParams.has('error')) { outcome = 'google_cancelled'; throw new Error('OAuth cancelled'); }
      if (!googleConfigured() || !url.searchParams.get('code')) throw new Error('Missing OAuth configuration or code');
      if (!redirectUris().includes(flow.redirect_uri)) throw new Error('OAuth redirect no longer configured');
      // A link is bound to the exact session that initiated it, including after logout or account switching.
      if (flow.session_token && (!userId || !token || hash(token) !== flow.session_token)) throw new Error('Link session expired');
      const exchange = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', signal: AbortSignal.timeout(15000),
        body: new URLSearchParams({ code: url.searchParams.get('code'), client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: flow.redirect_uri,
          grant_type: 'authorization_code', code_verifier: flow.verifier }),
      });
      if (!exchange.ok) throw new Error('OAuth exchange failed');
      const tokens = await exchange.json();
      if (typeof tokens.access_token !== 'string' || !tokens.access_token) throw new Error('Missing access token');
      // Identity comes directly from Google's HTTPS UserInfo endpoint, never from client-supplied claims.
      const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error('OAuth identity failed');
      const identity = await response.json();
      if (typeof identity.sub !== 'string' || !identity.sub || identity.sub.length > 255 || identity.email_verified !== true
        || typeof identity.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity.email) || identity.email.length > 254) throw new Error('Invalid Google identity');
      // Recheck after network I/O so logout during the exchange cannot authorize a link.
      if (flow.session_token && !db.prepare('SELECT 1 FROM sessions WHERE token=? AND user_id=? AND expires>?').get(flow.session_token, userId, Date.now())) throw new Error('Link session expired');
      const linked = db.prepare('SELECT user_id FROM google_accounts WHERE subject=?').get(identity.sub);
      let id = linked?.user_id;
      if (id && db.prepare('SELECT 1 FROM blocked_users WHERE user_id=?').get(id)) {
        outcome = 'google_blocked'; throw new Error('Account blocked');
      }
      if (adminLogin) {
        try { sessionCookie = startAdminSession(id); }
        catch (error) {
          if (error.status === 403) outcome = 'google_admin_denied';
          throw error;
        }
      } else if (flow.session_token) {
        const existing = db.prepare('SELECT subject FROM google_accounts WHERE user_id=?').get(userId);
        if ((linked && id !== userId) || (existing && existing.subject !== identity.sub)) { outcome = 'google_conflict'; throw new Error('Account already linked'); }
        db.prepare('INSERT OR IGNORE INTO google_accounts VALUES (?,?)').run(identity.sub, userId);
        id = userId;
      } else if (!id) {
        const email = identity.email.toLowerCase().trim();
        if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) { outcome = 'google_existing'; throw new Error('Sign in before linking'); }
        db.exec('BEGIN IMMEDIATE');
        try {
          id = Number(db.prepare('INSERT INTO users(name,email,password_hash,salt) VALUES (?,?,?,?)').run(
            availableNickname(db, identity.name), email, '', '').lastInsertRowid);
          db.prepare('INSERT INTO google_accounts VALUES (?,?)').run(identity.sub, id);
          db.exec('COMMIT');
        } catch (error) { db.exec('ROLLBACK'); throw error; }
      }
      const googleUrl = profilePicture(identity, tokens.id_token);
      if (googleUrl) {
        db.prepare(`INSERT INTO profile_photos(user_id,google_url) VALUES (?,?)
          ON CONFLICT(user_id) DO UPDATE SET google_url=excluded.google_url`).run(id, googleUrl);
      }
      if (!adminLogin) sessionCookie = startSession(id);
      outcome = flow.session_token ? 'google_linked' : 'google_success';
    } catch { /* Return a bounded public error; provider tokens and codes must never enter logs. */ }
    const target = new URL(destination, 'https://buscagames.local');
    if (!adminLogin || outcome !== 'google_success') target.searchParams.set(adminLogin ? 'adminAuth' : 'auth', outcome);
    res.writeHead(303, { Location: target.pathname + target.search + target.hash, 'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer', 'Set-Cookie': [flowCookie('', 0), ...(sessionCookie ? [sessionCookie] : [])] });
    res.end();
    return true;
  };
}
