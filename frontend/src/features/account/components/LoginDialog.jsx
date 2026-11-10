import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useGames } from '../../games/hooks/useGames';
import Account from './Account';

const googleErrors = {
  google_cancelled: 'A conexão com Google foi cancelada. Você pode tentar novamente ou entrar com e-mail.',
  google_existing: 'Entre com e-mail e senha e use “Vincular conta Google” no seu perfil.',
  google_blocked: 'Conta bloqueada pela administração.',
  google_conflict: 'Essa conta já tem um vínculo diferente. Use a conta Google vinculada ou entre com e-mail.',
  google_failed: 'Não foi possível conectar ao Google. Tente novamente ou entre com e-mail.',
};

export default function LoginDialog() {
  const { loginRequest, requestLogin, closeLogin } = useGames();
  const [params, setParams] = useSearchParams();
  const dialog = useRef(null);
  useEffect(() => {
    const result = params.get('auth');
    if (!result) return;
    if (googleErrors[result]) requestLogin('account', googleErrors[result]);
    setParams((current) => { const next = new URLSearchParams(current); next.delete('auth'); return next; }, { replace: true });
  }, [params, setParams, requestLogin]);

  useEffect(() => {
    if (!loginRequest) return;
    const element = dialog.current;
    const trigger = document.activeElement;
    const previousOverflow = document.documentElement.style.overflow;
    element.showModal();
    element.querySelector('.auth-close').focus();
    document.documentElement.style.overflow = 'hidden';
    return () => {
      element.close();
      document.documentElement.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [loginRequest]);

  return <dialog ref={dialog} className="auth-dialog" aria-modal="true" aria-label="Entrar no BuscaGames" aria-labelledby="login-title" aria-describedby="login-description" onCancel={(event) => { event.preventDefault(); closeLogin(); }} onKeyDown={(event) => {
    if (event.key !== 'Tab') return;
    const targets = [...event.currentTarget.querySelectorAll('button:not(:disabled), input:not(:disabled), a[href]')];
    const first = targets[0], last = targets.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}>
    {loginRequest && <>
      <button type="button" className="auth-close" onClick={closeLogin} aria-label="Fechar login e continuar explorando"><span aria-hidden="true">×</span></button>
      <div className="auth-layout">
        <aside className="auth-story">
          <span className="auth-wordmark">BuscaGames<span>.</span></span>
          <div className="auth-player" aria-hidden="true"><svg viewBox="0 0 120 120" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M40 43h40c9 0 14 9 16 18l4 18c2 10-8 15-15 8L73 74H47L35 87c-7 7-17 2-15-8l4-18c2-9 7-18 16-18Z" /><path d="M39 55v19m-9-9h18M52 43v-9h16v-8" /><circle cx="79" cy="57" r="3" /><circle cx="88" cy="68" r="3" /></svg><span>PLAYER / YOU</span></div>
          <div className="auth-story-copy"><p className="auth-eyebrow">SEU PRÓXIMO UNIVERSO</p><h3>Jogar é só<br />o começo<span>.</span></h3><p>Os favoritos, as histórias e as opiniões que fazem de você um jogador único.</p></div>
          <ul className="auth-perks"><li><span aria-hidden="true">♡</span>Guarde seus favoritos</li><li><span aria-hidden="true">☆</span>Dê sua nota aos jogos</li><li><span aria-hidden="true">↗</span>Compartilhe suas descobertas</li></ul>
          <p className="auth-story-footer">SUA BIBLIOTECA. DO SEU JEITO.</p>
        </aside>
        <div className="auth-main"><Account modal /><button type="button" className="auth-explore" onClick={closeLogin}>Continuar explorando sem entrar <span aria-hidden="true">→</span></button></div>
      </div>
    </>}
  </dialog>;
}
