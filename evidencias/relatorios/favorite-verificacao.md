# Favoritos — efeito de estourar balão

- Componente compartilhado: `FavoriteButton.jsx`; estilos em `games.css`.
- Sequência de 680ms: inflação, estouro com aro e oito partículas, retorno do coração.
- Resposta ao clique autenticado de adicionar; preenchimento segue o estado salvo.
- Remoção e solicitação de login não disparam o efeito. Movimento reduzido desativa animações.
- `npm --prefix frontend run lint`: passou.
- `npm --prefix frontend run build`: passou.
- `npm --prefix frontend test -- --maxWorkers=1`: 41 testes passaram, 10 arquivos.
  No sandbox Windows, TEMP e TMP foram direcionados a `frontend/node_modules/.tmp-favorite`
  para evitar falhas de leitura da pasta temporária do ambiente.
- Auditoria Premium strict: zero achados em `favorite-premium-audit.json`.
- DESIGN.md lint: zero erros; três avisos existentes de tokens sem referências no frontmatter.
- Edge/Playwright com API simulada: desktop 1280px, celular 360px, Enter/Espaço,
  repetição, remoção, falha HTTP 503, ausência de overflow e movimento reduzido passaram.
- Capturas: `favorite-desktop.png` e `favorite-mobile.png`, pausadas em 320ms.
- Script: `favorite-browser.cjs`; requer Playwright disponível via resolução de módulos
  ou variável `PLAYWRIGHT_MODULE`, além do Edge instalado. Cria servidor local temporário
  na porta 5177 e fecha navegador e servidor ao concluir. Não acessa contas reais.
