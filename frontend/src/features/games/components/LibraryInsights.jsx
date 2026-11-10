import Skeleton from "../../../components/ui/Skeleton";
import { useState } from "react";
import { libraryValues } from "../model/gameModel";

const COLORS = ["var(--neon-cyan)", "var(--neon-purple)", "var(--neon-magenta)", "var(--chart-gold)", "var(--chart-blue)", "var(--chart-coral)"];
const number = (value) => value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const labelFor = (field, label) => field === "nota" ? (label === "0" ? "Sem avaliação" : `${label} ★`) : label;

function Distribution({ title, field, rows, selected, onFilter }) {
  const [type, setType] = useState(field === "genero" ? "pizza" : "rosquinha");
  const total = rows.reduce((sum, [, count]) => sum + count, 0);
  const colors = new Map([...rows].sort(([a], [b]) => a.localeCompare(b, "pt-BR")).map(([label], index) => [label, COLORS[index % COLORS.length]]));
  const segments = rows.reduce((result, [label, count]) => {
    const start = result.at(-1)?.end || 0;
    return [...result, { label, count, start, end: start + (total ? count / total : 0) }];
  }, []);
  const toggle = (label) => onFilter(field, selected === label ? "" : label);
  return <section className="library-chart" aria-label={title}>
    <div className="library-chart-heading"><h3>{title}</h3>
      <div className="library-chart-types" role="group" aria-label={`Formato de ${title}`}>
        {["rosquinha", "pizza"].map((value) => <button key={value} type="button" aria-pressed={type === value} onClick={() => setType(value)}>{value === "pizza" ? "Pizza" : "Rosquinha"}</button>)}
      </div>
    </div>
    <svg className="library-round-chart" viewBox="0 0 240 240" role="group" aria-label={`Gráfico de ${type}: ${title}`}>
      {!total && <circle cx="120" cy="120" r="96" className="library-chart-empty" />}
      {segments.filter(({ count }) => count > 0).map(({ label, count, start, end }) => {
        const point = (fraction, radius) => [120 + radius * Math.cos(fraction * Math.PI * 2 - Math.PI / 2), 120 + radius * Math.sin(fraction * Math.PI * 2 - Math.PI / 2)].join(" ");
        const middle = (start + end) / 2;
        // Two arcs also render a complete circle when only one category remains.
        const outer = `M ${point(start, 96)} A 96 96 0 0 1 ${point(middle, 96)} A 96 96 0 0 1 ${point(end, 96)}`;
        const path = type === "pizza" ? `${outer} L 120 120 Z` : `${outer} L ${point(end, 60)} A 60 60 0 0 0 ${point(middle, 60)} A 60 60 0 0 0 ${point(start, 60)} Z`;
        const description = `${labelFor(field, label)}: ${count} ${count === 1 ? "jogo" : "jogos"} (${number(count / total * 100)}%)`;
        return <path key={label} d={path} fill={colors.get(label)} role="button" tabIndex={0}
          aria-label={`Filtrar ${title}: ${description}`} aria-pressed={selected === label}
          onClick={() => toggle(label)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(label); } }}>
          <title>{description}</title>
        </path>;
      })}
      {(type === "rosquinha" || !total) && <text x="120" y="118" textAnchor="middle" className="library-chart-total" aria-hidden="true">{total}<tspan x="120" dy="22">{total ? "ocorrências" : "Sem dados"}</tspan></text>}
    </svg>
    <div className="library-chart-legend">
      {rows.map(([label, count]) => <button type="button" key={label}
        aria-label={`${title}: ${label}, ${count} ${count === 1 ? "jogo" : "jogos"}`}
        aria-pressed={selected === label} disabled={!count && selected !== label}
        onClick={() => toggle(label)}>
        <span className="library-chart-swatch" style={{ background: colors.get(label) }} aria-hidden="true" />
        <span className="library-bar-label">{labelFor(field, label)}</span>
        <strong>{count} <small>({number(total ? count / total * 100 : 0)}%)</small></strong>
      </button>)}
      {!rows.length && <p>Sem dados nesta seleção.</p>}
    </div>
  </section>;
}

export default function LibraryInsights({ entries, favorites, filters, onFilter, loading }) {
  const rated = entries.filter(({ rating }) => rating > 0);
  const average = rated.length ? number(rated.reduce((sum, entry) => sum + entry.rating, 0) / rated.length) : "—";
  const distribution = (field) => {
    const counts = new Map();
    for (const { game } of entries) for (const value of libraryValues(game, field)) counts.set(value, (counts.get(value) || 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"));
  };
  if (loading) return <Skeleton variant="dashboard" label="Atualizando detalhes dos jogos…" />;
  return <section className="library-insights" aria-labelledby="insights-title" aria-busy={loading}>
    <div className="library-insights-heading"><h2 id="insights-title">Seu perfil de jogos</h2><p>{loading ? "Atualizando detalhes dos jogos…" : "Escolha rosquinha ou pizza. Clique nas fatias ou nas legendas para filtrar; clique novamente para remover o filtro."}</p></div>
    <dl className="library-metrics">
      {[["Jogos na seleção", entries.length], ["Favoritos na seleção", entries.filter(({ id }) => favorites.includes(id)).length], ["Jogos avaliados", rated.length], ["Média das suas notas", `${average}${rated.length ? " / 5" : ""}`]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
    <div className="library-charts">
      <Distribution title="Suas notas" field="nota" rows={[5, 4, 3, 2, 1, 0].map((rating) => [String(rating), entries.filter((entry) => entry.rating === rating).length])} selected={filters.nota} onFilter={onFilter} />
      <Distribution title="Gêneros" field="genero" rows={distribution("genero")} selected={filters.genero} onFilter={onFilter} />
      <Distribution title="Plataformas" field="plataforma" rows={distribution("plataforma")} selected={filters.plataforma} onFilter={onFilter} />
    </div>
    <p className="library-chart-note">Os gráficos e a média acompanham os filtros. Jogos sem nota não entram na média. Percentuais representam as ocorrências em cada gráfico: um jogo pode contar em mais de um gênero ou plataforma. Detalhes ausentes aparecem como “Não informado”.</p>
  </section>;
}
