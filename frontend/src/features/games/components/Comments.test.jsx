import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { GamesProvider } from '../context/GamesProvider';
import Comments from './Comments';
import Account from '../../account/components/Account';

let user;
let comments;
let failWrite;
beforeEach(() => {
  localStorage.clear();
  user = { id: 1, name: 'Ana', email: 'ana@example.com', ratings: { 'igdb-1': 4 }, commentCount: 0, commentGameIds: [] };
  comments = []; failWrite = false;
  vi.stubGlobal('fetch', vi.fn(async (path, options) => {
    const body = options.body && JSON.parse(options.body);
    if (options.method !== 'GET' && failWrite) return { ok: false, json: async () => ({ error: 'Falha de comunicação. Tente novamente.' }) };
    if (path === '/api/auth/logout') user = null;
    else if (options.method === 'POST') comments = [{ id: 1, userId: 1, author: 'Ana', body: body.body, rating: 4, version: 1, createdAt: '2026-11-02T12:00:00Z' }];
    else if (options.method === 'PATCH') comments = comments.map((c) => ({ ...c, body: body.body, version: c.version + 1 }));
    else if (options.method === 'DELETE') comments = [];
    if (user) user = { ...user, commentCount: comments.length, commentGameIds: comments.length ? ['igdb-1'] : [] };
    return { ok: true, json: async () => path.includes('auth') || options.method !== 'GET' ? { user } : { comments, own: user ? comments[0] || null : null, nextCursor: null } };
  }));
});
afterEach(() => vi.unstubAllGlobals());
function open(compact = false) {
  return render(<MemoryRouter><GamesProvider><Account /><Comments gameId="igdb-1" compact={compact} /></GamesProvider></MemoryRouter>);
}
const count = () => screen.getByText('Comentários publicados').parentElement.querySelector('dd');

it('responde com até 35 caracteres, preserva falhas e bloqueia a terceira resposta', async () => {
  comments = [{ id: 1, userId: 1, author: 'Ana', body: 'Ótimo jogo', createdAt: '2026-11-02T12:00:00Z' }];
  const original = fetch;
  const replies = [];
  let fail = false;
  vi.stubGlobal('fetch', vi.fn(async (path, options) => {
    if (!path.endsWith('/replies')) return original(path, options);
    if (options.method === 'POST') {
      if (fail) return { ok: false, status: 503, json: async () => ({ error: 'Tente novamente.' }) };
      const reply = { id: replies.length + 1, userId: 1, author: 'Ana', body: JSON.parse(options.body).body, createdAt: '2026-11-02T12:00:00Z' };
      replies.push(reply);
      return { ok: true, json: async () => ({ reply, ownCount: replies.length }) };
    }
    return { ok: true, json: async () => ({ replies: [...replies], ownCount: replies.length, nextCursor: null }) };
  }));
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Responder / ver respostas' }));
  const input = await screen.findByLabelText('Responder a Ana');
  const publish = screen.getByRole('button', { name: 'Publicar resposta' });
  expect(publish).toBeDisabled();
  fireEvent.change(input, { target: { value: 'a'.repeat(36) } });
  expect(publish).toBeDisabled();
  fireEvent.change(input, { target: { value: '😀'.repeat(35) } });
  expect(publish).toBeEnabled();
  fail = true;
  fireEvent.click(publish);
  await screen.findByText('Tente novamente.');
  expect(input).toHaveValue('😀'.repeat(35));
  fail = false;
  fireEvent.click(publish);
  await screen.findByText('Resposta publicada.');
  expect(input).toHaveValue('');
  fireEvent.change(input, { target: { value: 'Concordo!' } });
  fireEvent.click(screen.getByRole('button', { name: 'Publicar resposta' }));
  await screen.findByText('Você já enviou duas respostas a este comentário.');
  expect(screen.queryByLabelText('Responder a Ana')).not.toBeInTheDocument();
  expect(screen.getByText('Concordo!')).toBeInTheDocument();
});

it('publica, edita e exclui, atualizando a contagem e renderizando texto sem executar HTML', async () => {
  open();
  const input = await screen.findByLabelText('Sua opinião sobre o jogo');
  expect(screen.getByRole('button', { name: 'Publicar comentário' })).toBeDisabled();
  fireEvent.change(input, { target: { value: '   ' } });
  expect(screen.getByRole('button', { name: 'Publicar comentário' })).toBeDisabled();
  fireEvent.change(input, { target: { value: '<img src=x onerror=alert(1)>' } });
  expect(screen.getByText('28/500 caracteres')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Publicar comentário' }));
  await screen.findByText('Comentário publicado.');
  expect(count()).toHaveTextContent('1');
  expect(document.querySelector('img')).toBeNull();
  expect((await screen.findAllByText('Nota: 4/5')).length).toBeGreaterThan(0);
  fireEvent.click(await screen.findByRole('button', { name: 'Editar comentário' }));
  fireEvent.change(screen.getByLabelText('Editar seu comentário'), { target: { value: 'Nova opinião' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar comentário' }));
  await screen.findByText('Comentário atualizado.');
  expect(count()).toHaveTextContent('1');
  fireEvent.click(await screen.findByRole('button', { name: 'Excluir comentário' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar exclusão' }));
  expect(count()).toHaveTextContent('1');
  fireEvent.click(screen.getByRole('button', { name: 'Excluir comentário' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));
  await screen.findByText('Comentário excluído.');
  expect(count()).toHaveTextContent('0');
  await screen.findByText('Nenhum comentário ainda. Compartilhe sua opinião sobre este jogo.');
});

it('preserva o texto na falha, valida o limite e recupera sem recarregar a página', async () => {
  open();
  const input = await screen.findByLabelText('Sua opinião sobre o jogo');
  expect(input).toHaveAttribute('maxlength', '500');
  fireEvent.change(input, { target: { value: 'a'.repeat(501) } });
  expect(screen.getByRole('button', { name: 'Publicar comentário' })).toBeDisabled();
  fireEvent.change(input, { target: { value: 'a'.repeat(500) } });
  failWrite = true;
  fireEvent.click(screen.getByRole('button', { name: 'Publicar comentário' }));
  await screen.findByText(/Falha de comunicação/);
  expect(input).toHaveValue('a'.repeat(500));
  expect(count()).toHaveTextContent('0');
  failWrite = false;
  fireEvent.click(screen.getByRole('button', { name: 'Publicar comentário' }));
  await screen.findByText('Comentário publicado.');
});

it('carrega comentários na biblioteca somente ao abrir e exige sessão para publicar', async () => {
  user = null;
  open(true);
  await screen.findByRole('button', { name: 'Entrar' });
  expect(fetch.mock.calls.some(([path]) => path.endsWith('/comments'))).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Ver comentários' }));
  await screen.findByText('Nenhum comentário ainda. Compartilhe sua opinião sobre este jogo.');
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar comentário' }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: 'Sua opinião sobre o jogo' })).not.toBeInTheDocument();
});

it('restaura comentários e contador após remontar a interface e mantém favoritos e notas locais no logout', async () => {
  localStorage.setItem('buscagames:ratings', JSON.stringify({ 'igdb-2': 5 }));
  localStorage.setItem('buscagames:favorites', JSON.stringify(['igdb-2']));
  const view = open();
  fireEvent.change(await screen.findByLabelText('Sua opinião sobre o jogo'), { target: { value: 'Persistente' } });
  fireEvent.click(screen.getByRole('button', { name: 'Publicar comentário' }));
  await screen.findByText('Comentário publicado.');
  view.unmount(); open();
  await screen.findByRole('button', { name: 'Editar comentário' });
  expect(count()).toHaveTextContent('1');
  fireEvent.click(screen.getByRole('button', { name: 'Sair da conta' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Editar comentário' })).not.toBeInTheDocument());
  expect(localStorage.getItem('buscagames:ratings')).toBe('{"igdb-2":5}');
  expect(localStorage.getItem('buscagames:favorites')).toBe('["igdb-2"]');
});
