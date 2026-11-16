export function initializeNotifications(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    email_enabled INTEGER NOT NULL DEFAULT 1 CHECK(email_enabled IN (0,1))
  );
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK(kind IN ('follow','like','reply')),
    comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    read_at TEXT,
    email_key TEXT NOT NULL DEFAULT (lower(hex(randomblob(16)))),
    email_payload TEXT, email_attempts INTEGER NOT NULL DEFAULT 0,
    email_sent INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS notifications_recipient ON notifications(recipient_id, id DESC);
  CREATE INDEX IF NOT EXISTS notifications_unread ON notifications(recipient_id) WHERE read_at IS NULL;
  CREATE INDEX IF NOT EXISTS notifications_email ON notifications(id) WHERE email_sent=0;
  CREATE TRIGGER IF NOT EXISTS notification_email_optout AFTER INSERT ON notifications
  WHEN EXISTS(SELECT 1 FROM notification_preferences WHERE user_id=NEW.recipient_id AND email_enabled=0)
  BEGIN UPDATE notifications SET email_sent=1 WHERE id=NEW.id; END;
  CREATE TRIGGER IF NOT EXISTS notify_follow AFTER INSERT ON user_follows
  BEGIN INSERT INTO notifications(recipient_id,actor_id,kind)
    VALUES (NEW.followed_id,NEW.follower_id,'follow'); END;
  CREATE TRIGGER IF NOT EXISTS notify_like AFTER INSERT ON comment_likes
  BEGIN INSERT INTO notifications(recipient_id,actor_id,kind,comment_id)
    SELECT user_id,NEW.user_id,'like',id FROM comments WHERE id=NEW.comment_id AND user_id<>NEW.user_id; END;
  CREATE TRIGGER IF NOT EXISTS notify_reply AFTER INSERT ON comment_replies
  BEGIN INSERT INTO notifications(recipient_id,actor_id,kind,comment_id)
    SELECT user_id,NEW.user_id,'reply',id FROM comments WHERE id=NEW.comment_id AND user_id<>NEW.user_id; END;`);
}

export const notificationMessage = (kind) => ({ follow: 'começou a seguir você.', like: 'curtiu seu comentário.', reply: 'respondeu ao seu comentário.' })[kind];
export const notificationPath = (row) => row.kind === 'follow' ? `/perfil/${row.actorId}` : `/jogo/igdb-${row.gameId}#comentarios`;
export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.NOTIFICATIONS_EMAIL_FROM && /^https:\/\//.test(process.env.PUBLIC_SITE_URL || ''));

export async function handleNotifications(db, req, url, { userId, readBody, requireActive, fail, send }) {
  if (!userId) fail(401, 'Entre na sua conta para ver as notificações.');
  requireActive(userId);
  const unreadCount = () => db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE recipient_id=? AND read_at IS NULL').get(userId).n;
  if (req.method === 'GET' && url.pathname === '/api/notifications/count') {
    send(200, { unreadCount: unreadCount() }); return;
  }
  if (req.method === 'GET' && url.pathname === '/api/notifications') {
    const before = Number(url.searchParams.get('before') || Number.MAX_SAFE_INTEGER);
    if (!Number.isSafeInteger(before) || before < 1) fail(400, 'Página inválida.');
    const rows = db.prepare(`SELECT n.id,n.kind,n.actor_id AS actorId,u.name AS actor,
      n.created_at AS createdAt,n.read_at AS readAt,c.game_id AS gameId
      FROM notifications n JOIN users u ON u.id=n.actor_id LEFT JOIN comments c ON c.id=n.comment_id
      WHERE n.recipient_id=? AND n.id<? ORDER BY n.id DESC LIMIT 21`).all(userId, before);
    send(200, { notifications: rows.slice(0, 20).map(row => ({ ...row, message: notificationMessage(row.kind), path: notificationPath(row) })),
      nextCursor: rows.length > 20 ? rows[19].id : null, unreadCount: unreadCount(),
      latestId: db.prepare('SELECT MAX(id) AS id FROM notifications WHERE recipient_id=?').get(userId).id,
      emailEnabled: db.prepare('SELECT email_enabled FROM notification_preferences WHERE user_id=?').get(userId)?.email_enabled !== 0,
      emailAvailable: emailConfigured() }); return;
  }
  if (req.method === 'PUT' && url.pathname === '/api/notifications/read') {
    const { throughId, id } = await readBody(req);
    requireActive(userId);
    const value = id ?? throughId;
    if (!Number.isSafeInteger(value) || value < 1) fail(400, 'Notificação inválida.');
    db.prepare(`UPDATE notifications SET read_at=? WHERE recipient_id=? AND id${id === undefined ? '<=' : '='}? AND read_at IS NULL`)
      .run(new Date().toISOString(), userId, value);
    send(200, { unreadCount: unreadCount() }); return;
  }
  if (req.method === 'PUT' && url.pathname === '/api/notifications/preferences') {
    const { emailEnabled } = await readBody(req);
    requireActive(userId);
    if (typeof emailEnabled !== 'boolean') fail(400, 'Preferência inválida.');
    db.prepare('INSERT INTO notification_preferences VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET email_enabled=excluded.email_enabled').run(userId, Number(emailEnabled));
    if (!emailEnabled) db.prepare('UPDATE notifications SET email_sent=1,email_payload=NULL WHERE recipient_id=? AND email_sent=0').run(userId);
    send(200, { emailEnabled }); return;
  }
  fail(405, 'Método não permitido.');
}

// A bounded, persistent queue: failures never undo the social action or its notification.
export async function deliverNotificationEmails(db, { fetcher = fetch, env = process.env } = {}) {
  if (!env.RESEND_API_KEY || !env.NOTIFICATIONS_EMAIL_FROM || !/^https:\/\//.test(env.PUBLIC_SITE_URL || '')) return;
  const site = new URL(env.PUBLIC_SITE_URL).origin;
  db.prepare(`UPDATE notifications SET email_sent=1,email_payload=NULL WHERE email_sent=0 AND
    (created_at<strftime('%Y-%m-%dT%H:%M:%fZ','now','-23 hours') OR recipient_id IN
    (SELECT user_id FROM notification_preferences WHERE email_enabled=0))`).run();
  const rows = db.prepare(`SELECT n.*,n.actor_id AS actorId,c.game_id AS gameId,u.email,a.name AS actor
    FROM notifications n JOIN users u ON u.id=n.recipient_id JOIN users a ON a.id=n.actor_id
    LEFT JOIN comments c ON c.id=n.comment_id
    WHERE n.email_sent=0 AND n.email_attempts<5
    AND NOT EXISTS(SELECT 1 FROM blocked_users WHERE user_id IN (n.recipient_id,n.actor_id))
    ORDER BY n.id LIMIT 10`).all();
  for (const row of rows) {
    // A preference change or deletion can happen while the preceding email is in flight.
    if (!db.prepare(`SELECT 1 FROM notifications n WHERE n.id=? AND n.email_sent=0
      AND NOT EXISTS(SELECT 1 FROM notification_preferences WHERE user_id=n.recipient_id AND email_enabled=0)
      AND NOT EXISTS(SELECT 1 FROM blocked_users WHERE user_id IN (n.recipient_id,n.actor_id))`).get(row.id)) continue;
    // Save the exact payload so retries use the same idempotency key AND body.
    const payload = row.email_payload || JSON.stringify({ from: env.NOTIFICATIONS_EMAIL_FROM, to: [row.email],
      subject: 'Nova notificação no BuscaGames',
      text: `${row.actor} ${notificationMessage(row.kind)}\n\n${site}${notificationPath(row)}\n\nGerencie os alertas por email em ${site}/notificacoes` });
    db.prepare('UPDATE notifications SET email_payload=?,email_attempts=email_attempts+1 WHERE id=?').run(payload, row.id);
    try {
      const response = await fetcher('https://api.resend.com/emails', { method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `notification-${row.email_key}` },
        body: payload, signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Email não enviado');
      db.prepare('UPDATE notifications SET email_sent=1,email_payload=NULL WHERE id=?').run(row.id);
    } catch { console.warn(`Falha ao enviar notificação ${row.id} por email; tentativa ${row.email_attempts + 1}/5.`); }
  }
}

export function startNotificationEmails(db) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await deliverNotificationEmails(db); }
    catch { console.warn('Fila de emails de notificações indisponível.'); }
    finally { running = false; }
  };
  const timer = setInterval(tick, 60000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
