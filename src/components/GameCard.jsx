import { useNavigate } from "react-router-dom";
import { formatPrice } from "../lib/formatPrice";

export default function GameCard({ game }) {
  const navigate = useNavigate();

  return (
    <article className="card">
      <div className="card-cover">
        {game.cover ? (
          <img src={game.cover} alt={`Capa do jogo ${game.title}`} loading="lazy" />
        ) : (
          <div className="details-cover-empty">Sem capa</div>
        )}
        <span className="genre-tag">{game.genre}</span>
      </div>
      <div className="card-body">
        <h2 className="card-title">{game.title}</h2>
        <div className="card-modes">
          {game.modes.map((mode) => (
            <span className="mode-chip" key={mode}>
              {mode}
            </span>
          ))}
        </div>
        <div className="card-footer">
          {formatPrice(game.price)}
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
