import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

function formatPrice(value) {
  const numeric = Number(value);
  if (!numeric) {
    return <span className="price price--free">Grátis</span>;
  }
  const formatted = numeric.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return <span className="price">R$ {formatted}</span>;
}

function DetailsHeader() {
  return (
    <header className="header">
      <div className="header-inner">
        <Link to="/" className="logo" aria-label="BuscaGames — página inicial">
          <span className="bit-1">Busca</span>
          <span className="bit-2">Games</span>
        </Link>
      </div>
    </header>
  );
}

function draftFromGame(game) {
  return {
    title: game.title,
    genre: game.genre,
    modes: game.modes.join(", "),
    price: String(game.price),
    summary: game.summary,
    description: game.description || game.summary,
    images: game.images?.length ? [...game.images] : [game.cover],
    cover: game.cover,
  };
}

export default function Detalhes({ games, onSaveGame }) {
  const { id } = useParams();
  const game = games.find((item) => String(item.id) === String(id));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => (game ? draftFromGame(game) : null));
  const [imageUrl, setImageUrl] = useState("");
  const [selectedImage, setSelectedImage] = useState(() => {
    if (!game) return "";
    const images = game.images?.length ? game.images : [game.cover];
    return game.cover || images[0] || "";
  });

  useEffect(() => {
    if (!game) return;
    const nextDraft = draftFromGame(game);
    setDraft(nextDraft);
    setEditing(false);
    setImageUrl("");
    setSelectedImage(nextDraft.cover || nextDraft.images[0] || "");
  }, [id]);

  if (!game) {
    return (
      <>
        <DetailsHeader />
        <main>
          <div className="empty-state">
            <span className="glyph">?</span>
            <p>Jogo não encontrado.</p>
            <p className="hint">Esse título não está no catálogo.</p>
            <Link className="btn-details" to="/">
              Voltar ao catálogo
            </Link>
          </div>
        </main>
      </>
    );
  }

  const currentDraft = draft ?? draftFromGame(game);
  const images = editing
    ? currentDraft.images
    : game.images?.length
      ? game.images
      : [game.cover];
  const activeImage = images.includes(selectedImage) ? selectedImage : images[0];

  function updateField(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function addImageUrl() {
    const url = imageUrl.trim();
      if (!url || currentDraft.images.includes(url)) {
      setImageUrl("");
      return;
    }
    setDraft((current) => ({
      ...current,
      images: [...current.images, url],
      cover: current.cover || url,
    }));
    setSelectedImage(url);
    setImageUrl("");
  }

  function addImageFiles(files) {
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result);
        setDraft((current) => {
          if (current.images.includes(result)) return current;
          return {
            ...current,
            images: [...current.images, result],
            cover: current.cover || result,
          };
        });
        setSelectedImage(result);
      };
      reader.readAsDataURL(file);
    });
  }

  function removeImage(url) {
    setDraft((current) => {
      const nextImages = current.images.filter((image) => image !== url);
      const nextCover = current.cover === url ? nextImages[0] || "" : current.cover;
      return { ...current, images: nextImages, cover: nextCover };
    });
    if (selectedImage === url) {
      setSelectedImage("");
    }
  }

  function save() {
    const imagesToSave = currentDraft.images.filter(Boolean);
    onSaveGame(game.id, {
      title: currentDraft.title.trim() || game.title,
      genre: currentDraft.genre.trim() || game.genre,
      modes: currentDraft.modes
        .split(",")
        .map((mode) => mode.trim())
        .filter(Boolean),
      price: Number(String(currentDraft.price).replace(",", ".")) || 0,
      summary: currentDraft.summary.trim(),
      description: currentDraft.description.trim(),
      images: imagesToSave,
      cover: currentDraft.cover || imagesToSave[0] || game.cover,
    });
    setEditing(false);
  }

  function cancel() {
    const nextDraft = draftFromGame(game);
    setDraft(nextDraft);
    setSelectedImage(nextDraft.cover || nextDraft.images[0] || "");
    setImageUrl("");
    setEditing(false);
  }

  return (
    <>
      <DetailsHeader />
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
                  onClick={() => {
                    setSelectedImage(image);
                    if (editing) updateField("cover", image);
                  }}
                >
                  <img src={image} alt="" />
                </button>
              ))}
            </div>

            {editing && (
              <div className="image-editor">
                <label className="field-label" htmlFor="imageUrl">
                  Adicionar imagem
                </label>
                <div className="image-add-row">
                  <input
                    id="imageUrl"
                    type="url"
                    placeholder="Cole a URL da imagem..."
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addImageUrl();
                      }
                    }}
                  />
                  <button className="btn-ghost" type="button" onClick={addImageUrl}>
                    Adicionar URL
                  </button>
                </div>
                <label className="file-picker">
                  Enviar arquivo
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => {
                      addImageFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
                {images.length > 0 && (
                  <button
                    className="btn-ghost btn-ghost--danger"
                    type="button"
                    onClick={() => removeImage(activeImage)}
                    disabled={!activeImage}
                  >
                    Remover imagem selecionada
                  </button>
                )}
                <p className="hint">Clique em uma miniatura para usá-la como capa do card.</p>
              </div>
            )}
          </div>

          <div className="details-body">
            {!editing ? (
              <>
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
                    {game.description || "Nenhuma descrição detalhada ainda. Clique em Editar para adicionar."}
                  </p>
                </section>
              </>
            ) : (
              <form className="details-form" onSubmit={(e) => e.preventDefault()}>
                <label>
                  Título
                  <input
                    value={currentDraft.title}
                    onChange={(e) => updateField("title", e.target.value)}
                  />
                </label>
                <label>
                  Gênero
                  <input
                    value={currentDraft.genre}
                    onChange={(e) => updateField("genre", e.target.value)}
                  />
                </label>
                <label>
                  Modos (separados por vírgula)
                  <input
                    value={currentDraft.modes}
                    onChange={(e) => updateField("modes", e.target.value)}
                  />
                </label>
                <label>
                  Preço
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={currentDraft.price}
                    onChange={(e) => updateField("price", e.target.value)}
                  />
                </label>
                <label>
                  Resumo (aparece no card)
                  <textarea
                    rows="3"
                    value={currentDraft.summary}
                    onChange={(e) => updateField("summary", e.target.value)}
                  />
                </label>
                <label>
                  Descrição detalhada
                  <textarea
                    rows="8"
                    value={currentDraft.description}
                    onChange={(e) => updateField("description", e.target.value)}
                    placeholder="Conte a história, mecânicas, requisitos e tudo que o jogador precisa saber."
                  />
                </label>
              </form>
            )}
          </div>
        </article>
      </main>
    </>
  );
}
