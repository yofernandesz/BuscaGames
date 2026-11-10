import Skeleton from "../../../components/ui/Skeleton";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Comments from "../components/Comments";
import Header from "../../../components/layout/Header";
import EmptyState from "../../../components/ui/EmptyState";
import FavoriteButton from "../components/FavoriteButton";
import GameImage from "../components/GameImage";
import StarRating from "../components/StarRating";
import LibraryInsights from "../components/LibraryInsights";
import { useGames } from "../hooks/useGames";
import { readCatalog } from "../hooks/useCatalog";
import { libraryValues, normalize } from "../model/gameModel";
import "../styles/library.css";

export default function Biblioteca() {
  const { games, ratings, favorites, rememberGames, rateGame, user, accountLoading } = useGames();
  const [params, setParams] = useSearchParams();
  const [settled, setSettled] = useState("");
  const [retry, setRetry] = useState(0);
  const [showInsights, setShowInsights] = useState(false);
  const input = useRef(null);
  const rated = Object.keys(ratings).filter((id) => ratings[id] > 0);
  const idsKey = JSON.stringify([...new Set([...favorites, ...rated, ...(user?.commentGameIds || [])])]);
  const ids = JSON.parse(idsKey);
  const requestKey = `${idsKey}:${retry}`;
  const loading = accountLoading || (ids.length > 0 && settled !== requestKey);
  const query = params.get("q") || "";
  const filter = ["favoritos", "avaliados", "ambos"].includes(params.get("filtro")) ? params.get("filtro") : "todos";
  const filters = Object.fromEntries(["genero", "plataforma", "ano", "nota"].map((key) => [key, params.get(key) || ""]));
  if (!/^[0-5]$/.test(filters.nota)) filters.nota = "";
  const sort = params.get("ordem") === "nota" ? "nota" : "titulo";

  useEffect(() => {
    document.title = "Minha biblioteca | BuscaGames";
    return () => { document.title = "BuscaGames"; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const savedIds = JSON.parse(idsKey);
    // Fetch saved IDs directly: the home page contains only part of the catalog.
    async function restore() {
      for (let offset = 0; offset < savedIds.length; offset += 6) {
        const results = await Promise.allSettled(savedIds.slice(offset, offset + 6).map((id) =>
          readCatalog(`/api/games/${encodeURIComponent(id)}`, controller.signal)));
        if (controller.signal.aborted) return;
        rememberGames(results.filter((result) => result.status === "fulfilled" && result.value?.id && result.value?.title).map((result) => result.value));
      }
      if (!controller.signal.aborted) setSettled(`${idsKey}:${retry}`);
    }
    restore();
    return () => controller.abort();
  }, [idsKey, retry, rememberGames]);

  function update(key, value) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(key, value); else next.delete(key);
      return next;
    }, { replace: true });
  }

  const byId = new Map(games.map((game) => [String(game.id), game]));
  const entries = ids.map((id) => ({ id, game: byId.get(String(id)), rating: ratings[id] || 0 }));
  const unavailable = entries.filter(({ game }) => !game).length;
  const facets = [["genero", "Gênero"], ["plataforma", "Plataforma"], ["ano", "Ano de lançamento"]];
  const options = (field) => [...new Set([...entries.flatMap(({ game }) => libraryValues(game, field)), ...(filters[field] ? [filters[field]] : [])])].sort((a, b) => field === "ano" ? b.localeCompare(a, "pt-BR") : a.localeCompare(b, "pt-BR"));
  const visible = entries.filter(({ id, game, rating }) =>
    (!["favoritos", "ambos"].includes(filter) || favorites.includes(id)) && (!["avaliados", "ambos"].includes(filter) || rating > 0) &&
    (!showInsights || filters.nota === "" || rating === Number(filters.nota)) &&
    (!showInsights || facets.every(([field]) => !filters[field] || libraryValues(game, field).includes(filters[field]))) &&
    (!query.trim() || normalize(game?.title || String(id)).includes(normalize(query.trim()))))
    .sort((a, b) => (sort === "nota" ? b.rating - a.rating : 0) || (a.game?.title || String(a.id)).localeCompare(b.game?.title || String(b.id), "pt-BR"));

  return <>
    <Header />
    <main className="library">
      <section className="library-heading" aria-labelledby="library-title">
        <div>
          <p className="catalog-eyebrow">SEU ESPAÇO NO BUSCAGAMES</p>
          <h1 id="library-title">Minha <span>biblioteca</span></h1>
          <p>Os jogos que você guardou. As notas que você deu.</p>
        </div>
        <Link className="btn-ghost" to="/">Explorar catálogo <span aria-hidden="true">↗</span></Link>
      </section>
      <p className="library-storage">{user ? "Favoritos, avaliações e comentários ficam salvos na sua conta." : "Seus registros antigos deste navegador continuam aqui. Entre para favoritar, avaliar e comentar com sua conta."}</p>
      <section className="library-content" aria-label="Jogos da sua biblioteca">
        <div className="library-toolbar">
          <div className="library-filters" role="group" aria-label="Filtrar biblioteca">
            {[["todos", "Todos", ids.length], ["favoritos", "Favoritos", favorites.length], ["avaliados", "Avaliados", rated.length], ["ambos", "Favoritos avaliados", entries.filter(({ id, rating }) => favorites.includes(id) && rating > 0).length]].map(([value, label, count]) =>
              <button key={value} type="button" aria-pressed={filter === value} onClick={() => update("filtro", value === "todos" ? "" : value)}>{label} <span>{count}</span></button>)}
          </div>
          <div className="library-controls">
            <div className="library-search" role="search">
              <label htmlFor="library-query">Buscar na biblioteca</label>
              <div><input ref={input} id="library-query" type="search" value={query} maxLength={120} placeholder="Nome do jogo" onChange={(event) => update("q", event.target.value)} />
                {query && <button type="button" aria-label="Limpar busca na biblioteca" onClick={() => { update("q", ""); input.current.focus(); }}>×</button>}</div>
            </div>
            <label className="library-sort">Ordenar por<select value={sort} onChange={(event) => update("ordem", event.target.value === "titulo" ? "" : event.target.value)}><option value="titulo">Nome do jogo</option><option value="nota">Minha maior nota</option></select></label>
          </div>
          {ids.length > 0 && <button className="btn-ghost library-reset" type="button" aria-expanded={showInsights} aria-controls="library-statistics" onClick={() => setShowInsights((value) => !value)}>{showInsights ? "Ocultar estatísticas" : "Visualizar estatísticas"}</button>}
          {(query || filter !== "todos" || (showInsights && Object.values(filters).some(Boolean))) && <button className="btn-ghost library-reset" type="button" onClick={() => setParams(sort === "nota" ? { ordem: "nota" } : {})}>Limpar todos os filtros</button>}
        </div>
        <p className="library-status" role="status">{loading ? "Carregando seus jogos…" : `${visible.length} ${visible.length === 1 ? "jogo" : "jogos"} nesta seleção`}</p>
        {!loading && unavailable > 0 && <div className="library-warning" role="alert">Não foi possível carregar os detalhes de {unavailable} {unavailable === 1 ? "jogo" : "jogos"}. Seus favoritos e notas continuam salvos. <button type="button" className="btn-ghost" onClick={() => setRetry((value) => value + 1)}>Tentar novamente</button></div>}
        <div id="library-statistics" hidden={!showInsights}>
          {showInsights && ids.length > 0 && <>
            <div className="library-controls library-facets">
              {facets.map(([field, label]) => <label className="library-sort" key={field}>{label}<select value={filters[field]} onChange={(event) => update(field, event.target.value)}><option value="">Todos</option>{options(field).map((value) => <option key={value} value={value}>{value}</option>)}</select></label>)}
              <label className="library-sort">Minha nota<select value={filters.nota} onChange={(event) => update("nota", event.target.value)}><option value="">Todas</option><option value="0">Sem avaliação</option>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} {value === 1 ? "estrela" : "estrelas"}</option>)}</select></label>
            </div>
            <LibraryInsights entries={visible} favorites={favorites} filters={filters} onFilter={update} loading={loading} />
          </>}
        </div>
        {loading ? <Skeleton variant="library" count={Math.min(ids.length || 4, 6)} label="Carregando biblioteca…" /> : !ids.length ? <EmptyState glyph="♡" title="Sua biblioteca começa com um jogo." hint="No catálogo, toque no coração para guardar um favorito ou nas estrelas para dar sua nota." action={<Link className="btn-details" to="/">Encontrar meu próximo jogo</Link>} /> :
          !visible.length ? <EmptyState glyph="⌕" title="Nenhum jogo nesta seleção." hint="Experimente outro nome ou veja todos os seus jogos." action={<button className="btn-ghost" onClick={() => setParams({})}>Limpar filtros</button>} /> :
            <div className="library-grid" aria-busy={loading}>
              {visible.map(({ id, game, rating }) => <article className="library-card" key={id}>
                <Link className="library-cover" to={`/jogo/${id}`} aria-label={`Ver detalhes de ${game?.title || id}`}>
                  {game?.cover ? <GameImage src={game.cover} alt={`Capa de ${game.title}`} loading="lazy" /> : <span>{loading ? "Carregando capa…" : "Sem capa"}</span>}
                </Link>
                <div className="library-card-body">
                  <div className="library-card-heading"><h2><Link to={`/jogo/${id}`}>{game?.title || `Jogo ${id}`}</Link></h2><FavoriteButton game={game || { id, title: `Jogo ${id}` }} /></div>
                  <p className="library-platform">{game?.platforms?.join(" · ") || (game ? "Plataforma não informada" : "Detalhes aguardando consulta")}</p>
                  <StarRating disabled={accountLoading} label="Sua avaliação" name={`library-${id}`} value={rating} onChange={(value) => rateGame(id, value)} />
                  <Comments gameId={id} compact />
                  <Link className="library-details" to={`/jogo/${id}`}>Ver detalhes <span aria-hidden="true">↗</span></Link>
                </div>
              </article>)}
            </div>}
      </section>
    </main>
  </>;
}
