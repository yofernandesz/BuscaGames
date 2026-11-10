export async function communityApi(path, { method = 'GET', body, signal } = {}) {
  if (import.meta.env.VITE_GITHUB_PAGES === 'true') {
    if (path === '/api/auth/me') return { user: null, googleEnabled: false };
    throw new Error('Este recurso depende do backend e não está disponível nesta publicação do frontend no GitHub Pages.');
  }
  let response;
  try { response = await fetch(path, {
    method, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000), credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json', 'X-BuscaGames-Request': '1' } : {},
    body: body ? JSON.stringify(body) : undefined,
  }); } catch { throw new Error('Falha de comunicação. Verifique sua conexão e tente novamente.'); }
  if (response.status === 413) throw Object.assign(new Error('O arquivo ou os dados enviados são maiores do que o servidor aceita. Reduza o tamanho e tente novamente.'), { status: 413 });
  let data;
  try { data = await response.json(); } catch {
    const message = [404, 405].includes(response.status)
      ? 'O serviço de contas está indisponível. Tente novamente em instantes.'
      : response.status >= 500 ? 'Serviço temporariamente indisponível. Tente novamente em instantes.'
        : 'Resposta inválida do servidor. Tente novamente.';
    throw Object.assign(new Error(message), { status: response.status });
  }
  if (!response.ok) throw Object.assign(new Error(data.error || 'Não foi possível concluir. Tente novamente.'), { status: response.status, field: data.field });
  return data;
}
