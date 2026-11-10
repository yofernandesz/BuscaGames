import Skeleton from "../../../components/ui/Skeleton";
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import DashboardCharts from '../components/DashboardCharts';
import Avatar from '../../../components/ui/Avatar';
import ReviewBadge from '../../../components/ui/ReviewBadge';
import { useGames } from '../../games/hooks/useGames';
import Logo from '../../../components/layout/Logo';
import { communityApi } from '../../../lib/communityApi';
import { validateAccount } from '../../../../../shared/accountPolicy.mjs';
import '../styles/admin.css';

const sections = {
  dashboard: ['Dashboard', 'Visão geral', 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z'],
  usuarios: ['Usuários', 'Contas cadastradas', 'M16 21v-2a6 6 0 0 0-12 0v2 M10 4a4 4 0 1 0 .01 0 M18 6a4 4 0 0 1 0 7 M18 16q4 0 4 5'],
  verificacoes: ['Verificações', 'Cadastros pendentes de revisão', 'M12 2l8 3v6q0 7-8 11-8-4-8-11V5z M8 12l3 3 5-6'],
  administradores: ['Administradores', 'Equipe com acesso ao painel', 'M12 2l8 3v6q0 7-8 11-8-4-8-11V5z M9 12h6 M12 9v6'],
  registros: ['Auditoria', 'Histórico de acessos, permissões e ações administrativas', 'M5 3h14v18H5z M8 8h8 M8 12h8 M8 16h5'],
  atividades: ['Atividades', 'Comentários da comunidade', 'M2 12h5l3-8 4 16 3-8h5'],
  rotina: ['Rotina', 'Filas de atualização do catálogo', 'M3 5h18v16H3z M7 2v6 M17 2v6 M3 10h18 M7 15h6'],
  vinculos: ['Vínculos', 'Contas conectadas ao Google', 'M10 14l4-4 M8 11l-3 3a4 4 0 0 0 6 6l3-3 M16 13l3-3a4 4 0 0 0-6-6l-3 3'],
  chat: ['Chat', 'Conversa da equipe', 'M3 4h18v13H9l-6 4z M7 9h10 M7 13h6'],
  relatorios: ['Relatórios', 'Resumo da comunidade e do catálogo', 'M5 2h10l4 4v16H5z M9 17v-3 M12 17V9 M15 17v-5'],
};

function Icon({ name }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinejoin="round" strokeLinecap="round"><path d={sections[name][2]} /></svg>;
}

function Login({ onLogin }) {
  const { googleEnabled } = useGames();
  const [params, setParams] = useSearchParams();
  const [error, setError] = useState(() => {
    const outcome = params.get('adminAuth');
    if (!outcome) return {};
    const messages = {
      google_admin_denied: 'Esta conta Google não tem acesso ao painel. Use a conta autorizada pelo administrador.',
      google_cancelled: 'Login com Google cancelado. Você pode tentar novamente.',
      google_blocked: 'Conta bloqueada pela administração.',
    };
    return { message: messages[outcome] || 'Não foi possível entrar com o Google. Tente novamente.' };
  });
  useEffect(() => {
    if (params.has('adminAuth')) {
      const next = new URLSearchParams(params);
      next.delete('adminAuth');
      setParams(next, { replace: true });
    }
  }, [params, setParams]);
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);
  async function googleLogin() {
    setBusy(true);
    setError({});
    try {
      const { url } = await communityApi('/api/auth/google/start', { method: 'POST', body: { adminLogin: true } });
      window.location.assign(url);
    } catch (e) { setError(e); setBusy(false); }
  }
  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form));
    const invalid = validateAccount(body, false);
    if (invalid) { setError(invalid); form.elements[invalid.field].focus(); return; }
    setBusy(true);
    setError({});
    try { await communityApi('/api/admin/login', { method: 'POST', body }); onLogin(); }
    catch (e) { setError(e); }
    finally { setBusy(false); }
  }
  return <main className="admin-login"><div className="admin-login-brand"><Logo /></div>
    <section className="admin-login-card auth-form"><span className="admin-shield"><Icon name="verificacoes" /></span>
      <h1>Acesso administrativo</h1><p>Entre com a conta autorizada a administrar o BuscaGames.</p>
      <button type="button" className="auth-google" disabled={busy || !googleEnabled} onClick={googleLogin}>Entrar com Google</button>
      {!googleEnabled && <p className="auth-help">Login com Google indisponível neste ambiente.</p>}
      <div className="auth-divider"><span>ou use seu e-mail e senha</span></div>
      <form noValidate onSubmit={submit}>
        <label htmlFor="admin-email">E-mail</label><input id="admin-email" name="email" type="email" autoComplete="username" required aria-invalid={error.field === 'email'} aria-describedby="admin-error" />
        <label htmlFor="admin-password">Senha</label><div className="auth-password"><input id="admin-password" name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" required aria-invalid={error.field === 'password'} aria-describedby="admin-error" />
        <button className="auth-show" type="button" aria-pressed={visible} aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setVisible(!visible)}>{visible ? 'Ocultar' : 'Mostrar'}</button></div>
        <p id="admin-error" className="auth-error" role="alert">{error.message}</p>
        <button className="auth-submit" disabled={busy}>{busy ? 'Entrando…' : 'Entrar no painel'}<span aria-hidden="true">↗</span></button>
      </form><Link to="/">Voltar ao catálogo</Link>
    </section></main>;
}

function AccessManager({ section, request, busy, selection, setSelection }) {
  const [email, setEmail] = useState('');
  const dialog = useRef(null);
  useEffect(() => {
    if (selection && !dialog.current.open) dialog.current.showModal();
  }, [selection]);
  function close() { dialog.current.close(); setSelection(null); }
  const labels = { grant: 'Conceder acesso', revoke: 'Revogar acesso', block: 'Bloquear usuário', unblock: 'Desbloquear usuário' };
  const consequences = { grant: 'poderá acessar os dados do painel e gerenciar outros administradores.', revoke: 'perderá o acesso ao painel e terá as sessões administrativas encerradas.', block: 'terá as sessões encerradas e ficará sem acesso à conta.', unblock: 'poderá entrar novamente na conta.' };
  return <>{section === 'administradores' && <form className="admin-compose" noValidate onSubmit={e => {
    e.preventDefault(); setSelection({ email: email.trim(), action: 'grant' });
  }}><label htmlFor="grant-email">E-mail da conta que receberá acesso</label><input type="email" id="grant-email" value={email} onChange={e => setEmail(e.target.value)} />
    <button className="btn-ghost" disabled={busy || !email.trim()}>Conceder acesso</button></form>}
    <dialog className="admin-confirm" ref={dialog} aria-labelledby="access-title" onCancel={e => { e.preventDefault(); close(); }}>
      <h2 id="access-title">{labels[selection?.action]}?</h2>
      <p><strong>{selection?.email}</strong> {consequences[selection?.action]}</p>
      <div><button autoFocus className="btn-ghost" onClick={close}>Cancelar</button><button className="btn-ghost" disabled={busy} onClick={async () => {
        const change = selection; close(); if (await request(change)) setEmail('');
      }}>{labels[selection?.action]}</button></div>
    </dialog></>;
}

function RecordValue({ field, row }) {
  if (['Nome', 'Autor', 'Conta'].includes(field)) {
    return <span className="admin-person"><Avatar src={row.avatarUrl} /><span>{row[field]}<ReviewBadge reviewed={row.reviewed} /></span></span>;
  }
  if (field === 'Data') return new Date(row.Data.replace(' ', 'T') + 'Z').toLocaleString('pt-BR');
  return row[field];
}

function Panel({ section, data, page, onPage, request, busy }) {
  const [message, setMessage] = useState('');
  const [selection, setSelection] = useState(null);
  if (data.metrics) return <><dl className="admin-metrics">{data.metrics.map(({ label, value }) =>
    <div key={label}><dt>{label}</dt><dd>{value.toLocaleString('pt-BR')}</dd></div>)}</dl>
    {data.charts && <DashboardCharts charts={data.charts} />}
    {section === 'relatorios' ? <a className="btn-ghost" download="buscagames-relatorio.csv" href={'data:text/csv;charset=utf-8,' + encodeURIComponent('\uFEFFIndicador;Total\r\n' + data.metrics.map(m => m.label + ';' + m.value).join('\r\n'))}>Baixar relatório CSV ↓</a>
    : <Link className="btn-ghost" to="/admin/verificacoes">Revisar cadastros →</Link>}</>;
  const columns = Object.keys(data.rows[0] || {}).filter(key => !['id', 'reviewed', 'avatarUrl'].includes(key));
  return <>
    {['usuarios','administradores'].includes(section) && <AccessManager section={section} request={request} busy={busy} selection={selection} setSelection={setSelection} />}
    {section === 'chat' && <form className="admin-compose" noValidate onSubmit={async e => {
      e.preventDefault();
      if (await request({ message })) setMessage('');
    }}><label htmlFor="admin-message">Mensagem para a equipe</label><input id="admin-message" value={message} maxLength={500} onChange={e => setMessage(e.target.value)} disabled={busy} /><button className="btn-ghost" disabled={busy || !message.trim()}>Enviar mensagem</button></form>}
    {data.rows.length ? <div className="admin-table-wrap" tabIndex={0} role="region" aria-label={sections[section][1]}><table><thead><tr>{columns.map(key => <th key={key}>{key}</th>)}{['usuarios','administradores','verificacoes'].includes(section) && <th>Ação</th>}</tr></thead><tbody>
      {data.rows.map((row, i) => <tr key={row.id ?? i}>{columns.map(key => <td key={key}><RecordValue row={row} field={key} /></td>)}{section === 'verificacoes' && <td><button className="btn-ghost" disabled={busy} onClick={() => request({ id: row.id })}>Marcar como revisado</button></td>}{section === 'usuarios' && <td>{row.id === data.admin.id ? 'Sua conta' : <button className="btn-ghost" disabled={busy} onClick={() => setSelection({ id: row.id, email: row['E-mail'], action: row.Status === 'Ativo' ? 'block' : 'unblock' })}>{row.Status === 'Ativo' ? 'Bloquear' : 'Desbloquear'}</button>}</td>}{section === 'administradores' && <td>{row.id === data.admin.id ? 'Sua conta' : <button className="btn-ghost" disabled={busy} onClick={() => setSelection({ email: row['E-mail'], action: 'revoke' })}>Revogar acesso</button>}</td>}</tr>)}
    </tbody></table></div> : <p className="admin-empty">{section === 'verificacoes' ? 'Todos os cadastros foram revisados.' : section === 'chat' ? 'Envie a primeira mensagem para a equipe.' : 'Nenhum registro nesta seção.'}</p>}
    {data.pages > 1 && <div className="admin-pagination"><button className="btn-ghost" disabled={page === 1} onClick={() => onPage(page - 1)}>Anterior</button><span>{page} de {data.pages}</span><button className="btn-ghost" disabled={page >= data.pages} onClick={() => onPage(page + 1)}>Próxima</button></div>}
  </>;
}

export default function Admin() {
  const { section = 'dashboard' } = useParams();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [actionError, setActionError] = useState('');
  const url = '/api/admin/' + section + '?page=' + page;
  const valid = Object.hasOwn(sections, section);
  useEffect(() => {
    if (!valid) return;
    const controller = new AbortController();
    communityApi(url, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setResult({ url, data });
    }).catch(error => { if (!controller.signal.aborted) setResult({ url, error }); });
    return () => controller.abort();
  }, [url, revision, valid]);
  const dashboardOpen = section === 'dashboard' && Boolean(result?.data) && result.url === url;
  useEffect(() => {
    if (!dashboardOpen) return;
    const update = () => {
      if (document.visibilityState === 'visible') setRevision(value => value + 1);
    };
    const timer = window.setInterval(update, 60000);
    document.addEventListener('visibilitychange', update);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', update); };
  }, [dashboardOpen]);
  if (!valid) return <Navigate replace to="/admin" />;
  const refresh = () => setRevision(r => r + 1);
  const data = result?.url === url && result.data;
  const error = result?.url === url && result.error;
  if (error?.status === 401) return <Login onLogin={() => { setResult(null); setActionError(''); refresh(); }} />;
  if (!data) return <main className="admin-loading">{error ? <p role="alert">{error.message}</p> : <Skeleton variant={["dashboard", "relatorios"].includes(section) ? "dashboard" : "table"} count={6} label="Carregando painel…" />}{error && <button className="btn-ghost" onClick={refresh}>Tentar novamente</button>}</main>;
  async function request(body, logout = false) {
    if (busy) return false;
    setBusy(true); setActionError(''); setNotice(null);
    try {
      await communityApi('/api/admin/' + (logout ? 'logout' : section), { method: 'POST', body });
      if (logout) setResult(null);
      else {
        const messages = { usuarios: body.action === 'block' ? 'Usuário bloqueado.' : 'Usuário desbloqueado.', chat: 'Mensagem enviada.', verificacoes: 'Cadastro marcado como revisado.', administradores: body.action === 'grant' ? 'Acesso concedido.' : 'Acesso revogado.' };
        setNotice({ section, text: messages[section] });
      }
      refresh(); return true;
    } catch (e) {
      if (e.status === 401) { setResult(null); refresh(); }
      else setActionError(e.message);
      return false;
    } finally { setBusy(false); }
  }
  return <main className={'admin-shell' + (collapsed ? ' is-compact' : '')}>
    <aside className="admin-rail"><div className="admin-identity"><span className="admin-shield"><Avatar src={data.admin.avatarUrl}><Icon name="administradores" /></Avatar></span><div><strong>{data.admin.name}<ReviewBadge reviewed={data.admin.reviewed} /></strong><small>Administrador</small></div></div>
      <button className="admin-toggle" type="button" aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'} aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>{collapsed ? '›' : '‹'}</button>
      {[Object.keys(sections).slice(0, 4), Object.keys(sections).slice(4)].map((group, index) => <nav key={index} aria-label={index ? 'Registros' : 'Administração'}>{index === 1 && <h2>Registros</h2>}
        {group.map(key => <Link to={'/admin/' + key} key={key} aria-label={sections[key][0]} title={sections[key][1]} aria-current={section === key ? 'page' : undefined}><Icon name={key} /><span>{sections[key][0]}</span></Link>)}</nav>)}
    </aside>
    <section className="admin-work"><div className="admin-top"><Logo /><button className="btn-ghost" disabled={busy} onClick={() => request({}, true)}>Sair do painel</button></div>
      <header><p className="auth-eyebrow">{Object.keys(sections).indexOf(section) > 3 ? 'REGISTROS' : 'ADMINISTRAÇÃO'}</p><h1>{sections[section][0]}</h1><p>{sections[section][1]}</p></header>
      <Panel key={section} section={section} data={data} page={data.page || page} onPage={p => setParams({ page: String(p) })} busy={busy} request={request} />
      <p role="status" className="auth-status">{notice?.section === section && notice.text}</p><p role="alert" className="auth-error">{actionError}</p><button className="admin-refresh" onClick={refresh}>Atualizar dados ↻</button>
    </section></main>;
}
