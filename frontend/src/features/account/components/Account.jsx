import Skeleton from "../../../components/ui/Skeleton";
import ReviewBadge from "../../../components/ui/ReviewBadge";
import NicknameEditor from './NicknameEditor';
import { Link } from 'react-router-dom';
import { useEffect, useId, useRef, useState } from 'react';
import { useGames } from '../../games/hooks/useGames';
import { communityApi } from '../../../lib/communityApi';
import { PASSWORD_MIN, PASSWORD_MAX, LOGIN_PASSWORD_MAX, passwordRequirements, validateAccount } from '../../../../../shared/accountPolicy.mjs';
import '../../games/styles/comments.css';
import '../styles/auth.css';

function GoogleMark() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z" /><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.07v2.59A10 10 0 0 0 12 22Z" /><path fill="#FBBC05" d="M6.41 13.92a6 6 0 0 1 0-3.84V7.49H3.07a10 10 0 0 0 0 9.02l3.34-2.59Z" /><path fill="#EA4335" d="M12 5.96c1.47 0 2.79.5 3.82 1.49l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.93 5.49l3.34 2.59A5.99 5.99 0 0 1 12 5.96Z" /></svg>;
}

export default function Account({ modal = false }) {
  const { user, updateUser, accountLoading, googleEnabled, closeLogin, loginRequest } = useGames();
  const id = useId();
  const inFlight = useRef(false);
  const focusAfterSubmit = useRef(null);
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [invalidField, setInvalidField] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [draft, setDraft] = useState({ name: '', email: '', password: '', passwordConfirmation: '' });
  const requirements = passwordRequirements(draft.password, draft);

  useEffect(() => {
    if (!busy && focusAfterSubmit.current) {
      focusAfterSubmit.current.focus();
      focusAfterSubmit.current = null;
    }
  }, [busy]);

  async function submit(event) {
    event.preventDefault();
    if (inFlight.current) return;
    const form = event.currentTarget;
    const fields = Object.fromEntries(new FormData(form));
    const invalid = !user && validateAccount(fields, register);
    if (invalid) {
      setInvalidField(invalid.field);
      setError(invalid.message);
      form.elements[invalid.field].focus(); return;
    }
    inFlight.current = true;
    setBusy('email'); setError(''); setInvalidField(''); setMessage('');
    try {
      const data = await communityApi(`/api/auth/${user ? 'logout' : register ? 'register' : 'login'}`, { method: 'POST', body: fields });
      updateUser(data.user); setMessage(user ? 'Você saiu da conta.' : 'Sessão iniciada.');
      setDraft({ name: '', email: '', password: '', passwordConfirmation: '' });
      if (!user) closeLogin();
    } catch (err) {
      setError(err.message);
      if (err.field && form.elements[err.field]) { setInvalidField(err.field); focusAfterSubmit.current = form.elements[err.field]; }
      if (err.status === 401 && form.elements.password) { form.elements.password.value = ''; setDraft((value) => ({ ...value, password: '' })); focusAfterSubmit.current = form.elements.password; }
    } finally { inFlight.current = false; setBusy(''); }
  }

  async function google() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy('google'); setError('');
    try {
      const data = await communityApi('/api/auth/google/start', { method: 'POST', body: {
        link: Boolean(user), returnTo: window.location.pathname + window.location.search + window.location.hash,
      } });
      window.location.assign(data.url);
    } catch (err) { setError(err.message); inFlight.current = false; setBusy(''); }
  }

  const errors = error || (modal ? loginRequest?.message : '');
  return <div className={`auth-form ${modal ? 'auth-form--modal' : ''}`}>
    {accountLoading ? <Skeleton variant="form" label="Consultando sessão…" /> : user ? <>
      {modal && <h2 id="login-title">Sua conta</h2>}
      <dl className="profile-account-fields">
        <div><dt>Nome de exibição</dt><dd><Link to={`/perfil/${user.id}`}>{user.name}</Link><ReviewBadge reviewed={user.reviewed} /></dd></div>
        <div><dt>Identificação</dt><dd>#{user.id}</dd></div>
        <div><dt>E-mail <span className="profile-private-label">Só você</span></dt><dd>{user.email}</dd></div>
        <div><dt>Comentários publicados</dt><dd><Link to={`/perfil/${user.id}?aba=comments`}>{user.commentCount ?? 0} <span aria-hidden="true">↗</span><span className="sr-only"> Ver comentários publicados</span></Link></dd></div>
        <div><dt>Revisão do perfil</dt><dd>{user.reviewed ? 'Perfil revisado' : 'Ainda não revisado'}</dd></div>
        <div><dt>Foto de perfil</dt><dd>{user.customPhoto ? 'Personalizada' : user.avatarUrl ? 'Foto da conta Google' : 'Avatar padrão'}</dd></div>
        <div><dt>Conta Google</dt><dd>{user.googleLinked ? 'Vinculada' : 'Não vinculada'}</dd></div>
      </dl>
      {!modal && <NicknameEditor key={user.id} />}
      {user.googleLinked && <p className="auth-connected">✓ Conta Google vinculada</p>}
      {!user.googleLinked && <>
        <button type="button" className="auth-google" disabled={Boolean(busy) || !googleEnabled} onClick={google}><GoogleMark />{busy === 'google' ? 'Conectando…' : 'Vincular conta Google'}</button>
        {!googleEnabled && <p className="auth-help">A conexão com Google ainda não está disponível.</p>}
      </>}
      <form noValidate onSubmit={submit}><button className="btn-ghost" disabled={Boolean(busy)}>{busy === 'email' ? 'Saindo…' : 'Sair da conta'}</button></form>
    </> : <>
      <div className="auth-heading"><p className="auth-eyebrow">SUA CONTA BUSCAGAMES</p><h2 id={modal ? 'login-title' : `${id}-title`}>{register ? 'Comece sua história.' : 'Bom ter você por aqui.'}</h2>
        <p id={modal ? 'login-description' : undefined}>{loginRequest?.reason === 'favorite' ? 'Entre para guardar este jogo nos seus favoritos.' : loginRequest?.reason === 'rating' ? 'Entre para dar sua nota e marcar sua experiência.' : loginRequest?.reason === 'comment' ? 'Entre para compartilhar sua opinião sobre este jogo.' : 'Entre para reunir seus jogos, notas e descobertas.'}</p></div>
      <button type="button" className="auth-google" disabled={Boolean(busy) || !googleEnabled} onClick={google} aria-describedby={!googleEnabled ? `${id}-google-help` : undefined}><GoogleMark />{busy === 'google' ? 'Conectando…' : 'Continuar com Google'}</button>
      {!googleEnabled && <p id={`${id}-google-help`} className="auth-help">Google ainda indisponível. Use seu e-mail para continuar.</p>}
      <div className="auth-divider"><span>ou use seu e-mail</span></div>
      <form noValidate onSubmit={submit} onChange={(event) => { const { name, value } = event.target; if (name) setDraft((previous) => ({ ...previous, [name]: value })); }} aria-busy={Boolean(busy)} aria-describedby={`${id}-error`}>
        {register && <label htmlFor={`${id}-name`}>Nome de exibição<input id={`${id}-name`} name="name" autoComplete="nickname" minLength={2} maxLength={60} required disabled={Boolean(busy)} aria-invalid={invalidField === 'name'} aria-describedby={`${id}-error`} placeholder="Como você quer ser chamado?" /></label>}
        <label htmlFor={`${id}-email`}>E-mail<input id={`${id}-email`} name="email" type="email" autoComplete="email" maxLength={254} required disabled={Boolean(busy)} aria-invalid={invalidField === 'email'} aria-describedby={`${id}-error`} placeholder="voce@exemplo.com" /></label>
        <label htmlFor={`${id}-password`}>Senha</label>
        <div className="auth-password"><input id={`${id}-password`} name="password" type={showPassword ? 'text' : 'password'} autoComplete={register ? 'new-password' : 'current-password'} minLength={register ? PASSWORD_MIN : 1} maxLength={(register ? PASSWORD_MAX : LOGIN_PASSWORD_MAX) * 2} required disabled={Boolean(busy)} aria-invalid={invalidField === 'password'} aria-describedby={`${id}-password-help ${register ? `${id}-requirements ` : ''}${id}-error`} placeholder="Sua senha" />
          <button type="button" className="auth-show" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}><svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{showPassword && <path d="m3 3 18 18" />}</svg></button></div>
        <p id={`${id}-password-help`} className="auth-help">{register ? 'Prefira uma frase longa e exclusiva. Espaços, acentos e colar senhas são permitidos.' : 'Use a senha da sua conta.'}</p>
        {register && <>
          <ul id={`${id}-requirements`} className="auth-requirements" aria-label="Critérios da senha">{requirements.map((rule) => <li key={rule.id} data-met={Boolean(draft.password) && rule.met}><span aria-hidden="true">{draft.password && rule.met ? '✓' : '○'}</span><span className="sr-only">{draft.password && rule.met ? 'Atendido: ' : 'Pendente: '}</span>{rule.label}</li>)}</ul>
          <label htmlFor={`${id}-passwordConfirmation`}>Confirmar senha</label>
          <div className="auth-password"><input id={`${id}-passwordConfirmation`} name="passwordConfirmation" type={showConfirmation ? 'text' : 'password'} autoComplete="new-password" maxLength={PASSWORD_MAX * 2} required disabled={Boolean(busy)} aria-invalid={invalidField === 'passwordConfirmation'} aria-describedby={`${id}-confirmation-help ${id}-error`} placeholder="Digite a senha novamente" />
            <button type="button" className="auth-show" aria-label={showConfirmation ? 'Ocultar confirmação de senha' : 'Mostrar confirmação de senha'} aria-pressed={showConfirmation} onClick={() => setShowConfirmation(!showConfirmation)}><span aria-hidden="true">{showConfirmation ? '◉' : '◎'}</span></button></div>
          <p id={`${id}-confirmation-help`} className="auth-help" aria-live="polite">{draft.passwordConfirmation ? draft.password === draft.passwordConfirmation ? 'As senhas coincidem.' : 'As senhas ainda não coincidem.' : 'Repita a mesma senha para evitar erros de digitação.'}</p>
        </>}
        <p id={`${id}-error`} className="auth-error" role="alert">{errors}</p>
        <button className="auth-submit" disabled={Boolean(busy)}>{busy === 'email' ? 'Aguarde…' : register ? 'Criar conta' : 'Entrar'}<span aria-hidden="true">↗</span></button>
        <p className="auth-switch">{register ? 'Já faz parte?' : 'Primeira vez aqui?'} <button type="button" disabled={Boolean(busy)} onClick={() => { setRegister(!register); setError(''); setInvalidField(''); setShowPassword(false); setShowConfirmation(false); setDraft((value) => ({ ...value, name: '', passwordConfirmation: '' })); }}>{register ? 'Entrar na minha conta' : 'Criar uma conta'}</button></p>
      </form>
      <p className="auth-privacy">Seu nome, foto, plano de fundo, favoritos, notas e conexões aparecem no perfil público. Seu e-mail não é público. <a href="/privacidade">Saiba como cuidamos dos seus dados.</a></p>
    </>}
    {user && <p id={`${id}-error`} className="auth-error" role="alert">{errors}</p>}
    <p className="auth-status" role="status">{message}</p>
  </div>;
}
