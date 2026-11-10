# Comunidade — verificação em 5 de novembro de 2026

Implementação: `/comunidade` e `/perfil/:id`, busca por nome, seguir/deixar de
seguir, listas de conexões, biblioteca pública com favoritos e notas do dono,
links de autoria e curtir/descurtir comentários. A conversa continua na seção
de comentários de cada jogo. E-mail e dados de acesso não são retornados nas APIs públicas.

## Resultados

- `npm --prefix backend test`: 36 testes aprovados. Inclui privacidade da projeção,
  CSRF, sessão expirada/bloqueada, autoria, vínculos recíprocos, idempotência,
  busca com acentos, filtros, paginação e persistência após reabrir o banco.
- `npm --prefix frontend test`: 57 testes aprovados em 12 arquivos.
- Após o ajuste final de foco: testes de `Comunidade.test.jsx` e `Comments.test.jsx`
  novamente aprovados (8 testes).
- `npm --prefix frontend run lint`: aprovado.
- `npm --prefix frontend run build`: aprovado.
- `node tests/e2e/community-browser.cjs`: aprovado no Edge headless, com API real
  e SQLite em memória. O teste não acessa nem modifica o banco de uso do projeto.
- Auditoria premium em modo strict: 0 erros/avisos, em `community-premium-audit.json`.
- Validador de `DESIGN.md`: 0 erros; 3 avisos de tokens sem referência no frontmatter
  de componentes (text, muted, accent), sem alterações nos tokens globais.

Os testes precisaram de execução fora do isolamento de rede/arquivos temporários
para permitir conexões localhost e arquivos temporários do Vitest.

## Navegador e revisão visual

Desktop 1280px, celular 360px e 320px; sem rolagem horizontal. Inspecionadas as
capturas `community-desktop.png` e `community-mobile.png`. Os dados de teste não
possuem capas, exercitando também a apresentação de imagem indisponível.

Fluxos exercitados: busca/limpeza com foco, navegação de autoria, biblioteca com
nota diferente da nota do visitante, seguir por teclado, recarregar e manter o
vínculo, seguidores, filtro de avaliados, link direto para comentários,
curtir/descurtir e recarregar, deixar de seguir na própria lista, falha 503,
modo offline e repetição, sessão expirada com modal/Escape, visitante, perfil
inexistente, coleção vazia, nome longo e preferência por movimento reduzido.
Nenhum erro JavaScript foi registrado. Falha 503 foi a única resposta simulada;
os fluxos de sucesso passaram pela API real.

Revisão frente às telas existentes: Header, cores, tipografia, Avatar,
ReviewBadge, botões e cards da biblioteca foram reutilizados. A credencial
mantém a divisória pontilhada do perfil. Corrigidos o espaçamento do título e a
restauração de foco no X da busca durante a inspeção.

## Operação

Ao iniciar/reiniciar a API atualizada, `user_follows` e `comment_likes` são criadas
automaticamente no SQLite, preservando os dados existentes. Não foi feita
publicação nem reinício do serviço de uso. A política e o cadastro agora informam
a visibilidade pública de nome, foto, favoritos, notas e conexões.
