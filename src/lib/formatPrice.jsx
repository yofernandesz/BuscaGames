export function formatPrice(value) {
  const numeric = Number(value);
  if (!numeric) {
    return <span className="price price--free">Grátis</span>;
  }

  const formatted = numeric.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return <span className="price">R$ {formatted}</span>;
}
