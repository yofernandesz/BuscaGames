import './skeleton.css';

function Block({ shape = 'line' }) {
  return <span className={`skeleton-block skeleton-${shape}`} />;
}

function Content({ variant, count }) {
  if (variant === 'details' || variant === 'profile') return <>
    <div className={`skeleton-feature skeleton-feature--${variant}`}>
      <Block shape={variant === 'profile' ? 'avatar' : 'cover'} />
      <div className="skeleton-copy"><Block shape="heading" /><Block /><Block /><Block shape="short" /><Block shape="button" /></div>
    </div>
    <Content variant="stats" count={4} />
    <Content variant="rows" count={2} />
  </>;
  if (variant === 'form') return <div className="skeleton-form"><Block shape="heading" />{Array.from({ length: 3 }, (_, i) => <div key={i}><Block shape="short" /><Block shape="field" /></div>)}<Block shape="button" /></div>;
  if (variant === 'dashboard') return <><Block shape="heading" /><Content variant="stats" count={4} /><Block shape="chart" /><Content variant="table" count={5} /></>;
  return <div className={`skeleton-layout skeleton-layout--${variant}`}>
    {Array.from({ length: count }, (_, i) => <div className={`skeleton-item skeleton-item--${variant}`} key={i}>
      {variant === 'cards' && <Block shape="cover" />}
      {variant === 'library' && <Block shape="cover" />}
      {variant === 'players' && <Block shape="avatar" />}
      <div className="skeleton-copy"><Block shape={variant === 'stats' ? 'short' : 'heading'} /><Block />{variant !== 'stats' && <Block shape="short" />}</div>
    </div>)}
  </div>;
}

// One announcement per loading region; decorative shapes never enter the tab order.
export default function Skeleton({ variant = 'rows', count = 3, label = 'Carregando…' }) {
  return <div className={`skeleton skeleton--${variant}`} role="status">
    <span className="sr-only">{label}</span>
    <div aria-hidden="true"><Content variant={variant} count={count} /></div>
  </div>;
}
