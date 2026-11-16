import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { communityApi } from '../../../lib/communityApi';
import '../styles/notifications.css';

export default function NotificationButton() {
  const [count, setCount] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let controller;
    async function refresh() {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      try {
        const data = await communityApi('/api/notifications/count', { signal: request.signal });
        if (!request.signal.aborted) { setCount(data.unreadCount); setFailed(false); }
      } catch {
        if (!request.signal.aborted) setFailed(true);
      }
    }
    const visibleRefresh = () => { if (!document.hidden) void refresh(); };
    void refresh();
    const timer = setInterval(visibleRefresh, 30000);
    window.addEventListener('notifications-changed', refresh);
    window.addEventListener('focus', visibleRefresh);
    document.addEventListener('visibilitychange', visibleRefresh);
    return () => {
      controller?.abort(); clearInterval(timer);
      window.removeEventListener('notifications-changed', refresh);
      window.removeEventListener('focus', visibleRefresh);
      document.removeEventListener('visibilitychange', visibleRefresh);
    };
  }, []);
  const label = failed ? 'Notificações: contagem indisponível' : count == null ? 'Notificações: carregando contagem' : `Notificações: ${count.toLocaleString('pt-BR')} não lidas`;
  return <NavLink className="notification-button" to="/notificacoes" aria-label={label} title={label}>
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
    <span>Notificações</span><span className="notification-count" aria-hidden="true">{failed ? '!' : count == null ? '…' : count > 99 ? '99+' : count}</span>
  </NavLink>;
}
