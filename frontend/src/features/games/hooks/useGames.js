import { useContext } from "react";
import { GamesContext } from "../context/GamesContext";

export function useGames() {
  const context = useContext(GamesContext);
  if (!context) {
    throw new Error("useGames deve ser usado dentro de GamesProvider");
  }
  return context;
}
