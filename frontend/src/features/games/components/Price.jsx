const money = (value) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function Price({ game }) {
  const value = game.price;
  const available = typeof value === "number" && Number.isFinite(value) && value >= 0 && game.priceCurrency === "BRL";
  const stale = game.priceStatus === "stale";
  const discount = available && !stale && Number.isFinite(game.priceInitial) && game.priceInitial > value;
  const source = /^https:\/\/store\.steampowered\.com\/app\/\d+\//.test(game.priceSource || "") ? game.priceSource : null;
  const messages = {
    pending: ["Consultando preço...", "A consulta é automática. O valor aparecerá aqui quando estiver disponível."],
    no_source: ["Preço não monitorado", "Esta edição não tem vínculo com a Steam no catálogo."],
    unavailable: ["Sem oferta em reais", "A Steam não retornou uma oferta em BRL para esta edição. Confira as opções na loja."],
    error: ["Consulta temporariamente indisponível", "Uma nova tentativa será feita automaticamente."],
  };
  const [title, hint] = messages[game.priceStatus] || ["Preço indisponível", ""];
  const retryAt = Date.parse(game.priceRetryAt);
  return <div className="game-offer">
    {stale && <span className="offer-note">Último preço · atualização pendente</span>}
    <div className="offer-values">
      {discount && <><del className="offer-original">{money(game.priceInitial)}</del>
        <span className="offer-discount" aria-label={`Desconto de ${Math.round((1 - value / game.priceInitial) * 100)}%`}>−{Math.round((1 - value / game.priceInitial) * 100)}%</span></>}
      <span className={`price ${available && value === 0 && game.priceIsFree ? "price--free" : ""}`}>
        {available ? (value === 0 && game.priceIsFree ? "Grátis" : money(value)) : title}
      </span>
    </div>
    {!available && hint && <span className="offer-note">{hint}</span>}
    {Number.isFinite(retryAt) && (!available || stale) && <time className="offer-note" dateTime={game.priceRetryAt}>
      Nova tentativa a partir de {new Date(retryAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
    </time>}
    {source && <><span className="offer-note">Steam Brasil · PC</span>
      <a className="offer-source" href={source} target="_blank" rel="noreferrer" aria-label="Conferir na Steam (abre em nova aba)">Conferir na Steam <span aria-hidden="true">↗</span></a></>}
    {game.priceCheckedAt && <time className="offer-note" dateTime={game.priceCheckedAt}>Consultado em {new Date(game.priceCheckedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</time>}
  </div>;
}
