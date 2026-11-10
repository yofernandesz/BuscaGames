import { useRef, useState } from 'react';
import './social-actions.css';

// onActivate returns true only after the server confirms a new follow/like.
export default function SocialButton({ kind, active, busy, disabled, count, onActivate }) {
  const [celebrating, setCelebrating] = useState(false);
  const pending = useRef(false);
  const follow = kind === 'follow';
  const label = busy ? 'Salvando…' : follow ? active ? 'Deixar de seguir' : 'Seguir' : active ? 'Descurtir' : 'Curtir';
  const countLabel = count === undefined ? '' : `, ${count} ${count === 1 ? 'curtida' : 'curtidas'}`;

  async function activate() {
    if (pending.current || busy || disabled) return;
    pending.current = true;
    setCelebrating(false);
    try {
      const confirmed = await onActivate();
      if (confirmed && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) setCelebrating(true);
    } finally { pending.current = false; }
  }

  return <button type="button" className={`social-button social-button--${kind}`} aria-label={label + countLabel}
    aria-pressed={Boolean(active)} aria-busy={Boolean(busy)} disabled={busy || disabled}
    data-celebrating={celebrating || undefined} onClick={activate}
    onAnimationEnd={event => { if (event.animationName === 'social-confirm-icon') setCelebrating(false); }}>
    <span className="social-button-sheen" aria-hidden="true" />
    <span className="social-button-symbol" aria-hidden="true">
      <span className="social-button-halo" />
      <svg className="social-button-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        {follow ? <>
          <circle cx="9" cy="7.5" r="3.25" />
          <path d="M2.5 20v-2a5 5 0 0 1 5-5h3a5 5 0 0 1 5 5v2" />
          <path className="social-follow-plus" d="M19 6v6m-3-3h6" />
          <path className="social-follow-check" pathLength="1" d="m16 9 2 2 4-5" />
        </> : <path className="social-heart" d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />}
      </svg>
      {!follow && <span className="social-button-sparks">{Array.from({ length: 6 }, (_, index) => <i key={index} style={{ '--spark-angle': `${index * 60 + 15}deg` }} />)}</span>}
      <span className="social-button-spinner" />
    </span>
    <span className="social-button-label"><span aria-hidden="true" className="social-button-reserve">{follow ? 'Deixar de seguir' : 'Salvando…'}</span><span aria-hidden="true">{label}</span></span>
    {count !== undefined && <span className="social-button-count" aria-hidden="true"><span key={count}>{count.toLocaleString('pt-BR')}</span></span>}
  </button>;
}
