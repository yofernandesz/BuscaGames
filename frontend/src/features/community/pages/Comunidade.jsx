import Skeleton from "../../../components/ui/Skeleton";
import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import Header from '../../../components/layout/Header';
import ProfileSocialStats from '../../../components/ui/ProfileSocialStats';
import { useCommunityQuery } from '../../../hooks/useCommunityQuery';
import Avatar from '../../../components/ui/Avatar';
import ReviewBadge from '../../../components/ui/ReviewBadge';
import ProfileBackground from '../../../components/ui/ProfileBackground';
import SocialButton from '../../../components/ui/SocialButton';
import EmptyState from '../../../components/ui/EmptyState';
import GameImage from '../../games/components/GameImage';
import { communityApi } from '../../../lib/communityApi';
import { useGames } from '../../games/hooks/useGames';
import '../styles/community.css';
import '../../games/styles/library.css';

function QueryState({ query, empty, children, variant = "players" }) {
  if (query.loading) return <Skeleton variant={variant} label="Carregando…" />;
  if (query.error) return <div className="community-status" role="alert"><p>{query.error}</p><button className="btn-ghost" onClick={query.retry}>Tentar novamente</button></div>;
  if (empty) return <EmptyState glyph="◇" title="Nada por aqui ainda." hint={empty} />;
  return children;
}

function Pagination({ data, onPage }) {
  if (!data || data.pages <= 1) return null;
  return <nav className="community-pagination" aria-label="Paginação">
    <button className="btn-ghost" disabled={data.page <= 1} onClick={() => onPage(data.page - 1)}>Anterior</button>
    <span role="status">Página {data.page} de {data.pages}</span>
    <button className="btn-ghost" disabled={data.page >= data.pages} onClick={() => onPage(data.page + 1)}>Próxima</button>
  </nav>;
}

function FollowButton({ profile, onChange }) {
  const { user, accountLoading, requestLogin, updateUser } = useGames();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  if (user?.id === profile.id) return <Link className="btn-ghost" to="/perfil">Meu perfil</Link>;
  async function follow() {
    if (!user) { requestLogin(); return; }
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const data = await communityApi(`/api/users/${profile.id}/follow`, { method: 'PUT', body: { following: !profile.isFollowing } });
      onChange(data.profile);
      setMessage(data.profile.isFollowing ? `Você está seguindo ${profile.name}.` : `Você deixou de seguir ${profile.name}.`);
      return Boolean(data.profile.isFollowing);
    } catch (err) {
      if (err.status === 401) { updateUser(null); requestLogin('account', 'Sua sessão expirou. Entre novamente para continuar.'); }
      setError(err.message);
    } finally { setBusy(false); }
  }
  return <div className="community-follow">
    <SocialButton kind="follow" active={profile.isFollowing} busy={busy} disabled={accountLoading} onActivate={follow} />
    <span className="sr-only" role="status">{message}</span>
    {error && <p role="alert">{error}</p>}
  </div>;
}

function PlayerList({ query, onFollowChange }) {
  const { user } = useGames();
  return <QueryState query={query} empty={query.data?.users.length === 0 ? 'Encontre jogadores na comunidade ou experimente outro nome.' : ''}>
    <div className="community-players">{query.data?.users.map(player => <article className="community-player" key={player.id}>
      <Link className="community-player-link" to={`/perfil/${player.id}`}>
        <span className="community-avatar"><Avatar src={player.avatarUrl}><span aria-hidden="true">◇</span></Avatar></span>
        <div><h2>{player.name}<ReviewBadge reviewed={player.reviewed} /></h2><span>{player.favoriteCount} favoritos · {player.ratingCount} avaliados</span></div>
      </Link>
      <p>{player.followerCount} seguidores</p>
      <FollowButton key={user?.id || 0} profile={player} onChange={next => { query.update(data => ({ ...data, users: data.users.map(item => item.id === next.id ? next : item) })); onFollowChange?.(); }} />
    </article>)}</div>
  </QueryState>;
}

export default function Comunidade() {
  const [params, setParams] = useSearchParams();
  const input = useRef(null);
  const heading = useRef(null);
  const q = params.get('q') || '';
  const page = params.get('page') || '1';
  const query = useCommunityQuery(`/api/users?${new URLSearchParams({ q, page })}`);
  useEffect(() => { input.current.value = q; }, [q]);
  useEffect(() => { document.title = 'Comunidade — BuscaGames'; heading.current?.focus({ preventScroll: true }); }, []);
  return <><Header /><main className="community-page">
    <div className="community-heading"><p className="catalog-eyebrow">GOSTOS DIFERENTES. NOVAS DESCOBERTAS.</p><h1 ref={heading} tabIndex={-1}>Comunidade<span>.</span></h1><p>Encontre jogadores, visite suas bibliotecas e acompanhe quem joga como você.</p></div>
    <form className="community-search" role="search" noValidate onSubmit={event => { event.preventDefault(); setParams(input.current.value.trim() ? { q: input.current.value.trim() } : {}); }}>
      <label htmlFor="player-search">Buscar jogadores por nome</label>
      <div><input ref={input} id="player-search" type="search" maxLength={120} defaultValue={q} placeholder="Nome do jogador" onKeyDown={event => { if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault(); }} />
        <button type="button" className="btn-ghost community-search-clear" aria-label="Limpar busca de jogadores" onClick={() => { input.current.value = ''; setParams({}); input.current.focus(); }}>×</button>
        <button className="btn-details">Buscar</button></div>
    </form>
    <PlayerList query={query} />
    {!query.loading && !query.error && <Pagination data={query.data} onPage={value => setParams({ ...(q ? { q } : {}), page: String(value) })} />}
  </main></>;
}

export function PerfilPublico() {
  const { id } = useParams();
  const { user } = useGames();
  // Remount on identity changes so pending actions cannot update a different profile.
  return <PublicProfile key={`${id}:${user?.id || 0}`} id={id} />;
}

function PublicProfile({ id }) {
  const [params, setParams] = useSearchParams();
  const { user } = useGames();
  const heading = useRef(null);
  const profileQuery = useCommunityQuery(`/api/users/${encodeURIComponent(id)}`);
  const profile = profileQuery.data?.profile;
  const tab = ['followers', 'following', 'comments', 'likes'].includes(params.get('aba')) ? params.get('aba') : 'library';
  const filter = ['favorites', 'rated'].includes(params.get('filtro')) ? params.get('filtro') : 'all';
  const page = params.get('page') || '1';
  const collection = useCommunityQuery(`/api/users/${encodeURIComponent(id)}/${tab}?${new URLSearchParams({ page, filter })}`);
  useEffect(() => {
    document.title = `${profile?.name || (profileQuery.error ? 'Perfil indisponível' : 'Carregando perfil')} — BuscaGames`;
    heading.current?.focus({ preventScroll: true });
  }, [profile?.name, profileQuery.error]);
  return <><Header /><main className="community-page">
    <Link className="community-back" to="/comunidade">← Comunidade</Link>
    <QueryState query={profileQuery} variant="profile">
      {profile && <>
        <section className="community-profile" aria-labelledby="public-name">
          <span className="community-avatar"><Avatar src={profile.avatarUrl}><span aria-hidden="true">◇</span></Avatar></span>
          <div><p className="catalog-eyebrow">CARTÃO DE JOGADOR / #{profile.id}</p><h1 id="public-name" ref={heading} tabIndex={-1}>{profile.name}<ReviewBadge reviewed={profile.reviewed} /></h1><p>Os favoritos e as opiniões de quem joga.</p></div>
          <FollowButton profile={profile} onChange={next => profileQuery.update(() => ({ profile: next }))} />
          <dl className="community-stats">
            <div><dt>Favoritos</dt><dd><Link to="?filtro=favorites">{profile.favoriteCount}<span className="sr-only"> Ver favoritos</span><span aria-hidden="true"> ↗</span></Link></dd></div>
            <div><dt>Avaliados</dt><dd><Link to="?filtro=rated">{profile.ratingCount}<span className="sr-only"> Ver avaliados</span><span aria-hidden="true"> ↗</span></Link></dd></div>
            <div><dt>Nota média</dt><dd><Link to="?filtro=rated">{profile.averageRating == null ? '—' : `${profile.averageRating.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} / 5`}<span className="sr-only"> Ver notas</span><span aria-hidden="true"> ↗</span></Link></dd></div>
            <div><dt>Comentários</dt><dd><Link to="?aba=comments">{profile.commentCount?.toLocaleString('pt-BR') ?? '—'}<span className="sr-only"> Ver comentários</span><span aria-hidden="true"> ↗</span></Link></dd></div>
          </dl>
          <ProfileSocialStats profile={profile} />
          <ProfileBackground src={profile.backgroundUrl} />
        </section>
        {user?.id === profile.id && <p className="community-note">Este é o seu perfil público. Nome, foto, plano de fundo, favoritos, notas e conexões podem ser vistos por outras pessoas. <Link to="/perfil">Editar meu perfil</Link> · <Link to="/biblioteca">Editar minha biblioteca</Link></p>}
        <nav className="community-tabs" aria-label="Conteúdo do perfil">
          {[['library', 'Biblioteca'], ['followers', `Seguidores (${profile.followerCount})`], ['following', `Seguindo (${profile.followingCount})`], ['likes', 'Curtidas recebidas'], ['comments', 'Comentários']].map(([value, label]) => <Link key={value} aria-current={tab === value ? 'page' : undefined} to={value === 'library' ? '?' : `?aba=${value}`}>{label}</Link>)}
        </nav>
        <div className="community-content" key={`${tab}:${filter}:${page}`}>
        {tab === 'library' ? <>
          <div className="library-filters" role="group" aria-label="Filtrar biblioteca pública">{[['all', 'Todos'], ['favorites', 'Favoritos'], ['rated', 'Avaliados']].map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => setParams(value === 'all' ? {} : { filtro: value })}>{label}</button>)}</div>
          <QueryState query={collection} variant="library" empty={collection.data?.games?.length === 0 ? 'Este jogador ainda não tem jogos nesta seleção.' : ''}>
            <div className="library-grid community-library">{collection.data?.games?.map(game => <article className="library-card" key={game.id}>
              <Link className="library-cover" to={`/jogo/${game.id}`} aria-label={`Ver detalhes de ${game.title}`}><GameImage src={game.cover} alt={`Capa de ${game.title}`} loading="lazy" /></Link>
              <div className="library-card-body"><h2><Link to={`/jogo/${game.id}`}>{game.title}</Link></h2><p className="library-platform">{game.platforms?.join(' · ') || 'Plataforma não informada'}</p><p>{game.favorite ? '♥ Favorito' : 'Jogo avaliado'}</p><p className="community-rating">{game.rating ? `Nota de ${profile.name}: ${game.rating}/5` : 'Ainda não avaliado'}</p><Link className="library-details" to={`/jogo/${game.id}#comentarios`}>Conversar sobre o jogo <span aria-hidden="true">↗</span></Link></div>
            </article>)}</div>
          </QueryState>
        </> : ['comments', 'likes'].includes(tab) ? <>
          <div className="profile-section-heading"><h2>{tab === 'likes' ? 'Comentários que receberam curtidas' : `Comentários de ${profile.name}`}</h2>
            {collection.data && <span>{collection.data.total.toLocaleString('pt-BR')} comentários</span>}</div>
          <QueryState query={collection} variant="rows" empty={collection.data?.comments?.length === 0 ? (tab === 'likes' ? 'Quando um comentário receber uma curtida, ele aparecerá aqui.' : 'Este jogador ainda não publicou comentários. Explore os jogos e participe das conversas.') : ''}>
            <ol className="profile-comments">{collection.data?.comments?.map(comment => <li key={comment.id}>
              <article className="profile-comment">
                <Link className="profile-comment-game" to={`/jogo/${comment.game.id}#comentarios`}>
                  <GameImage src={comment.game.cover} alt="" loading="lazy" />
                  <div><span className="profile-eyebrow">CONVERSA SOBRE</span><h3>{comment.game.title}</h3></div><span aria-hidden="true">↗</span>
                </Link>
                <p className="profile-comment-body">{comment.body}</p>
                <footer><time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleDateString('pt-BR')}</time><span className="profile-comment-likes"><span aria-hidden="true">♡</span> {comment.likeCount.toLocaleString('pt-BR')} {comment.likeCount === 1 ? 'curtida' : 'curtidas'}</span></footer>
                <Link className="profile-comment-open" to={`/jogo/${comment.game.id}#comentarios`}>Abrir conversa <span className="sr-only">sobre {comment.game.title}</span><span aria-hidden="true">↗</span></Link>
              </article>
            </li>)}</ol>
          </QueryState>
        </> : <PlayerList query={collection} onFollowChange={user?.id === profile.id ? () => { collection.retry(); profileQuery.retry(); } : undefined} />}
        {!collection.loading && !collection.error && <Pagination data={collection.data} onPage={value => setParams(current => { const next = new URLSearchParams(current); next.set('page', String(value)); return next; })} />}
        </div>
      </>}
    </QueryState>
  </main></>;
}
