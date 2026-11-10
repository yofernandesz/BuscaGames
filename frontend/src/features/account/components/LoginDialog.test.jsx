import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { GamesProvider } from '../../games/context/GamesProvider';
import { useGames } from '../../games/hooks/useGames';
import FavoriteButton from '../../games/components/FavoriteButton';
import StarRating from '../../games/components/StarRating';
import Comments from '../../games/components/Comments';

let user, failLogin, failWrite, delayLogin;
beforeEach(() => {
  localStorage.clear(); user = null; failLogin = false; failWrite = 0; delayLogin = null;
  vi.stubGlobal('fetch', vi.fn(async (path, options) => {
    const body = options.body && JSON.parse(options.body);
    const reply = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
    if (path === '/api/auth/me') return reply({ user, googleEnabled: true });
    if (path === '/api/auth/login' || path === '/api/auth/register') {
      if (delayLogin) await delayLogin;
      if (failLogin) return reply({ error: 'E-mail ou senha incorretos.' }, 401);
      user = { id: 1, name: 'Ana', email: body.email, favorites: [], ratings: {}, commentCount: 0 };
    } else if (path === '/api/auth/google/start') return reply({ error: 'Não foi possível conectar ao Google.' }, 503);
    else if (options.method === 'PUT') {
      if (failWrite) return reply({ error: 'Não foi possível salvar.' }, failWrite);
      user = path.endsWith('favorite') ? { ...user, favorites: body.favorite ? ['igdb-1'] : [] } : { ...user, ratings: { 'igdb-1': body.rating } };
    }
    return reply(path.endsWith('comments') ? { comments: [], own: null, nextCursor: null } : { user });
  }));
});
afterEach(() => vi.unstubAllGlobals());
function Actions() {
  const { ratings, rateGame } = useGames();
  return <><FavoriteButton game={{ id: 'igdb-1', title: 'Aventura' }} /><StarRating value={ratings['igdb-1']} onChange={(value) => rateGame('igdb-1', value)} /><Comments gameId="igdb-1" /></>;
}
async function open(path = '/jogo/igdb-1') {
  render(<MemoryRouter initialEntries={[path]}><GamesProvider><Actions /></GamesProvider></MemoryRouter>);
  await screen.findByRole('button', { name: 'Adicionar comentário' });
}
function credentials() {
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'ana@example.com' } });
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'uma-senha-longa' } });
}

it('mantém leitura livre e pede login nas três ações, sem gravar como visitante; Escape restaura foco', async () => {
  await open();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  for (const trigger of [screen.getByRole('button', { name: 'Adicionar Aventura aos favoritos' }), screen.getByRole('radio', { name: '4 estrelas' }), screen.getByRole('button', { name: 'Adicionar comentário' })]) {
    trigger.focus(); fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Continuar com Google' })).toBeEnabled();
    expect(document.documentElement.style.overflow).toBe('hidden');
    const continueButton = within(dialog).getByRole('button', { name: 'Continuar explorando sem entrar' });
    continueButton.focus(); fireEvent.keyDown(continueButton, { key: 'Tab' });
    expect(within(dialog).getByRole('button', { name: 'Fechar login e continuar explorando' })).toHaveFocus();
    fireEvent(dialog, new Event('cancel', { bubbles: true, cancelable: true }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  }
  expect(fetch.mock.calls.filter(([, options]) => options.method !== 'GET')).toHaveLength(0);
  expect(localStorage.getItem('buscagames:favorites')).toBeNull();
  expect(localStorage.getItem('buscagames:ratings')).toBeNull();
});

it('anima o clique de adicionar, preserva o estado na falha e permite repetir após remover', async () => {
  user = { id: 1, name: 'Ana', favorites: [], ratings: {}, commentCount: 0 };
  render(<MemoryRouter><GamesProvider><Actions /></GamesProvider></MemoryRouter>);
  const button = screen.getByRole('button', { name: 'Adicionar Aventura aos favoritos' });
  await waitFor(() => expect(button).toBeEnabled());
  failWrite = 503;
  fireEvent.click(button);
  fireEvent.click(button);
  expect(button).toBeDisabled();
  expect(button.querySelector('.is-bursting')).toBeInTheDocument();
  await screen.findByText('Não foi possível salvar.');
  expect(button).toHaveAttribute('aria-pressed', 'false');
  expect(fetch.mock.calls.filter(([, options]) => options.method === 'PUT')).toHaveLength(1);
  fireEvent.animationEnd(button.querySelector('svg'));
  // React uses the WebKit event fallback when jsdom lacks AnimationEvent.
  fireEvent(button.querySelector('svg'), new Event('webkitAnimationEnd', { bubbles: true }));
  expect(button.querySelector('.is-bursting')).not.toBeInTheDocument();

  failWrite = 0;
  fireEvent.click(button);
  expect(button.querySelector('.is-bursting')).toBeInTheDocument();
  await waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'true'));
  fireEvent.click(button);
  expect(button.querySelector('.is-bursting')).not.toBeInTheDocument();
  await waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'false'));
  fireEvent.click(button);
  expect(button.querySelector('.is-bursting')).toBeInTheDocument();
  await waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'true'));
});

it('valida, mostra senha, preserva e-mail no erro e autentica sem duplicar envio; permite ações na conta', async () => {
  await open();
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar Aventura aos favoritos' }));
  fireEvent.click(screen.getByRole('button', { name: 'Entrar', exact: true }));
  expect(screen.getByLabelText('E-mail')).toHaveFocus();
  credentials();
  expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'password');
  fireEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }));
  expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'text');
  failLogin = true;
  fireEvent.click(screen.getByRole('button', { name: 'Entrar', exact: true }));
  await screen.findByText('E-mail ou senha incorretos.');
  expect(screen.getByLabelText('E-mail')).toHaveValue('ana@example.com');
  expect(screen.getByLabelText('Senha')).toHaveValue('');
  failLogin = false; credentials();
  let resolveLogin; delayLogin = new Promise((resolve) => { resolveLogin = resolve; });
  fireEvent.click(screen.getByRole('button', { name: 'Entrar', exact: true }));
  expect(screen.getByRole('button', { name: 'Aguarde…' })).toBeDisabled();
  fireEvent.submit(screen.getByLabelText('E-mail').closest('form'));
  expect(fetch.mock.calls.filter(([path]) => path === '/api/auth/login')).toHaveLength(2);
  resolveLogin();
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  failWrite = 503;
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar Aventura aos favoritos' }));
  await screen.findByText('Não foi possível salvar.', { exact: false });
  expect(screen.queryByRole('button', { name: 'Remover Aventura dos favoritos' })).not.toBeInTheDocument();
  failWrite = 0;
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar Aventura aos favoritos' }));
  await screen.findByRole('button', { name: 'Remover Aventura dos favoritos' });
  fireEvent.click(screen.getByRole('radio', { name: '5 estrelas' }));
  await waitFor(() => expect(screen.getByRole('radio', { name: '5 estrelas' })).toHaveAttribute('aria-checked', 'true'));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  failWrite = 401;
  fireEvent.click(screen.getByRole('button', { name: 'Remover Aventura dos favoritos' }));
  await screen.findByRole('dialog');
  expect(screen.getByText(/Sua sessão expirou/)).toBeInTheDocument();
});

it('permite cadastro no mesmo modal e recupera erro e cancelamento Google', async () => {
  await open('/jogo/igdb-1?auth=google_cancelled');
  await screen.findByText(/A conexão com Google foi cancelada/);
  fireEvent.click(screen.getByRole('button', { name: 'Continuar com Google' }));
  await screen.findByText('Não foi possível conectar ao Google.');
  fireEvent.click(screen.getByRole('button', { name: 'Criar uma conta' }));
  fireEvent.change(screen.getByLabelText('Nome de exibição'), { target: { value: 'Ana' } });
  credentials();
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'nuvem-lunar-unica' } });
  fireEvent.change(screen.getByLabelText('Confirmar senha'), { target: { value: 'nuvem-lunar-unica' } });
  fireEvent.click(screen.getByRole('button', { name: 'Criar conta', exact: true }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(fetch.mock.calls.some(([path]) => path === '/api/auth/register')).toBe(true);
});

it('explica critérios, bloqueia senhas previsíveis e exige confirmação sem impedir colar', async () => {
  await open();
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar Aventura aos favoritos' }));
  fireEvent.click(screen.getByRole('button', { name: 'Criar uma conta' }));
  expect(screen.getByRole('list', { name: 'Critérios da senha' })).toBeInTheDocument();
  expect(screen.getByText('De 8 a 20 caracteres.')).toBeInTheDocument();
  expect(screen.getByLabelText('Senha')).toHaveAttribute('minlength', '8');
  fireEvent.change(screen.getByLabelText('Nome de exibição'), { target: { value: 'Ana' } });
  credentials();
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'curta' } });
  fireEvent.click(screen.getByRole('button', { name: 'Criar conta', exact: true }));
  expect(screen.getByLabelText('Senha')).toHaveFocus();
  expect(screen.getByLabelText('Senha')).toHaveAttribute('aria-invalid', 'true');
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'Password123456789!' } });
  fireEvent.click(screen.getByRole('button', { name: 'Criar conta', exact: true }));
  expect(screen.getByRole('alert')).toHaveTextContent('Evite senhas comuns');
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'café violeta lunar' } });
  fireEvent.change(screen.getByLabelText('Confirmar senha'), { target: { value: 'outra frase' } });
  fireEvent.click(screen.getByRole('button', { name: 'Criar conta', exact: true }));
  expect(screen.getByLabelText('Confirmar senha')).toHaveFocus();
  expect(screen.getByLabelText('Confirmar senha')).toHaveAttribute('type', 'password');
  fireEvent.click(screen.getByRole('button', { name: 'Mostrar confirmação de senha' }));
  expect(screen.getByLabelText('Confirmar senha')).toHaveAttribute('type', 'text');
  expect(fetch.mock.calls.some(([path]) => path === '/api/auth/register')).toBe(false);
  fireEvent.change(screen.getByLabelText('Confirmar senha'), { target: { value: 'café violeta lunar' } });
  expect(screen.getByText('As senhas coincidem.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Criar conta', exact: true }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  const [, options] = fetch.mock.calls.find(([path]) => path === '/api/auth/register');
  expect(JSON.parse(options.body).password).toBe('café violeta lunar');
});
