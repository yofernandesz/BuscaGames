import { useEffect, useRef, useState } from 'react';
import { useGames } from '../../games/hooks/useGames';
import { communityApi } from '../../../lib/communityApi';

export default function NicknameEditor() {
  const { user, updateUser, requestLogin } = useGames();
  const [name, setName] = useState(user.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const pending = useRef(null);
  const input = useRef(null);
  useEffect(() => () => pending.current?.abort(), []);
  const availableAt = user.isAdmin ? null : user.nicknameAvailableAt;

  async function save(event) {
    event.preventDefault();
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true); setError(''); setMessage('');
    try {
      const data = await communityApi('/api/auth/nickname', { method: 'PUT', body: { name }, signal: controller.signal });
      if (controller.signal.aborted) return;
      updateUser(data.user, user.id);
      setName(data.user.name);
      setMessage('Nickname atualizado.');
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err.message);
      if (err.status === 401) { updateUser(null); requestLogin('account', 'Sua sessão expirou. Entre novamente para continuar.'); }
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  useEffect(() => { if (error && !busy) input.current?.focus(); }, [error, busy]);

  return <form noValidate onSubmit={save} aria-busy={busy}>
    <label htmlFor="profile-nickname">Nickname
      <input ref={input} id="profile-nickname" autoComplete="nickname" value={name} minLength={2} maxLength={60} required
        readOnly={busy} aria-invalid={Boolean(error)} aria-describedby="nickname-help nickname-status"
        onChange={event => { setName(event.target.value); setError(''); setMessage(''); }} />
    </label>
    <p className="auth-help" id="nickname-help">{user.isAdmin
      ? 'Administradores podem alterar o nickname sem prazo de espera, inclusive para nomes em uso.'
      : <>Escolha um nickname disponível. Após salvar, aguarde 30 dias para trocar novamente.
        {availableAt && <> Próxima troca a partir de {new Date(availableAt).toLocaleString('pt-BR')}.</>}</>}</p>
    <button className="btn-ghost" disabled={busy || name.trim() === user.name}>{busy ? 'Salvando…' : 'Salvar nickname'}</button>
    <p id="nickname-status" role={error ? 'alert' : 'status'}>{error || message}</p>
  </form>;
}
