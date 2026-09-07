import { useState } from "react";
import { emptyDraft } from "../lib/gameModel";
import { useGames } from "../context/GamesContext";
import GameEditor from "./GameEditor";

export default function NovoJogo({ onCancel, onCreated }) {
  const { addGame } = useGames();
  const [draft, setDraft] = useState(() => emptyDraft());
  const [error, setError] = useState("");

  function save() {
    if (!draft.title.trim()) {
      setError("Informe pelo menos o título do jogo.");
      return;
    }
    addGame(draft);
    onCreated?.();
  }

  return (
    <section className="create-panel" aria-labelledby="novo-jogo-title">
      <div className="details-top">
        <h2 id="novo-jogo-title" className="create-panel-title">
          Novo jogo
        </h2>
        <div className="details-actions">
          <button className="btn-ghost" type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button className="btn-details" type="button" onClick={save}>
            Salvar no catálogo
          </button>
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}
      <GameEditor draft={draft} onChange={setDraft} imageInputId="newGameImageUrl" />
    </section>
  );
}
