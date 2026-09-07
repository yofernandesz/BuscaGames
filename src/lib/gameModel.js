export function normalize(str = "") {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function withDetails(game) {
  const images = game.images?.length ? game.images : game.cover ? [game.cover] : [];
  return {
    ...game,
    images,
    cover: game.cover || images[0] || "",
    description: game.description || game.summary || "",
  };
}

export function emptyDraft() {
  return {
    title: "",
    genre: "",
    modes: "",
    price: "0",
    summary: "",
    description: "",
    images: [],
    cover: "",
  };
}

export function draftFromGame(game) {
  const images = game.images?.length ? [...game.images] : game.cover ? [game.cover] : [];
  return {
    title: game.title,
    genre: game.genre,
    modes: Array.isArray(game.modes) ? game.modes.join(", ") : "",
    price: String(game.price ?? 0),
    summary: game.summary || "",
    description: game.description || game.summary || "",
    images,
    cover: game.cover || images[0] || "",
  };
}

export function gameFromDraft(draft, id) {
  const images = (draft.images || []).filter(Boolean);
  const title = draft.title.trim() || "Novo jogo";
  const summary = draft.summary.trim();
  const description = draft.description.trim() || summary;

  return withDetails({
    id,
    title,
    genre: draft.genre.trim() || "Sem gênero",
    modes: draft.modes
      .split(",")
      .map((mode) => mode.trim())
      .filter(Boolean),
    price: Number(String(draft.price).replace(",", ".")) || 0,
    summary,
    description,
    images,
    cover: draft.cover || images[0] || "",
  });
}

export function nextGameId(games) {
  return games.reduce((max, game) => Math.max(max, Number(game.id) || 0), 0) + 1;
}

export function searchGames(games, query) {
  const term = normalize(query.trim());
  if (!term) return games;

  return games.filter((game) => {
    const haystack = normalize(
      [game.title, game.genre, ...(game.modes || []), game.summary, game.description].join(" ")
    );
    return haystack.includes(term);
  });
}
