# Perfil e conexões — 5 de novembro de 2026

## Entrega

Perfil pessoal com identificação, nome, e-mail privado, origem da foto, revisão,
vínculo Google e comentários. Seguidores, seguindo e curtidas recebidas têm cards
inteiramente navegáveis no perfil pessoal e público. Biblioteca, favoritos,
avaliações, média e comentários levam às listas correspondentes. A API oferece
listas paginadas de comentários e de comentários com curtidas, preservando a
projeção pública sem dados de autenticação ou e-mail.

Curtidas significa reações recebidas nos comentários do autor; não favoritos de
jogos. A lista informa quantos comentários receberam as reações. Os links abrem
a conversa do jogo. Nenhuma dependência nova foi adicionada.

## Verificação

- Frontend: `npm test -- --reporter=dot`, 63 testes em 13 arquivos aprovados.
- Backend: `npm test`, 39 testes aprovados, incluindo privacidade, contagens,
  curtidas, exclusão, paginação, sessão e persistência.
- `npm --prefix frontend run lint` e `npm --prefix frontend run build`: aprovados.
- Auditoria premium strict: zero achados, em `profile-social-audit.json`.
- DESIGN.md lint: zero erros. Três avisos existentes sobre tokens sem referência
  em mapas de componentes; os tokens têm uso no CSS canônico e mapeamento na prosa.
  Executado pelo CLI já disponível no cache npm, pois o registry estava inacessível.
- `profile-social-browser.cjs`: aprovado no Edge headless com API real e banco
  SQLite exclusivamente em memória. Cobre teclado/foco, links, Voltar, deixar de
  seguir e atualização dos totais, curtidas, comentários, dados privados,
  carregamento lento, falha/repetição, offline/recuperação, vazio, visitante e
  movimento reduzido. Compara também a comunidade existente.
- Doze combinações de rota/largura (320, 390, 768 e 1440px), sem overflow horizontal.
  Alvos sociais com largura e altura superiores a 44px. Capturas desktop/mobile
  inspecionadas; evidência em `profile-social-results.json`.

As primeiras execuções na sandbox falharam por restrições de loopback e arquivos
temporários; as execuções autorizadas fora dela passaram. A suíte frontend emite
avisos de act em testes legados, sem falhas. Safari, Firefox e dispositivos físicos
não foram exercitados.

## Reconciliação de design

| Regra | Evidência | Decisão |
| --- | --- | --- |
| Perfil antes sem animações | Pedido atual exige animações | Entrada finita, hover e transição de conteúdo documentados; movimento reduzido preservado |
| Tokens e tipografia existentes | profile-social.css consome base.css | Paleta, fontes e raios preservados |
| Dados privados só no perfil pessoal | API pública usa projeção explícita | Novas listas retornam somente comentários já públicos e metadados do jogo |
| Consultas públicas com cancelamento | Hook antes local à comunidade | Extraído para uso compartilhado, mantendo a chave de sessão e cancelamento |
