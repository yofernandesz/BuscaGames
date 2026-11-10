import Skeleton from "../../../components/ui/Skeleton";
import { useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import FeaturedGame from "../components/FeaturedGame";
import { useGames } from "../hooks/useGames";
import { readCatalog, useCatalog } from "../hooks/useCatalog";
import Header from "../../../components/layout/Header";
import EmptyState from "../../../components/ui/EmptyState";
import GameCard from "../components/GameCard";
import GameImage from "../components/GameImage";

const SHELF_INTROS = {
  weekly: "Descubra os títulos que despertam interesse — índice de visitas da IGDB.",
  trending: "Em alta na Steam — popularidade baseada no pico de jogadores em 24 horas.",
  retro: "Uma viagem pelas gerações que marcaram os videogames.",
  classics: "Grandes jogos que continuam valendo o seu tempo.",
  new: "Novas histórias e mundos que acabaram de chegar.",
  upcoming: "Seu próximo jogo favorito pode estar a caminho.",
};

const CATEGORY_STYLES = {
  weekly: { label: "NO RADAR", hint: "Descubra o que está despertando curiosidade.", color: "#b89aff", icon: "m12 3 2.6 5.3 5.9.9-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.2l5.9-.9Z" },
  trending: { label: "EM MOVIMENTO", hint: "Entre nos mundos que estão reunindo jogadores.", color: "#ffac87", icon: "m3 17 6-6 4 4 8-10M15 5h6v6" },
  retro: { label: "DE VOLTA AO PIXEL", hint: "Um novo encontro com a sua nostalgia.", color: "#7de4da", icon: "M7 7h10l4 4v8h-5l-2-3h-4l-2 3H3v-8ZM7 10v4m-2-2h4m6-1h.01M18 14h.01" },
  classics: { label: "ALÉM DO TEMPO", hint: "Histórias que todo jogador merece viver.", color: "#f0d28a", icon: "M8 3h8v6a4 4 0 0 1-8 0ZM8 5H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4m-4 1v5m-4 3h8m-6-3h4v3" },
  new: { label: "ACABARAM DE CHEGAR", hint: "Novos universos. A próxima descoberta é sua.", color: "#a6c3ff", icon: "m13 2-9 12h7l-1 8 10-12h-7Z" },
  upcoming: { label: "O PRÓXIMO CAPÍTULO", hint: "Dê uma espiada no que vem por aí.", color: "#f6a6d6", icon: "M8 3v4m8-4v4M3 10h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2m5 9 4 3-4 3Z" },
};

function CategoryLink({ section }) {
  const style = CATEGORY_STYLES[section.id] || CATEGORY_STYLES.weekly;
  const cover = section.games.find((game) => game.cover)?.cover;
  return (
    <a className="category-card" href={`#shelf-${section.id}`} aria-label={`Explorar ${section.title}`} style={{ "--category-color": style.color }}>
      {cover && <GameImage className="category-art" src={cover} alt="" loading="lazy" />}
      <span className="category-topline">
        <span className="category-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={style.icon} /></svg></span>
        <span className="category-kicker">{style.label}</span>
      </span>
      <span className="category-title">{section.title}</span>
      <span className="category-hint">{style.hint}</span>
      <span className="category-footer">
        <span>{section.total > 0 ? `${section.total.toLocaleString("pt-BR")} títulos para explorar` : "Conheça a seleção"}</span>
        <span className="category-arrow" aria-hidden="true">↗</span>
      </span>
    </a>
  );
}

function Shelf({ title, description, initial, section = "", query = "" }) {
  const { games, rememberGames } = useGames();
  const [extra, setExtra] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const byId = new Map(games.map((game) => [game.id, game]));
  const displayed = [...new Map([...initial.games, ...extra].map((game) => [game.id, game])).values()];
  async function loadMore() {
    setLoading(true); setError("");
    try {
      const data = await readCatalog(`/api/games?${new URLSearchParams({ section, q: query, page: page + 1, limit: initial.limit })}`);
      rememberGames(data.games); setExtra((current) => [...current, ...data.games]);
      setPage(data.page); setHasMore(data.hasMore);
    } catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }
  return (
    <section id={`shelf-${section || "all"}`} className={`catalog-section ${section ? "discovery-shelf" : ""}`} aria-label={title}>
      <div className="shelf-heading"><h2 className="page-title">{title}</h2>
        <span className="shelf-count">{initial.total.toLocaleString("pt-BR")} títulos</span></div>
      {SHELF_INTROS[section] && <p className="shelf-intro">{initial.notice || SHELF_INTROS[section]}</p>}
      {description && <details className="shelf-criteria"><summary>Como esta seleção é feita</summary><p>{description}</p></details>}
      <div className="games-grid" tabIndex={section && displayed.length ? 0 : undefined} role={section ? "group" : undefined} aria-label={section ? `Jogos de ${title}; role para explorar` : undefined}>
        {displayed.map((game) => <GameCard key={game.id} game={{ ...(byId.get(game.id) || game), metric: game.metric }} />)}
      </div>
      {!displayed.length && <p className="shelf-empty">{section === "trending" ? "Aguardando a coleta do ranking Steam. Explore também os destaques da semana." : "Novos títulos aparecerão aqui conforme o catálogo for atualizado."}</p>}
      {loading && <Skeleton variant="cards" count={3} label="Carregando mais jogos…" />}{error && <p role="alert">{error}</p>}
      {hasMore && <button className="btn-ghost load-more" disabled={loading} onClick={loadMore}>
        {loading ? "Carregando..." : `Ver mais — ${title}`}
      </button>}
    </section>
  );
}

function SearchResults({ query, section, sectionTitle }) {
  const { data, error, loading } = useCatalog(`/api/games?${new URLSearchParams({ q: query, section })}`);
  if (loading) return <Skeleton variant="cards" count={6} label="Buscando no catálogo..." />;
  if (error) return <p role="alert">{error}</p>;
  if (!data?.games.length) return <EmptyState hint="Tente outro termo ou remova o filtro de categoria." />;
  return <Shelf key={`${query}-${section}`} title={sectionTitle || "Resultados do catálogo"} initial={data} query={query} section={section} />;
}

export default function Catalogo({ cookiesAccepted = false, onCookieSettings }) {
  const [params, setParams] = useSearchParams();
  const [composition, setComposition] = useState(null);
  const searchInput = useRef(null);
  const query = params.get("q") || "";
  const section = params.get("section") || "";
  function updateSearch(key, value) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(key, value); else next.delete(key);
      return next;
    }, { replace: true });
  }
  const setQuery = (value) => updateSearch("q", value);
  const setSection = (value) => updateSearch("section", value);
  const { data, error, loading } = useCatalog("/api/home");
  const searching = Boolean(query.trim() || section);
  const sectionTitle = data?.sections.find((item) => item.id === section)?.title;

  return (
    <>
      <Header>
        <div className="search-tools" role="search" aria-label="Pesquisar no catálogo">
        <div className="search-wrap">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input ref={searchInput} type="search" id="searchInput" aria-label="Buscar jogos" maxLength={120}
            placeholder="Encontre seu próximo jogo..." autoComplete="off"
            value={composition ?? query}
            onCompositionStart={() => setComposition(query)}
            onCompositionEnd={(event) => { setComposition(null); setQuery(event.currentTarget.value); }}
            onChange={(event) => {
              if (event.nativeEvent.isComposing || composition !== null) setComposition(event.target.value);
              else setQuery(event.target.value);
            }} />
          {(composition ?? query) && <button type="button" className="search-clear" aria-label="Limpar texto da busca" onClick={() => {
            setComposition(null); setQuery(""); searchInput.current.focus();
          }}>×</button>}
        </div>
        <details className="search-filter" onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.currentTarget.open = false;
            event.currentTarget.querySelector("summary").focus();
          }
        }}>
          <summary className={`filter-trigger ${section ? "is-active" : ""}`}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M4 7h9m4 0h3M4 17h3m4 0h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></svg>
            <span>Filtros</span>{section && <span className="filter-badge" aria-label="1 filtro ativo">1</span>}
          </summary>
          <div className="filter-panel">
            <span className="filter-eyebrow">UMA DESCOBERTA MAIS SUA</span>
            <label htmlFor="categoryFilter">Explorar por categoria</label>
            <select id="categoryFilter" value={section} onChange={(event) => setSection(event.target.value)}>
              <option value="">Todas as categorias</option>
              {data?.sections.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
            <p>Combine uma categoria com o título, gênero ou modo de jogo que procura.</p>
            <button type="button" className="filter-reset" disabled={!section} onClick={() => setSection("")}>Limpar filtro</button>
          </div>
        </details>
        </div>
        <span className="result-count">{data && <><strong>{data.catalog.total.toLocaleString("pt-BR")}</strong><span>jogos para descobrir</span></>}</span>
      </Header>
      <main>
        {!searching && <div className="catalog-shortcut"><span>Descubra seu próximo jogo</span><a href="#catalogo">Explorar categorias <span aria-hidden="true">↓</span></a></div>}
        {!searching && <FeaturedGame cookiesAccepted={cookiesAccepted} onCookieSettings={onCookieSettings} />}
        <section id="catalogo" className="catalog-discovery" aria-labelledby="catalog-title">
          <div className="catalog-heading">
            <div>
              <p className="catalog-eyebrow"><span aria-hidden="true" /> DESCUBRA. JOGUE. REPITA.</p>
              <h1 id="catalog-title">Catálogo de <span>jogos</span></h1>
              <p className="catalog-subtitle">Sua próxima grande aventura começa com uma descoberta.</p>
            </div>
            {data && !searching && <a className="catalog-browse" href="#shelf-all">
              <span>Todos os jogos <span aria-hidden="true">↗</span></span>
              <small>{data.catalog.total.toLocaleString("pt-BR")} títulos no catálogo</small>
            </a>}
          </div>
          {searching && <div className="search-context" role="status">
            <span>{query.trim() ? <>Buscando por <strong>“{query.trim()}”</strong></> : "Explorando o catálogo"}</span>
            {sectionTitle && <span className="active-filter">{sectionTitle}<button type="button" aria-label={`Remover filtro ${sectionTitle}`} onClick={() => setSection("")}>×</button></span>}
            <button type="button" className="search-reset" onClick={() => { setParams({}); setComposition(null); searchInput.current.focus(); }}>Limpar busca</button>
          </div>}
          {loading && !searching && <Skeleton variant="categories" count={6} label="Carregando catálogo..." />}
          {error && <p role="alert">{error}{import.meta.env.VITE_GITHUB_PAGES !== 'true' && ' Tente novamente em instantes.'}</p>}
          {data && !searching && <nav className="discovery-nav" aria-label="Explorar categorias">
            {data.sections.map((section) => <CategoryLink key={section.id} section={section} />)}
          </nav>}
        </section>
        {data && <details className="catalog-sync"><summary>
          <span className="sync-indicator" aria-hidden="true" />
          {data.status.lastSuccess ? `Catálogo atualizado · ${new Date(data.status.lastSuccess).toLocaleDateString("pt-BR")}` : "Preparando seu catálogo"}
          {(data.status.stale || data.status.degraded) && data.status.lastSuccess && " · Atualização pendente"}
        </summary><p className="catalog-note" role="status">
          {data.status.lastSuccess ? `Atualizado em ${new Date(data.status.lastSuccess).toLocaleString("pt-BR")}.` : "Aguardando a primeira sincronização."}
          {!data.status.configured && " A integração com a IGDB ainda precisa ser configurada no servidor."}
          {(data.status.stale || data.status.degraded) && data.status.lastSuccess && " Exibindo os últimos dados salvos; atualização pendente."}
          {data.status.syncing && " Sincronização em andamento."}
          {!data.status.importComplete && data.status.configured && " O catálogo está sendo ampliado gradualmente."}
          {data.status.pendingUpdates && " Há atualizações adicionais aguardando processamento."}
        </p></details>}

        {loading && !searching && <Skeleton variant="cards" count={4} label="Carregando jogos…" />}
        {searching ? <SearchResults key={`${query.trim()}-${section}`} query={query.trim()} section={section} sectionTitle={sectionTitle} /> : data && <>
          {data.sections.map((section) => <Shelf key={`${section.id}-${data.status.lastSuccess}`} title={section.title}
            description={section.description} initial={section} section={section.id} />)}
          <Shelf key={`all-${data.status.lastSuccess}`} title="Todos os jogos, DLCs e expansões" initial={data.catalog} />
        </>}
      </main>
    </>
  );
}
