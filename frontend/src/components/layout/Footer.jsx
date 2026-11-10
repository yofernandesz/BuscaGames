import Logo from "./Logo";
import { Link } from "react-router-dom";

export default function Footer({ cookieSettingsRef, onCookieSettings }) {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-main">
          <div className="footer-brand">
            <Logo />
            <p>Descubra seu próximo jogo. Guarde seus favoritos.</p>
          </div>
          <div className="footer-creator">
            <p className="footer-label">Desenvolvido por</p>
            <h2>Arthur Fernandes<span aria-hidden="true">.</span></h2>
            <nav className="footer-socials" aria-label="Redes sociais de Arthur Fernandes">
              <a href="https://www.instagram.com/fernandess_arthur/" target="_blank" rel="noopener noreferrer" aria-label="Instagram de Arthur Fernandes (abre em nova aba)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                  <rect x="3" y="3" width="18" height="18" rx="5" />
                  <circle cx="12" cy="12" r="4" />
                  <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
                </svg>
                Instagram <span className="footer-external" aria-hidden="true">↗</span>
              </a>
              <a href="https://www.linkedin.com/in/arthur-fernandes-549a72314/" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn de Arthur Fernandes (abre em nova aba)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="3" width="18" height="18" rx="3" />
                  <path d="M7.5 10v7M11.5 17v-7m0 3a3 3 0 0 1 6 0v4" />
                  <circle cx="7.5" cy="7" r="1" fill="currentColor" stroke="none" />
                </svg>
                LinkedIn <span className="footer-external" aria-hidden="true">↗</span>
              </a>
            </nav>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© 2026 BuscaGames. Todos os direitos reservados.</p>
          <div className="footer-privacy-actions">
            <Link className="btn-ghost footer-privacy" to="/admin">Acesso administrativo</Link>
            <Link className="btn-ghost footer-privacy" to="/privacidade">Política de Privacidade</Link>
            <button ref={cookieSettingsRef} type="button" className="btn-ghost" onClick={onCookieSettings}>Preferências de cookies</button>
          </div>
          <p>Dados e imagens do catálogo: <a href="https://www.igdb.com/" target="_blank" rel="noopener noreferrer" aria-label="IGDB (abre em nova aba)">IGDB <span aria-hidden="true">↗</span></a></p>
        </div>
      </div>
    </footer>
  );
}
