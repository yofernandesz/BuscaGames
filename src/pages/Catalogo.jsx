import { useMemo, useState } from "react";
import { useGames } from "../context/GamesContext";
import { searchGames } from "../lib/gameModel";
import Logo from "../components/Logo";
import EmptyState from "../components/EmptyState";
import GameCard from "../components/GameCard";
import NovoJogo from "../components/NovoJogo";

export default function Catalogo() {
  const { games } = useGames();
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);

  const filteredGames = useMemo(() => searchGames(games, query), [games, query]);

  return (
    <>
      <header className="header">
        <div className="header-inner">
          <Logo />

          <div className="search-wrap">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="7"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              id="searchInput"
              placeholder="Buscar por título, gênero ou modo de jogo..."
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <span className="result-count">
            {filteredGames.length > 0 && (
              <>
                <strong>{filteredGames.length}</strong>{" "}
                {filteredGames.length === 1 ? "jogo encontrado" : "jogos encontrados"}
              </>
            )}
          </span>
        </div>
      </header>

      <main>
        <div className="page-heading">
          <h1 className="page-title">Catálogo de jogos</h1>
          {!adding && (
            <button className="btn-details" type="button" onClick={() => setAdding(true)}>
              Adicionar jogo
            </button>
          )}
        </div>

        {adding && (
          <NovoJogo onCancel={() => setAdding(false)} onCreated={() => setAdding(false)} />
        )}

        <div className="games-grid">
          {filteredGames.length === 0 ? (
            <EmptyState
              hint={
                adding
                  ? "Preencha o formulário acima para publicar o primeiro jogo."
                  : "Tente buscar por outro título, gênero ou modo de jogo."
              }
            />
          ) : (
            filteredGames.map((game) => <GameCard key={game.id} game={game} />)
          )}
        </div>
      </main>
    </>
  );
}
