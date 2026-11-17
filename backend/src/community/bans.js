import { createHash } from 'node:crypto';
import { normalizeEmail } from '../../../shared/accountPolicy.mjs';
import { accountTransaction } from './accountEmail.js';

const digest = (kind, value) => createHash('sha256').update(kind + ':' + value).digest('hex');
const emailDigest = (email) => digest('email', normalizeEmail(email));
const googleDigest = (subject) => subject ? digest('google', subject) : null;

export function initializeBans(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS banned_users (
    user_id INTEGER PRIMARY KEY, email_digest TEXT NOT NULL UNIQUE, google_digest TEXT UNIQUE
  )`);
}

export function isBanned(db, email, subject) {
  return Boolean(db.prepare('SELECT 1 FROM banned_users WHERE email_digest=? OR google_digest=?')
    .get(emailDigest(email), googleDigest(subject)));
}

export function insertUser(db, name, email, passwordHash, salt) {
  // Never reuse a banned profile's public ID, even if it was the newest account.
  return Number(db.prepare(`INSERT INTO users(id,name,email,password_hash,salt)
    VALUES (MAX(COALESCE((SELECT MAX(id) FROM users),0),
                COALESCE((SELECT MAX(user_id) FROM banned_users),0))+1,?,?,?,?)`)
    .run(name, email, passwordHash, salt).lastInsertRowid);
}

export function banUser(db, id, adminId, session, fail) {
  accountTransaction(db, () => {
    if (!db.prepare('SELECT 1 FROM admin_sessions WHERE token=? AND user_id=? AND expires>?').get(session, adminId, Date.now())) {
      fail(401, 'Entre com uma conta administrativa.');
    }
    const target = db.prepare(`SELECT u.email,g.subject FROM users u
      LEFT JOIN google_accounts g ON g.user_id=u.id WHERE u.id=?`).get(id);
    if (!target) fail(404, 'Esta conta não está mais disponível. Atualize a lista.');
    db.prepare('INSERT INTO banned_users VALUES (?,?,?)').run(id, emailDigest(target.email), googleDigest(target.subject));

    // Older tables lack cascades; dependent replies, likes and notifications already cascade.
    db.prepare('DELETE FROM google_flows WHERE session_token IN (SELECT token FROM sessions WHERE user_id=?)').run(id);
    db.prepare('DELETE FROM admin_reviews WHERE user_id=? OR reviewer=?').run(id, id);
    const actorSuffix = ` (#${id})`;
    db.prepare('UPDATE account_events SET actor=NULL WHERE substr(actor, -length(?))=?').run(actorSuffix, actorSuffix);
    for (const table of ['user_favorites', 'user_ratings', 'comments', 'admin_messages', 'account_events']) {
      db.prepare(`DELETE FROM ${table} WHERE user_id=?`).run(id);
    }
    db.prepare('DELETE FROM users WHERE id=?').run(id);
    db.prepare('INSERT INTO account_events(user_id,event,actor) VALUES (?,?,?)')
      .run(adminId, 'Banimento aplicado', 'Própria conta');
  });
}
