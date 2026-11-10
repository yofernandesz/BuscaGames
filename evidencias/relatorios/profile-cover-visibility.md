# Visibilidade da capa pública

- Causa: altura fixa de 13rem recortava a capa 3:1; o degradê público começava com 76% de escurecimento e terminava opaco.
- Correção em `frontend/src/components/ui/profile-background.css`: faixa própria na proporção 3:1, identidade abaixo da imagem e degradê somente nos 15% inferiores. Perfil pessoal mantém sua apresentação existente.
- `DESIGN.md` documenta a variante pública no componente compartilhado, sem novas dependências ou tokens globais.
- `npm run lint` e `npm run build`: passaram.
- `npm test -- --maxWorkers=1`, com TEMP/TMP em `frontend/node_modules/.tmp-cover`: 13 arquivos e 67 testes passaram. A primeira execução com o diretório temporário padrão do isolamento falhou com ENOENT.
- Auditoria Premium strict: zero achados, registrada em `evidencias/auditorias/profile-cover-visibility-audit.json`.
- Lint de DESIGN.md: zero erros; três avisos preexistentes de tokens sem referência no frontmatter de componentes.
- Edge/Playwright: `tests/e2e/profile-background-browser.cjs` passou com API local e SQLite em memória. Inclui upload, recorte, teclado, persistência, recuperação offline, visitante, privacidade, remoção e sessão expirada.
- Regressão adicionada: proporção 3:1, avatar abaixo da capa e ausência de overflow em 1440/650/390/320px; falha da imagem preserva a geometria. Capturas `profile-cover-visible-*.png`; desktop e 320px inspecionados visualmente.
- Navegador executado fora do isolamento Windows devido à falha de inicialização do Edge. Nenhuma conta real foi usada. Alteração local, sem deploy.
