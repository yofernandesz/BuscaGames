# Estrelas — cinco níveis de entusiasmo

- Componente canônico: `StarRating.jsx`, com estilos em `games.css` e contrato em `DESIGN.md`.
- SVG com contorno e preenchimento substitui o glifo de estrela. Legendas: Ruim,
  Regular, Bom, Ótimo e Obra-prima. Hover e foco são prévias; a nota salva permanece em /5.
- Reações: tremor/queda, balanço, salto, salto com giro/faíscas e giro completo
  das cinco estrelas em cascata com dois halos e 50 partículas.
- Disparo após confirmação da nota; sem celebração ao remover, carregar nota salva,
  falhar ou aguardar resposta. Movimento reduzido suprime os efeitos.
- `npm --prefix frontend test -- --maxWorkers=1`: 49 testes passaram em 11 arquivos.
  TEMP/TMP direcionados para `frontend/node_modules/.tmp-favorite` no sandbox Windows.
- `npm --prefix frontend run lint`: passou.
- `npm --prefix frontend run build`: passou.
- Auditoria Premium strict: zero achados em `rating-premium-audit.json`.
- Lint DESIGN.md: zero erros e três avisos existentes sobre referências dos tokens no frontmatter.
- Edge/Playwright, com API simulada: cinco animações e término, setas/Home/End,
  foco visível, limpar nota, salvamento lento, falha 503, movimento reduzido,
  biblioteca e card compacto a 320px passaram. Sem overflow horizontal; cinco
  estrelas na mesma linha em dispositivo de toque. Capturas desktop 1280px/mobile 360px.
- `rating-browser.cjs` usa Edge e Playwright disponível via resolução de módulos ou
  `PLAYWRIGHT_MODULE`. Abre servidor temporário na porta 5178 e fecha ao concluir.
  Não acessa conta real. Capturas de animação pausadas em 300ms (1) e 700ms (5).
