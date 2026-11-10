import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { auditedChange, initializeAdmin, adminSection } from '../admin.js';
import { promisify } from 'node:util';
import { isIP } from 'node:net';
import { googleAuthHandler, googleConfigured } from './googleAuth.js';
import { normalizeEmail, validateAccount } from '../../../shared/accountPolicy.mjs';
import { initializeSocial, handleSocial } from './social.js';
import { initializeNicknames, changeNickname, nicknameAvailability } from './nicknames.js';
import { validateBackground } from './profileBackground.js';

const deriveKey = promisify(scrypt);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const fail = (status, message, field) => { throw Object.assign(new Error(message), { status, field }); };
const passwordOptions = { N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 };
const passwordPrefix = 'scrypt-v2$';

export function initializeCommunity(db) {
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, salt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS profile_photos (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      google_url TEXT, custom_png BLOB, custom_url TEXT
    );
    CREATE TABLE IF NOT EXISTS profile_backgrounds (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      png BLOB NOT NULL, url TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires);
    CREATE TABLE IF NOT EXISTS auth_attempts (
      key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS auth_attempts_expiry ON auth_attempts(expires);
    CREATE TABLE IF NOT EXISTS google_accounts (
      subject TEXT PRIMARY KEY, user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS google_flows (
      state TEXT PRIMARY KEY, verifier TEXT NOT NULL, browser TEXT NOT NULL,
      return_to TEXT NOT NULL, session_token TEXT, expires INTEGER NOT NULL, redirect_uri TEXT
    );
    CREATE TABLE IF NOT EXISTS user_favorites (
      user_id INTEGER NOT NULL REFERENCES users(id), game_id INTEGER NOT NULL REFERENCES games(id),
      PRIMARY KEY(user_id, game_id)
    );
    CREATE TABLE IF NOT EXISTS user_ratings (
      user_id INTEGER NOT NULL REFERENCES users(id), game_id INTEGER NOT NULL REFERENCES games(id),
      rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5), PRIMARY KEY(user_id, game_id)
    );
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id), game_id INTEGER NOT NULL REFERENCES games(id),
      body TEXT NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 500),
      created_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
      UNIQUE(user_id, game_id)
    );
    CREATE INDEX IF NOT EXISTS comments_game_recent ON comments(game_id, id DESC);
    CREATE TABLE IF NOT EXISTS comment_replies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 35), created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS replies_parent_author ON comment_replies(comment_id, user_id);
    CREATE TRIGGER IF NOT EXISTS replies_limit BEFORE INSERT ON comment_replies
    WHEN (SELECT COUNT(*) FROM comment_replies WHERE comment_id=NEW.comment_id AND user_id=NEW.user_id) >= 2
    BEGIN SELECT RAISE(ABORT, 'reply_limit'); END;
  `);
  initializeAdmin(db);
  initializeNicknames(db);
  initializeSocial(db);
  if (!db.prepare('PRAGMA table_info(google_flows)').all().some(column => column.name === 'admin_login')) {
    db.exec('ALTER TABLE google_flows ADD COLUMN admin_login INTEGER NOT NULL DEFAULT 0');
  }
  if (!db.prepare('PRAGMA table_info(google_flows)').all().some((column) => column.name === 'redirect_uri')) {
    db.exec('ALTER TABLE google_flows ADD COLUMN redirect_uri TEXT');
  }
}

async function readJsonBody(req, maxBytes = 8192) {
  if (!req.headers['content-type']?.startsWith('application/json') || req.headers['x-buscagames-request'] !== '1'
    || req.headers['sec-fetch-site'] === 'cross-site') fail(403, 'Requisição não autorizada.');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) fail(413, 'Dados muito longos.');
    chunks.push(chunk);
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    return data;
  } catch { fail(400, 'Dados inválidos.'); }
}

export function communityHandler(db) {
  // Bound password derivations and repeated attempts without adding a service dependency.
  let hashing = 0;
  const limit = (key, maximum, res) => {
    const now = Date.now();
    db.prepare('DELETE FROM auth_attempts WHERE expires<=?').run(now);
    const digest = hash(key);
    const attempt = db.prepare('SELECT count, expires FROM auth_attempts WHERE key=?').get(digest);
    if (attempt?.count >= maximum || (!attempt && db.prepare('SELECT COUNT(*) AS n FROM auth_attempts').get().n >= 10000)) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil(((attempt?.expires || now + 900000) - now) / 1000))));
      fail(429, 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
    }
    db.prepare('INSERT INTO auth_attempts VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(digest, now + 900000);
  };
  const requireActive = (id) => {
    if (db.prepare('SELECT 1 FROM blocked_users WHERE user_id=?').get(id)) fail(403, 'Conta bloqueada pela administração.');
  };
  const profile = (id) => {
    const user = db.prepare('SELECT id, name, email, COALESCE(custom_url, google_url) AS avatarUrl, custom_url IS NOT NULL AS customPhoto FROM users LEFT JOIN profile_photos ON user_id=id WHERE id=?').get(id);
    return { ...user, backgroundUrl: db.prepare('SELECT url FROM profile_backgrounds WHERE user_id=?').get(id)?.url ?? null,
      ...nicknameAvailability(db, id),
      reviewed: Boolean(db.prepare('SELECT 1 FROM admin_reviews WHERE user_id=?').get(id)),
      googleLinked: Boolean(db.prepare('SELECT 1 FROM google_accounts WHERE user_id=?').get(id)),
      favorites: db.prepare('SELECT game_id FROM user_favorites WHERE user_id=?').all(id).map((r) => `igdb-${r.game_id}`),
      commentCount: db.prepare('SELECT COUNT(*) AS n FROM comments WHERE user_id=?').get(id).n,
      commentGameIds: db.prepare('SELECT game_id FROM comments WHERE user_id=?').all(id).map((r) => `igdb-${r.game_id}`),
      ratings: Object.fromEntries(db.prepare('SELECT game_id, rating FROM user_ratings WHERE user_id=?').all(id).map((r) => [`igdb-${r.game_id}`, r.rating])),
    };
  };
  const handleGoogle = googleAuthHandler(db);
  return async (req, res, url) => {
    const gameRoute = /^\/api\/games\/igdb-(\d+)\/(comments|rating|favorite)$/.exec(url.pathname);
    const commentRoute = /^\/api\/comments\/(\d+)$/.exec(url.pathname);
    const replyRoute = /^\/api\/comments\/(\d+)\/replies$/.exec(url.pathname);
    const photoRoute = /^\/api\/avatars\/(\d+)\/[a-f0-9]{64}\.png$/.exec(url.pathname);
    const backgroundRoute = /^\/api\/backgrounds\/(\d+)\/[a-f0-9]{64}\.png$/.exec(url.pathname);
    const adminRoute = url.pathname.startsWith('/api/admin/');
    const adminLogin = url.pathname === '/api/admin/login';
    const socialRoute = url.pathname === '/api/users' || url.pathname.startsWith('/api/users/') || /^\/api\/comments\/\d+\/like$/.test(url.pathname);
    if (!socialRoute && !adminRoute && !photoRoute && !backgroundRoute && !url.pathname.startsWith('/api/auth/') && !gameRoute && !commentRoute && !replyRoute) return false;
    const send = (status, data, headers = {}) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
      res.end(JSON.stringify(data));
    };
    try {
      if (backgroundRoute && req.method === 'GET') {
        const background = db.prepare('SELECT png FROM profile_backgrounds WHERE user_id=? AND url=?').get(backgroundRoute[1], url.pathname);
        if (!background) fail(404, 'Plano de fundo não encontrado.');
        res.writeHead(200, { 'Content-Type': 'image/png', 'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; sandbox", 'Cache-Control': 'public, max-age=3600' });
        res.end(background.png);
        return true;
      }
      if (photoRoute && req.method === 'GET') {
        const photo = db.prepare('SELECT custom_png FROM profile_photos WHERE user_id=? AND custom_url=?').get(photoRoute[1], url.pathname);
        if (!photo) fail(404, 'Foto não encontrada.');
        res.writeHead(200, { 'Content-Type': 'image/png', 'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; sandbox", 'Cache-Control': 'public, max-age=3600' });
        res.end(photo.custom_png);
        return true;
      }
      if (req.method === 'POST' && ['/api/auth/register', '/api/auth/login', '/api/auth/google/start','/api/admin/login'].includes(url.pathname)) {
        // Only enable behind a private API and a proxy that overwrites this header.
        const forwarded = req.headers['x-buscagames-client-ip'];
        const address = process.env.TRUST_PROXY === 'true' && typeof forwarded === 'string' && isIP(forwarded) ? forwarded : req.socket.remoteAddress;
        limit(`ip:${address}`, 30, res);
      }
      const token = /(?:^|;\s*)bg_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
      const session = token && db.prepare('SELECT user_id FROM sessions WHERE token=? AND expires>?').get(hash(token), Date.now());
      const userId = session?.user_id;
      const readBody = async (request, maxBytes) => {
        const data = await readJsonBody(request, maxBytes);
        // Receiving a body yields to logout, expiration and administrative revocation.
        // Recheck the exact session before any account mutation or OAuth linking.
        if (!adminRoute && userId && !db.prepare('SELECT 1 FROM sessions WHERE token=? AND user_id=? AND expires>?').get(hash(token), userId, Date.now())) {
          fail(401, 'Sua sessão expirou. Entre novamente para continuar.');
        }
        return data;
      };
      if (replyRoute) {
        const commentId = Number(replyRoute[1]);
        if (!db.prepare('SELECT 1 FROM comments WHERE id=?').get(commentId)) fail(404, 'Comentário não encontrado.');
        const ownCount = () => db.prepare('SELECT COUNT(*) AS n FROM comment_replies WHERE comment_id=? AND user_id=?').get(commentId, userId || 0).n;
        const select = `SELECT r.id, r.user_id AS userId, r.body, r.created_at AS createdAt, u.name AS author
          FROM comment_replies r JOIN users u ON u.id=r.user_id`;
        if (req.method === 'GET') {
          const after = Number(url.searchParams.get('after') || 0);
          if (!Number.isSafeInteger(after) || after < 0) fail(400, 'Página inválida.');
          const rows = db.prepare(`${select} WHERE r.comment_id=? AND r.id>? ORDER BY r.id LIMIT 21`).all(commentId, after);
          send(200, { replies: rows.slice(0, 20), nextCursor: rows.length > 20 ? rows[19].id : null, ownCount: ownCount() });
          return true;
        }
        if (req.method !== 'POST') fail(405, 'Método não permitido.');
        if (!userId) fail(401, 'Entre na sua conta para responder.');
        requireActive(userId);
        const { body } = await readBody(req);
        if (typeof body !== 'string' || !body.trim() || Array.from(body).length > 35 || body.includes('\0')) fail(400, 'Escreva uma resposta de 1 a 35 caracteres.');
        let inserted;
        try {
          inserted = db.prepare('INSERT INTO comment_replies(comment_id,user_id,body,created_at) VALUES (?,?,?,?)').run(commentId, userId, body.trim(), new Date().toISOString());
        } catch (error) {
          if (error.message.includes('reply_limit')) fail(409, 'Você já enviou duas respostas a este comentário.');
          throw error;
        }
        send(201, { reply: db.prepare(`${select} WHERE r.id=?`).get(inserted.lastInsertRowid), ownCount: ownCount() });
        return true;
      }
      if (socialRoute && await handleSocial(db, req, url, { userId, readBody, requireActive, fail, send })) return true;
      const cookie = (value, age) => `bg_session=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${process.env.SESSION_COOKIE_SECURE === 'true' || req.socket.encrypted || (process.env.NODE_ENV === 'production' && process.env.SESSION_COOKIE_SECURE !== 'false') ? '; Secure' : ''}`;
      const startSession = (id) => {
        requireActive(id);
        db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());
        if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(hash(token));
        const nextToken = randomBytes(32).toString('hex');
        db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hash(nextToken), id, Date.now() + 30 * 86400000);
        return cookie(nextToken, 30 * 86400);
      };
      const adminCookie = (value, age) => cookie(value, age).replace('bg_session=', 'bg_admin=').replace('Path=/;', 'Path=/api/admin;');
      const adminToken = adminRoute && /(?:^|;\s*)bg_admin=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
      const startAdminSession = (id) => {
        if (!id || !db.prepare('SELECT 1 FROM administrators WHERE user_id=?').get(id)) fail(403, 'Conta sem acesso administrativo.');
        requireActive(id);
        const next = randomBytes(32).toString('hex');
        db.prepare('DELETE FROM admin_sessions WHERE expires<=? OR token=?').run(Date.now(), hash(adminToken || ''));
        db.prepare('INSERT INTO admin_sessions VALUES (?,?,?)').run(hash(next), id, Date.now() + 8 * 3600000);
        return adminCookie(next, 8 * 3600);
      };
      if (adminRoute && !adminLogin) {
        const admin = adminToken && db.prepare(`SELECT u.id,u.name,u.avatarUrl, EXISTS(SELECT 1 FROM admin_reviews WHERE user_id=u.id) AS reviewed FROM admin_sessions s
          JOIN administrators a ON a.user_id=s.user_id JOIN admin_user_profiles u ON u.id=a.user_id
          WHERE s.token=? AND s.expires>?`).get(hash(adminToken), Date.now());
        if (!admin) fail(401, 'Entre com uma conta administrativa.');
        const section = url.pathname.slice('/api/admin/'.length);
        if (req.method === 'GET') {
          const page = Number(url.searchParams.get('page') || 1);
          if (!Number.isSafeInteger(page) || page < 1) fail(400, 'Página inválida.');
          const result = adminSection(db, section, page);
          if (!result) fail(404, 'Seção não encontrada.');
          send(200, { admin, ...result }); return true;
        }
        if (req.method !== 'POST') fail(405, 'Método não permitido.');
        const body = await readBody(req);
        if (!db.prepare('SELECT 1 FROM admin_sessions WHERE token=? AND expires>?').get(hash(adminToken), Date.now())) fail(401, 'Entre com uma conta administrativa.');
        const recordChange = (target, event, sql, ...args) => auditedChange(db, {
          target, event, sql, args, actor: `${admin.name} (#${admin.id})`,
        });
        if (section === 'logout') {
          recordChange(admin.id, 'Saída do painel', 'DELETE FROM admin_sessions WHERE token=?', hash(adminToken));
          send(200, {}, { 'Set-Cookie': adminCookie('', 0) }); return true;
        }
        if (section === 'chat') {
          validateComment(body.message);
          db.prepare('INSERT INTO admin_messages(user_id,body) VALUES (?,?)').run(admin.id, body.message.trim());
        } else if (section === 'usuarios') {
          if (!Number.isSafeInteger(body.id) || !db.prepare('SELECT 1 FROM users WHERE id=?').get(body.id)) fail(400, 'Conta inválida.');
          if (body.id === admin.id) fail(400, 'Você não pode bloquear a própria conta.');
          if (body.action === 'block') recordChange(body.id, 'Conta bloqueada', 'INSERT OR IGNORE INTO blocked_users VALUES (?)', body.id);
          else if (body.action === 'unblock') recordChange(body.id, 'Conta desbloqueada', 'DELETE FROM blocked_users WHERE user_id=?', body.id);
          else fail(400, 'Ação inválida.');
        } else if (section === 'administradores') {
          const target = db.prepare('SELECT id FROM users WHERE email=?').get(normalizeEmail(body.email));
          if (!target) fail(400, 'Conta não encontrada. Confira o e-mail cadastrado.');
          if (body.action === 'grant') {
            recordChange(target.id, 'Acesso administrativo concedido', 'INSERT OR IGNORE INTO administrators VALUES (?)', target.id);
          } else if (body.action === 'revoke') {
            if (target.id === admin.id) fail(400, 'Sua própria permissão deve ser revisada por outro administrador.');
            recordChange(target.id, 'Acesso administrativo revogado', 'DELETE FROM administrators WHERE user_id=?', target.id);
          } else fail(400, 'Ação inválida.');
        } else if (section === 'verificacoes') {
          if (!Number.isSafeInteger(body.id) || !db.prepare('SELECT 1 FROM users WHERE id=?').get(body.id)) fail(400, 'Conta inválida.');
          db.prepare('INSERT OR IGNORE INTO admin_reviews VALUES (?,?)').run(body.id, admin.id);
        } else fail(404, 'Ação não encontrada.');
        send(200, {}); return true;
      }
      if (await handleGoogle(req, res, url, { userId, token, readBody, startSession, startAdminSession })) return true;
      if (url.pathname === '/api/auth/me' && req.method === 'GET') {
        send(200, { user: userId ? profile(userId) : null, googleEnabled: googleConfigured() }); return true;
      }
      if (gameRoute && req.method === 'GET' && gameRoute[2] === 'comments') {
        const gameId = Number(gameRoute[1]);
        if (!db.prepare('SELECT 1 FROM games WHERE id=?').get(gameId)) fail(404, 'Jogo não encontrado.');
        const before = Number(url.searchParams.get('before') || Number.MAX_SAFE_INTEGER);
        if (!Number.isSafeInteger(before) || before < 1) fail(400, 'Página inválida.');
        const select = `SELECT c.id, c.user_id AS userId, c.body, c.created_at AS createdAt, c.version,
          u.name AS author, EXISTS(SELECT 1 FROM admin_reviews WHERE user_id=u.id) AS reviewed, COALESCE(p.custom_url, p.google_url) AS avatarUrl, r.rating,
          (SELECT COUNT(*) FROM comment_likes WHERE comment_id=c.id) AS likeCount,
          EXISTS(SELECT 1 FROM comment_likes WHERE comment_id=c.id AND user_id=?) AS liked
          FROM comments c JOIN users u ON u.id=c.user_id
          LEFT JOIN profile_photos p ON p.user_id=u.id
          LEFT JOIN user_ratings r ON r.user_id=c.user_id AND r.game_id=c.game_id`;
        const rows = db.prepare(`${select} WHERE c.game_id=? AND c.id<? ORDER BY c.id DESC LIMIT 11`).all(userId || 0, gameId, before);
        send(200, { comments: rows.slice(0, 10), nextCursor: rows.length > 10 ? rows[9].id : null,
          own: userId ? db.prepare(`${select} WHERE c.game_id=? AND c.user_id=?`).get(userId, gameId, userId) || null : null });
        return true;
      }
      if (!['POST', 'PATCH', 'DELETE', 'PUT'].includes(req.method)) fail(405, 'Método não permitido.');
      if (url.pathname === '/api/auth/nickname') {
        if (!userId) fail(401, 'Entre na sua conta para alterar o nickname.');
        if (req.method !== 'PUT') fail(405, 'Método não permitido.');
        const { name } = await readBody(req);
        requireActive(userId);
        changeNickname(db, userId, name);
        send(200, { user: profile(userId) }); return true;
      }
      if (url.pathname === '/api/auth/background') {
        if (!userId) fail(401, 'Entre na sua conta para alterar o plano de fundo.');
        if (req.method !== 'PUT') fail(405, 'Método não permitido.');
        requireActive(userId);
        const { photo } = await readBody(req, 2 * 1024 * 1024);
        if (photo === null) {
          db.prepare('DELETE FROM profile_backgrounds WHERE user_id=?').run(userId);
        } else {
          const png = validateBackground(photo);
          if (!png) fail(400, 'Imagem inválida. Escolha outro plano de fundo.');
          const path = `/api/backgrounds/${userId}/${hash(png)}.png`;
          db.prepare(`INSERT INTO profile_backgrounds(user_id,png,url) VALUES (?,?,?)
            ON CONFLICT(user_id) DO UPDATE SET png=excluded.png, url=excluded.url`).run(userId, png, path);
        }
        send(200, { user: profile(userId) }); return true;
      }
      if (url.pathname === '/api/auth/avatar') {
        if (!userId) fail(401, 'Entre na sua conta para alterar a foto.');
        if (req.method !== 'PUT') fail(405, 'Método não permitido.');
        const { photo } = await readBody(req, 128 * 1024);
        requireActive(userId);
        if (photo === null) {
          db.prepare('UPDATE profile_photos SET custom_png=NULL, custom_url=NULL WHERE user_id=?').run(userId);
        } else {
          const png = typeof photo === 'string' ? Buffer.from(photo, 'base64') : Buffer.alloc(0);
          if (png.length < 45 || png.subarray(0, 16).toString('hex') !== '89504e470d0a1a0a0000000d49484452'
            || png.readUInt32BE(16) !== 128 || png.readUInt32BE(20) !== 128
            || png.subarray(-12).toString('hex') !== '0000000049454e44ae426082') fail(400, 'Imagem inválida. Escolha outra foto.');
          const path = `/api/avatars/${userId}/${hash(png)}.png`;
          db.prepare(`INSERT INTO profile_photos(user_id,custom_png,custom_url) VALUES (?,?,?)
            ON CONFLICT(user_id) DO UPDATE SET custom_png=excluded.custom_png, custom_url=excluded.custom_url`).run(userId, png, path);
        }
        send(200, { user: profile(userId) }); return true;
      }
      const data = await readBody(req);
      if (['/api/auth/register', '/api/auth/login', '/api/admin/login'].includes(url.pathname) && req.method === 'POST') {
        const registering = url.pathname.endsWith('/register');
        const invalid = validateAccount(data, registering);
        if (invalid) fail(400, invalid.message, invalid.field);
        const email = normalizeEmail(data.email);
        const name = typeof data.name === 'string' ? data.name.trim() : '';
        limit(`${registering ? 'register' : 'login'}:${email}`, registering ? 5 : 10, res);
        if (hashing >= 4) { res.setHeader('Retry-After', '5'); fail(429, 'Muitas tentativas. Aguarde alguns segundos.'); }
        const existing = db.prepare('SELECT * FROM users WHERE email=?').get(email);
        const salt = registering ? randomBytes(16).toString('hex') : existing?.salt || 'unregistered-user';
        const legacy = !registering && /^[a-f0-9]{128}$/.test(existing?.password_hash || '');
        let password;
        hashing++;
        let id;
        try {
          password = await deriveKey(data.password, salt, 64, legacy ? { ...passwordOptions, p: 1 } : passwordOptions);
          if (registering) {
            if (existing) fail(409, 'Não foi possível criar a conta com os dados informados. Tente entrar ou use outro e-mail.', 'email');
            try { id = Number(db.prepare('INSERT INTO users(name,email,password_hash,salt) VALUES (?,?,?,?)').run(name, email, passwordPrefix + password.toString('hex'), salt).lastInsertRowid); }
            catch (error) {
              if (error.message.includes('Nickname já está em uso')) fail(409, 'Este nickname já está em uso. Escolha outro.', 'name');
              if (error.message.includes('UNIQUE constraint failed: users.email')) fail(409, 'Não foi possível criar a conta com os dados informados. Tente entrar ou use outro e-mail.', 'email');
              throw error;
            }
          } else {
            const stored = existing?.password_hash.replace(/^scrypt-v2\$/, '') || '';
            if (!/^[a-f0-9]{128}$/.test(stored) || !timingSafeEqual(password, Buffer.from(stored, 'hex'))) fail(401, 'E-mail ou senha incorretos.');
            id = existing.id;
            if (adminLogin && !db.prepare('SELECT 1 FROM administrators WHERE user_id=?').get(id)) fail(401, 'E-mail ou senha incorretos.');
            if (legacy) {
              const nextSalt = randomBytes(16).toString('hex');
              const upgraded = await deriveKey(data.password, nextSalt, 64, passwordOptions);
              db.prepare('UPDATE users SET password_hash=?, salt=? WHERE id=?').run(passwordPrefix + upgraded.toString('hex'), nextSalt, id);
            }
            db.prepare('DELETE FROM auth_attempts WHERE key=?').run(hash(`login:${email}`));
          }
        } finally { hashing--; }
        if (adminLogin) {
          send(200, { admin: { id, name: existing.name } }, { 'Set-Cookie': startAdminSession(id) }); return true;
        }
        send(registering ? 201 : 200, { user: profile(id) }, { 'Set-Cookie': startSession(id) }); return true;
      }
      if (!userId) fail(401, 'Entre na sua conta para continuar.');
      requireActive(userId);
      if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
        db.prepare('DELETE FROM sessions WHERE token=?').run(hash(token));
        send(200, { user: null }, { 'Set-Cookie': cookie('', 0) }); return true;
      }
      if (gameRoute) {
        const gameId = Number(gameRoute[1]);
        if (!db.prepare('SELECT 1 FROM games WHERE id=?').get(gameId)) fail(404, 'Jogo não encontrado.');
        if (gameRoute[2] === 'favorite' && req.method === 'PUT') {
          if (typeof data.favorite !== 'boolean') fail(400, 'Favorito inválido.');
          if (data.favorite) db.prepare('INSERT OR IGNORE INTO user_favorites VALUES (?,?)').run(userId, gameId);
          else db.prepare('DELETE FROM user_favorites WHERE user_id=? AND game_id=?').run(userId, gameId);
          send(200, { user: profile(userId) }); return true;
        }
        if (gameRoute[2] === 'rating' && req.method === 'PUT') {
          if (!Number.isInteger(data.rating) || data.rating < 0 || data.rating > 5) fail(400, 'Nota inválida.');
          if (!data.rating) db.prepare('DELETE FROM user_ratings WHERE user_id=? AND game_id=?').run(userId, gameId);
          else db.prepare('INSERT INTO user_ratings VALUES (?,?,?) ON CONFLICT(user_id,game_id) DO UPDATE SET rating=excluded.rating').run(userId, gameId, data.rating);
          send(200, { user: profile(userId) }); return true;
        }
        if (gameRoute[2] !== 'comments' || req.method !== 'POST') fail(405, 'Método não permitido.');
        validateComment(data.body);
        if (db.prepare('SELECT 1 FROM comments WHERE user_id=? AND game_id=?').get(userId, gameId)) fail(409, 'Você já comentou neste jogo. Edite seu comentário.');
        db.prepare('INSERT INTO comments(user_id,game_id,body,created_at) VALUES (?,?,?,?)').run(userId, gameId, data.body.trim(), new Date().toISOString());
        send(201, { user: profile(userId) }); return true;
      }
      if (commentRoute && ['PATCH', 'DELETE'].includes(req.method)) {
        const row = db.prepare('SELECT * FROM comments WHERE id=?').get(Number(commentRoute[1]));
        if (!row) fail(404, 'Comentário não encontrado.');
        if (row.user_id !== userId) fail(403, 'Você só pode alterar seus próprios comentários.');
        if (data.version !== row.version) fail(409, 'Este comentário mudou. Recarregue os comentários antes de continuar.');
        if (req.method === 'DELETE') db.prepare('DELETE FROM comments WHERE id=?').run(row.id);
        else {
          validateComment(data.body);
          db.prepare('UPDATE comments SET body=?, version=version+1 WHERE id=?').run(data.body.trim(), row.id);
        }
        send(200, { user: profile(userId) }); return true;
      }
      fail(404, 'Não encontrado.');
    } catch (error) {
      if (!error.status) console.error('Falha na comunidade:', error.message);
      send(error.status || 500, { error: error.status ? error.message : 'Serviço temporariamente indisponível. Tente novamente.', ...(error.field ? { field: error.field } : {}) });
    }
    return true;
  };
}

function validateComment(body) {
  if (typeof body !== 'string' || !body.trim() || body.length > 500 || body.includes('\0')) fail(400, 'Escreva um comentário de 1 a 500 caracteres.');
}
