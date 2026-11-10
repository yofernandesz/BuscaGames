// Keep normalization identical for registration, editing and Google sign-in.
const nicknameKey = (name) => name.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();

export function availableNickname(db, name) {
  const base = (typeof name === 'string' ? name : '').normalize('NFKC')
    .replace(/[\p{Cc}\p{Cf}]/gu, '').trim().replace(/\s+/gu, ' ').slice(0, 60) || 'Jogador';
  let candidate = base;
  const exists = db.prepare('SELECT 1 FROM users WHERE nickname_key(name)=nickname_key(?)');
  for (let number = 2; exists.get(candidate); number++) {
    const suffix = `-${number}`;
    candidate = base.slice(0, 60 - suffix.length).trimEnd() + suffix;
  }
  return candidate;
}

export function initializeNicknames(db) {
  db.function('nickname_key', { deterministic: true }, nicknameKey);
  db.exec('BEGIN IMMEDIATE');
  try {
    if (!db.prepare("SELECT 1 FROM sqlite_schema WHERE name IN ('users_nickname_unique', 'users_nickname_insert')").get()) {
      const seen = new Set();
      // Keep the oldest account's nickname and preserve all IDs and relationships.
      for (const user of db.prepare('SELECT id,name FROM users ORDER BY id').all()) {
        const key = nicknameKey(user.name);
        if (seen.has(key)) {
          const name = availableNickname(db, user.name);
          db.prepare('UPDATE users SET name=? WHERE id=?').run(name, user.id);
          seen.add(nicknameKey(name));
        } else seen.add(key);
      }
    }
    db.exec(`DROP INDEX IF EXISTS users_nickname_unique;
      CREATE INDEX IF NOT EXISTS users_nickname_lookup ON users(nickname_key(name));
      CREATE TABLE IF NOT EXISTS nickname_changes (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        changed_at INTEGER NOT NULL
      );
      CREATE TRIGGER IF NOT EXISTS users_nickname_insert BEFORE INSERT ON users
      WHEN EXISTS(SELECT 1 FROM users WHERE nickname_key(name)=nickname_key(NEW.name))
      BEGIN SELECT RAISE(ABORT, 'Nickname já está em uso'); END;
      CREATE TRIGGER IF NOT EXISTS users_nickname_update BEFORE UPDATE OF name ON users
      WHEN NOT EXISTS(SELECT 1 FROM administrators WHERE user_id=NEW.id)
        AND EXISTS(SELECT 1 FROM users WHERE id<>NEW.id AND nickname_key(name)=nickname_key(NEW.name))
      BEGIN SELECT RAISE(ABORT, 'Nickname já está em uso'); END;`);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

const cooldown = 30 * 86400000;

export function nicknameAvailability(db, id) {
  const isAdmin = Boolean(db.prepare('SELECT 1 FROM administrators WHERE user_id=?').get(id));
  const changed = db.prepare('SELECT changed_at FROM nickname_changes WHERE user_id=?').get(id);
  return { isAdmin, nicknameAvailableAt: !isAdmin && changed ? changed.changed_at + cooldown : null };
}

export function changeNickname(db, id, value, now = Date.now()) {
  const fail = (status, message) => { throw Object.assign(new Error(message), { status, field: 'name' }); };
  const name = typeof value === 'string' ? value.normalize('NFKC').trim().replace(/\s+/gu, ' ') : '';
  if (name.length < 2 || name.length > 60 || /[\p{Cc}\p{Cf}]/u.test(value)) {
    fail(400, 'Use um nickname de 2 a 60 caracteres, sem caracteres de controle.');
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    const current = db.prepare('SELECT name FROM users WHERE id=?').get(id);
    if (current.name !== name) {
      const { isAdmin, nicknameAvailableAt } = nicknameAvailability(db, id);
      if (!isAdmin && nicknameAvailableAt > now) fail(409, 'Você pode alterar seu nickname a cada 30 dias. Aguarde o prazo indicado no perfil.');
      if (!isAdmin && db.prepare('SELECT 1 FROM users WHERE id<>? AND nickname_key(name)=nickname_key(?)').get(id, name)) {
        fail(409, 'Este nickname já está em uso. Escolha outro.');
      }
      db.prepare('UPDATE users SET name=? WHERE id=?').run(name, id);
      db.prepare('INSERT INTO nickname_changes VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET changed_at=excluded.changed_at').run(id, now);
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
