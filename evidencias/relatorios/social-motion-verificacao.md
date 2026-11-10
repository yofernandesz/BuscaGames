# Botões sociais — 5 de novembro de 2026

Frontend Design Premium aplicado aos botões de seguir e curtir, com componente
visual compartilhado e CSS sem dependências adicionais. As APIs e os dados
persistidos não foram alterados.

- `npm --prefix frontend test`: 60 testes aprovados em 13 arquivos.
- `npm --prefix frontend run lint` e `npm --prefix frontend run build`: aprovados.
- Auditoria premium strict: 0 erros e 0 avisos (`social-motion-audit.json`).
- `node tests/e2e/community-browser.cjs`: fluxo real de API/SQLite isolado no
  Edge headless, incluindo teclado, telefone, falha, repetição e sessão expirada.

Verificações específicas de movimento: efeitos identificados pela Web Animations
API, pausados em 220ms para inspeção visual, concluídos e limpos; nenhuma
celebração inicial, em remoção ou durante a espera da API. Requisição de seguir
retida temporariamente para verificar botão desabilitado e largura constante.
Medidas antes/depois de seguir e curtir diferem menos de 1px. Movimento reduzido
não produz animações. Repetição de curtir por Espaço testada no celular.

Capturas inspecionadas: `social-follow-desktop.png`, `social-follow-mobile.png`,
`social-like-desktop.png` e `social-like-mobile.png`. Ciano e magenta distinguem as
ações; a confirmação não depende só da cor. Fonte e cores seguem o projeto.

A inspeção revelou status `.sr-only` sem regra global, fazendo o botão crescer
após seguir; a utilidade foi centralizada em `base.css`. Largura estável foi
verificada novamente após a correção. O validador de DESIGN.md tem 0 erros e
mantém os 3 avisos anteriores de tokens sem referência no frontmatter.
