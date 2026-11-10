# Aviso de cookies — 03/11/2026

- `App.jsx` aguarda a consulta de sessão e mostra o aviso automático apenas para visitantes sem escolha salva. Aceitação e recusa persistem no navegador; armazenamento bloqueado mantém a escolha em memória.
- Login não concede aceitação. Preferências continuam acessíveis pelo rodapé, perfil, política e player; revisão suspende o player até a nova escolha.
- Testes do frontend: 52/52 passaram com `npm test -- --maxWorkers=1`, usando TEMP/TMP em `frontend/node_modules/.tmp-favorite`. Testes de App e Perfil também passaram separadamente (19/19).
- Uma execução adicional da suíte apresentou falha intermitente em `Comments.test.jsx:37`, ao procurar “Publicar comentário” enquanto a listagem carregava. Esse arquivo não foi alterado; sua execução isolada posterior passou (4/4).
- `npm run lint` e `npm run build` passaram. Auditoria Premium strict: nenhum achado, em `cookies-session-audit.json`.
- Edge/Chromium com API simulada, 1440px e 320px: aceitação e recusa após recarga, sessão autenticada, revisão manual, Escape, bloqueio do player sem aceitação e navegação ao perfil passaram. Sem erros de execução ou overflow horizontal. Captura mobile inspecionada.
- Script reproduzível: `cookies-session-browser.cjs`, com Playwright resolvido via `PLAYWRIGHT_MODULE`. Resultados em `cookies-session-results.json`; capturas em `cookies-session-1440.png` e `cookies-session-320.png`. O navegador precisou executar fora do isolamento Windows. Nenhuma conta real foi alterada.
