import Skeleton from "../../../components/ui/Skeleton";
import ReviewBadge from "../../../components/ui/ReviewBadge";
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import Account from "../components/Account";
import Avatar from "../../../components/ui/Avatar";
import ProfileSocialStats from "../../../components/ui/ProfileSocialStats";
import { useCommunityQuery } from "../../../hooks/useCommunityQuery";
import ProfilePhotoEditor from "../components/ProfilePhotoEditor";
import ProfileBackground from "../../../components/ui/ProfileBackground";
import Header from "../../../components/layout/Header";
import { useGames } from "../../games/hooks/useGames";
import "../styles/profile.css";

function ProfileConnections({ id }) {
  const query = useCommunityQuery(`/api/users/${id}`);
  return <div className="profile-connections" aria-busy={query.loading}>
    {query.loading ? <Skeleton variant="stats" count={3} label="Carregando conexões…" />
      : query.error ? <div className="profile-connections-status" role="alert"><p>{query.error}</p><button className="btn-ghost" onClick={query.retry}>Tentar novamente</button></div>
        : query.data?.profile && <ProfileSocialStats profile={query.data.profile} personal />}
  </div>;
}

export default function Perfil({ onCookieSettings }) {
  const heading = useRef(null);
  const { favorites, ratings, user, accountLoading } = useGames();
  const rated = Object.entries(ratings).filter(([, rating]) => rating > 0);
  const favoriteCount = new Set(favorites).size;
  const total = new Set([...favorites, ...rated.map(([id]) => id), ...(user?.commentGameIds || [])]).size;
  const average = rated.length
    ? (rated.reduce((sum, [, rating]) => sum + rating, 0) / rated.length).toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })
    : "—";

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Perfil — BuscaGames";
    heading.current?.focus({ preventScroll: true });
    return () => { document.title = previousTitle; };
  }, []);

  return <>
    <Header />
    <main className="profile-page">
      <div className="profile-heading">
        <div><p className="profile-eyebrow">SEU ESPAÇO NO BUSCAGAMES</p><h1 ref={heading} tabIndex={-1}>Perfil<span aria-hidden="true">.</span></h1></div>
        <span className="profile-preview">{accountLoading ? "Consultando sessão…" : user ? "Sessão iniciada" : "Sem sessão iniciada"}</span>
      </div>

      {accountLoading ? <Skeleton variant="profile" label="Carregando perfil…" /> : <><section className="profile-pass" aria-labelledby="player-name">
        <div className="profile-identity">
          <ProfileBackground src={user?.backgroundUrl} />
          <div className="profile-cover-header">
          <div className="profile-avatar-wrap">
            <div className="profile-avatar" aria-hidden="true">
            <Avatar src={user?.avatarUrl}><svg viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M32 36h36c8 0 12 7 14 15l4 17c2 10-8 15-14 8L61 65H39L28 76c-6 7-16 2-14-8l4-17c2-8 6-15 14-15Z" /><path d="M29 51v14m-7-7h14M46 36v-8h11v-8" /><circle cx="66" cy="51" r="2" /><circle cx="74" cy="60" r="2" /></svg></Avatar>
            </div>
            {user && <label className="profile-avatar-picker" htmlFor="profile-photo-file" title="Escolher foto de perfil">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 7h4l2-3h6l2 3h4v13H3z" /><circle cx="12" cy="13" r="3.5" /></svg>
              <span className="sr-only">Escolher foto de perfil</span>
            </label>}
          </div>
          {user && <ProfilePhotoEditor key={`background-${user.id}`} background />}
          </div>
          <div><p className="profile-eyebrow">CARTÃO DE JOGADOR{user ? ` / #${user.id}` : ''}</p><h2 id="player-name">{user ? <Link className="profile-name-link" to={`/perfil/${user.id}`}>{user.name}</Link> : "Jogador visitante"}<ReviewBadge reviewed={user?.reviewed} /></h2><p className="profile-identity-copy">Cada jogo diz um pouco sobre você.<br />Sua próxima descoberta começa aqui.</p></div>
          {user && <ProfileConnections key={`connections-${user.id}`} id={user.id} />}
          {user && <ProfilePhotoEditor key={user.id} />}
          <div className="profile-pass-footer"><span>BUSCAGAMES / PLAYER</span><span>{user ? "Biblioteca da conta" : "Visitante"}</span></div>
        </div>
        <div className="profile-welcome">
          <span className="profile-eyebrow">UM LUGAR PARA O SEU LADO GAMER</span>
          <h2>Os jogos mudam.<br />E <em>você?</em></h2>
          <p>Guarde os que marcaram você, dê sua nota e encontre o próximo favorito. Este é o ponto de encontro da sua jornada.</p>
          <Link className="btn-ghost" to="/biblioteca">Abrir minha biblioteca <span aria-hidden="true">↗</span></Link>
          {user && <Link className="btn-ghost" to={`/perfil/${user.id}`}>Ver meu perfil público <span aria-hidden="true">↗</span></Link>}
          {user && <Link className="btn-ghost" to="/comunidade">Explorar comunidade <span aria-hidden="true">↗</span></Link>}
        </div>
      </section>

      <section className="profile-collection" aria-labelledby="collection-title">
        <div className="profile-section-heading"><h2 id="collection-title">Sua marca no catálogo</h2><span>{user ? "Favoritos e avaliações da conta" : "Registros antigos deste navegador"}</span></div>
        <dl className="profile-stats">
          <div><dt>Jogos na biblioteca</dt><dd>{total.toLocaleString("pt-BR")}</dd><Link to="/biblioteca">Ver todos os jogos <span aria-hidden="true">↗</span></Link></div>
          <div><dt>Favoritos</dt><dd>{favoriteCount.toLocaleString("pt-BR")}<span aria-hidden="true">♡</span></dd><Link to="/biblioteca?filtro=favoritos">Ver favoritos <span aria-hidden="true">↗</span></Link></div>
          <div><dt>Jogos avaliados</dt><dd>{rated.length.toLocaleString("pt-BR")}<span aria-hidden="true">☆</span></dd><Link to="/biblioteca?filtro=avaliados">Ver avaliações <span aria-hidden="true">↗</span></Link></div>
          <div><dt>Sua nota média</dt><dd>{average}<small>/ 5</small></dd><Link to="/biblioteca?filtro=avaliados&ordem=nota">Ver jogos por nota <span aria-hidden="true">↗</span></Link></div>
        </dl>
      </section>

      <div className="profile-bottom">
        <section className="profile-account" aria-labelledby="account-title">
          <div className="profile-section-heading"><h2 id="account-title">Informações da conta</h2></div>
          <Account />
        </section>
        <aside className="profile-next" aria-labelledby="next-title">
          <span className="profile-eyebrow">{total ? "A DESCOBERTA CONTINUA" : "SUA JORNADA COMEÇA AQUI"}</span>
          <h2 id="next-title">{total ? "Sempre cabe mais um favorito." : "Todo jogador tem um primeiro favorito."}</h2>
          <p>{total ? "Volte ao catálogo. Seu próximo grande jogo pode estar a uma descoberta de distância." : "Explore o catálogo e toque no coração de um jogo. Ele passa a fazer parte da sua biblioteca."}</p>
          <Link className="btn-details" to="/">Explorar jogos <span aria-hidden="true">↗</span></Link>
          <div className="profile-privacy"><Link to="/privacidade">Privacidade e seus dados</Link><button type="button" onClick={onCookieSettings}>Preferências de cookies</button></div>
        </aside>
      </div>
      </>}
    </main>
  </>;
}
