import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { INITIAL_GAMES } from "../data/initialGames";
import { gameFromDraft, nextGameId, withDetails } from "../lib/gameModel";

const GamesContext = createContext(null);

export function GamesProvider({ children }) {
  const [games, setGames] = useState(() => INITIAL_GAMES.map(withDetails));

  const saveGame = useCallback((id, patch) => {
    setGames((current) =>
      current.map((game) => (game.id === id ? withDetails({ ...game, ...patch }) : game))
    );
  }, []);

  const addGame = useCallback((draft) => {
    let createdId = null;
    setGames((current) => {
      createdId = nextGameId(current);
      return [...current, gameFromDraft(draft, createdId)];
    });
    return createdId;
  }, []);

  const value = useMemo(
    () => ({ games, saveGame, addGame }),
    [games, saveGame, addGame]
  );

  return <GamesContext.Provider value={value}>{children}</GamesContext.Provider>;
}

export function useGames() {
  const context = useContext(GamesContext);
  if (!context) {
    throw new Error("useGames deve ser usado dentro de GamesProvider");
  }
  return context;
}
