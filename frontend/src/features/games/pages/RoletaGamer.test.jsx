import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { readCatalog } from '../hooks/useCatalog';
import { drawSpin, segmentCenter, SPIN_DURATION } from '../model/roulette';
import RoletaGamer from './RoletaGamer';

vi.mock('../../../components/layout/Header', () => ({ default: () => null }));
vi.mock('../hooks/useCatalog', () => ({ readCatalog: vi.fn() }));

const button = (name) => screen.getByRole('button', { name });
const input = () => screen.getByRole('textbox', { name: 'Nome do jogo' });
const list = () => screen.getByRole('list', { name: 'Participantes' });
const add = (title) => {
  fireEvent.change(input(), { target: { value: title } });
  fireEvent.click(button('Adicionar jogo'));
};
const mockGames = Array.from({ length: 8 }, (_, index) => ({ id: `igdb-${index + 1}`, title: `Jogo ${index + 1}`, genres: ['RPG', 'Tiro'], cover: '/cover.png' }));

beforeEach(() => {
  vi.mocked(readCatalog).mockReset().mockResolvedValue({ games: [] });
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('valida cadastro, edita, remove e mantém o rascunho ao alternar o modo', () => {
  render(<MemoryRouter><RoletaGamer /></MemoryRouter>);
  expect(button('Girar roleta')).toBeDisabled();
  add('   ');
  expect(screen.getByRole('alert')).toHaveTextContent('Digite o nome do jogo');
  add('Hollow   Knight');
  expect(button('Girar roleta')).toBeDisabled();
  add('  hollow KNIGHT  ');
  expect(screen.getByRole('alert')).toHaveTextContent('já está na roleta');
  expect(input()).toHaveFocus();
  add('Celeste');
  expect(button('Girar roleta')).toBeEnabled();
  fireEvent.click(button('Editar Celeste'));
  expect(input()).toHaveFocus();
  fireEvent.change(input(), { target: { value: 'Hades' } });
  fireEvent.click(button('Por gênero'));
  fireEvent.click(button('Personalizada'));
  expect(input()).toHaveValue('Hades');
  fireEvent.click(button('Salvar edição'));
  expect(list()).toHaveTextContent('Hades');
  for (const game of ['Portal', 'Fez', 'Disco Elysium', 'Outer Wilds']) add(game);
  expect(within(list()).getAllByRole('listitem')).toHaveLength(6);
  expect(button('Adicionar jogo')).toBeDisabled();
  expect(screen.getByText('6 de 6 jogos')).toBeInTheDocument();
  fireEvent.click(button('Remover Outer Wilds'));
  expect(button('Adicionar jogo')).toBeEnabled();
  expect(screen.getByText('5 de 6 jogos')).toBeInTheDocument();
});

it('consulta o gênero, pagina quando necessário, filtra duplicatas e reutiliza a lista', async () => {
  vi.mocked(readCatalog).mockResolvedValueOnce({ games: [mockGames[0], { ...mockGames[1], title: '  JOGO 1 ' }], hasMore: true })
    .mockResolvedValueOnce({ games: [...mockGames.slice(1), { id: 'inválido', title: 'Incompleto' }], hasMore: false });
  vi.spyOn(Math, 'random').mockReturnValue(0);
  render(<MemoryRouter><RoletaGamer /></MemoryRouter>);
  fireEvent.click(button('Por gênero'));
  const genre = screen.getByRole('combobox', { name: 'Gênero do catálogo' });
  fireEvent.change(genre, { target: { value: 'Role-playing (RPG)' } });
  fireEvent.click(button('Gerar 6 jogos'));
  expect(screen.getByText('Carregando jogos do catálogo…')).toBeInTheDocument();
  expect(await screen.findByText('6 de 6 jogos')).toBeInTheDocument();
  const titles = () => within(list()).getAllByRole('listitem').map((item) => item.textContent);
  const first = titles();
  expect(new Set(first).size).toBe(6);
  expect(readCatalog).toHaveBeenNthCalledWith(1, '/api/games?q=Role-playing+%28RPG%29&page=1&limit=48', expect.anything());
  expect(readCatalog).toHaveBeenNthCalledWith(2, '/api/games?q=Role-playing+%28RPG%29&page=2&limit=48', expect.anything());
  fireEvent.click(button('Personalizada'));
  fireEvent.click(button('Por gênero'));
  expect(screen.getByRole('combobox')).toHaveValue('Role-playing (RPG)');
  expect(titles()).toEqual(first);
  fireEvent.click(button('Gerar outros jogos'));
  expect(titles()).not.toEqual(first);
  expect(readCatalog).toHaveBeenCalledTimes(2);
  vi.mocked(window.matchMedia).mockReturnValue({ matches: true });
  fireEvent.click(button('Girar roleta'));
  expect(screen.getByRole('link', { name: 'Ver detalhes' })).toHaveAttribute('href', '/jogo/igdb-1');
});

it('oferece recuperação de erro e distingue resultados vazios e insuficientes', async () => {
  vi.mocked(readCatalog).mockRejectedValueOnce(new TypeError('offline'))
    .mockResolvedValueOnce({ games: [] }).mockResolvedValueOnce({ games: mockGames.slice(0, 2) });
  render(<MemoryRouter><RoletaGamer /></MemoryRouter>);
  fireEvent.click(button('Por gênero'));
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Adventure' } });
  fireEvent.click(button('Gerar 6 jogos'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível conectar');
  fireEvent.click(button('Tentar novamente'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Nenhum jogo encontrado');
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Shooter' } });
  fireEvent.click(button('Gerar 6 jogos'));
  expect(await screen.findByRole('alert')).toHaveTextContent('apenas 2 jogos');
  expect(button('Girar roleta')).toBeDisabled();
});

it('alinha todos os segmentos ao indicador e torna cada intervalo de sorteio equiprovável', () => {
  for (let count = 2; count <= 6; count++) {
    for (let index = 0; index < count; index++) {
      const from = 313.5;
      for (const random of [(index + .001) / count, (index + .999) / count]) {
        const result = drawSpin(count, from, () => random);
        expect(result.index).toBe(index);
        expect((result.restingAngle + segmentCenter(index, count)) % 360).toBeCloseTo(0);
        expect(result.endAngle % 360).toBeCloseTo(result.restingAngle);
        expect(result.endAngle - from).toBeGreaterThanOrEqual(7 * 360);
      }
    }
  }
});

it('trava sorteios simultâneos, revela o nome apontado, gira de novo e encerra ao desmontar', async () => {
  const { container, unmount } = render(<MemoryRouter><RoletaGamer /></MemoryRouter>);
  add('Celeste');
  add('Hades');
  const disc = container.querySelector('.roulette-disc');
  let complete;
  const cancel = vi.fn();
  disc.animate = vi.fn(() => ({ finished: new Promise((resolve) => { complete = resolve; }), cancel }));
  vi.spyOn(Math, 'random').mockReturnValue(.75);
  fireEvent.click(button('Girar roleta'));
  fireEvent.click(button('Girando…'));
  expect(disc.animate).toHaveBeenCalledTimes(1);
  expect(disc.animate.mock.calls[0][1].duration).toBe(SPIN_DURATION);
  expect(button('Por gênero')).toBeDisabled();
  expect(button('Remover Hades')).toBeDisabled();
  await act(async () => complete());
  expect(disc.style.transform).toBe('rotate(90deg)');
  expect(disc.querySelector('[data-segment="1"]')).toHaveTextContent('Hades');
  expect(screen.getByRole('heading', { name: 'Hades' })).toBeInTheDocument();
  expect(screen.getByText('O jogo escolhido foi Hades.')).toHaveAttribute('role', 'status');
  expect(screen.queryByRole('link', { name: 'Ver detalhes' })).not.toBeInTheDocument();
  fireEvent.click(button('Girar novamente'));
  expect(disc.animate).toHaveBeenCalledTimes(2);
  unmount();
  expect(cancel).toHaveBeenCalledTimes(2);
});

it('mostra o resultado sem animar em movimento reduzido e vincula títulos exatos', async () => {
  vi.mocked(window.matchMedia).mockReturnValue({ matches: true });
  const { container } = render(<MemoryRouter><RoletaGamer /></MemoryRouter>);
  add('Celeste');
  add('Hades');
  vi.spyOn(Math, 'random').mockReturnValue(0);
  vi.mocked(readCatalog).mockResolvedValue({ games: [{ id: 'igdb-1', title: 'Celeste', cover: '/celeste.png' }, { id: 'igdb-2', title: 'Celeste 2' }] });
  const disc = container.querySelector('.roulette-disc');
  disc.animate = vi.fn();
  fireEvent.click(button('Girar roleta'));
  expect(screen.getByRole('heading', { name: 'Celeste' })).toBeInTheDocument();
  expect(await screen.findByRole('link', { name: 'Ver detalhes' })).toHaveAttribute('href', '/jogo/igdb-1');
  expect(disc.animate).not.toHaveBeenCalled();
  fireEvent.click(button('Girar novamente'));
  expect(await screen.findByRole('link', { name: 'Ver detalhes' })).toHaveAttribute('href', '/jogo/igdb-1');
});
