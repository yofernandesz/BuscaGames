# Testes no navegador

Execute a partir da **raiz do repositório**, com Node.js 24, dependências do
frontend instaladas, Microsoft Edge e Playwright disponível. Esses scripts
ficavam em `evidencias/`; agora ficam separados dos arquivos que produzem.

Se Playwright não estiver na resolução normal de módulos, defina
`PLAYWRIGHT_MODULE` com o caminho para a instalação existente. Ele é usado
somente na verificação e não é dependência da aplicação.

| Comando | Cobertura |
| --- | --- |
| `node tests/e2e/skeleton-browser.cjs` | Skeletons em nove rotas, desktop/mobile, falhas e movimento reduzido |
| `node tests/e2e/admin-browser.mjs` | Login e operações administrativas |
| `node tests/e2e/community-browser.cjs` | Perfis públicos, seguidores e curtidas |
| `node tests/e2e/replies-browser.cjs` | Respostas, limites, falha de envio, teclado e mobile |
| `node tests/e2e/cookies-session-browser.cjs` | Cookies e estado da sessão |
| `node tests/e2e/favorite-browser.cjs` | Favoritos e movimento |
| `node tests/e2e/profile-background-browser.cjs` | Envio, persistência e remoção de capa |
| `node tests/e2e/profile-social-browser.cjs` | Conexões e conteúdo dos perfis |
| `node tests/e2e/rating-browser.cjs` | Notas, teclado e animações |
| `node tests/e2e/responsive-browser.cjs` | Layout e controles em telas estreitas |

Os scripts iniciam servidores locais temporários e usam respostas simuladas ou
SQLite em memória. Execute um por vez: alguns usam portas fixas. Capturas ficam
em `evidencias/capturas/`; resultados JSON ficam em `evidencias/resultados/`.

Os testes de componente continuam junto do código em `frontend/src/`; os testes
da API continuam em `backend/test/`. São executados pelos comandos npm existentes
e pela integração contínua. Os scripts desta pasta são verificações adicionais.
