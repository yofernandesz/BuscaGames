export default function ReviewBadge({ reviewed }) {
  if (!reviewed) return null;
  return <svg className="review-badge" viewBox="0 0 24 24" role="img" aria-label="Perfil revisado por um administrador">
    <title>Perfil revisado por um administrador</title>
    <path fill="currentColor" d="M7 5h10c2.6 0 4 2 4.6 4.8l1 5.5c.7 3.8-2.4 5.5-5 3L15 16H9l-2.6 2.3c-2.7 2.6-5.8.8-5.1-3l1-5.5C3 7 4.4 5 7 5Z"/>
    <path stroke="var(--bg-0)" strokeWidth="1.7" strokeLinecap="round" d="M5 10.5h5m-2.5-2.5v5m8-1.5h.1m2.5-2h.1"/>
  </svg>;
}
