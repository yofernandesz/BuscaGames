import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from '../../../app/App';

let viewer, profile, failFollow;
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('buscagames:cookie-choice', 'rejected');
  viewer = { id: 1, name: 'Ana', email: 'ana@example.com', favorites: [], ratings: { 'igdb-1': 1 } };
  profile = { id: 2, name: 'Bruno', favoriteCount: 1, ratingCount: 1, averageRating: 5, followerCount: 0, followingCount: 0, isFollowing: false };
  failFollow = false;
  vi.stubGlobal('fetch', vi.fn(async (path, options = {}) => {
    const url = new URL(path, 'http://localhost');
    let data;
    if (url.pathname === '/api/auth/me') data = { user: viewer };
    else if (url.pathname.endsWith('/follow')) {
      if (failFollow) return { ok: false, status: 503, json: async () => ({ error: 'Não foi possível seguir. Tente novamente.' }) };
      const following = JSON.parse(options.body).following;
      profile = { ...profile, isFollowing: following, followerCount: Number(following) }; data = { profile };
    } else if (url.pathname === '/api/users/2') data = { profile };
    else if (/\/(likes|comments)$/.test(url.pathname)) data = { comments: [{ id: 1, body: 'Uma aventura memorável.', createdAt: '2026-11-05T12:00:00Z', likeCount: 4, game: { id: 'igdb-1', title: 'Hollow Knight' } }], total: 13, page: Number(url.searchParams.get('page') || 1), pages: 2 };
    else if (url.pathname.endsWith('/library')) data = { games: [{ id: 'igdb-1', title: 'Hollow Knight', platforms: ['PC'], rating: 5, favorite: true }], total: 1, page: 1, pages: 1 };
    else data = { users: url.searchParams.get('q') === 'ausente' ? [] : [profile], total: 1, page: 1, pages: 1 };
    return { ok: true, json: async () => data };
  }));
});

it('abre as curtidas, pagina e mantém o destino do jogo e os dados privados protegidos', async () => {
  open('/perfil/2?aba=likes');
  await screen.findByText('Uma aventura memorável.');
  expect(screen.getByRole('link', { name: 'Curtidas recebidas', exact: true })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByText('4 curtidas')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Abrir conversa sobre Hollow Knight/ })).toHaveAttribute('href', '/jogo/igdb-1#comentarios');
  fireEvent.click(screen.getByRole('button', { name: 'Próxima' }));
  await screen.findByText('Página 2 de 2');
  expect(fetch.mock.calls.some(([path]) => path.includes('/likes?page=2'))).toBe(true);
  expect(screen.queryByText('ana@example.com')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: 'Comentários', exact: true }));
  await screen.findByRole('heading', { name: 'Comentários de Bruno' });
  await screen.findByText('Página 1 de 2');
});
afterEach(() => vi.unstubAllGlobals());
const open = (path = '/perfil/2') => render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);

it('abre o perfil por URL, mostra a nota do dono e segue/desfaz sem editar sua biblioteca', async () => {
  open();
  await screen.findByRole('heading', { level: 1, name: 'Bruno' });
  expect(await screen.findByText('Nota de Bruno: 5/5')).toBeInTheDocument();
  expect(screen.queryByText('ana@example.com')).not.toBeInTheDocument();
  expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Conversar sobre o jogo/ })).toHaveAttribute('href', '/jogo/igdb-1#comentarios');
  fireEvent.click(screen.getByRole('button', { name: 'Seguir' }));
  await screen.findByRole('link', { name: 'Seguidores (1)' });
  fireEvent.click(screen.getByRole('button', { name: 'Deixar de seguir' }));
  await screen.findByRole('link', { name: 'Seguidores (0)' });
  expect(viewer.ratings['igdb-1']).toBe(1);
});

it('preserva o estado em falha e permite repetir a ação', async () => {
  failFollow = true;
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Seguir' }));
  await screen.findByText('Não foi possível seguir. Tente novamente.');
  expect(screen.getByRole('button', { name: 'Seguir' })).toHaveAttribute('aria-pressed', 'false');
  failFollow = false;
  fireEvent.click(screen.getByRole('button', { name: 'Seguir' }));
  await screen.findByRole('button', { name: 'Deixar de seguir' });
});

it('convida visitante a entrar e não oferece seguir a própria conta', async () => {
  viewer = null;
  const view = open();
  const follow = await screen.findByRole('button', { name: 'Seguir' });
  await waitFor(() => expect(follow).toBeEnabled());
  fireEvent.click(follow);
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
  expect(fetch.mock.calls.some(([path]) => path.endsWith('/follow'))).toBe(false);
  view.unmount(); viewer = { id: 2, name: 'Bruno', favorites: [], ratings: {} };
  open();
  expect(await screen.findByText(/Este é o seu perfil público/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Seguir' })).not.toBeInTheDocument();
});

it('busca explicitamente, trata ausência de resultados e limpa a busca com foco', async () => {
  open('/comunidade');
  await screen.findByRole('heading', { name: 'Bruno' });
  const input = screen.getByRole('searchbox', { name: 'Buscar jogadores por nome' });
  fireEvent.change(input, { target: { value: 'ausente' } });
  fireEvent.click(screen.getByRole('button', { name: 'Buscar', exact: true }));
  await screen.findByText('Nada por aqui ainda.');
  fireEvent.click(screen.getByRole('button', { name: 'Limpar busca de jogadores' }));
  await screen.findByRole('heading', { name: 'Bruno' });
  await waitFor(() => expect(screen.getByRole('searchbox')).toHaveFocus());
  expect(screen.getByRole('searchbox')).toHaveValue('');
});
