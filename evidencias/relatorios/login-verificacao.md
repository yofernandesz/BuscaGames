# Verificação do login — 02/11/2026

- Frontend: `npm --prefix frontend test` — 34 testes, 9 arquivos, todos passaram.
- Backend: `npm --prefix backend test` — 28 testes, todos passaram.
- `npm --prefix frontend run lint` — sem erros ou avisos.
- `npm --prefix frontend run build` — build de produção concluído.
- Auditoria Premium strict: `login-ui-audit.json` — zero achados.
- `npx --yes -p @google/design.md designmd lint DESIGN.md` — zero erros;
  três avisos de tokens existentes sem referências formais em components.
  CSS continua canônico, mapeado na documentação, sem alteração de paleta.

Navegador real em prévia local isolada com SQLite em memória e conta fictícia:
login por senha, favorito, avaliação, publicação de comentário, perfil, recarga,
persistência de sessão e dados, logout e modal acionado por comentário/favorito.
Validação vazia foca e-mail, Escape devolve foco ao acionador, Tab circula dentro
do modal, fundo inerte via showModal, sem transbordamento horizontal.
Desktop 1440×1000; celular 390×844 e cadastro 320×740 com rolagem interna.
Capturas: login-desktop.jpg e login-mobile.jpg.

Google: integração testada com respostas controladas de token/UserInfo, incluindo
PKCE, estado vinculado ao cookie, repetição, expiração, cancelamento, indisponibilidade,
e-mail não verificado, conflito de vínculo, e-mail existente e sessão encerrada.
Não foi feito login real no Google: GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET não
estão configurados no .env. As instruções estão em backend/README.md. O botão
fica indisponível com explicação até a configuração ser concluída.

Nenhum pacote novo. O formulário Account é reutilizado no perfil e no modal;
GamesProvider centraliza a proteção e a API valida as escritas. Registros antigos
não são apagados nem atribuídos automaticamente a uma conta. O novo requisito
substitui a permissão anterior de escrever avaliações/favoritos como visitante.
