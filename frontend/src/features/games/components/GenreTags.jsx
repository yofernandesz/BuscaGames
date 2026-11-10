export default function GenreTags({ game }) {
  const genres = [...new Set((game.genres?.length ? game.genres : (game.genre || "").split(","))
    .map((genre) => genre.trim()).filter(Boolean))];

  if (!genres.length || (genres.length === 1 && genres[0] === "Gênero não informado")) {
    return <p className="genre-empty">Gênero não informado</p>;
  }

  return (
    <ul className="genre-tags" aria-label="Gêneros e temas">
      {genres.map((genre) => <li className="genre-chip" key={genre}>{genre}</li>)}
    </ul>
  );
}
