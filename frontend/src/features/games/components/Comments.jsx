import Skeleton from "../../../components/ui/Skeleton";
import ReviewBadge from "../../../components/ui/ReviewBadge";
import Avatar from "../../../components/ui/Avatar";
import SocialButton from "../../../components/ui/SocialButton";
import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useGames } from '../hooks/useGames';
import { communityApi } from '../../../lib/communityApi';
import '../styles/comments.css';

export default function Comments({ gameId, compact = false }) {
  const { user, revision, updateUser, accountLoading } = useGames();
  const [open, setOpen] = useState(!compact);
  return <section className="comments" aria-label="Comentários do jogo">
    {compact ? <button type="button" className="btn-ghost" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Ocultar comentários' : 'Ver comentários'}</button> : <h2>Comentários da comunidade</h2>}
    {open && <CommentList key={gameId} gameId={gameId} user={user} revision={revision} updateUser={updateUser} accountLoading={accountLoading} />}
  </section>;
}

function CommentList({ gameId, user, revision, updateUser, accountLoading }) {
  const { requestLogin } = useGames();
  const fieldId = useId();
  const [items, setItems] = useState([]);
  const [own, setOwn] = useState(null);
  const [next, setNext] = useState(null);
  const [loadedKey, setLoadedKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [editVersion, setEditVersion] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [retry, setRetry] = useState(0);
  const invalid = !draft.trim() || draft.length > 500;
  const path = `/api/games/${gameId}/comments`;
  const requestKey = `${path}:${revision}:${retry}:${user?.id || 0}`;
  const loading = loadedKey !== requestKey;

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setError('');
      try {
        const data = await communityApi(path, { signal: controller.signal });
        if (!Array.isArray(data.comments)) throw new Error('Resposta inválida. Tente carregar os comentários novamente.');
        if (!controller.signal.aborted) { setItems(data.comments); setOwn(data.own); setNext(data.nextCursor); }
      } catch (err) { if (!controller.signal.aborted) setError(err.message); }
      finally { if (!controller.signal.aborted) setLoadedKey(requestKey); }
    }
    load();
    return () => controller.abort();
  }, [path, requestKey]);

  async function more() {
    setBusy(true); setError('');
    try {
      const data = await communityApi(`${path}?before=${next}`);
      setItems((current) => [...current, ...data.comments.filter((item) => !current.some((old) => old.id === item.id))]); setNext(data.nextCursor);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function save(event, remove = false) {
    event.preventDefault();
    if (!user) { requestLogin('comment'); return; }
    if (busy || (!remove && invalid)) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const data = await communityApi(own ? `/api/comments/${own.id}` : path, {
        method: remove ? 'DELETE' : own ? 'PATCH' : 'POST', body: { body: draft, version: remove ? own?.version : editVersion },
      });
      setDraft(''); setEditing(false); setDeleting(false); updateUser(data.user, user.id);
      setMessage(remove ? 'Comentário excluído.' : own ? 'Comentário atualizado.' : 'Comentário publicado.');
    } catch (err) {
      if (err.status === 401) { updateUser(null); requestLogin('comment', 'Sua sessão expirou. Entre novamente; seu texto continua aqui.'); }
      setError(err.message);
    }
    finally { setBusy(false); }
  }

  return <div className="comment-list" aria-busy={loading || busy}>
    {accountLoading ? <Skeleton variant="rows" count={1} label="Consultando sessão…" /> : !user ? <div className="comment-login"><p>Sua experiência também faz parte deste jogo.</p><button type="button" className="btn-ghost" onClick={() => requestLogin('comment')}>Adicionar comentário</button></div> : !loading && (!own || editing) && <form className="community-form" noValidate onSubmit={save}>
      <label htmlFor={fieldId}>{own ? 'Editar seu comentário' : 'Sua opinião sobre o jogo'}</label>
      <textarea className="resize-none" id={fieldId} value={draft} maxLength={500} rows={5} disabled={busy} aria-describedby={`${fieldId}-count`} onChange={(event) => setDraft(event.target.value)} />
      <span id={`${fieldId}-count`} aria-live="polite">{draft.length}/500 caracteres</span>
      <div className="comment-actions"><button className="btn-details" disabled={busy || invalid}>{busy ? 'Salvando…' : own ? 'Salvar comentário' : 'Publicar comentário'}</button>
        {own && <button className="btn-ghost" type="button" disabled={busy} onClick={() => { setEditing(false); setDraft(''); }}>Cancelar edição</button>}</div>
    </form>}
    {user && own && !editing && <div className="own-comment">
      <h3>Seu comentário</h3><CommentBody key={`${own.id}:${user?.id}:${own.liked}:${own.likeCount}`} item={own} />
      {deleting ? <div><p>Excluir seu comentário deste jogo? Esta ação não pode ser desfeita.</p><div className="comment-actions">
        <button className="btn-ghost" disabled={busy} onClick={() => setDeleting(false)}>Cancelar exclusão</button>
        <button className="btn-ghost" disabled={busy} onClick={(event) => save(event, true)}>Confirmar exclusão</button>
      </div></div> : <div className="comment-actions"><button className="btn-ghost" disabled={busy || loading} onClick={() => { setEditing(true); setEditVersion(own.version); setDraft(own.body); }}>Editar comentário</button><button className="btn-ghost" disabled={busy || loading} onClick={() => setDeleting(true)}>Excluir comentário</button></div>}
    </div>}
    <p role="status">{message}</p>
    {error && <p role="alert">{error} <button className="btn-ghost" disabled={busy} onClick={() => setRetry((value) => value + 1)}>Recarregar comentários</button></p>}
    {loading ? <Skeleton variant="rows" label="Carregando comentários…" /> : !error && !items.length && <p>Nenhum comentário ainda. Compartilhe sua opinião sobre este jogo.</p>}
    <ol className="comment-items">{items.filter((item) => item.id !== own?.id).map((item) => <li key={item.id}><CommentBody key={`${item.id}:${user?.id}:${item.liked}:${item.likeCount}`} item={item} /></li>)}</ol>
    {next && <button className="btn-ghost" disabled={loading || busy} onClick={more}>{busy ? 'Carregando…' : 'Carregar mais comentários'}</button>}
  </div>;
}

function CommentBody({ item }) {
  const { user, accountLoading, requestLogin, updateUser } = useGames();
  const [reaction, setReaction] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const liked = Boolean(reaction?.liked ?? item.liked);
  const count = reaction?.likeCount ?? item.likeCount ?? 0;
  async function like() {
    if (!user) { requestLogin(); return; }
    if (busy) return;
    setBusy(true); setError('');
    try {
      const data = await communityApi(`/api/comments/${item.id}/like`, { method: 'PUT', body: { liked: !liked } });
      setReaction(data);
      return data.liked;
    }
    catch (err) {
      if (err.status === 401) { updateUser(null); requestLogin('account', 'Sua sessão expirou. Entre novamente para continuar.'); }
      setError(err.message);
    } finally { setBusy(false); }
  }
  return <><div className="comment-meta"><Link className="comment-author" to={`/perfil/${item.userId}`}><Avatar src={item.avatarUrl} /><strong>{item.author}<ReviewBadge reviewed={item.reviewed} /></strong></Link><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString('pt-BR')}</time>{item.rating != null && <span>Nota: {item.rating}/5</span>}</div><p className="comment-text">{item.body}</p>
    <SocialButton kind="like" active={liked} busy={busy} disabled={accountLoading} count={count} onActivate={like} />
    <span className="sr-only" role="status">{reaction ? liked ? 'Curtida adicionada.' : 'Curtida removida.' : ''}</span>
    {error && <p role="alert">{error}</p>}
    <CommentReplies key={user?.id || 'guest'} commentId={item.id} author={item.author} />
  </>;
}

function CommentReplies({ commentId, author }) {
  const { user, accountLoading, requestLogin } = useGames();
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const path = `/api/comments/${commentId}/replies`;
  const length = Array.from(draft).length;

  async function load(more = false) {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const result = await communityApi(more ? `${path}?after=${data.nextCursor}` : path);
      setData(current => ({ ...result, replies: more ? [...current.replies, ...result.replies.filter(reply => !current.replies.some(old => old.id === reply.id))] : result.replies }));
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function submit(event) {
    event.preventDefault();
    if (busy || !draft.trim() || length > 35 || data.ownCount >= 2) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await communityApi(path, { method: 'POST', body: { body: draft } });
      setData(current => ({ ...current, ownCount: result.ownCount, replies: [...current.replies, result.reply] }));
      setDraft(''); setMessage('Resposta publicada.');
    } catch (err) {
      if (err.status === 401) requestLogin('comment', 'Sua sessão expirou. Entre novamente para responder.');
      if (err.status === 409) setData(current => ({ ...current, ownCount: 2 }));
      setError(err.message);
    } finally { setBusy(false); }
  }

  return <div className="comment-replies">
    <button type="button" className="btn-ghost" aria-expanded={open} aria-controls={`${fieldId}-thread`} onClick={() => {
      setOpen(!open);
      if (!open && !data) load();
    }}>{open ? 'Ocultar respostas' : 'Responder / ver respostas'}</button>
    {open && <div id={`${fieldId}-thread`} className="comment-thread" aria-busy={busy}>
      {data && <>
        <ol className="comment-items">{[...data.replies].sort((a, b) => a.id - b.id).map(reply => <li key={reply.id}>
          <div className="comment-meta"><Link className="comment-author" to={`/perfil/${reply.userId}`}>{reply.author}</Link><time dateTime={reply.createdAt}>{new Date(reply.createdAt).toLocaleString('pt-BR')}</time></div>
          <p className="comment-text">{reply.body}</p>
        </li>)}</ol>
        {!data.replies.length && <p>Ainda não há respostas.</p>}
        {data.nextCursor && <button type="button" className="btn-ghost" disabled={busy} onClick={() => load(true)}>Carregar mais respostas</button>}
        {!user ? <button type="button" className="btn-ghost" disabled={accountLoading} onClick={() => requestLogin('comment')}>Entrar para responder</button>
          : data.ownCount >= 2 ? <p role="status">Você já enviou duas respostas a este comentário.</p>
            : <form className="community-form" noValidate onSubmit={submit}>
              <label htmlFor={fieldId}>Responder a {author}</label>
              <input id={fieldId} value={draft} disabled={busy} aria-describedby={`${fieldId}-hint`} onChange={event => setDraft(event.target.value)} />
              <span id={`${fieldId}-hint`} aria-live="polite">{length}/35 caracteres · {data.ownCount}/2 respostas</span>
              <button className="btn-details" disabled={busy || !draft.trim() || length > 35}>{busy ? 'Enviando…' : 'Publicar resposta'}</button>
            </form>}
      </>}
      {busy && !data ? <Skeleton variant="rows" count={2} label="Carregando respostas…" /> : busy && <p role="status">Carregando…</p>}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error} {!data && <button type="button" className="btn-ghost" disabled={busy} onClick={() => load()}>Tentar novamente</button>}</p>}
    </div>}
  </div>;
}
