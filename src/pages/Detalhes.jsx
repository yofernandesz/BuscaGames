import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useGames } from "../context/GamesContext";
import { draftFromGame, gameFromDraft } from "../lib/gameModel";
import { formatPrice } from "../lib/formatPrice";
import Logo from "../components/Logo";
import EmptyState from "../components/EmptyState";
import GameEditor from "../components/GameEditor";

export default function Detalhes() {
  const { id } = useParams();
  const { games, saveGame } = useGames();
  const game = games.find((item) => String(item.id) === String(id));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => (game ? draftFromGame(game) : null));
  const [previewImage, setPreviewImage] = useState("");

  useEffect(() => {
    if (!game) return;
    setDraft(draftFromGame(game));
    setEditing(false);
    setPreviewImage("");
  }, [id]);

  if (!game) {
    return (
      <>
        <header className="header">
          <div className="header-inner">
            <Logo />
          </div>
        </header>
        <main>
          <EmptyState
            glyph="?"
            title="Jogo não encontrado."
            hint="Esse título não está no catálogo."
            action={
              <Link className="btn-details" to="/">
                Voltar ao catálogo
              </Link>
            }
          />
        </main>
      </>
    );
  }

  const currentDraft = draft ?? draftFromGame(game);
  const images = game.images?.length ? game.images : game.cover ? [game.cover] : [];
  const activeImage = images.includes(previewImage)
    ? previewImage
    : images.includes(game.cover)
      ? game.cover
      : images[0] || "";

  function save() {
    const updated = gameFromDraft(currentDraft, game.id);
    saveGame(game.id, updated);
    setEditing(false);
  }

  function cancel() {
    setDraft(draftFromGame(game));
    setEditing(false);
  }

  return (
    <>
      <header className="header">
        <div className="header-inner">
          <Logo />
        </div>
      </header>
      <main>
        <div className="details-top">
          <Link className="back-link" to="/">
            ← Voltar ao catálogo
          </Link>
          {!editing ? (
            <button className="btn-details" type="button" onClick={() => setEditing(true)}>
              Editar
            </button>
          ) : (
            <div className="details-actions">
              <button className="btn-ghost" type="button" onClick={cancel}>
                Cancelar
              </button>
              <button className="btn-details" type="button" onClick={save}>
                Salvar
              </button>
            </div>
          )}
        </div>

        {editing ? (
          <GameEditor
            draft={currentDraft}
            onChange={setDraft}
            imageInputId="editGameImageUrl"
          />
        ) : (
          <article className="details">
            <div className="details-media">
              <div className="details-cover">
                {activeImage ? (
                  <img src={activeImage} alt={`Imagem de ${game.title}`} />
                ) : (
                  <div className="details-cover-empty">Sem imagens</div>
                )}
              </div>
              <div className="gallery">
                {images.map((image) => (
                  <button
                    key={image}
                    type="button"
                    className={`gallery-thumb ${image === activeImage ? "is-active" : ""}`}
                    onClick={() => setPreviewImage(image)}
                  >
                    <img src={image} alt="" />
                  </button>
                ))}
              </div>
            </div>
            <div className="details-body">
              <span className="genre-tag genre-tag--inline">{game.genre}</span>
              <h1 className="details-title">{game.title}</h1>
              <div className="card-modes">
                {game.modes.map((mode) => (
                  <span className="mode-chip" key={mode}>
                    {mode}
                  </span>
                ))}
              </div>
              {formatPrice(game.price)}
              <p className="details-summary">{game.summary}</p>
              <section className="details-description-block">
                <h2>Descrição detalhada</h2>
                <p className="details-description">
                  {game.description ||
                    "Nenhuma descrição detalhada ainda. Clique em Editar para adicionar."}
                </p>
              </section>
            </div>
          </article>
        )}
      </main>
    </>
  );
}
