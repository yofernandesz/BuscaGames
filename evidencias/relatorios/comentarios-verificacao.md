# Verificação do sistema de comentários

- Backend: 27 testes passaram (`npm --prefix backend test`). Inclui teste HTTP
  de cadastro/login/logout, autorização por autor, validação de texto, duplicidade,
  nota atual, edição com versão, exclusão, integridade referencial, paginação,
  contagem e reabertura do SQLite em arquivo.
- Frontend: 31 testes passaram, 8 arquivos (`npm --prefix frontend test`).
  A suíte antiga tem avisos React de act nas verificações síncronas; sem falhas.
- `npm --prefix frontend run lint` e `npm --prefix frontend run build`: passaram.
- Auditoria estrita de UI: zero erros/avisos (`comentarios-ui-audit.json`).
- Navegador real, instância isolada com SQLite em memória: cadastro, persistência
  da sessão ao navegar, avaliação 4/5, publicação, edição, integração na biblioteca,
  contador 1 no perfil, confirmação e exclusão com estado vazio. Layout conferido
  em desktop e viewport 390 × 844. Nenhuma conta ou comentário de teste no banco real.
- Migração aditiva automática ao abrir o SQLite; nenhuma dependência adicionada.
- Produção HTTPS: definir SESSION_COOKIE_SECURE=true. Cadastro sem verificação
  de e-mail e sem recuperação de senha nesta versão; ver backend/README.md.
