import { Link } from "react-router-dom";

export default function Logo() {
  return (
    <Link to="/" className="logo" aria-label="BuscaGames — página inicial">
      <span className="bit-1">Busca</span>
      <span className="bit-2">Games</span>
    </Link>
  );
}
