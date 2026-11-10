export function normalize(str = "") {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function libraryValues(game, field) {
  if (field === "ano") return [game?.releaseDate?.slice(0, 4) || "Não informado"];
  const values = field === "genero" ? game?.genres : game?.platforms;
  return values?.length ? [...new Set(values)] : ["Não informado"];
}

export function normalizeRating(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.min(5, Math.round(numeric));
}

export function withDetails(game) {
  const images = game.images?.length ? game.images : game.cover ? [game.cover] : [];
  return {
    ...game,
    images,
    cover: game.cover || images[0] || "",
    description: game.description || game.summary || "",
    rating: normalizeRating(game.rating),
  };
}

