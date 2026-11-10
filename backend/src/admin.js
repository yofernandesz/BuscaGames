export function initializeAdmin(db) {
  db.exec(`
    CREATE VIEW IF NOT EXISTS admin_user_profiles AS
      SELECT u.id,u.name,u.email,COALESCE(p.custom_url,p.google_url) AS avatarUrl
      FROM users u LEFT JOIN profile_photos p ON p.user_id=u.id;
    CREATE TABLE IF NOT EXISTS administrators (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS admin_sessions (
      token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES administrators(user_id) ON DELETE CASCADE, expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admin_reviews (
      user_id INTEGER PRIMARY KEY REFERENCES users(id), reviewer INTEGER NOT NULL REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS admin_messages (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), body TEXT NOT NULL, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS account_events (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), event TEXT NOT NULL, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS blocked_users (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS account_events_by_date ON account_events(created);
    CREATE TRIGGER IF NOT EXISTS account_registered AFTER INSERT ON users BEGIN
      INSERT INTO account_events(user_id,event) VALUES(new.id,'Cadastro criado');
    END;
  `);
  db.exec('BEGIN IMMEDIATE');
  try {
    if (!db.prepare('PRAGMA table_info(account_events)').all().some(column => column.name === 'actor')) {
      db.exec(`ALTER TABLE account_events ADD COLUMN actor TEXT;
        DROP TRIGGER IF EXISTS account_blocked;
        DROP TRIGGER IF EXISTS account_unblocked;
        DROP TRIGGER IF EXISTS account_reviewed;`);
    }
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS account_blocked AFTER INSERT ON blocked_users BEGIN
        DELETE FROM sessions WHERE user_id=new.user_id;
        DELETE FROM admin_sessions WHERE user_id=new.user_id;
      END;
      CREATE TRIGGER IF NOT EXISTS account_reviewed AFTER INSERT ON admin_reviews BEGIN
        INSERT INTO account_events(user_id,event,actor)
        SELECT new.user_id,'Cadastro revisado',name || ' (#' || id || ')' FROM users WHERE id=new.reviewer;
      END;
      CREATE TRIGGER IF NOT EXISTS admin_signed_in AFTER INSERT ON admin_sessions BEGIN
        INSERT INTO account_events(user_id,event,actor) VALUES(new.user_id,'Entrada no painel','Própria conta');
      END;
      CREATE TRIGGER IF NOT EXISTS google_linked_event AFTER INSERT ON google_accounts BEGIN
        INSERT INTO account_events(user_id,event,actor) VALUES(new.user_id,'Conta Google vinculada','Própria conta');
      END;
      CREATE TRIGGER IF NOT EXISTS admin_chat_event AFTER INSERT ON admin_messages BEGIN
        INSERT INTO account_events(user_id,event,actor) VALUES(new.user_id,'Mensagem enviada ao chat da equipe','Própria conta');
      END;
    `);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

// Commit the audit entry with the change, including when the CLI is the caller.
export function auditedChange(db, { sql, args, target, actor, event }) {
  db.exec('BEGIN IMMEDIATE');
  try {
    if (db.prepare(sql).run(...args).changes) {
      db.prepare('INSERT INTO account_events(user_id,event,actor) VALUES (?,?,?)').run(target, event, actor);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

const count = (db, table) => db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get().total;
const queries = {
  usuarios: `SELECT u.id,u.avatarUrl,u.name AS Nome,u.email AS "E-mail",r.user_id IS NOT NULL AS reviewed,
    CASE WHEN b.user_id IS NULL THEN 'Ativo' ELSE 'Bloqueado' END AS Status
    FROM admin_user_profiles u LEFT JOIN admin_reviews r ON r.user_id=u.id LEFT JOIN blocked_users b ON b.user_id=u.id ORDER BY u.id DESC`,
  verificacoes: `SELECT u.id,u.avatarUrl, u.name AS Nome, u.email AS "E-mail" FROM admin_user_profiles u
    LEFT JOIN admin_reviews r ON r.user_id=u.id WHERE r.user_id IS NULL ORDER BY u.id`,
  administradores: 'SELECT u.id,u.avatarUrl, u.name AS Nome, EXISTS(SELECT 1 FROM admin_reviews WHERE user_id=u.id) AS reviewed, u.email AS "E-mail" FROM administrators a JOIN admin_user_profiles u ON u.id=a.user_id ORDER BY u.name,u.id',
  registros: `SELECT e.id,u.avatarUrl,e.created AS Data,e.event AS Ação,u.name || ' (#' || u.id || ')' AS Conta,
    EXISTS(SELECT 1 FROM admin_reviews WHERE user_id=u.id) AS reviewed,
    COALESCE(e.actor,CASE WHEN e.event='Cadastro criado' THEN 'Própria conta' ELSE 'Não registrado' END) AS Responsável
    FROM account_events e JOIN admin_user_profiles u ON u.id=e.user_id ORDER BY e.id DESC`,
  atividades: `SELECT c.id,u.avatarUrl,u.name AS Autor,EXISTS(SELECT 1 FROM admin_reviews WHERE user_id=u.id) AS reviewed,g.title AS Jogo,c.body AS Comentário FROM comments c
    JOIN admin_user_profiles u ON u.id=c.user_id JOIN games g ON g.id=c.game_id ORDER BY c.id DESC`,
  vinculos: 'SELECT u.id,u.avatarUrl,u.name AS Conta,EXISTS(SELECT 1 FROM admin_reviews WHERE user_id=u.id) AS reviewed,u.email AS "E-mail",\'Google\' AS Provedor FROM google_accounts a JOIN admin_user_profiles u ON u.id=a.user_id ORDER BY u.id DESC',
  chat: 'SELECT m.id,u.avatarUrl,u.name AS Autor,EXISTS(SELECT 1 FROM admin_reviews WHERE user_id=u.id) AS reviewed,m.body AS Mensagem,m.created AS Data FROM admin_messages m JOIN admin_user_profiles u ON u.id=m.user_id ORDER BY m.id DESC',
};

export function adminSection(db, section, page) {
  if (section === 'dashboard' || section === 'relatorios') {
    const metrics = { 'Usuários': 'users', 'Jogos no catálogo': 'games', 'Comentários': 'comments', 'Avaliações': 'user_ratings', 'Favoritos': 'user_favorites', 'Administradores': 'administrators' };
    const totals = Object.entries(metrics).map(([label, table]) => ({ label, value: count(db, table) }));
    if (section === 'relatorios') return { metrics: totals };
    // Event timestamps are stored in UTC. Group by the São Paulo calendar day.
    const history = db.prepare(`WITH RECURSIVE days(day) AS (
      SELECT date('now','-3 hours','-29 days')
      UNION ALL SELECT date(day,'+1 day') FROM days WHERE day < date('now','-3 hours')
    )
    SELECT day, COUNT(CASE WHEN event='Cadastro criado' THEN 1 END) AS registrations,
      COUNT(CASE WHEN event='Cadastro revisado' THEN 1 END) AS reviews
    FROM days LEFT JOIN account_events ON created >= datetime(day,'+3 hours')
      AND created < datetime(day,'+1 day','+3 hours')
    GROUP BY day ORDER BY day`).all();
    const ratings = db.prepare('SELECT rating,COUNT(*) AS votes FROM user_ratings GROUP BY rating').all();
    return { metrics: totals, charts: { history, ratings, users: totals.find(item => item.label === 'Usuários').value,
      reviewed: count(db, 'admin_reviews'), blocked: count(db, 'blocked_users') } };
  }
  if (section === 'rotina') {
    return { rows: [
      { Rotina: 'Atualização de preços', Pendentes: count(db, 'price_queue') },
      { Rotina: 'Tradução e requisitos', Pendentes: count(db, 'localization_queue') },
    ], pages: 1 };
  }
  if (!Object.hasOwn(queries, section)) return null;
  const sql = queries[section];
  const pages = Math.max(1, Math.ceil(count(db, `(${sql})`) / 20));
  const current = Math.min(page, pages);
  return { rows: db.prepare(sql + ' LIMIT 20 OFFSET ?').all((current - 1) * 20), page: current, pages };
}
