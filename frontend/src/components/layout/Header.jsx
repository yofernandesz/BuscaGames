import Logo from "./Logo";
import { NavLink } from "react-router-dom";
import { useGames } from '../../features/games/hooks/useGames';

export default function Header({ children }) {
  const { user, requestLogin, accountLoading } = useGames();
  return (
    <header className="header">
      <div className="header-inner">
        <Logo />
        <nav className="main-nav" aria-label="Navegação principal">
          <NavLink to="/" end>Catálogo</NavLink>
          <NavLink to="/biblioteca">Minha biblioteca</NavLink>
          <NavLink to="/comunidade">Comunidade</NavLink>
          <NavLink to="/perfil">Perfil</NavLink>
          {!user && <button className="header-login" type="button" disabled={accountLoading} onClick={() => requestLogin()}>Entrar <span aria-hidden="true">↗</span></button>}
        </nav>
        {children}
      </div>
    </header>
  );
}
