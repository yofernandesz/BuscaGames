import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import SocialButton from './SocialButton';

beforeEach(() => vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false }))));
afterEach(() => vi.unstubAllGlobals());

it('anima somente após confirmação e bloqueia ativações concorrentes', async () => {
  let complete;
  const onActivate = vi.fn(() => new Promise(resolve => { complete = resolve; }));
  render(<SocialButton kind="follow" active={false} onActivate={onActivate} />);
  const button = screen.getByRole('button', { name: 'Seguir' });
  fireEvent.click(button); fireEvent.click(button);
  expect(onActivate).toHaveBeenCalledTimes(1);
  expect(button).not.toHaveAttribute('data-celebrating');
  await act(async () => complete(true));
  expect(button).toHaveAttribute('data-celebrating', 'true');
});

it('não celebra estado restaurado, falha, login ou remoção e respeita movimento reduzido', async () => {
  const onActivate = vi.fn().mockResolvedValue(false);
  const view = render(<SocialButton kind="like" active count={12} onActivate={onActivate} />);
  const button = screen.getByRole('button', { name: 'Descurtir, 12 curtidas' });
  expect(button).toHaveAttribute('aria-pressed', 'true');
  expect(button).not.toHaveAttribute('data-celebrating');
  fireEvent.click(button);
  await waitFor(() => expect(onActivate).toHaveBeenCalledTimes(1));
  expect(button).not.toHaveAttribute('data-celebrating');
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
  onActivate.mockResolvedValue(true);
  view.rerender(<SocialButton kind="like" active={false} count={12} onActivate={onActivate} />);
  fireEvent.click(button);
  await waitFor(() => expect(onActivate).toHaveBeenCalledTimes(2));
  expect(button).not.toHaveAttribute('data-celebrating');
});

it('anuncia o carregamento e preserva a contagem sem permitir novos envios', () => {
  const onActivate = vi.fn();
  render(<SocialButton kind="like" busy active count={1} onActivate={onActivate} />);
  const button = screen.getByRole('button', { name: 'Salvando…, 1 curtida' });
  expect(button).toBeDisabled();
  expect(button).toHaveAttribute('aria-busy', 'true');
  expect(button).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(button);
  expect(onActivate).not.toHaveBeenCalled();
});
