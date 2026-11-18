import { MAX_GAMES, segmentCenter } from '../model/roulette';

const colors = ['#933aff', '#007eae', '#5053ee', '#00877d', '#c12c87', '#295dc4'];
const sparks = Array.from({ length: 18 }, (_, index) => ({
  '--direction': `${index * 20 + (index % 3) * 4}deg`,
  '--distance': `${81 + (index % 5) * 5}%`,
  '--delay': `${(index % 4) * 60}ms`,
}));

export default function RouletteWheel({ games, spinning, winner, celebration, wheelRef }) {
  const count = games.length || MAX_GAMES;
  const slice = 360 / count;
  const labelTurn = winner ? 180 - (winner.restingAngle + 180) % 360 : 0;
  const stops = Array.from({ length: count }, (_, index) => {
    const color = games.length ? colors[index] : index % 2 ? '#233257' : '#472874';
    const start = index * slice;
    return `${color} ${start}deg ${(index + 1) * slice - 0.65}deg, #100e24 ${(index + 1) * slice - 0.65}deg ${(index + 1) * slice}deg`;
  });
  return <div className="roulette-wheel" data-state={spinning ? 'spinning' : winner ? 'winner' : 'idle'} aria-hidden="true">
    <div className="roulette-ring" />
    <div className="roulette-pointer" />
    <div className="roulette-disc" ref={wheelRef} style={{
      '--segments': `conic-gradient(${stops.join(', ')})`,
      '--label-turn': `${labelTurn}deg`,
    }}>
      {winner && <div className="roulette-highlight" style={{ '--winner-start': `${winner.index * slice}deg`, '--winner-end': `${(winner.index + 1) * slice}deg` }} />}
      {games.map((game, index) => {
        const angle = segmentCenter(index, count) * Math.PI / 180;
        return <div key={game.id} className="roulette-disc-label" data-segment={index} style={{
          left: `${50 + Math.sin(angle) * 31}%`, top: `${50 - Math.cos(angle) * 31}%`,
        }}><span>{game.title}</span></div>;
      })}
    </div>
    <div className="roulette-hub"><span>✦</span></div>
    {winner && <div className="roulette-sparks" key={celebration}>
      {sparks.map((style) => <span key={style['--direction']} style={style}><i /></span>)}
    </div>}
  </div>;
}

export function SegmentSwatch({ index }) {
  return <span aria-hidden="true" className="roulette-swatch" style={{ '--segment-color': colors[index] }} />;
}
