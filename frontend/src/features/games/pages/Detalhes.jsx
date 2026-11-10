import Skeleton from "../../../components/ui/Skeleton";
import Comments from "../components/Comments";
import FavoriteButton from "../components/FavoriteButton";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useGames } from "../hooks/useGames";
import Price from "../components/Price";
import Header from "../../../components/layout/Header";
import EmptyState from "../../../components/ui/EmptyState";
import StarRating from "../components/StarRating";
import { useCatalog } from "../hooks/useCatalog";
import GameImage from "../components/GameImage";
import GenreTags from "../components/GenreTags";

export default function Detalhes() {
  const { id } = useParams();
  const { games, rateGame } = useGames();
  const game = games.find((item) => String(item.id) === String(id));
  if (/^igdb-\d+$/.test(id)) return <RemoteDetails key={id} id={id} rateGame={rateGame} />;
  if (!game) {
    return (
      <>
        <Header />
        <main>
          <EmptyState
            glyph="?"
            title="Jogo não encontrado."
            hint="Esse título não está no catálogo."
            action={
              <Link className="btn-details" to="/">
                Voltar ao catálogo
              </Link>
            }
          />
        </main>
      </>
    );
  }

  return <GameDetails key={game.id} game={game} rateGame={rateGame} />;
}

function RemoteDetails({ id, rateGame }) {
  const { games } = useGames();
  const { data, error, loading } = useCatalog(`/api/games/${id}`);
  const game = games.find((item) => item.id === id);
  if (!data) return <><Header /><main>
    {loading ? <Skeleton variant="details" label="Carregando detalhes..." /> : <p role="alert">{error}</p>}
    <Link className="back-link" to="/">Voltar ao catálogo</Link>
  </main></>;
  return <GameDetails game={{ ...data, rating: game?.rating ?? 0 }} rateGame={rateGame} />;
}

function GameDetails({ game, rateGame }) {
  const comments = useRef(null);
  const { hash } = useLocation();
  useEffect(() => {
    if (hash === '#comentarios') { comments.current?.scrollIntoView(); comments.current?.focus({ preventScroll: true }); }
  }, [hash, game.id]);
  const { accountLoading } = useGames();
  const [previewImage, setPreviewImage] = useState("");
  const images = game.images?.length ? game.images : game.cover ? [game.cover] : [];
  const activeImage = images.includes(previewImage)
    ? previewImage
    : images.includes(game.cover)
      ? game.cover
      : images[0] || "";

  return (
    <>
      <Header />
      <main>
        <div className="details-top">
          <Link className="back-link" to="/">
            ← Voltar ao catálogo
          </Link>

        </div>

        <article className="details">
            <div className="details-media">
              <div className="details-cover">
                {activeImage ? (
                  <GameImage key={activeImage} src={activeImage} size="1080p" alt={`Imagem de ${game.title}`} />
                ) : (
                  <div className="details-cover-empty">Sem imagens</div>
                )}
              </div>
              <div className="gallery">
                {images.map((image, index) => (
                  <button
                    key={image}
                    type="button"
                    aria-label={`Ver imagem ${index + 1} de ${game.title}`}
                    aria-pressed={image === activeImage}
                    className={`gallery-thumb ${image === activeImage ? "is-active" : ""}`}
                    onClick={() => setPreviewImage(image)}
                  >
                    <GameImage src={image} size="cover_big" alt="" loading="lazy" />
                  </button>
                ))}
              </div>
            </div>
            <div className="details-body">
              <div className="details-top">
                <h1 className="details-title">{game.title}</h1>
                <FavoriteButton game={game} />
              </div>
              <GenreTags game={game} />
              <div className="card-modes">
                {game.modes.map((mode) => (
                  <span className="mode-chip" key={mode}>
                    {mode}
                  </span>
                ))}
              </div>
              <Price game={game} />
              {game.source && <section className="catalog-note" aria-label="Informações da IGDB">
                <p>{game.type} · {game.releaseDate || "Data de lançamento não informada"}</p>
                <p>Plataformas: {game.platforms?.join(", ") || "Não informadas"}</p>
                <p>{game.sourceRating == null ? "IGDB: sem nota" : `IGDB: ${game.sourceRating.toFixed(1)}/100 (${game.sourceRatingCount} avaliações)`}</p>
                <p>Empresas: {game.companies?.join(", ") || "Não informadas"}</p>
                <a href={game.sourceUrl} target="_blank" rel="noreferrer">Ver fonte na IGDB</a>
                {game.parentId && <p><Link to={`/jogo/${game.parentId}`}>Ver jogo base</Link></p>}
                {game.relatedIds?.length > 0 && <p>DLCs e expansões: {game.relatedIds.map((related, index) =>
                  <Link className="related-game" key={related} to={`/jogo/${related}`}>Conteúdo {index + 1}</Link>)}</p>}
              </section>}
              <StarRating
                disabled={accountLoading}
                label="Sua avaliação"
                name={`details-rating-${game.id}`}
                value={game.rating}
                onChange={(rating) => rateGame(game.id, rating)}
              />
              <p className="details-summary" lang="pt-BR">{game.summary || (
                game.summaryStatus === "quota" ? "A tradução aguarda a renovação da cota diária. Uma nova tentativa será feita automaticamente." :
                game.summaryStatus === "unavailable" ? "Não foi possível obter a descrição em português agora. O sistema tentará novamente automaticamente." :
                game.summaryPending ? "Descrição em português aguardando processamento automático." : "Descrição ainda não disponibilizada pela fonte."
              )}</p>
              <section className="details-description-block">
                <h2>Requisitos mínimos (PC)</h2>
                <p className="details-description" style={{ whiteSpace: "pre-line" }}>{game.pcRequirements || (
                  game.platforms?.length && !game.platforms.some((platform) => /PC|Windows|Linux|Mac/i.test(platform)) ? "Não há versão para PC informada no catálogo para este título." :
                  game.requirementsStatus === "pending" ? "Os requisitos de PC ainda aguardam consulta à fonte." :
                  game.requirementsStatus === "unavailable" ? "A consulta aos requisitos está temporariamente indisponível. Haverá uma nova tentativa automática." :
                  "Requisitos mínimos de PC não disponibilizados pela fonte."
                )}</p>
                {game.requirementsSource && <a href={game.requirementsSource} target="_blank" rel="noreferrer">Consultar requisitos na Steam ↗</a>}
                <h2>Plataformas que rodam o jogo</h2>
                <div className="card-modes">{game.platforms?.length ? game.platforms.map((platform) => <span className="mode-chip" key={platform}>{platform}</span>) : <p>Plataformas não informadas pela fonte.</p>}</div>
              </section>
            </div>
          </article>
          <div id="comentarios" ref={comments} tabIndex={-1} className="game-comments-anchor"><Comments gameId={game.id} /></div>
      </main>
    </>
  );
}
