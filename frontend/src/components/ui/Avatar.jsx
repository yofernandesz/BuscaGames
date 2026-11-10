import { useState } from "react";

export default function Avatar({ src, children }) {
  const [failed, setFailed] = useState(null);
  return src && src !== failed
    ? <img className="player-photo" src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(src)} />
    : children ?? null;
}
