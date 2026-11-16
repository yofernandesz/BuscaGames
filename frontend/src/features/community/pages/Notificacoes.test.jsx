import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import Notificacoes from './Notificacoes';
import { useGames } from '../../games/hooks/useGames';
import { communityApi } from '../../../lib/communityApi';

vi.mock('../../games/hooks/useGames');
vi.mock('../../../lib/communityApi');
let inbox, failRead;
beforeEach(() => {
  failRead = false;
  useGames.mockReturnValue({ user: { id: 2 }, accountLoading: false });
  inbox = { unreadCount: 1, latestId: 5, nextCursor: null, emailEnabled: true, emailAvailable: false,
    notifications: [{ id: 5, kind: 'reply', actorId: 1, actor: 'Ana', message: 'respondeu ao seu comentário.', path: '/jogo/igdb-1#comentarios', createdAt: '2026-11-13T12:00:00Z', readAt: null }] };
  communityApi.mockImplementation(async (path, options) => {
    if (path.endsWith('/count')) return { unreadCount: inbox.unreadCount };
    if (path.endsWith('/read')) {
      if (failRead) throw new Error('Falha ao salvar. Tente novamente.');
      inbox.unreadCount = 0;
      return { unreadCount: 0 };
    }
    if (path.endsWith('/preferences')) return options.body;
    return structuredClone(inbox);
  });
});
const open = () => render(<MemoryRouter><Notificacoes /></MemoryRouter>);

it('mostra o sino, mantém não lida ao abrir e atualiza a contagem após leitura explícita', async () => {
  open();
  expect(await screen.findByRole('link', { name: 'Notificações: 1 não lidas' })).toBeInTheDocument();
  expect(await screen.findByText('Não lida')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Ver conversa' })).toHaveAttribute('href', '/jogo/igdb-1#comentarios');
  expect(communityApi.mock.calls.some(([path]) => path.endsWith('/read'))).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Marcar todas como lidas' }));
  expect(await screen.findByText('Lida')).toBeInTheDocument();
  await screen.findByRole('link', { name: 'Notificações: 0 não lidas' });
  expect(communityApi).toHaveBeenCalledWith('/api/notifications/read', { method: 'PUT', body: { throughId: 5 } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Receber alertas por email' }));
  await waitFor(() => expect(screen.getByRole('checkbox')).not.toBeChecked());
});

it('preserva não lidas em falha de escrita e permite tentar novamente', async () => {
  failRead = true;
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Marcar como lida' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao salvar');
  expect(screen.getByText('Não lida')).toBeInTheDocument();
  failRead = false;
  fireEvent.click(screen.getByRole('button', { name: 'Marcar como lida' }));
  expect(await screen.findByText('Lida')).toBeInTheDocument();
});

it('mostra carregamento, erro recuperável e lista vazia', async () => {
  communityApi.mockRejectedValueOnce(new Error('Sem conexão')).mockRejectedValueOnce(new Error('Sem conexão'));
  open();
  expect(screen.getByText('Carregando notificações…')).toBeInTheDocument();
  await screen.findByRole('button', { name: 'Tentar novamente' });
  inbox.notifications = []; inbox.unreadCount = 0;
  fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  expect(await screen.findByText(/Nenhuma notificação por aqui/)).toBeInTheDocument();
});

it('não consulta notificações de visitantes', () => {
  useGames.mockReturnValue({ user: null, accountLoading: false });
  open();
  expect(screen.getByRole('button', { name: 'Entrar para ver notificações' })).toBeInTheDocument();
  expect(communityApi).not.toHaveBeenCalled();
});
