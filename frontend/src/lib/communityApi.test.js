import { afterEach, expect, it, vi } from 'vitest';
import { communityApi } from './communityApi';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('no Pages mantém visitante e bloqueia operações sem enviar dados', async () => {
  vi.stubEnv('VITE_GITHUB_PAGES', 'true');
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  await expect(communityApi('/api/auth/me')).resolves.toEqual({ user: null, googleEnabled: false });
  await expect(communityApi('/api/auth/register', { method: 'POST', body: { password: 'example' } }))
    .rejects.toThrow('não está disponível nesta publicação');
  expect(fetch).not.toHaveBeenCalled();
});

it.each([
  [404, 'O serviço de contas está indisponível.'],
  [405, 'O serviço de contas está indisponível.'],
  [413, 'O arquivo ou os dados enviados são maiores do que o servidor aceita.'],
  [502, 'Serviço temporariamente indisponível.'],
  [200, 'Resposta inválida do servidor.'],
])('explica respostas não JSON (HTTP %s) sem perder o status', async (status, message) => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ status, ok: status === 200, json: async () => { throw new SyntaxError(); } })));
  await expect(communityApi('/api/auth/register', { method: 'POST', body: {} }))
    .rejects.toMatchObject({ status, message: expect.stringContaining(message) });
});

it('explica também o limite quando a API responde 413 em JSON', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ status: 413, ok: false, json: async () => ({ error: 'Dados muito longos.' }) })));
  await expect(communityApi('/api/auth/background', { method: 'PUT', body: { photo: 'image' } }))
    .rejects.toMatchObject({ status: 413, message: expect.stringContaining('maiores do que o servidor aceita') });
});

it('preserva o erro de cadastro informado pela API', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ status: 409, ok: false, json: async () => ({ error: 'Não foi possível cadastrar este e-mail. Tente entrar.' }) })));
  await expect(communityApi('/api/auth/register', { method: 'POST', body: {} }))
    .rejects.toMatchObject({ status: 409, message: 'Não foi possível cadastrar este e-mail. Tente entrar.' });
});
