import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import StarRating from './StarRating';

function Rating({ initial = 0, save = async () => true, disabled = false }) {
  const [value, setValue] = useState(initial);
  return <StarRating value={value} disabled={disabled} onChange={async (next) => {
    if (await save(next)) setValue(next);
  }} />;
}

it.each([1, 2, 3, 4, 5])('reage à nota %i confirmada e encerra a animação', async (level) => {
  const { container } = render(<Rating />);
  const button = screen.getByRole('radio', { name: level === 1 ? '1 estrela' : `${level} estrelas` });
  fireEvent.click(button);
  await waitFor(() => expect(button).toHaveAttribute('aria-checked', 'true'));
  expect(container.firstChild).toHaveAttribute('data-reaction', String(level));
  expect(container.querySelectorAll('.is-reacting')).toHaveLength(level === 5 ? 5 : 1);
  expect(container.querySelectorAll('.star-spark')).toHaveLength(level === 5 ? 50 : level === 4 ? 6 : 0);
  fireEvent.animationEnd(button.querySelector('svg'));
  // React's jsdom fallback uses the prefixed event when AnimationEvent is absent.
  fireEvent(button.querySelector('svg'), new Event('webkitAnimationEnd', { bubbles: true }));
  expect(container.firstChild).not.toHaveAttribute('data-reaction');
});

it('preserva a nota e não celebra em falha; bloqueia envios repetidos enquanto salva', async () => {
  let finish;
  const save = vi.fn(() => new Promise(resolve => { finish = resolve; }));
  const { container } = render(<Rating initial={2} save={save} />);
  const fifth = screen.getByRole('radio', { name: '5 estrelas' });
  fireEvent.click(fifth);
  fireEvent.click(fifth);
  expect(save).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('radiogroup')).toHaveAttribute('aria-busy', 'true');
  expect(container.firstChild).not.toHaveAttribute('data-reaction');
  await act(async () => finish(false));
  expect(screen.getByRole('radio', { name: '2 estrelas' })).toHaveAttribute('aria-checked', 'true');
  expect(container.firstChild).not.toHaveAttribute('data-reaction');
});

it('antecipa no hover sem gravar, navega por teclado e limpa a nota sem celebrar', async () => {
  const save = vi.fn(async () => true);
  const { container } = render(<Rating save={save} />);
  const first = screen.getByRole('radio', { name: '1 estrela' });
  const fifth = screen.getByRole('radio', { name: '5 estrelas' });
  fireEvent.mouseEnter(fifth);
  expect(container.firstChild).toHaveAttribute('data-level', '5');
  expect(save).not.toHaveBeenCalled();
  expect(container.firstChild).not.toHaveAttribute('data-reaction');
  fireEvent.mouseLeave(container.firstChild);
  expect(container.firstChild).toHaveAttribute('data-level', '0');
  fireEvent.keyDown(first, { key: 'End' });
  expect(fifth).toHaveFocus();
  await waitFor(() => expect(fifth).toHaveAttribute('aria-checked', 'true'));
  fireEvent.click(fifth);
  await waitFor(() => expect(fifth).toHaveAttribute('aria-checked', 'false'));
  expect(container.firstChild).not.toHaveAttribute('data-reaction');
  expect(screen.getByText('sem nota')).toBeInTheDocument();
});

it('mantém leitura da nota salva sem animação inicial ou interação quando desabilitada', () => {
  const save = vi.fn();
  const { container } = render(<Rating initial={5} disabled save={save} />);
  const fifth = screen.getByRole('radio', { name: '5 estrelas' });
  expect(fifth).toBeDisabled();
  fireEvent.click(fifth);
  expect(save).not.toHaveBeenCalled();
  expect(container.firstChild).not.toHaveAttribute('data-reaction');
});
