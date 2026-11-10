export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 20;
// Preserve the accepted length for passwords belonging to existing accounts.
export const LOGIN_PASSWORD_MAX = 128;

const controls = /[\p{Cc}\p{Cf}]/u;
export const normalizeEmail = (value) => typeof value === 'string' ? value.trim().toLowerCase() : '';
function validEmail(value) {
  if (typeof value !== 'string' || value.length > 254 || controls.test(value)) return false;
  const [local, domain, extra] = value.split('@');
  return extra === undefined && Boolean(local && domain) && local.length <= 64
    && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local) && !local.startsWith('.') && !local.endsWith('.') && !local.includes('..')
    && domain.includes('.') && domain.split('.').every((part) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(part));
}

const compact = (value) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '');
// Local denylist of common bases and predictable variants; not a complete breach corpus.
const common = /^(?:password|passw0rd|senha|senhasegura|minhasenha|qwerty|azerty|letmein|iloveyou|welcome|bemvindo|admin|administrador|buscagames|1234567890)+\d*$/;
const sequences = ['abcdefghijklmnopqrstuvwxyz', 'qwertyuiopasdfghjklzxcvbnm'];
export function passwordRequirements(password = '', { name = '', email = '' } = {}) {
  const value = compact(password);
  const personal = [normalizeEmail(email).split('@')[0], ...name.trim().split(/\s+/)].map(compact).filter((part) => part.length >= 4);
  return [
    { id: 'length', label: `De ${PASSWORD_MIN} a ${PASSWORD_MAX} caracteres.`, met: [...password].length >= PASSWORD_MIN && [...password].length <= PASSWORD_MAX },
    { id: 'predictable', label: 'Evite senhas comuns, sequências e repetições.', met: Boolean(value || password.trim()) && !common.test(value) && !/^(.{1,4})\1+$/u.test(password.trim()) && !/^\d+$/.test(value) && !sequences.some((sequence) => value.length >= 8 && (sequence.includes(value) || [...sequence].reverse().join('').includes(value))) },
    { id: 'personal', label: 'Não inclua seu nome, e-mail ou BuscaGames.', met: Boolean(password) && !value.includes('buscagames') && !personal.some((part) => value.includes(part)) },
  ];
}

export function validateAccount(data, registering) {
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  if (registering && (name.length < 2 || name.length > 60 || controls.test(name))) return { field: 'name', message: 'Use um nome de exibição de 2 a 60 caracteres, sem caracteres de controle.' };
  const email = normalizeEmail(data.email);
  if (registering ? !validEmail(email) : email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { field: 'email', message: 'Informe um e-mail válido, como voce@exemplo.com.' };
  if (typeof data.password !== 'string' || !data.password || [...data.password].length > LOGIN_PASSWORD_MAX) return { field: 'password', message: 'Informe sua senha, com até 128 caracteres.' };
  if (registering) {
    const unmet = passwordRequirements(data.password, { name, email: data.email }).find((rule) => !rule.met);
    if (unmet) return { field: 'password', message: unmet.label };
    if (data.passwordConfirmation !== data.password) return { field: 'passwordConfirmation', message: 'As senhas devem ser iguais. Digite novamente a confirmação.' };
  }
  return null;
}
