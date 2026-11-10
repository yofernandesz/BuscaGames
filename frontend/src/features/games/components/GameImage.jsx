import { useState } from "react";

export default function GameImage({ src, alt, size = "cover_big_2x", className, ...props }) {
  const [failure, setFailure] = useState(null);
  // Upgrade stored IGDB URLs too, without waiting for a new catalog import.
  const enhanced = src?.replace(/^(https:\/\/images\.igdb\.com\/igdb\/image\/upload\/)t_[\w]+\//, `$1t_${size}/`);
  const original = failure?.src === src;
  if (!src || (original && failure.unavailable)) {
    return alt ? <div className={`game-image-empty ${className || ""}`} role="img" aria-label={`${alt} — imagem indisponível`}>
      <span aria-hidden="true">◇</span><span>Imagem indisponível</span>
    </div> : null;
  }
  return <img {...props} className={className} src={original ? src : enhanced} alt={alt} decoding="async"
    onError={() => setFailure({ src, unavailable: original || enhanced === src })} />;
}
