# Indisponibilidade de 17/11/2026

## Diagnóstico e correção aplicada

A página estática da Vercel respondia 200, mas `/api/health`, `/api/auth/me`,
`/api/home` e `/api/notifications/count` excediam 20 segundos. O acesso direto
à API também falhava. DNS apontava para a EC2 correta; TCP e TLS funcionavam,
com certificado válido até 11/02/2027. Não foi uma falha do frontend ou do
rewrite da Vercel.

Na EC2, Nginx estava ativo e registrava `upstream timed out` para
`127.0.0.1:3001`. O healthcheck local excedia oito segundos. O processo Node
estava em estado `D`, em `folio_wait_bit_common`, com stack de leitura ext4
e `pread64`. A pressão de I/O estava entre 75% e 82%. Havia cerca de 14 GB
livres; não era falta de espaço. PM2 mostrava o processo pai `npm` online,
o que não significava que o servidor HTTP estava respondendo.

O banco tinha 95.154 jogos e cerca de 588 MB. A seleção de cada trabalho de
tradução percorria o catálogo com `SELECT g.data`, joins e ordenação,
repetindo isso até dez vezes por ciclo no mesmo processo da API. A correção
seleciona primeiro o ID pelo índice existente `games_rating_count` e busca
o JSON apenas para o jogo escolhido. O plano passou a usar `COVERING INDEX`
e busca por chave primária. A consulta corrigida levou 0,874 s no banco real.

A espera por disco foi observada diretamente; a consulta foi identificada
como fonte evitável de leitura e corrigida. Não foram consultadas métricas
CloudWatch de créditos/latência EBS; não há evidência suficiente para atribuir
o incidente a uma falha física do volume ou a uma indisponibilidade da AWS.

## Publicação e reversão

- Correção aplicada diretamente em
  `/home/ubuntu/BuscaGames/backend/src/catalog/localization.js` e na cópia local.
- Arquivo anterior preservado em
  `/home/ubuntu/localization.js.pre-incident-20261117`.
- Sintaxe validada com `node --check`; API reiniciada pelo PM2.
- Nenhuma migração ou remoção de dados foi executada.
- A VM estava no commit `36bcb6f`; a cópia local estava em `9fc5cf2`.
  Apenas a correção deste incidente foi aplicada na VM, sem publicar outras
  alterações. A correção local ainda precisa entrar no próximo commit/push
  para não se perder em futuras implantações.

## Verificação por componente

| Componente | Evidência |
| --- | --- |
| Frontend/Vercel | HTML 200; interface recarregada mostrando 95.154 jogos; proxy voltou a fornecer JSON da API. |
| EC2/Node/Nginx | Healthcheck local 200 em 0,006 s após correção; Node voltou ao estado de espera normal `ep_poll`. |
| Autenticação | `/api/auth/me` 200, usuário anônimo e Google habilitado. Sem sessão, notificações retornam 401 esperado. |
| Catálogo | `/api/home` e `/api/games` 200; sincronização de 17/11 às 06:00 UTC, sem estado degradado ou desatualizado. Importação completa ainda pendente. |
| Brevo | Estatísticas transacionais e eventos consultados pela EC2 com HTTP 200. Provedor, remetente e URL pública configurados. |

No Brevo, o intervalo retornado de 15 a 17/11 mostrou quatro solicitações,
três entregas, zero bloqueios e um `softBounced`. O evento indicou
`550 Requested action not taken: mailbox unavailable`, uma rejeição do
servidor do destinatário. Consultas de conta/remetentes retornaram 403 com
a chave disponível; isso limita a auditoria desses recursos. Não foi enviada
mensagem de teste nem criado cadastro real durante esta investigação.

Os logs também registravam indisponibilidade de dados de alguns jogos na
Steam e cota diária de tradução atingida. Esses avisos continuam possíveis;
a correção preserva a fila, suas prioridades e o reagendamento.

## Validação e limites

- Backend: 66 testes passaram, incluindo novo teste do plano de consulta.
- Frontend: 75 testes passaram com `--maxWorkers=2`; lint e build passaram.
  A primeira execução paralela teve três timeouts de teste de cinco segundos;
  a execução com dois workers passou sem alterar testes ou comportamento.
- Métricas HTTP repetidas em
  `evidencias/resultados/incident-2026-11-17-http.json`.
  Foram 28 verificações entre 19:23:46 e 19:26:03 (São Paulo), sem erros:
  sete respostas 200 de saúde (máximo 282 ms), sete 200 da página inicial,
  sete 200 de busca e sete 401 esperados de notificações sem sessão.
- Consultas sem cache ainda apresentaram lentidão: aproximadamente sete
  segundos na página inicial e nove segundos na busca. A recuperação não
  equivale a uma garantia de baixa latência sob carga.
- Login Google completo, cadastro, recebimento de novos e-mails, recuperação
  de senha e alterações autenticadas não foram executados com conta real.
- Não foi configurado monitor externo permanente. PM2 sozinho não detecta
  toda indisponibilidade HTTP enquanto o processo permanece vivo.

Referência técnica: a API `DatabaseSync` executa operações de forma síncrona,
conforme a [documentação do Node.js](https://nodejs.org/api/sqlite.html).
