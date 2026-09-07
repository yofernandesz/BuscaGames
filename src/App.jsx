import { Navigate, Route, Routes } from "react-router-dom";
import { GamesProvider } from "./context/GamesContext";
import Catalogo from "./pages/Catalogo";
import Detalhes from "./pages/Detalhes";
import "./App.css";

export default function App() {
  return (
    <GamesProvider>
      <div className="app">
        <Routes>
          <Route path="/" element={<Catalogo />} />
          <Route path="/jogo/:id" element={<Detalhes />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

        <footer>
          © BuscaGames — Todos os direitos reservados.
          <h4>Developed by Arthur Fernandes</h4>
        </footer>
      </div>
    </GamesProvider>
  );
}
