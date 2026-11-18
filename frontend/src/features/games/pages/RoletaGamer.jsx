import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../../../components/layout/Header';
import Skeleton from '../../../components/ui/Skeleton';
import GameImage from '../components/GameImage';
import RouletteWheel, { SegmentSwatch } from '../components/RouletteWheel';
import { readCatalog } from '../hooks/useCatalog';
import { cleanTitle, drawSpin, GENRES, hasDetails, MAX_GAMES, sampleGames, SPIN_DURATION, titleKey, uniqueGames } from '../model/roulette';
import '../styles/roulette.css';

export default function RoletaGamer() {
  const [mode, setMode] = useState('manual');
  const [manual, setManual] = useState([]);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(null);
  const [validation, setValidation] = useState('');
  const [genre, setGenre] = useState('');
  const [automatic, setAutomatic] = useState([]);
  const [catalogError, setCatalogError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState(null);
  const [manualMatch, setManualMatch] = useState(null);
  const heading = useRef(null);
  const rosterHeading = useRef(null);
  const input = useRef(null);
  const wheel = useRef(null);
  const spin = useRef(null);
  const angle = useRef(0);
  const request = useRef(null);
  const pools = useRef(new Map());
  const sequence = useRef(0);
  const manualMode = mode === 'manual';
  const participants = manualMode ? manual : automatic;
  const ready = manualMode ? participants.length >= 2 : participants.length === MAX_GAMES && !loading;
  const full = manual.length === MAX_GAMES && editing === null;
  const winnerTitle = winner?.game.title;
  const celebration = winner?.celebration;
  const winnerInfo = winner?.game ?? null;
  const catalogGame = hasDetails(winnerInfo) ? winnerInfo : manualMatch?.title === winnerTitle ? manualMatch?.game : null;

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Roleta Gamer — BuscaGames';
    heading.current?.focus({ preventScroll: true });
    return () => {
      document.title = previousTitle;
      const animation = spin.current;
      spin.current = null;
      animation?.cancel();
      request.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!winnerTitle || !manualMode || winnerTitle.length > 120) return;
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]);
    const params = new URLSearchParams({ q: winnerTitle, limit: 48 });
    readCatalog(`/api/games?${params}`, signal).then(({ games }) => {
      if (signal.aborted) return;
      const matches = games.filter((game) => hasDetails(game) && typeof game.title === 'string' && titleKey(game.title) === titleKey(winnerTitle));
      if (matches.length === 1) setManualMatch({ title: winnerTitle, game: matches[0] });
    }).catch(() => { /* A consulta é opcional para jogos digitados. */ });
    return () => controller.abort();
  }, [celebration, manualMode, winnerTitle]);

  function clearWinner() {
    setWinner(null);
    setManualMatch(null);
    angle.current = 0;
    wheel.current.style.transform = '';
  }

  function changeMode(next) {
    if (spin.current || next === mode) return;
    clearWinner();
    setMode(next);
  }

  function saveGame(event) {
    event.preventDefault();
    if (spin.current || full) return;
    const title = cleanTitle(draft);
    const error = !title ? 'Digite o nome do jogo.' : manual.some((game) => game.id !== editing && titleKey(game.title) === titleKey(title))
      ? 'Esse jogo já está na roleta.' : '';
    setValidation(error);
    if (error) { input.current.focus(); return; }
    clearWinner();
    if (editing === null) setManual([...manual, { id: `manual-${++sequence.current}`, title }]);
    else setManual(manual.map((game) => game.id === editing ? { ...game, title } : game));
    setEditing(null);
    setDraft('');
    if (manual.length + Number(editing === null) < MAX_GAMES) input.current.focus();
    else rosterHeading.current.focus();
  }

  function editGame(game) {
    setEditing(game.id);
    setDraft(game.title);
    setValidation('');
  }

  useEffect(() => {
    if (editing !== null && manualMode) { input.current?.focus(); input.current?.select(); }
  }, [editing, manualMode]);

  function removeGame(game) {
    clearWinner();
    setManual(manual.filter((item) => item.id !== game.id));
    if (editing === game.id) cancelEdit();
    rosterHeading.current.focus();
  }

  function cancelEdit() {
    setEditing(null);
    setDraft('');
    setValidation('');
  }

  function changeGenre(event) {
    setGenre(event.target.value);
    setCatalogError(null);
    setAutomatic([]);
    clearWinner();
  }

  async function generate() {
    if (!genre || request.current || spin.current) return;
    setCatalogError(null);
    let games = pools.current.get(genre);
    if (!games) {
      const controller = new AbortController();
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]);
      request.current = controller;
      setLoading(true);
      try {
        let page = 1;
        let hasMore;
        const candidates = [];
        do {
          const params = new URLSearchParams({ genre, page, limit: 48 });
          const data = await readCatalog(`/api/games?${params}`, signal);
          if (controller.signal.aborted) return;
          candidates.push(...data.games);
          games = uniqueGames(candidates);
          hasMore = data.hasMore;
          page++;
        } while (games.length < MAX_GAMES && hasMore);
        if (games.length >= MAX_GAMES) pools.current.set(genre, games);
      } catch (error) {
        if (!controller.signal.aborted) setCatalogError({ retry: true, message: signal.aborted
          ? 'A consulta demorou demais. Tente novamente.'
          : error instanceof TypeError ? 'Não foi possível conectar ao catálogo. Tente novamente.' : error.message });
        return;
      } finally {
        request.current = null;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    if (games.length < MAX_GAMES) {
      setCatalogError({ message: games.length ? `Encontramos apenas ${games.length} ${games.length === 1 ? 'jogo' : 'jogos'}. Escolha outro gênero.`
        : 'Nenhum jogo encontrado. Escolha outro gênero.' });
      return;
    }
    // A consulta pode terminar enquanto a pessoa usa a roleta personalizada.
    setAutomatic(sampleGames(games, automatic));
  }

  function startSpin() {
    if (!ready || spin.current) return;
    const { index, restingAngle, endAngle } = drawSpin(participants.length, angle.current);
    const game = participants[index];
    const disc = wheel.current;
    setManualMatch(null);
    const finish = () => {
      angle.current = restingAngle;
      disc.style.transform = `rotate(${restingAngle}deg)`;
      const animation = spin.current;
      spin.current = null;
      animation?.cancel();
      setSpinning(false);
      setWinner({ index, game, restingAngle, celebration: ++sequence.current });
    };
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || !disc.animate) { finish(); return; }
    setWinner(null);
    setSpinning(true);
    const animation = disc.animate([{ transform: `rotate(${angle.current}deg)` }, { transform: `rotate(${endAngle}deg)` }], {
      duration: SPIN_DURATION, easing: 'cubic-bezier(.42, .02, .16, 1)', fill: 'forwards',
    });
    spin.current = animation;
    const settle = () => { if (spin.current === animation) finish(); };
    animation.finished.then(settle, settle);
  }

  return <>
    <Header />
    <main className="roulette-page">
      <div className="roulette-intro">
        <h1 tabIndex={-1} ref={heading}>Roleta <span>Gamer</span></h1>
        <p>Descubra qual vai ser seu próximo jogo.</p>
      </div>
      <div className="roulette-layout">
        <section className="roulette-controls" aria-labelledby="roulette-settings">
          <h2 id="roulette-settings">Configure seu sorteio</h2>
          <fieldset className="roulette-modes" disabled={spinning}>
            <legend className="sr-only">Modo de sorteio</legend>
            <button className="btn-ghost" type="button" aria-pressed={manualMode} onClick={() => changeMode('manual')}>Personalizada</button>
            <button className="btn-ghost" type="button" aria-pressed={!manualMode} onClick={() => changeMode('genre')}>Por gênero</button>
          </fieldset>
          <fieldset className="roulette-fields" disabled={spinning}>
            <legend className="sr-only">Jogos do sorteio</legend>
            {manualMode ? <form className="roulette-fields" onSubmit={saveGame} noValidate>
              <label htmlFor="roulette-name">Nome do jogo</label>
              <div className="roulette-form-row">
                <input ref={input} id="roulette-name" placeholder="Digite um título" value={draft} disabled={full} aria-invalid={Boolean(validation)}
                  aria-describedby={validation ? 'roulette-validation' : undefined} onChange={(event) => { setDraft(event.target.value); setValidation(''); }} />
                <button className="btn-ghost" disabled={full} type="submit">{editing === null ? 'Adicionar jogo' : 'Salvar edição'}</button>
              </div>
              {editing !== null && <button className="btn-ghost roulette-cancel" type="button" onClick={() => { cancelEdit(); rosterHeading.current.focus(); }}>Cancelar edição</button>}
              {validation && <p className="roulette-error" role="alert" id="roulette-validation">{validation}</p>}
            </form> : <>
              <label htmlFor="roulette-genre">Gênero do catálogo</label>
              <div className="roulette-form-row">
                <select id="roulette-genre" value={genre} disabled={loading} onChange={changeGenre}>
                  <option value="">Selecione um gênero</option>
                  {GENRES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <button className="btn-ghost" type="button" disabled={!genre} aria-disabled={loading} onClick={() => {
                  if (request.current || spin.current) return;
                  clearWinner();
                  void generate();
                }}>{loading ? 'Consultando…' : catalogError?.retry ? 'Tentar novamente' : automatic.length ? 'Gerar outros jogos' : 'Gerar 6 jogos'}</button>
              </div>
              {catalogError && <p className="roulette-error" role="alert">{catalogError.message}</p>}
            </>}
          </fieldset>
          <div className="roulette-roster">
            <div className="roulette-roster-heading">
              <h3 id="roulette-participants" tabIndex={-1} ref={rosterHeading}>Participantes</h3>
              <span role="status">{participants.length} de {MAX_GAMES} jogos</span>
            </div>
            {!manualMode && loading ? <Skeleton variant="rows" count={MAX_GAMES} label="Carregando jogos do catálogo…" /> : participants.length ?
              <ul aria-labelledby="roulette-participants">
                {participants.map((game, index) => <li key={game.id} data-winner={winner?.index === index || undefined}>
                  <SegmentSwatch index={index} />
                  <span className="roulette-game-title">{game.title}</span>
                  {manualMode && <div className="roulette-game-actions">
                    <button className="btn-ghost" type="button" disabled={spinning} aria-label={`Editar ${game.title}`} onClick={() => editGame(game)}>Editar</button>
                    <button className="btn-ghost" type="button" disabled={spinning} aria-label={`Remover ${game.title}`} onClick={() => removeGame(game)}>Remover</button>
                  </div>}
                </li>)}
              </ul> : <p className="roulette-muted">{manualMode ? 'Adicione de 2 a 6 jogos para girar.' : 'Escolha um gênero para gerar a lista de jogos.'}</p>}
          </div>
        </section>
        <section className="roulette-stage" aria-label="Sorteio">
          <RouletteWheel games={participants} spinning={spinning} winner={winner} celebration={winner?.celebration} wheelRef={wheel} />
          <div className="roulette-draw">
            <p className="sr-only" role="status" aria-atomic="true">{spinning ? 'Sorteio em andamento.' : winner ? `O jogo escolhido foi ${winnerTitle}.` : ''}</p>
            <button className="btn-details roulette-spin" type="button" disabled={!ready} aria-disabled={spinning} onClick={startSpin}>
              <span aria-hidden="true">{winner ? '↻' : '✦'}</span>
              {spinning ? 'Girando…' : winner ? 'Girar novamente' : 'Girar roleta'}
            </button>
            {!winner && <p className="roulette-muted">{spinning ? 'A roleta está escolhendo um jogo.' : ready ? 'Todos os jogos têm a mesma chance.'
              : manualMode ? 'A roleta precisa de pelo menos 2 jogos.' : 'Gere 6 jogos para girar a roleta.'}</p>}
            {winner && <div className="roulette-result" key={winner.celebration}>
              {catalogGame?.cover && <GameImage className="roulette-cover" src={catalogGame.cover} alt="" width="72" height="96" />}
              <div>
                <p>O jogo escolhido foi...</p>
                <h2>{winnerTitle}</h2>
                {catalogGame && <Link className="btn-ghost" to={`/jogo/${catalogGame.id}`}>Ver detalhes</Link>}
              </div>
            </div>}
          </div>
        </section>
      </div>
    </main>
  </>;
}
