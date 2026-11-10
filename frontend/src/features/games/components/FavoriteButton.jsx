import { useGames } from "../hooks/useGames";
import { useState } from 'react';

export default function FavoriteButton({ game }) {
  const { favorites, toggleFavorite, accountLoading, user } = useGames();
  const [busy, setBusy] = useState(false);
  const [burst, setBurst] = useState(0);
  const selected = favorites.includes(game.id);
  const label = `${selected ? "Remover" : "Adicionar"} ${game.title} ${selected ? "dos" : "aos"} favoritos`;

  return (
    <button
      type="button"
      className="favorite-button"
      aria-label={label}
      title={label}
      aria-pressed={selected}
      disabled={busy || accountLoading}
      aria-busy={busy}
      onClick={async () => {
        if (busy || accountLoading) return;
        if (!user) { toggleFavorite(game.id); return; }
        setBurst((current) => selected ? 0 : current + 1);
        setBusy(true);
        try { await toggleFavorite(game.id); }
        finally { setBusy(false); }
      }}
    >
      <span key={burst} className={`favorite-visual${burst ? ' is-bursting' : ''}`} aria-hidden="true">
        <span className="favorite-burst">
          {Array.from({ length: 8 }, (_, index) => (
            <span className="favorite-particle" key={index} style={{ '--particle-angle': `${index * 45}deg` }} />
          ))}
        </span>
        <svg className="favorite-heart" viewBox="0 0 24 24" width="24" height="24"
          onAnimationEnd={() => setBurst(0)}
          fill={selected ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
          <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
        </svg>
      </span>
    </button>
  );
}
