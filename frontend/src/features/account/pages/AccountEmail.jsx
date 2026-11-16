import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Header from '../../../components/layout/Header';
import { communityApi } from '../../../lib/communityApi';
import { useGames } from '../../games/hooks/useGames';
import { normalizeEmail, PASSWORD_MAX, validAccountEmail, validateNewPassword } from '../../../../../shared/accountPolicy.mjs';
import PasswordField, { PasswordRequirements } from '../components/PasswordField';
import '../styles/auth.css';

const copy = {
  pending: {
    title: 'Confirme seu e-mail',
    description: 'Abra o link de confirmação na sua caixa de entrada. Ele vale por 15 minutos.',
    action: 'Enviar link de confirmação', route: 'resend-verification',
    sent: 'Se o endereço puder ser confirmado, enviaremos um link. Confira também a pasta de spam.',
  },
  forgot: {
    title: 'Recupere sua senha',
    description: 'Informe o e-mail da conta para solicitar um link de recuperação.',
    action: 'Enviar link de recuperação', route: 'forgot-password',
    sent: 'Se houver uma conta elegível para este e-mail, enviaremos um link. Confira também a pasta de spam.',
  },
  verify: {
    title: 'Verifique seu e-mail',
    description: 'Confirme este endereço se você criou uma conta no BuscaGames ou solicitou a confirmação.',
    action: 'Verificar meu e-mail', route: 'verify-email',
    success: 'E-mail verificado', complete: 'Seu endereço foi confirmado. Você já pode entrar.',
    retry: '/confirmacao-pendente', retryLabel: 'Solicitar outro link de confirmação',
  },
  reset: {
    title: 'Defina uma nova senha',
    description: 'Escolha uma senha para voltar a acessar sua conta. Ao salvar, suas sessões anteriores serão encerradas.',
    action: 'Salvar nova senha', route: 'reset-password',
    success: 'Senha redefinida', complete: 'Sua nova senha foi salva. Entre novamente para acessar sua conta.',
    retry: '/recuperar-senha', retryLabel: 'Solicitar outro link de recuperação',
  },
};

export default function AccountEmail({ mode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const usesToken = Boolean(copy[mode].retry);
  const [linkVisit, setLinkVisit] = useState(() => ({ location, number: 0 }));
  // A fresh fragment can arrive in the same tab without a full page navigation.
  if (usesToken && location.hash && location !== linkVisit.location) {
    setLinkVisit({ location, number: linkVisit.number + 1 });
  }
  useEffect(() => {
    if (usesToken && location.hash) navigate(location.pathname, { replace: true });
  }, [usesToken, location.hash, location.pathname, navigate]);

  const hash = linkVisit.location.hash.slice(1);
  return <AccountEmailForm key={usesToken ? linkVisit.number : location.key} mode={mode} initialState={location.state}
    token={usesToken && /^[\w-]{43}$/.test(hash) ? hash : ''} />;
}

function AccountEmailForm({ mode, initialState, token }) {
  const content = copy[mode];
  const { user, refreshAccount, requestLogin } = useGames();
  const heading = useRef(null);
  const inFlight = useRef(false);
  const focusAfterSubmit = useRef(null);
  const usesToken = Boolean(content.retry);
  const [email, setEmail] = useState(initialState?.email || '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(usesToken && !token ? 'invalid' : '');
  const [notice, setNotice] = useState(initialState?.emailSent === true ? 'Enviamos um link para o seu e-mail. Confira também a pasta de spam.' : '');
  const [error, setError] = useState(initialState?.emailSent === false ? 'O envio falhou. Aguarde um minuto e solicite outro link.' : '');
  const [field, setField] = useState('');
  const title = result === 'success' ? content.success : result === 'invalid' ? 'Link indisponível' : content.title;
  const description = result === 'success' ? content.complete : result === 'invalid'
    ? 'Este link é inválido, expirou ou já foi usado.' : content.description;

  useEffect(() => {
    document.title = `${title} — BuscaGames`;
    heading.current?.focus({ preventScroll: true });
  }, [title]);
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
    const address = normalizeEmail(fields.email);
    const invalid = mode === 'reset' ? validateNewPassword(fields) : !usesToken && !validAccountEmail(address)
      ? { field: 'email', message: 'Informe um e-mail válido.' } : null;
    if (invalid) {
      setField(invalid.field);
      setError(invalid.message);
      form.elements[invalid.field].focus();
      return;
    }
    inFlight.current = true;
    setBusy(true); setField(''); setError(''); setNotice('');
    try {
      await communityApi(`/api/auth/${content.route}`, {
        method: 'POST', body: usesToken ? { ...fields, token } : { email: address },
      });
      if (usesToken) {
        setPassword('');
        await refreshAccount();
        setResult('success');
      } else setNotice(content.sent);
    } catch (err) {
      if (err.field === 'token') setResult('invalid');
      else {
        setError(err.retryAfter ? `Aguarde ${err.retryAfter} segundos e tente novamente.` : err.message);
        setField(err.field || '');
        if (err.field) focusAfterSubmit.current = form.elements[err.field];
      }
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }

  return <>
    <Header />
    <main className="auth-page">
      <section className="auth-form auth-page-card" aria-labelledby="account-email-title">
        <div className="auth-heading">
          <h1 id="account-email-title" tabIndex={-1} ref={heading}>{title}</h1>
          <p>{description}</p>
        </div>
        {!result && <form noValidate onSubmit={submit} aria-busy={busy} aria-describedby="account-email-error">
          {!usesToken && <label>E-mail
            <input type="email" name="email" autoComplete="email" required maxLength={254} value={email}
              onChange={(event) => setEmail(event.target.value)} disabled={busy} aria-invalid={field === 'email'}
              aria-describedby="account-email-error" placeholder="voce@exemplo.com" />
          </label>}
          {mode === 'reset' && <>
            <PasswordField id="reset-password" label="Nova senha" name="password" value={password}
              onChange={(event) => setPassword(event.target.value)} autoComplete="new-password"
              maxLength={PASSWORD_MAX * 2} disabled={busy} aria-invalid={field === 'password'}
              aria-describedby="reset-requirements account-email-error" />
            <PasswordRequirements id="reset-requirements" password={password} />
            <PasswordField id="reset-confirmation" label="Confirmar senha" visibilityLabel="confirmação de senha"
              name="passwordConfirmation" autoComplete="new-password" maxLength={PASSWORD_MAX * 2} disabled={busy}
              aria-invalid={field === 'passwordConfirmation'} aria-describedby="account-email-error" />
          </>}
          <p className="auth-error" role="alert" id="account-email-error">{error}</p>
          <p className="auth-status" role="status">{notice}</p>
          <button className="auth-submit" disabled={busy}>{busy ? 'Aguarde…' : content.action}</button>
        </form>}
        <div className="auth-page-actions">
          {result === 'invalid' && <Link className="auth-link" to={content.retry}>{content.retryLabel}</Link>}
          {user ? <Link className="auth-link" to="/perfil">Ir para meu perfil</Link>
            : <button type="button" className="auth-link" onClick={() => requestLogin()}>{result === 'success' ? 'Entrar' : 'Voltar para o login'}</button>}
        </div>
      </section>
    </main>
  </>;
}
