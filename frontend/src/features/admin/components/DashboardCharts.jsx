import { useState } from 'react';

const format = value => value.toLocaleString('pt-BR');
const shortDate = day => day.slice(8) + '/' + day.slice(5, 7);

function ActivityChart({ history }) {
  const [days, setDays] = useState(7);
  const rows = history.slice(-days);
  const peak = Math.max(1, ...rows.flatMap(row => [row.registrations, row.reviews]));
  const x = index => 8 + index * 584 / (rows.length - 1);
  const y = count => 106 - count / peak * 94;
  return <section className="dash-chart dash-history">
    <div className="dash-chart-head"><h2>Cadastros e revisões</h2>
      <div className="dash-switch" role="group" aria-label="Período do histórico">{[7, 30].map(n =>
        <button type="button" key={n} aria-pressed={days === n} onClick={() => setDays(n)}>{n} dias</button>)}</div>
    </div>
    <div className="dash-legend"><span>Cadastros</span><span>Revisões</span></div>
    <div className="dash-plot"><div aria-hidden="true" className="dash-axis"><span>{format(peak)}</span><span>0</span></div>
      <svg viewBox="0 0 600 118" preserveAspectRatio="none" role="img" aria-label={'Cadastros e revisões por dia nos últimos ' + days + ' dias. Valores na tabela abaixo.'}>
        {[12, 59, 106].map(n => <line key={n} x1="0" x2="600" y1={n} y2={n} stroke="var(--line)" />)}
        {['registrations', 'reviews'].map((key, i) =>
          <polyline key={key} points={rows.map((row, index) => x(index) + ',' + y(row[key])).join(' ')} fill="none" stroke={i ? 'var(--neon-purple)' : 'var(--neon-cyan)'} strokeWidth={i ? 2 : 3} strokeDasharray={i ? '5 4' : undefined} vectorEffect="non-scaling-stroke" />)}
      </svg></div>
    <div className="dash-dates"><span>{shortDate(rows[0].day)}</span><span>{shortDate(rows.at(-1).day)}</span></div>
    <details><summary>Ver valores por dia</summary><div className="dash-daily"><table><thead><tr><th>Data</th><th>Cadastros</th><th>Revisões</th></tr></thead><tbody>{rows.map(row =>
      <tr key={row.day}><th scope="row">{shortDate(row.day)}</th><td>{format(row.registrations)}</td><td>{format(row.reviews)}</td></tr>)}</tbody></table></div></details>
  </section>;
}

function AccountChart({ users, reviewed, blocked }) {
  const [status, setStatus] = useState(false);
  const first = status ? users - blocked : reviewed;
  const fraction = users ? first / users : 0;
  const segments = status ? ['Ativos', 'Bloqueados'] : ['Revisados', 'Pendentes'];
  return <section className="dash-chart"><div className="dash-chart-head"><h2>Perfis de usuários</h2>
    <div className="dash-switch" role="group" aria-label="Distribuição dos perfis">{['Revisão','Acesso'].map((label,i) =>
      <button key={label} type="button" aria-pressed={status === Boolean(i)} onClick={() => setStatus(Boolean(i))}>{label}</button>)}</div></div>
    <div className="dash-accounts"><div className="dash-ring" aria-hidden="true" style={{ background: users ? 'conic-gradient(var(--neon-cyan) ' + fraction * 100 + '%, var(--neon-purple) 0)' : 'var(--line)' }}><b>{format(users)}<small>usuários</small></b></div>
      <dl className="dash-breakdown">{segments.map((label,i) => <div key={label}><dt>{label}</dt><dd>{format(i ? users - first : first)}</dd></div>)}</dl></div>
  </section>;
}

export default function DashboardCharts({ charts }) {
  const { history, ratings, users, reviewed, blocked } = charts;
  const votes = new Map(ratings.map(row => [row.rating, row.votes]));
  const max = Math.max(1, ...votes.values());
  return <div className="dash-charts"><ActivityChart history={history} /><AccountChart users={users} reviewed={reviewed} blocked={blocked} />
    <section className="dash-chart"><h2>Notas da comunidade</h2>
      <dl className="dash-bars">{[5,4,3,2,1].map(rating => <div key={rating}><dt aria-label={rating + ' estrelas'}>{rating} ★</dt>
        <dd><span aria-hidden="true"><i style={{ width: ((votes.get(rating) || 0) / max * 100) + '%' }} /></span><b>{format(votes.get(rating) || 0)}</b></dd></div>)}</dl>
      {!ratings.length && <p>Nenhuma avaliação registrada.</p>}
    </section></div>;
}
