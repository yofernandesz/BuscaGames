# Organização da estrutura — 6 de novembro de 2026

117 arquivos foram realocados, preservando as alterações locais anteriores.
O [README principal](../../README.md) e os READMEs de frontend, backend, testes
de navegador e evidências descrevem a estrutura atual.

- Frontend: áreas `games`, `account`, `community` e `admin` com páginas,
  componentes e estilos próprios; transporte HTTP em `lib/`, hook público
  compartilhado em `hooks/` e estilos dos componentes comuns junto de `components/ui/`.
- Backend: módulos de catálogo em `src/catalog/` e de contas/comunidade em
  `src/community/`. Entradas `server.js` e `admin-access.js` mantidas nos caminhos existentes.
- Scripts de navegador em `tests/e2e/`; evidências separadas em `auditorias/`,
  `capturas/`, `resultados/`, `relatorios/` e `docker/`.
- Guias Docker e Compose em `docs/`; arquivos de implantação continuam na raiz.

## Preservação e validação

- 79 arquivos JS/JSX/MJS de aplicação, configuração e testes unitários comparados:
  conteúdo idêntico fora das substituições de caminhos.
- 16 folhas CSS preservadas integralmente; ordem de carregamento mantida.
- JavaScript e CSS de produção idênticos byte a byte aos anteriores.
- 213 imports relativos e todos os links Markdown locais resolvem corretamente.
- `npm --prefix frontend run lint`: aprovado.
- `npm --prefix frontend test`: 65 testes aprovados.
- `npm --prefix backend test`: 42 testes aprovados.
- `npm --prefix frontend run build`: aprovado.
- Os oito scripts de `tests/e2e/` passaram no Edge: administração, comunidade,
  cookies/sessão, favoritos, capa do perfil, conexões do perfil, avaliações e
  responsividade. Esta última verificou 46 cenários, sem erros ou achados.
- Auditoria Premium strict: zero erros ou avisos, em
  [estrutura-premium-audit.json](../auditorias/estrutura-premium-audit.json).
- Estrutura virtual do container: 24 imports do backend válidos nos destinos
  `/app` e `/shared`; subpastas incluídas pelo `.dockerignore` existente.
  Docker não está instalado neste ambiente, portanto o build de containers não foi executado.

Os testes de navegador revelaram preparações antigas independentes das mudanças
de pasta. A senha fictícia administrativa ultrapassava o limite vigente; foi
trocada por uma senha de teste válida. Favoritos, notas e responsividade agora
iniciam com a preferência de cookies definida, pois suas sessões autenticadas
não exibem o aviso automaticamente. As verificações de cookies permanecem no
script dedicado. Nenhuma regra de cadastro ou de consentimento foi alterada.

Banco real, variáveis de ambiente, comandos npm, rotas, conteúdo visual e regras
de negócio permaneceram inalterados. Os testes HTTP usam dados temporários;
as capturas e os resultados gerados foram gravados nas novas pastas.
