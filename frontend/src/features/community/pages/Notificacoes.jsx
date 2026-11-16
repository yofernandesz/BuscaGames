import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Header from '../../../components/layout/Header';
import Skeleton from '../../../components/ui/Skeleton';
import { useGames } from '../../games/hooks/useGames';
import { useCommunityQuery } from '../../../hooks/useCommunityQuery';
import { communityApi } from '../../../lib/communityApi';
import '../styles/notifications.css';

export default function Notificacoes() {
  const { user, accountLoading, requestLogin } = useGames();
  const heading = useRef(null);
  useEffect(() => { document.title = 'Notificações | BuscaGames'; heading.current?.focus(); }, []);
  return <><Header /><main className="notifications-page">
    <h1 tabIndex={-1} ref={heading}>Notificações</h1>
    <p className="notifications-intro">Acompanhe novos seguidores, curtidas e respostas aos seus comentários.</p>
    {accountLoading ? <Skeleton variant="rows" label="Carregando sua conta…" /> : !user ? <button className="btn-ghost" onClick={() => requestLogin()}>Entrar para ver notificações</button> : <NotificationList key={user.id} />}
  </main></>;
}

function NotificationList() {
  const [params, setParams] = useSearchParams();
  const before = params.get('antes');
  const query = useCommunityQuery(`/api/notifications${before ? `?before=${encodeURIComponent(before)}` : ''}`);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function change(path, body, transform, message) {
    if (busy) return;
    setBusy(true); setError(''); setFeedback('');
    try {
      const result = await communityApi(path, { method: 'PUT', body });
      if (!alive.current) return;
      query.update(data => transform(data, result));
      setFeedback(message);
      window.dispatchEvent(new Event('notifications-changed'));
    } catch (failure) { if (alive.current) setError(failure.message); }
    finally { if (alive.current) setBusy(false); }
  }
  const data = query.data;
  return <section aria-label="Suas notificações" aria-busy={query.loading || busy}>
    {query.loading && <Skeleton variant="rows" label="Carregando notificações…" />}
    {query.error && <div role="alert"><p>{query.error}</p><button className="btn-ghost" onClick={query.retry}>Tentar novamente</button></div>}
    {data && <>
      <div className="notifications-toolbar">
        <strong>{data.unreadCount.toLocaleString('pt-BR')} não lidas</strong>
        <button className="btn-ghost" disabled={busy || !data.unreadCount} onClick={() => change('/api/notifications/read', { throughId: data.latestId },
          (current, result) => ({ ...current, unreadCount: result.unreadCount, notifications: current.notifications.map(item => ({ ...item, readAt: item.readAt || new Date().toISOString() })) }), 'Notificações marcadas como lidas.')}>Marcar todas como lidas</button>
        <button className="btn-ghost" disabled={busy} onClick={query.retry}>Atualizar</button>
      </div>
      <label className="notification-preference"><input type="checkbox" checked={data.emailEnabled} disabled={busy} onChange={event => change('/api/notifications/preferences', { emailEnabled: event.target.checked },
        (current, result) => ({ ...current, emailEnabled: result.emailEnabled }), 'Preferência de email salva.')} />Receber alertas por email</label>
      {!data.emailAvailable && <p className="notifications-intro">O envio de emails ainda não está disponível. Sua preferência ficará salva.</p>}
      {!data.notifications.length ? <p className="notifications-empty">Nenhuma notificação por aqui. Novas interações com seu perfil e seus comentários aparecerão nesta lista.</p> : <ol className="notification-list">
        {data.notifications.map(item => <li key={item.id} className={item.readAt ? '' : 'notification-unread'}>
          <div><p><Link to={`/perfil/${item.actorId}`}>{item.actor}</Link> {item.message}</p>
            <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString('pt-BR')}</time>
            <span className="notification-state">{item.readAt ? 'Lida' : 'Não lida'}</span>
          </div>
          <div className="notification-actions"><Link to={item.path}>{item.kind === 'follow' ? 'Ver perfil' : 'Ver conversa'}</Link>
            {!item.readAt && <button className="btn-ghost" disabled={busy} onClick={() => change('/api/notifications/read', { id: item.id },
              (current, result) => ({ ...current, unreadCount: result.unreadCount, notifications: current.notifications.map(row => row.id === item.id ? { ...row, readAt: new Date().toISOString() } : row) }), 'Notificação marcada como lida.')}>Marcar como lida</button>}
          </div>
        </li>)}
      </ol>}
      {(before || data.nextCursor) && <nav className="notifications-toolbar" aria-label="Paginação de notificações">
        {before && <button className="btn-ghost" disabled={busy} onClick={() => setParams({})}>Mais recentes</button>}
        {data.nextCursor && <button className="btn-ghost" disabled={busy} onClick={() => setParams({ antes: String(data.nextCursor) })}>Anteriores</button>}
      </nav>}
    </>}
    <p role="status">{busy ? 'Salvando…' : feedback}</p>
    {error && <p role="alert">{error}</p>}
  </section>;
}
