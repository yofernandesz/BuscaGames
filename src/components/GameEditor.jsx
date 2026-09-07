import { useState } from "react";

export default function GameEditor({ draft, onChange, imageInputId = "imageUrl" }) {
  const [imageUrl, setImageUrl] = useState("");
  const images = draft.images || [];
  const activeImage = images.includes(draft.cover) ? draft.cover : images[0] || "";

  function updateField(field, value) {
    onChange((current) => ({ ...current, [field]: value }));
  }

  function addImageUrl() {
    const url = imageUrl.trim();
    if (!url) return;
    onChange((current) => {
      if (current.images.includes(url)) return current;
      return {
        ...current,
        images: [...current.images, url],
        cover: current.cover || url,
      };
    });
    setImageUrl("");
  }

  function addImageFiles(files) {
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result);
        onChange((current) => {
          if (current.images.includes(result)) return current;
          return {
            ...current,
            images: [...current.images, result],
            cover: current.cover || result,
          };
        });
      };
      reader.readAsDataURL(file);
    });
  }

  function removeImage(url) {
    if (!url) return;
    onChange((current) => {
      const nextImages = current.images.filter((image) => image !== url);
      return {
        ...current,
        images: nextImages,
        cover: current.cover === url ? nextImages[0] || "" : current.cover,
      };
    });
  }

  return (
    <article className="details">
      <div className="details-media">
        <div className="details-cover">
          {activeImage ? (
            <img
              src={activeImage}
              alt={draft.title ? `Imagem de ${draft.title}` : "Pré-visualização"}
            />
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
              onClick={() => updateField("cover", image)}
            >
              <img src={image} alt="" />
            </button>
          ))}
        </div>

        <div className="image-editor">
          <label className="field-label" htmlFor={imageInputId}>
            Adicionar imagem
          </label>
          <div className="image-add-row">
            <input
              id={imageInputId}
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
      </div>

      <div className="details-body">
        <form className="details-form" onSubmit={(e) => e.preventDefault()}>
          <label>
            Título
            <input
              value={draft.title}
              onChange={(e) => updateField("title", e.target.value)}
              placeholder="Nome do jogo"
            />
          </label>
          <label>
            Gênero
            <input
              value={draft.genre}
              onChange={(e) => updateField("genre", e.target.value)}
              placeholder="Ex.: RPG - Aventura"
            />
          </label>
          <label>
            Modos (separados por vírgula)
            <input
              value={draft.modes}
              onChange={(e) => updateField("modes", e.target.value)}
              placeholder="Singleplayer, Co-op"
            />
          </label>
          <label>
            Preço
            <input
              type="number"
              min="0"
              step="0.01"
              value={draft.price}
              onChange={(e) => updateField("price", e.target.value)}
            />
          </label>
          <label>
            Resumo (aparece no card)
            <textarea
              rows="3"
              value={draft.summary}
              onChange={(e) => updateField("summary", e.target.value)}
            />
          </label>
          <label>
            Descrição detalhada
            <textarea
              rows="8"
              value={draft.description}
              onChange={(e) => updateField("description", e.target.value)}
              placeholder="Conte a história, mecânicas, requisitos e tudo que o jogador precisa saber."
            />
          </label>
        </form>
      </div>
    </article>
  );
}
