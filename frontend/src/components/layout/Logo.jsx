import { Link } from "react-router-dom";

export default function Logo() {
  return (
    <Link
      to="/"
      className="logo"
      aria-label="BuscaGames — página inicial"
      onClick={() => window.scrollTo({ top: 0, left: 0, behavior: "instant" })}
    >
      <img
        className="logo-img"
        src={`${import.meta.env.BASE_URL}buscagames-mark.png`}
        alt=""
        width="52"
        height="52"
      />
      <span className="logo-type">
        <span className="logo-name">Busca<span>Games</span><span className="logo-dot">.</span></span>
        <span className="logo-tagline">SEU PRÓXIMO UNIVERSO</span>
      </span>
    </Link>
  );
}
