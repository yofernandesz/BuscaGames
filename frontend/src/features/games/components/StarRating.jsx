import { useId, useState } from "react";

const STARS = [1, 2, 3, 4, 5];
const MOODS = ['Escolha sua nota', 'Ruim', 'Regular', 'Bom', 'Ótimo', 'Obra-prima'];

function starLabel(value) {
  return value === 1 ? "1 estrela" : `${value} estrelas`;
}

export default function StarRating({
  value = 0,
  onChange,
  label = "Avaliação",
  compact = false,
  disabled = false,
  name,
}) {
  const generatedName = useId();
  const groupName = name ? `${name}-${generatedName}` : generatedName;
  const [hover, setHover] = useState(0);
  const [busy, setBusy] = useState(false);
  const [reaction, setReaction] = useState({ level: 0, run: 0 });
  const display = hover || value;
  const reacting = !busy && reaction.level === value ? reaction.level : 0;
  const readOnly = disabled || typeof onChange !== "function";

  async function select(next, toggle = true) {
    if (readOnly || busy) return;
    const rating = toggle && next === value ? 0 : next;
    setReaction((current) => ({ level: rating, run: current.run + 1 }));
    setHover(0);
    setBusy(true);
    try { await onChange(rating); }
    finally { setBusy(false); }
  }

  return (
    <div
      className={`star-rating ${compact ? "star-rating--compact" : ""}`}
      data-level={display}
      data-reaction={reacting || undefined}
      onMouseLeave={() => setHover(0)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setHover(0);
      }}
    >
      <span className="star-rating-label" id={`${groupName}-label`}>
        {label}
        <strong>{value > 0 ? `${value}/5` : "sem nota"}</strong>
        <span className="star-rating-mood" aria-hidden="true">{MOODS[display]}</span>
      </span>
      <div
        className="star-rating-group"
        role="radiogroup"
        aria-busy={busy}
        aria-labelledby={`${groupName}-label`}
      >
        {STARS.map((star) => {
          const filled = display >= star;
          const animated = reacting === star || reacting === 5;
          return (
            <button
              key={star}
              type="button"
              role="radio"
              name={groupName}
              className={`star-button${filled ? " is-filled" : ""}${animated ? " is-reacting" : ""}`}
              style={{ '--star-index': star - 1 }}
              title={`${starLabel(star)} · ${MOODS[star]}`}
              aria-label={starLabel(star)}
              aria-checked={value === star}
              tabIndex={value === star || (value === 0 && star === 1) ? 0 : -1}
              disabled={readOnly}
              aria-disabled={busy || undefined}
              onMouseEnter={() => {
                if (!readOnly) setHover(star);
              }}
              onFocus={() => {
                if (!readOnly) setHover(star);
              }}
              onClick={() => select(star)}
              onKeyDown={(event) => {
                if (busy) return;
                const direction = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
                if (!direction && event.key !== "Home" && event.key !== "End") return;
                event.preventDefault();
                const next = event.key === "Home" ? 1 : event.key === "End" ? 5 : (star - 1 + direction + 5) % 5 + 1;
                select(next, false);
                event.currentTarget.parentElement.children[next - 1].focus();
              }}
            >
              <span key={reaction.run} className="star-visual" aria-hidden="true">
                {animated && reacting >= 4 && <span className="star-fireworks">
                  {Array.from({ length: reacting === 5 ? 10 : 6 }, (_, index) => (
                    <span key={index} className="star-spark" style={{ '--spark-angle': `${index * (reacting === 5 ? 36 : 60)}deg` }} />
                  ))}
                </span>}
                <svg className="star-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"
                  onAnimationEnd={() => {
                    if (star === reacting) setReaction((current) => ({ ...current, level: 0 }));
                  }}>
                  <path d="m12 2.8 2.8 5.68 6.27.91-4.54 4.42 1.07 6.24L12 17.1l-5.6 2.95 1.07-6.24L2.93 9.39l6.27-.91Z" />
                </svg>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
