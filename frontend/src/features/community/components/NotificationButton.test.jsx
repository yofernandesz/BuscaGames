import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { communityApi } from '../../../lib/communityApi';
import NotificationButton from './NotificationButton';

vi.mock('../../../lib/communityApi');

it('mostra só sino e contador e reinicia o efeito a cada novo evento, inclusive com contagem igual', async () => {
  communityApi.mockResolvedValue({ unreadCount: 120, latestId: 5 });
  render(<MemoryRouter><NotificationButton /></MemoryRouter>);
  const link = await screen.findByRole('link', { name: 'Notificações: 120 não lidas' });
  expect(link).toHaveTextContent(/^99\+$/);
  expect(link).not.toHaveClass('notification-arrival');
  const initialBell = link.querySelector('.notification-bell');

  communityApi.mockResolvedValue({ unreadCount: 120, latestId: 6 });
  fireEvent(window, new Event('notifications-changed'));
  await vi.waitFor(() => expect(link.querySelector('.notification-bell')).not.toBe(initialBell));
  expect(link).toHaveClass('notification-arrival');
  const firstArrivalBell = link.querySelector('.notification-bell');

  communityApi.mockResolvedValue({ unreadCount: 120, latestId: 7 });
  fireEvent(window, new Event('notifications-changed'));
  await vi.waitFor(() => expect(link.querySelector('.notification-bell')).not.toBe(firstArrivalBell));
  const secondArrivalBell = link.querySelector('.notification-bell');

  communityApi.mockResolvedValue({ unreadCount: 0, latestId: 7 });
  fireEvent(window, new Event('notifications-changed'));
  await screen.findByRole('link', { name: 'Notificações: 0 não lidas' });
  expect(link.querySelector('.notification-bell')).toBe(secondArrivalBell);
});
