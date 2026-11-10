import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useCatalog } from "../hooks/useCatalog";
import GameImage from "./GameImage";

// Official date: https://www.rockstargames.com/VI (checked 2026-10-24).
const RELEASE_DATE = "2026-11-19";
const MUSIC_URL = "https://www.youtube.com/watch?v=5dPwBWvmcbQ";

function timeUntilRelease(date, now) {
  // Midnight in São Paulo is a countdown reference, not a confirmed unlock time.
  const total = Math.max(0, Math.ceil((Date.parse(`${date}T00:00:00-03:00`) - now.getTime()) / 1000));
  return { total, units: [
    [Math.floor(total / 86400), "dias"],
    [Math.floor(total / 3600) % 24, "horas"],
    [Math.floor(total / 60) % 60, "minutos"],
    [total % 60, "segundos"],
  ] };
}

export default function FeaturedGame({ cookiesAccepted = false, onCookieSettings }) {
  const { data } = useCatalog("/api/games/igdb-52189?preview=1");
  const game = data?.id === "igdb-52189" ? data : null;
  const [now, setNow] = useState(() => new Date());
  const [musicOpen, setMusicOpen] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(game?.releaseDate || "") ? game.releaseDate : RELEASE_DATE;
  const countdown = timeUntilRelease(date, now);
  const formattedDate = new Intl.DateTimeFormat("pt-BR", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
  const cover = game?.cover || "https://images.igdb.com/igdb/image/upload/t_cover_big/cocv1v.jpg";
  return <section className="gta-spotlight" aria-label="Destaque da vez: Grand Theft Auto VI">
    <div className="gta-copy">
      <span className="gta-eyebrow">★ DESTAQUE DA VEZ</span>
      <p className="gta-location">LEONIDA · VICE CITY</p>
      <h2>Grand Theft Auto <span>VI</span></h2>
      <p className="gta-tagline">O próximo destino é Vice City.</p>
      <p className="gta-description">Entre no clima de GTA 6. Uma nova história nas ruas iluminadas de Leonida está chegando.</p>
      <div className="gta-countdown">
        {countdown.total > 0 ? <><span className="gta-countdown-label">VICE CITY ESTÁ CHAMANDO</span>
          <div className="gta-clock" role="timer" aria-label="Contagem regressiva até a data de lançamento" aria-live="off">
            {countdown.units.map(([value, label]) => <div className="gta-clock-unit" key={label}>
              <strong>{String(value).padStart(2, "0")}</strong><span>{label}</span>
            </div>)}
          </div><p className="gta-clock-caption">Até o lançamento. Prepare-se para Vice City!</p></>
          : <strong className="gta-arrival">A data prevista chegou!</strong>}
        <time dateTime={date}>{formattedDate}</time>
      </div>
      <p className="gta-date-note">Contagem até 00h da data prevista, no horário de São Paulo (UTC−3). Horário de liberação não confirmado; data sujeita a alteração. <a href="https://www.rockstargames.com/VI" target="_blank" rel="noreferrer">Site oficial ↗</a></p>
      <div className="discovery-actions">
        {game ? <Link className="btn-details" to="/jogo/igdb-52189">Explorar GTA VI ↗</Link>
          : <a className="btn-details" href="https://www.rockstargames.com/VI" target="_blank" rel="noreferrer">Explorar GTA VI ↗</a>}
        <a className="discovery-secondary" href="#shelf-all">Continuar explorando ↓</a>
      </div>
    </div>
    <div className="gta-media">
      <GameImage className="gta-poster" src={cover} size="1080p" alt="Capa de Grand Theft Auto VI" fetchPriority="high" />
      <div className="gta-music">
        <span className="gta-eyebrow">A TRILHA DO DESTAQUE</span>
        <h3>Flower In A Hurricane</h3>
        <p>Justice, Tame Impala, SZA & King Gizzard & The Lizard Wizard</p>
        <button className="btn-ghost" type="button" aria-expanded={musicOpen} aria-controls="gta-music-player" onClick={() => setMusicOpen((open) => !open)}>
          {musicOpen ? "Fechar player" : "♫ Ouvir a música"}
        </button>
        <div id="gta-music-player">
          {musicOpen && !cookiesAccepted && <div className="music-consent">
            <p>Para carregar o player, aceite os cookies opcionais. Você também pode ouvir diretamente no YouTube.</p>
            {onCookieSettings && <button type="button" className="btn-ghost" onClick={onCookieSettings}>Rever escolha de cookies</button>}
            <a href={MUSIC_URL} target="_blank" rel="noreferrer">Assistir no YouTube ↗</a>
          </div>}
          {musicOpen && cookiesAccepted && <><iframe title="Flower In A Hurricane — YouTube" src="https://www.youtube-nocookie.com/embed/5dPwBWvmcbQ?autoplay=1&playsinline=1"
            height="220" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
            <p>Se o vídeo não iniciar, pressione play. <a href={MUSIC_URL} target="_blank" rel="noreferrer">Assistir no YouTube ↗</a></p></>}
        </div>
      </div>
    </div>
  </section>;
}
