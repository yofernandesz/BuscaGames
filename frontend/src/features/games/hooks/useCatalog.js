import { useEffect, useState } from "react";
import { useGames } from "./useGames";

export async function readCatalog(path, signal) {
  if (import.meta.env.VITE_GITHUB_PAGES === 'true') throw new Error('Esta publicação apresenta apenas o frontend. O catálogo de jogos depende do backend e não está disponível no GitHub Pages.');
  const response = await fetch(path, { signal });
  if (!response.ok) throw new Error(response.status === 404 ? "Jogo não encontrado." : "Catálogo temporariamente indisponível.");
  return response.json();
}

export function useCatalog(path) {
  const { rememberGames } = useGames();
  const [result, setResult] = useState({ data: null, error: "", path: "" });
  useEffect(() => {
    const controller = new AbortController();
    let nextRefresh;
    const refresh = () => readCatalog(path, controller.signal).then((data) => {
      if (controller.signal.aborted) return;
      const games = data.sections
        ? [...data.catalog.games, ...data.sections.flatMap((section) => section.games)]
        : data.games || [data];
      rememberGames(games);
      setResult({ data, error: "", path });
      nextRefresh = setTimeout(refresh, games.some((game) => game.priceStatus === "pending") ? 15000
        : games.some((game) => ["error", "stale"].includes(game.priceStatus)) || /^\/api\/games\/igdb-\d+(?:\?|$)/.test(path) ? 60000 : 5 * 60 * 1000);
    }).catch((error) => {
      if (!controller.signal.aborted) {
        setResult((current) => ({ data: current.path === path ? current.data : null, error: error.message, path }));
        nextRefresh = setTimeout(refresh, 60000);
      }
    });
    const timeout = setTimeout(refresh, path.includes("q=") ? 300 : 0);
    return () => { controller.abort(); clearTimeout(timeout); clearTimeout(nextRefresh); };
  }, [path, rememberGames]);
  return result.path === path ? { ...result, loading: false } : { data: null, error: "", loading: true };
}
