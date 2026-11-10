# API e atualização diária do BuscaGames

Node.js 24, `node:http`, `fetch` e `node:sqlite`, sem pacotes externos. A interface consulta somente o banco local; o worker consulta a IGDB. O processo do backend precisa permanecer ativo (por exemplo, Docker Compose em servidor sempre ligado).

## Estrutura

```text
src/
  server.js                 # Entrada HTTP, workers e modo --sync
  admin-access.js           # CLI de concessão/revogação de acesso
  admin.js                  # Consultas, métricas e auditoria administrativa
  catalog/
    catalog.js              # SQLite, importação e consultas do catálogo
    igdb.js                 # Cliente IGDB/Twitch
    sync.js                 # Sincronização e agendamento
    steam.js                # Ranking Steam via IGDB
    localization.js         # Traduções e requisitos dos jogos
    prices.js               # Preços e fila de atualização
  community/
    community.js            # Contas, sessões, comentários e roteamento da comunidade
    googleAuth.js           # Login e vínculo com Google
    nicknames.js            # Normalização e unicidade dos nomes
    profileBackground.js    # Validação do plano de fundo
    social.js               # Perfis públicos, seguidores e curtidas
test/                       # Testes nativos do Node, sem serviços externos
data/                       # SQLite local, ignorado pelo Git
```

Os pontos de entrada e o caminho padrão do banco permanecem os mesmos.
As regras de cadastro compartilhadas ficam em `../shared/accountPolicy.mjs`.
Imports são diretos; não há arquivos intermediários de reexportação.

## Configurar e executar

1. Crie uma aplicação no [console de desenvolvedores Twitch](https://dev.twitch.tv/console/apps) e obtenha Client ID e Client Secret. A IGDB usa autenticação de aplicação Twitch, renovada automaticamente no servidor. Consulte os [termos e requisitos da IGDB](https://api-docs.igdb.com/#getting-started), inclusive para uso comercial.
2. Copie `backend/.env.example` para `backend/.env` e preencha `IGDB_CLIENT_ID` e `IGDB_CLIENT_SECRET`. Os comandos `npm start` e `npm run sync` também leem o `.env` da raiz (usado pelo Compose); `backend/.env`, quando existir, tem precedência. Nunca use variáveis `VITE_*` para essas credenciais.
3. Na pasta `backend`, execute `npm run dev` durante o desenvolvimento: a API reinicia quando o código muda. `npm start` executa sem recarga e exige reinício manual após alterações. Não é necessário `npm install`.
4. Em outro terminal, execute `npm --prefix frontend run dev` a partir da raiz. O Vite encaminha `/api` para a porta 3001.

Para Docker, copie o `.env.example` da **raiz** para `.env`, preencha as credenciais e execute `docker compose up -d --build --wait`. O Compose usa esse arquivo da raiz; não lê `backend/.env`. O volume `catalog-data` mantém o SQLite entre recriações. `docker compose down` preserva o volume; `down --volumes` apaga o catálogo. Faça backup consistente com SQLite ou com o serviço parado, preservando os arquivos WAL quando presentes.

| Variável | Padrão | Uso |
| --- | --- | --- |
| `IGDB_CLIENT_ID` | vazio | Identificador da aplicação Twitch |
| `IGDB_CLIENT_SECRET` | vazio | Segredo, somente no backend |
| `SYNC_HOUR_UTC` | `6` | Horário diário em UTC; 06:00 UTC = 03:00 São Paulo (UTC-3) |
| `PORT` | `3001` | Porta HTTP no modo local |
| `DATABASE_PATH` | `backend/data/catalog.sqlite` | Arquivo persistente; `/app/data/catalog.sqlite` no container |

Sem credenciais, a API serve dados já armazenados e informa que a integração precisa ser configurada. Não publica os antigos dados de demonstração como catálogo real.

## Sincronização

- Primeira execução imediata; depois, diariamente no horário configurado. Ao reiniciar, recupera uma execução atrasada, respeitando o intervalo de uma hora entre tentativas. Falhas são repetidas após uma hora, sem depender de acessos à página.
- Seções prioritárias e conteúdos relacionados são carregados primeiro. A importação completa é gradual: até 20 páginas de 500 jogos por execução, incluindo DLCs e expansões. Em paralelo, até 20 páginas atualizam registros modificados, usando `updated_at`, janela fixa e cursor de ID persistidos. O volume total da IGDB pode exigir vários ciclos para ser importado.
- O watermark só avança ao concluir a janela. Sobreposição de 24 horas reduz perdas por alterações durante a leitura. Cada página é gravada em transação; falhas não apagam páginas anteriores. IDs da IGDB são únicos e atualizações antigas não sobrescrevem novas.
- Capas, descrições, gêneros, plataformas, gerações, modos, notas e contagens, empresas, datas por plataforma, sites e relações ficam no SQLite. A resposta original dos campos consultados também é preservada. Imagens são carregadas sob demanda pelo CDN da IGDB; seus arquivos não são espelhados localmente.
- As categorias exibidas combinam gêneros e temas da IGDB, sem duplicatas e em português (por exemplo, Horror → Terror e Thriller → Suspense). A busca aceita os nomes originais e traduzidos. Importações antigas sem temas são atualizadas em até 20 lotes de 500 jogos por sincronização, mesmo sem alteração de `updated_at`, com retomada após falhas. Reinicie o backend com o código atualizado; a correção dos dados existentes depende desses ciclos ou de sincronizações manuais.
- Limite de requisições: chamadas sequenciais espaçadas em 300 ms, timeout de 20 segundos, até quatro tentativas com backoff para rede/429/5xx e respeito a `Retry-After`. Um cooldown maior que um minuto adia a execução; o prazo é persistido para ser respeitado inclusive após reinícios. Token expirado é renovado uma vez após 401. Segredos e corpos de erro externos não são registrados.
- Uma lease no SQLite impede execuções simultâneas e expira após encerramento inesperado. Use uma instância do serviço por volume SQLite local; não compartilhe esse arquivo via rede.
- `npm run sync` dentro de `backend` executa uma sincronização manual, com a mesma proteção de concorrência. `npm test` executa os testes sem credenciais e sem acessar a IGDB.

O incremental acompanha inclusões e atualizações. Exclusões na fonte não são removidas automaticamente: para espelhar exclusões, seria necessário integrar os webhooks de remoção da IGDB ou adicionar reconciliação periódica completa.

## Critérios transparentes das seções

- **Interesse da semana** ocupa a posição de “Mais jogados da semana”: média das amostras diárias disponíveis do índice de visitas da IGDB (`popularity_type = 1`) nos últimos sete dias. Não é contagem de jogadores ou visitas. Cada card informa quantas amostras existem. São monitorados os 200 líderes diários e os líderes anteriores ainda no histórico; a classificação não representa todo o mercado. A coleta ocorre antes da importação extensa e é salva independentemente dela. Respostas vazias, antigas ou inválidas preservam o histórico e provocam nova tentativa após uma hora. Sem amostras nos últimos sete dias, a seção usa a janela de sete dias da última coleta disponível, com data e aviso de atualização pendente. Sem histórico, mostra jogos reais do catálogo ordenados por quantidade de avaliações, sem inventar métricas. Assim que houver amostras recentes, a seleção semanal volta automaticamente. Um banco totalmente vazio ainda depende da primeira importação.
- **Em alta:** 100 líderes do indicador Steam 24hr Peak Players via IGDB (`popularity_type = 5`), ordenados pelo índice normalizado de pico de jogadores em 24 horas. Não é contagem bruta nem crescimento semanal. A coleta diária atualiza os metadados em lote e substitui o ranking em transação; falhas preservam a última lista. Cada card identifica a fonte e a data, sinalizando coletas com mais de 48 horas. Não requer chave Steam adicional.
- **Retrô:** lançamento há pelo menos 15 anos e plataforma de geração 1–6, ou lançamento até 2000. O critério também cobre computadores antigos sem geração informada.
- **Clássicos:** pelo menos dez anos, nota agregada IGDB ≥80/100 e pelo menos 50 avaliações. É uma seleção por critérios declarados.
- **Lançamentos:** primeiro lançamento nos últimos 90 dias.
- **Próximos lançamentos:** primeiro lançamento previsto nos próximos 365 dias. Datas ausentes não são inventadas.

Os dados podem vir em inglês. A nota agregada da fonte é mostrada em escala 0–100, separada das estrelas pessoais. Preço ausente significa “Preço indisponível”. Registros antigos de visitante permanecem no navegador para leitura. Novos favoritos exigem sessão e ficam em user_favorites. Avaliações autenticadas ficam em tabela própria e não alteram os registros da IGDB.

Referência: [IGDB PopScore e indicadores disponíveis](https://api-docs.igdb.com/#popscore).

## Endpoints e cache

### Otimizações de consultas e integração

- Listagens carregam preços, traduções e tentativas em lote: uma página de 48
  jogos faz seis SELECTs no catálogo comum, em vez de até 242. Os detalhes
  continuam usando a mesma projeção, com as mesmas regras de validade.
- Índices de quantidade de avaliações e lançamento descendente evitam ordenações
  temporárias nessas listagens, mantendo o desempate por ID. São criados
  automaticamente ao abrir o banco, inclusive em instalações existentes.
- Os workers compartilham chamadas Steam simultâneas para o mesmo aplicativo e
  idioma. A promessa é descartada ao concluir ou falhar; preços continuam com os
  prazos de validade anteriores. O cooldown também é revisto depois da espera.
- Reenfileirar um preço já pendente só grava uma atualização se sua prioridade
  aumentar, preservando a data original e a ordem da fila.

Benchmark reproduzível: `node backend/benchmark/catalog.js` na raiz. Usa SQLite
em memória, 20 mil jogos sintéticos, páginas de 48 itens, cinco aquecimentos e
30 medições, sem cache HTTP nem chamadas externas. Medianas observadas antes →
depois: catálogo 8,69 → 2,40 ms; lançamentos 6,05 → 2,64 ms; busca `Game 12`
11,87 → 5,48 ms. São medições locais, não uma previsão de latência de produção.
O teste `test/performance.test.js` verifica equivalência das respostas, quantidade
de consultas, planos de ordenação, prioridade e compartilhamento/recuperação Steam.

A busca continua literal, por trecho e sem diferença de acentos. Não foi trocada
por busca de palavras, que mudaria os resultados. Referência técnica:
[planejamento de consultas e índices compostos do SQLite](https://www.sqlite.org/queryplanner.html).

### Preços na Steam Brasil

Jogos com um link de aplicativo Steam nos dados da IGDB recebem preços da loja brasileira (`appdetails`, `cc=br`, `l=brazilian`), sem chave adicional. A associação usa o ID exato do aplicativo; não procura produtos por nomes parecidos nem atribui o preço de outro jogo/edição. O valor corresponde à versão para PC na Steam, não a consoles ou a uma comparação entre lojas.

Preços são guardados em centavos no SQLite e expostos em reais com `price`, `priceInitial`, `priceCurrency`, `priceIsFree`, `priceStatus`, `priceSource`, `priceCheckedAt` e `priceRetryAt`. A interface distingue consulta pendente, ausência de vínculo (`no_source`), ausência de oferta em BRL (`unavailable`) e erro temporário (`error`). Ausência de oferta não prova que o produto foi removido: pode haver restrição regional ou venda em pacote. O link “Conferir na Steam” permite consultar as opções da edição exata. Preço ausente nunca significa gratuidade e moedas diferentes de BRL não são rotuladas como reais.

Uma fila persistente independente da tradução consulta até dez jogos por ciclo, agendado a cada minuto, com espera de 350 ms por chamada e timeout de 15 segundos. Jogos mostrados nas listagens entram na fila, e páginas de detalhes têm prioridade. Valores válidos são reutilizados por seis horas; respostas sem oferta são reutilizadas por 24 horas para reduzir consultas improdutivas. Após esse prazo, o próximo acesso solicita atualização. Respostas da Steam já obtidas pelo worker de localização também abastecem o cache de preços.

Falhas preservam o valor anterior da mesma edição com indicação de atualização pendente. Dados inválidos adiam apenas aquele jogo por 15 minutos, sem bloquear os demais. Falhas de rede/5xx pausam consultas Steam por cinco minutos; 403/429 por pelo menos uma hora, respeitando `Retry-After`. Preços e localização compartilham essa pausa. Uma resposta válida sem oferta remove o preço anterior. Atualizações invalidam o cache HTTP; preços pendentes são revistos no frontend após 15 segundos, erros e valores antigos após um minuto. O catálogo não depende de uma chamada à loja durante a resposta HTTP. A disponibilidade e o preço final devem ser conferidos na loja, pois o endpoint público pode mudar ou limitar consultas.

- `GET /api/health`: disponibilidade do serviço e banco; não mede a saúde da IGDB.
- `GET /api/home`: seis seções, primeira página do catálogo e estado de sincronização.
- `GET /api/games?page=1&limit=12&q=termo&section=retro`: busca e paginação; `section` é opcional (`weekly`, `trending`, `retro`, `classics`, `new`, `upcoming`). Limite máximo: 48 itens; busca: 120 caracteres.
- `GET /api/games/igdb-123`: detalhes completos, inclusive relações de DLC/expansões.

Respostas têm ETag e revalidação HTTP a cada consulta e cache interno de 60 segundos. O cache em memória tem teto de 200 respostas. Listagens omitem galerias e descrições longas. A interface faz debounce da busca, usa imagens lazy e atualiza listagens abertas a cada cinco minutos e detalhes a cada minuto. Uma falha externa preserva o catálogo salvo e exibe atualização pendente.

## Português brasileiro e requisitos de PC

O worker de localização inicia com o servidor e processa até dez títulos por ciclo, com ciclos agendados a cada minuto. Jogos abertos na página de detalhes recebem prioridade sobre a coleta automática, pela ordem da primeira visita pendente. Reabrir ou atualizar a página não duplica a tarefa nem muda sua posição. Tarefas automáticas já enfileiradas são promovidas quando o jogo é aberto, inclusive durante a espera por cota. A prioridade persiste após reiniciar o servidor; a fila antiga é migrada automaticamente.

A fila é consultada entre cada jogo processado, permitindo atender novas visitas antes do restante do trabalho automático. A prévia de GTA VI na página inicial usa `?preview=1` e não conta como visita. Respostas HTTP em cache também registram visitas; requisições HEAD não registram. Traduções válidas já salvas são reutilizadas. A navegação apenas enfileira IDs: não faz chamadas externas síncronas. Os prazos de nova tentativa e a cota diária continuam sendo respeitados, portanto prioridade não garante tradução imediata. Textos e requisitos ficam em tabelas SQLite separadas, preservando o original da IGDB.

Descrições oficiais e requisitos mínimos são consultados na Steam por app ID, em `brazilian`. Se a descrição não tiver versão localizada, o texto em inglês da fonte é traduzido por MyMemory (`en|pt-BR`), com proteção dos nomes do jogo e das empresas, cache por conteúdo e orçamento conservador de 4.500 caracteres/dia. A tradução de um catálogo inteiro é gradual e depende dessa cota gratuita. Não há garantia de detecção automática de idiomas diferentes do inglês nesse fallback. A interface informa tradução pendente, sem apresentar o resumo original em inglês como se fosse português. Os nomes de jogos, empresas e plataformas comerciais são mantidos.

Requisitos de PC são os publicados pela Steam; não são deduzidos a partir de consoles ou jogos similares. A interface mostra indisponibilidade quando faltam dados. HTML externo é convertido em texto antes da exibição. Descrições localizadas são atualizadas mensalmente ou quando muda o conteúdo original; falhas temporárias permanecem na fila com nova tentativa após uma hora; cota esgotada aguarda o próximo dia UTC. A interface diferencia cota, falha temporária, processamento pendente e dados ausentes. Créditos: https://mymemory.translated.net/doc/spec.php e https://mymemory.translated.net/doc/usagelimits.php.


## Contas, comentários e avaliações

A abertura do banco cria aditivamente `users`, `sessions`, `user_ratings` e
`comments`, sem remover dados do catálogo. Backups devem incluir o mesmo volume
SQLite. Não é necessário rodar uma migração separada.

- Cadastro/login: `POST /api/auth/register` (`name`, `email`, `password`, `passwordConfirmation`) e
  `POST /api/auth/login` (`email`, `password`). As regras de cadastro estão em
  `shared/accountPolicy.mjs`, utilizadas pelo formulário e novamente pela API.
  Não há verificação de e-mail nem recuperação de senha nesta versão.
- O nickname (`name`) é protegido por triggers SQLite, inclusive em escritas simultâneas
  e atualizações diretas. Administradores podem atualizar para nomes já usados.
  A comparação usa Unicode NFKC, ignora maiúsculas/minúsculas
  e espaços nas extremidades, e reduz espaços consecutivos a um; acentos permanecem
  distintos. Cadastro com nickname ocupado retorna 409 e `field: name`.
  Novas contas Google recebem sufixo numérico (`-2`, `-3`, ...) quando necessário.
  Ao reiniciar a API, a migração mantém o nickname da conta de menor ID e acrescenta
  sufixos aos duplicados antigos, preservando IDs, senhas, sessões e relações.
  Cada conexão de escrita precisa registrar `nickname_key` (feito por `openCatalog`);
  conexões externas sem essa função não podem escrever em `users`.
- Sessão: `GET /api/auth/me`; logout: `POST /api/auth/logout` com `{}`.
  Troca de nickname: `PUT /api/auth/nickname` com `{ "name": "Novo nome" }`.
  A primeira troca é imediata; as seguintes exigem 30 dias exatos desde a última
  alteração bem-sucedida, registrada em `nickname_changes`. Salvar o mesmo nome
  não reinicia o prazo. Administradores não têm espera nem restrição de nome ocupado;
  tamanho e validação de caracteres continuam obrigatórios. A transação serializa
  verificação e gravação. A sessão retorna `isAdmin` e `nicknameAvailableAt` (milissegundos).
  Cookie HttpOnly/SameSite=Lax de 30 dias; somente hash do token fica no banco.
  Configure `SESSION_COOKIE_SECURE=true` no ambiente HTTPS de produção; o padrão
  false permite desenvolvimento e Compose local HTTP. Não exponha login por HTTP público.
- Escritas exigem JSON e `X-BuscaGames-Request: 1`. Não habilitar CORS permissivo.
  Tentativas de autenticação têm limites persistidos no SQLite por IP e e-mail,
  além de limite de concorrência. Veja a política de segurança abaixo.
- `GET /api/games/igdb-ID/comments?before=CURSOR`: páginas de 10 comentários,
  IDs decrescentes, `nextCursor` e `own` (comentário do usuário, mesmo fora da página).
- `POST /api/games/igdb-ID/comments`: `{body}`; um comentário por autor/jogo.
  Valida texto não vazio e até 500 unidades UTF-16 no cliente e no servidor.
- `PATCH /api/comments/ID`: `{body, version}`; `DELETE`: `{version}`.
  Autoria vem exclusivamente da sessão. Uma versão antiga retorna 409.
- `PUT /api/games/igdb-ID/rating`: `{rating}` entre 0 e 5; zero remove a nota.
  O comentário mostra a nota atual do autor, sem excluir o texto ao remover a nota.
- Respostas de escrita trazem o perfil atualizado, `commentCount`, `commentGameIds`
  e `ratings`. A contagem é um COUNT indexado, sem contador redundante.
  Chaves estrangeiras impedem órfãos; UNIQUE impede comentários duplicados.
- Comentários são texto simples, renderizados pelo escape padrão do React.
  Biblioteca inclui jogos comentados e só consulta comentários quando o painel abre.
  Notas locais de visitante são preservadas separadamente; não são atribuídas
  automaticamente a uma conta em dispositivo compartilhado.

Verificação: `npm --prefix backend test` e `npm --prefix frontend test`.

## Login com Google e favoritos da conta

Navegar e ler comentários é público. Escritas de favoritos, avaliações e comentários
exigem sessão na API. `PUT /api/games/igdb-ID/favorite` recebe `{favorite: true|false}`;
o perfil inclui `favorites` e `googleLinked`. Favoritos são idempotentes e isolados
por usuário. Registros antigos do navegador são preservados apenas para leitura,
sem atribuição automática a uma conta.

Para habilitar Google:

1. Crie um cliente OAuth **Aplicativo da Web** no Google Cloud e configure a tela
   de consentimento com os escopos `openid email profile`.
2. Adicione o URI de redirecionamento exato:
   `http://localhost:5173/api/auth/google/callback` no Vite, ou
   `http://localhost:8080/api/auth/google/callback` no Compose.
   Em produção, use `https://SEU-DOMINIO/api/auth/google/callback`.
3. Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e `GOOGLE_REDIRECT_URI`
   no ambiente do backend (ou `.env` da raiz para Compose). Nunca use prefixo
   `VITE_` no segredo. Em HTTPS, configure `SESSION_COOKIE_SECURE=true`.
4. Reinicie a API. Em um projeto Google em teste, inclua os usuários de teste
   na tela de consentimento. Sem as variáveis, o botão explica a indisponibilidade
   e o login por e-mail continua funcionando.

Para acessar pelo celular usando um túnel HTTPS, mantenha o retorno local em
`GOOGLE_REDIRECT_URI` e configure o retorno público em `GOOGLE_REDIRECT_URIS`
(URLs completas separadas por vírgula). Exemplo:
`GOOGLE_REDIRECT_URIS=https://SEU-DOMINIO/api/auth/google/callback`.
Cadastre **cada URL exata** em Google Auth Platform → Clientes → cliente Web →
URIs de redirecionamento autorizados. Reinicie a API depois de editar `.env`.
O início do login escolhe apenas um retorno configurado com a mesma origem do
navegador; esse retorno fica salvo até a troca do código. Origens não configuradas
recebem um erro recuperável antes de sair do site. No celular, `localhost` aponta
para o próprio aparelho. Use o link HTTPS público desde o início do login.
Túneis rápidos `trycloudflare.com` mudam de endereço quando recriados: atualize
o `.env` e o cadastro Google juntos, ou use um domínio estável.

`POST /api/auth/google/start` recebe `{returnTo, link}` e devolve a URL Google.
O retorno em `GET /api/auth/google/callback` usa código de autorização, PKCE S256,
estado aleatório de uso único, cookie HttpOnly vinculado ao navegador e expiração
de dez minutos. Só caminhos locais podem ser destinos de retorno. A identidade é
consultada diretamente no endpoint HTTPS UserInfo do Google com o token obtido
pelo servidor. `sub` identifica o vínculo; e-mail precisa estar verificado. Tokens
Google não são persistidos nem registrados em logs.

Uma conta Google nova cria a conta BuscaGames. Se o e-mail já existe, a pessoa
precisa entrar com senha e escolher **Vincular conta Google** no perfil.
Não há vinculação automática por coincidência de e-mail. O vínculo exige a mesma
sessão válida que iniciou o fluxo e não substitui vínculos de outra conta.
Cancelamento, expiração e falha do provedor retornam à página com erro recuperável.
O usuário repete a ação desejada após entrar; não há publicação automática.

Migração aditiva: `google_accounts`, `google_flows`, `user_favorites` são criadas
na abertura do banco. A implementação usa Node/SQLite já existentes, sem pacotes
adicionais. Referência: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect).
Verificação específica: `node --test test/auth.test.js` no diretório backend.

## Segurança do cadastro

- Nome de exibição com 2–60 caracteres, sem controles invisíveis; e-mail limitado
  a 254 caracteres e normalizado com trim/lowercase. Não removemos pontos nem
  sufixos `+`, pois isso poderia unir identidades diferentes.
- Novas senhas têm 8–20 pontos de código Unicode; espaços, acentos, símbolos,
  colagem e gerenciadores são permitidos. Confirmação idêntica é obrigatória na API.
  Bloqueamos bases comuns e variantes previsíveis, repetições curtas, senhas somente
  numéricas e inclusão de nome/e-mail (partes com pelo menos quatro caracteres) ou
  BuscaGames. A lista local não substitui uma base completa de senhas vazadas.
- Hash scrypt versionado com N=16384, r=8, p=5, salt aleatório de 16 bytes e
  comparação em tempo constante. Hashes antigos continuam aceitos e são atualizados
  após login válido, sem exigir mudança da senha. Não armazenamos confirmação,
  senha em texto ou tokens brutos de sessão. Regras mais estritas de cadastro não
  bloqueiam senhas ou formatos de e-mail aceitos anteriormente no login.
- Limites em janelas de 15 minutos: 30 tentativas por IP (incluindo entradas
  inválidas e início OAuth), 5 cadastros por e-mail e 10 logins por e-mail.
  Login válido limpa o contador do e-mail. Respostas 429 incluem Retry-After.
  Até quatro hashes simultâneos por processo e 10 mil chaves de limite no banco.
  Reiniciar a API preserva contadores; chaves expiradas são removidas automaticamente.
- O Compose usa API privada e Nginx sobrescrevendo X-BuscaGames-Client-IP;
  somente nesse cenário TRUST_PROXY=true é seguro. Fora dele, o padrão ignora
  cabeçalhos encaminhados. Nunca exponha a porta da API com TRUST_PROXY=true.
  Túneis/proxies adicionais precisam de configuração confiável do IP real no Nginx;
  sem ela, o limite será compartilhado pelos clientes desse proxy.
- Senhas e dados pessoais não são registrados em logs. JSON limitado a 8 KiB,
  cabeçalho de requisição obrigatório, rejeição de Sec-Fetch-Site: cross-site,
  consultas parametrizadas, restrição UNIQUE de e-mail e respostas sem cache.
  Login inválido usa a mesma mensagem para conta inexistente ou senha incorreta.
  O cadastro imediato ainda distingue e-mail indisponível pelo status 409; eliminar
  essa enumeração exige um fluxo de ativação por e-mail com resposta uniforme.
- Cookies Secure são padrão quando NODE_ENV=production, exceto com opt-out
  SESSION_COOKIE_SECURE=false para HTTP local. O Compose local faz esse opt-out:
  em implantação pública, configure HTTPS e SESSION_COOKIE_SECURE=true.
- Sem serviço de envio, o cadastro por senha permanece ativo sem comprovação
  de propriedade do e-mail, conforme decisão atual. Não marcar esse e-mail como
  verificado nem usá-lo para recuperação automática. O fluxo Google exige
  email_verified=true e não vincula contas automaticamente por coincidência de e-mail.

Referências: [OWASP Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
e [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
Verificação: `npm --prefix backend test` (inclui `account-security.test.js`),
`npm --prefix frontend test`, `npm --prefix frontend run lint` e `npm --prefix frontend run build`.

## Comunidade, perfis públicos e interações

As tabelas `user_follows` e `comment_likes` são criadas automaticamente ao abrir o
SQLite existente. Nenhuma conta, jogo ou biblioteca é removida. Reinicie a API ao
atualizar o código; não há comando separado de migração.

- `GET /api/users?q=NOME&page=1`: jogadores, busca literal sem diferença de acentos
  ou maiúsculas. Páginas de 12, ordenação por nome/ID, `users`, `total`, `page`, `pages`.
- `GET /api/users/ID`: `profile` com ID, nome, foto, `backgroundUrl`, selo de revisão, contagens de
  favoritos/avaliados/seguidores/seguindo, `commentCount`, `receivedLikeCount`
  (curtidas recebidas nos comentários), média e `isFollowing` relativo à sessão.
  Esta é uma projeção pública explícita: nunca inclui e-mail, senha, salt, tokens
  ou vínculo Google. As leituras usam `Cache-Control: no-store`.
- `GET /api/users/ID/library?filter=all|favorites|rated&page=1`: união dos jogos
  favoritos e avaliados da conta indicada, deduplicada. Retorna `games`, total e
  paginação; cada jogo tem ID, título, capa, plataformas, favorito e nota do dono.
  Não inclui registros locais de visitante nem substitui a nota pela de quem visita.
- `GET /api/users/ID/followers?page=1` e `/following?page=1`: mesma projeção de jogadores.
  Páginas que excedem o total são ajustadas para a última disponível.
- `GET /api/users/ID/comments?page=1` e `/likes?page=1`: comentários públicos do
  jogador; `likes` inclui apenas os que receberam curtidas. Retorna `comments`,
  `total`, `page`, `pages`, em páginas de 12, mais recentes primeiro, ajustando
  páginas excedentes. Cada item inclui ID, texto, data, contagem de curtidas e
  jogo (ID, título, capa). A contagem do perfil soma curtidas, enquanto o total
  dessa lista conta comentários. Não revela quem curtiu nem histórico privado.
- `PUT /api/users/ID/follow` com `{following: true|false}`: segue/deixa de seguir,
  retorna `{profile}` público atualizado. Não permite seguir a própria conta.
- `PUT /api/comments/ID/like` com `{liked: true|false}`: retorna `{liked, likeCount}`.
  Comentários retornados pela API incluem `likeCount` e `liked` relativo à sessão.
  A exclusão do comentário remove suas curtidas por chave estrangeira.

Escritas são idempotentes, exigem sessão ativa, JSON e `X-BuscaGames-Request: 1`,
e recusam requisições cross-site. A identidade é obtida do cookie; IDs de autor no
corpo não permitem agir por outra pessoa. Bloqueio administrativo revoga sessões
existentes e impede novas escritas. Sem sessão retorna 401, dados inválidos 400,
recurso ausente 404, método inválido 405. Banco impõe unicidade das relações.

Nome, foto, favoritos, notas e listas de conexões são públicos, conforme o recurso
solicitado; cadastro e política de privacidade informam essa visibilidade. Usuários
podem remover favoritos/notas, descurtir e deixar de seguir. A interação é feita por
comentários nos jogos e curtidas; não há mensagens privadas neste recurso.

Validação: `test/social.test.js` cobre privacidade, autorização, idempotência,
filtragem, paginação e persistência. `tests/e2e/community-browser.cjs` executa
os fluxos no Edge com API real e SQLite isolado em memória, sem usar o banco real.

### Plano de fundo do perfil

Se todo upload falhar com “Dados muito longos”, confirme que a API foi reiniciada
após atualizar o código. Uma versão antiga sem a rota de background pode encaminhar
o JSON ao limite genérico de 8 KiB. Em desenvolvimento, use `npm run dev`; no
Compose, reconstrua e recrie os serviços após alterações. O limite dedicado abaixo
não deve ser aumentado para contornar uma API antiga.

`PUT /api/auth/background` recebe `{photo: BASE64_PNG}` ou `{photo: null}` para
remover. Exige sessão ativa e as proteções de origem das demais escritas. O dono
vem exclusivamente da sessão; não aceita um ID de destino. Responde `{user}` com
`backgroundUrl`, também disponível em `/api/auth/me` e na projeção pública.
O navegador aceita JPG, PNG ou WebP até 8 MB, recorta pelo centro para 900 × 300
(3:1) e reencodifica sem metadados. A API limita o corpo a 2 MiB e valida tamanho,
assinatura, dimensões, chunks/CRC e dados descomprimidos do PNG RGB/RGBA de 8 bits.

`profile_backgrounds` guarda uma imagem por conta no SQLite existente. A tabela
é criada automaticamente também em bancos existentes. Substituição/remoção é
atômica; falha não apaga a imagem anterior. `GET /api/backgrounds/ID/HASH.png`
serve a imagem sem login, com MIME fixo, nosniff e cache de uma hora. Apenas o
hash atual é servido; uma cópia já armazenada no navegador pode durar até uma
hora após a remoção. Não são aceitas URLs externas. Nome, foto e plano de fundo
são públicos; e-mail, credenciais e sessão não fazem parte dessa projeção.

### Respostas a comentários

GET /api/comments/ID/replies?after=CURSOR lista até 20 respostas em ordem de publicação, com replies, nextCursor e ownCount da sessão. POST no mesmo caminho recebe {body} e retorna {reply, ownCount}. Exige conta ativa; texto não vazio de até 35 pontos de código Unicode; até duas respostas por usuário e comentário (409 ao exceder, protegido por trigger SQLite). Respostas não recebem outras respostas e não alteram o contador de opiniões sobre jogos. A exclusão do comentário remove as respostas em cascata.

