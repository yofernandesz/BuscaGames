export default function EmptyState({
  glyph = "¯\\_(ツ)_/¯",
  title = "Nenhum jogo encontrado.",
  hint = "Tente buscar por outro título, gênero ou modo de jogo.",
  action = null,
}) {
  return (
    <div className="empty-state">
      <span className="glyph">{glyph}</span>
      <p>{title}</p>
      {hint && <p className="hint">{hint}</p>}
      {action}
    </div>
  );
}
