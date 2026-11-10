import { fileURLToPath } from 'node:url';
import { auditedChange } from './admin.js';
import { openCatalog } from './catalog/catalog.js';

const [action, email] = process.argv.slice(2);
if (!['grant', 'revoke'].includes(action) || !email) throw new Error('Use grant ou revoke seguido do e-mail da conta.');
const db = openCatalog(process.env.DATABASE_PATH || fileURLToPath(new URL('../data/catalog.sqlite', import.meta.url)));
try {
  const account = db.prepare('SELECT id FROM users WHERE email=?').get(email.trim().toLowerCase());
  if (!account) throw new Error('Conta não encontrada.');
  const granting = action === 'grant';
  auditedChange(db, {
    target: account.id, actor: 'Terminal do servidor', args: [account.id],
    sql: granting ? 'INSERT OR IGNORE INTO administrators VALUES (?)' : 'DELETE FROM administrators WHERE user_id=?',
    event: granting ? 'Acesso administrativo concedido' : 'Acesso administrativo revogado',
  });
  console.info(action === 'grant' ? 'Acesso administrativo concedido.' : 'Acesso administrativo revogado.');
} finally { db.close(); }
