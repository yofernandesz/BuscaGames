import { useEffect, useRef, useState } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import Privacidade from "../pages/Privacidade";
import Admin from "../features/admin/pages/Admin";
import Perfil from "../features/account/pages/Perfil";
import Comunidade, { PerfilPublico } from "../features/community/pages/Comunidade";
import Footer from "../components/layout/Footer";
import { GamesProvider } from "../features/games/context/GamesProvider";
import { useGames } from "../features/games/hooks/useGames";
import Catalogo from "../features/games/pages/Catalogo";
import Detalhes from "../features/games/pages/Detalhes";
import Biblioteca from "../features/games/pages/Biblioteca";
import ScrollToTop from "./ScrollToTop";

export default function App() {
  return <GamesProvider><AppContent /></GamesProvider>;
}

function AppContent() {
  const { user, accountLoading } = useGames();
  const [cookieChoice, setCookieChoice] = useState(() => {
    try {
      const stored = localStorage.getItem("buscagames:cookie-choice");
      return stored === "accepted" || stored === "rejected" ? stored : null;
    } catch { return null; }
  });
  const [reviewingCookies, setReviewingCookies] = useState(false);
  const showCookieNotice = reviewingCookies || (!accountLoading && !user && cookieChoice === null);
  const cookieSettings = useRef(null);
  const cookieBanner = useRef(null);
  useEffect(() => {
    if (!showCookieNotice || !window.ResizeObserver) return;
    const root = document.documentElement;
    const observer = new ResizeObserver(([entry]) => {
      root.style.setProperty("--cookie-space", `${entry.target.getBoundingClientRect().height + 32}px`);
    });
    observer.observe(cookieBanner.current);
    return () => { observer.disconnect(); root.style.removeProperty("--cookie-space"); };
  }, [showCookieNotice]);
  function chooseCookies(choice) {
    setCookieChoice(choice);
    setReviewingCookies(false);
    try { localStorage.setItem("buscagames:cookie-choice", choice); }
    catch { /* Com armazenamento bloqueado, a escolha vale nesta página. */ }
    cookieSettings.current?.focus({ preventScroll: true });
  }
  function reviewCookies() {
    setReviewingCookies(true);
    requestAnimationFrame(() => cookieBanner.current?.focus());
  }
  return (
      <div className="app">
        <ScrollToTop />
        {showCookieNotice && <section className="cookie-notice" aria-labelledby="cookie-title" tabIndex={-1} ref={cookieBanner} onKeyDown={(event) => {
          if (event.key === "Escape") { event.stopPropagation(); chooseCookies("rejected"); }
        }}>
          <div className="cookie-notice-heading">
            <span className="cookie-notice-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12a4 4 0 0 1-4-4 4 4 0 0 1-4-4V3a9 9 0 1 0 9 9Z" /><path d="M8 8h.01M7 14h.01M12 17h.01M13 11h.01" strokeWidth="3" /></svg>
            </span>
            <div>
              <h2 id="cookie-title">Cookies e sua privacidade</h2>
            </div>
            <button type="button" className="cookie-notice-close" aria-label="Fechar aviso e continuar sem cookies opcionais" title="Continuar sem cookies opcionais" onClick={() => chooseCookies("rejected")}>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>
            </button>
          </div>
          <div className="cookie-notice-copy">
            <p>Explore à vontade. Cookies opcionais permitem usar o player do YouTube; o catálogo funciona sem eles.</p>
          </div>
          <details className="cookie-notice-details">
            <summary>Como usamos seus dados</summary>
          <dl className="cookie-notice-summary">
            <div><dt>Neste navegador</dt><dd>Registros antigos deste navegador e dados da sua conta são mantidos, mesmo ao recusar.</dd></div>
            <div><dt>Com sua permissão</dt><dd>O player do YouTube só carrega após aceitar os cookies opcionais.</dd></div>
          </dl>
          <div className="cookie-notice-footnote">
            <p>Sua escolha fica salva neste navegador. Você pode alterá-la em “Preferências de cookies”. Se o armazenamento estiver bloqueado, ela vale apenas nesta página.</p>
            <p><Link to="/privacidade">Leia a Política de Privacidade completa.</Link></p>
          </div>
          </details>
          <div className="cookie-notice-actions">
            <button type="button" className="btn-ghost" onClick={() => chooseCookies("rejected")}>Recusar opcionais</button>
            <button type="button" className="btn-ghost" onClick={() => chooseCookies("accepted")}>Aceitar cookies</button>
          </div>
        </section>}
        <Routes>
          <Route path="/admin/:section?" element={<Admin />} />
          <Route path="/perfil" element={<Perfil onCookieSettings={reviewCookies} />} />
          <Route path="/perfil/:id" element={<PerfilPublico />} />
          <Route path="/comunidade" element={<Comunidade />} />
          <Route path="/privacidade" element={<Privacidade onCookieSettings={reviewCookies} />} />
          <Route path="/" element={<Catalogo cookiesAccepted={cookieChoice === "accepted" && !reviewingCookies} onCookieSettings={reviewCookies} />} />
          <Route path="/biblioteca" element={<Biblioteca />} />
          <Route path="/jogo/:id" element={<Detalhes />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

        <Footer cookieSettingsRef={cookieSettings} onCookieSettings={reviewCookies} />
      </div>
  );
}
