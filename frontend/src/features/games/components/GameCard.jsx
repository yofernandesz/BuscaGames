import FavoriteButton from "./FavoriteButton";
import { useNavigate } from "react-router-dom";
import Price from "./Price";
import { useGames } from "../hooks/useGames";
import StarRating from "./StarRating";
import GameImage from "./GameImage";
import GenreTags from "./GenreTags";

export default function GameCard({ game }) {
  const navigate = useNavigate();
  const { rateGame, accountLoading } = useGames();

  return (
    <article className="card">
      <div className="card-cover">
        {game.cover ? (
          <GameImage src={game.cover} alt={`Capa do jogo ${game.title}`} loading="lazy" />
        ) : (
          <div className="details-cover-empty">Sem capa</div>
        )}
        <FavoriteButton game={game} />
      </div>
      <div className="card-body">
        <h2 className="card-title">{game.title}</h2>
        <GenreTags game={game} />
        {game.source && <p className="catalog-note">
          {game.type} · {game.releaseDate || "Data não informada"}<br />
          {game.platforms?.join(", ") || "Plataformas não informadas"}<br />
          {game.sourceRating == null ? "IGDB: sem nota" : `IGDB: ${game.sourceRating.toFixed(1)}/100 (${game.sourceRatingCount} avaliações)`}
          {Boolean(game.metric?.samples) && <><br />{game.metric.samples} amostra(s) diária(s) de interesse</>}
          {game.metric?.kind === "weekly" && game.metric.measuredAt && <><br />
            Coleta: {new Date(game.metric.measuredAt).toLocaleString("pt-BR")}
            {game.metric.stale && " · Atualização pendente"}
          </>}
          {game.metric?.source === "Steam via IGDB" && <><br />
            <a href="https://store.steampowered.com/charts/mostplayed" target="_blank" rel="noreferrer">Steam · pico em 24h via IGDB ↗</a><br />
            Coleta: {new Date(game.metric.measuredAt).toLocaleString("pt-BR")}
            {game.metric.stale && " · Atualização pendente"}
          </>}
        </p>}
        <div className="card-modes">
          {game.modes.map((mode) => (
            <span className="mode-chip" key={mode}>
              {mode}
            </span>
          ))}
        </div>
        <StarRating
          disabled={accountLoading}
          compact
          label="Sua avaliação"
          name={`card-rating-${game.id}`}
          value={game.rating}
          onChange={(rating) => rateGame(game.id, rating)}
        />
        <div className="card-footer">
          <Price game={game} />
          <button
            className="btn-details"
            type="button"
            onClick={() => navigate(`/jogo/${game.id}`)}
          >
            Ver detalhes
          </button>
        </div>
      </div>
    </article>
  );
}
