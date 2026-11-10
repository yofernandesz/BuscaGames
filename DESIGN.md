---
version: alpha
name: BuscaGames
description: Catálogo brasileiro de jogos com identidade noturna e detalhes neon.
colors:
  background: "#0b0a12"
  surface: "#121026"
  text: "#f1eeff"
  muted: "#a29ccb"
  primary: "#34f0e0"
  accent: "#9b5cff"
typography:
  display:
    fontFamily: "Chakra Petch, sans-serif"
  body:
    fontFamily: "Rajdhani, sans-serif"
rounded:
  DEFAULT: "14px"
spacing:
  page-max: "75rem"
components:
  price: {}
  genre-tags: {}
---

# BuscaGames

## Overview

Catálogo para descobrir jogos e consultar informações, em português do Brasil,
em celular e desktop. A identidade existente lembra uma biblioteca de jogos
noturna: capas têm destaque; dados e preços usam apresentação discreta.
Não transformar estados sem preço em promoções ou avisos alarmistas.

Os tokens de `frontend/src/styles/base.css` são a fonte canônica; este documento
espelha os valores, sem gerar CSS. As regras dos componentes ficam em
`frontend/src/features/games/styles/games.css`. Não há biblioteca de UI ou tema claro.

### Localização dos componentes

As áreas do frontend ficam em `frontend/src/features/`: `games`, `account`,
`community` e `admin`, com páginas, componentes e estilos próximos entre si.
Os donos canônicos citados neste documento mantêm os mesmos nomes e contratos.
`components/ui/` reúne os componentes compartilhados e seus estilos locais;
`styles/` mantém a base, o layout, os componentes globais e a responsividade.
`lib/communityApi.js` e `hooks/useCommunityQuery.js` são compartilhados entre áreas.
A reorganização de pastas preserva os tokens, a ordem de carregamento do CSS,
as rotas e todas as regras de interação descritas abaixo.

## Colors

Mapeamento: background → `--bg-0`, surface → `--bg-1`, text → `--text-hi`,
muted → `--text-lo`, primary → `--neon-cyan`, accent → `--neon-purple`.
Ciano identifica links e gratuidade confirmada; roxo compõe a identidade.
Estados de consulta são explicados por texto, nunca só pela cor.

## Typography

Display → `--font-display`; body → `--font-body`. Preços usam display com
peso 700; explicações usam `.offer-note`. Valores monetários são formatados
em `pt-BR`, exclusivamente em BRL quando a fonte confirmar a moeda.
Datas de consulta são apresentadas no fuso do navegador.

## Layout

`app/ScrollToTop.jsx` centraliza a entrada no topo em todas as rotas, antes
da pintura, com rolagem instantânea. A restauração automática do histórico
fica desativada enquanto o app está montado; retorno pelo navegador também
abre no topo. Filtros e âncoras na mesma tela mantêm seu comportamento próprio.

As avaliações usam cinco colunas iguais de até 44px em `games.css`, encolhendo
juntas na ficha da biblioteca e nos cards, sem quebrar a quinta estrela para
outra linha. Nome e e-mail da conta quebram palavras longas em `profile.css`,
preservando o conteúdo completo e a largura dos botões do formulário.

`--page-max` limita a página a 75rem. Cards usam grade fluida e seções de
descoberta mantêm rolagem horizontal própria. Blocos de oferta podem quebrar
linhas; links permanecem acessíveis em 320px e não dependem de hover.
Não usar alturas fixas ou truncamento para esconder motivos de indisponibilidade.

## Elevation & Depth

Fundos escuros, bordas sutis e sombras nos cards existentes. Estados de preço
permanecem no fluxo do documento, sem modal, toast ou nova camada visual.

## Shapes

`--radius` define os containers em 14px. Etiquetas de gênero usam os cantos
de 7px já implementados; preços são conteúdo textual, sem caixa decorativa.

## Components

### Estrelas de avaliação

`StarRating.jsx` é o dono das cinco reações no catálogo, detalhes e biblioteca.
Estrelas SVG com contorno substituem o glifo tipográfico; preenchimento representa
a seleção, e foco ciano permanece independente da cor da nota. A legenda distingue
Ruim, Regular, Bom, Ótimo e Obra-prima. A nota persistida segue sendo exibida em /5.
Hover e foco antecipam a escolha sem salvar nem disparar celebrações.

Após confirmação da nota, 1 treme e cai levemente (650ms), 2 balança indecisa
(700ms), 3 salta (750ms), 4 salta com giro e faíscas (1000ms), e 5 faz as cinco
estrelas girarem em cascata com halos e partículas (1250ms + 70ms por estrela).
Sem loops, som ou flashes de tela; remoção da nota não celebra. Botões mantêm
geometria estável, sem animação no carregamento inicial. Movimento reduzido
conserva somente cor, preenchimento e legenda. Teclado mantém setas/Home/End.

`games.css` é dono dos tokens locais: `--rating-gold` (#ffd24a, dourado existente)
e `--rating-color` (por nível: --text-lo, #f0d28a, dourado, dourado, #fff0af).
Partículas reutilizam --neon-cyan e --neon-purple. Tipografia e tokens globais
continuam em base.css. Não há dependência nova.

### Coração de favoritos

`FavoriteButton.jsx` compartilha o efeito de estourar balão entre catálogo,
detalhes e biblioteca. Ao adicionar com sessão, o coração infla, desaparece
brevemente entre um aro e oito partículas, e retorna em 680ms. O efeito responde
ao clique; preenchimento e `aria-pressed` continuam seguindo a confirmação da API.
Remover ou abrir o login não dispara partículas. O botão mantém seus 44px e foco
ciano, sem deslocar o layout. `prefers-reduced-motion: reduce` desativa todo o efeito.
O rosa existente #ff6b9d é centralizado no token local `--favorite-accent` em
`games.css`; partículas alternam esse rosa e `--text-hi`. Não há som nem dependência.

### Aviso de cookies

`App.jsx` salva aceitação e recusa em `buscagames:cookie-choice` no localStorage.
O aviso automático aguarda a consulta da sessão e aparece somente para visitantes
sem escolha salva. Usuários conectados podem abrir as preferências manualmente;
login não autoriza opcionais. Armazenamento bloqueado mantém a escolha só na página.
O card não modal fica no canto inferior direito, com até 25rem,
sem backdrop, foco automático ou bloqueio do catálogo. A camada é
`--z-cookie-notice` (60 em base.css), acima do cabeçalho existente (50).
O texto inicial explica que o catálogo funciona sem cookies opcionais.
Um disclosure nativo recolhe os detalhes de armazenamento, revisão e política
em `/privacidade`. Aceitar e recusar têm o mesmo destaque; fechar pelo X ou por Escape
dentro do card equivale a recusar opcionais. A altura é limitada a 55dvh, com
rolagem interna e respeito às áreas seguras. ResizeObserver atualiza espaço
no fim da página e scroll-padding para manter controles alcançáveis ao rolar.
A navegação interna preserva a escolha. “Preferências de cookies” reabre o aviso
com foco e suspende o player. `FeaturedGame.jsx` só monta o iframe do YouTube
após aceitação e ação de ouvir. Favoritos e notas continuam seguindo o
armazenamento funcional documentado no README. A escolha persiste até ser alterada
ou removida no navegador; não há carregamento automático do player. O aviso reutiliza tokens e botões globais,
quebra linhas em telas estreitas e não captura o teclado. O card pode ser
dispensado a qualquer momento; o topo e a posição inicial do catálogo não mudam.

### Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Select/Listbox | Catalogo.jsx, select nativo | Filtro de seção do catálogo | Popup do sistema operacional | App.test.jsx |
| Price | Price.jsx e prices.js | Estados de preço abaixo e backend/README.md | Mesma oferta em card e detalhe | Price.test.jsx, prices.test.js, navegador |

`Price.jsx` é o único dono da apresentação de preço em cards e detalhes.
`prices.js` no backend é dono da associação exata com a Steam, dos valores,
validade e tentativas. `useCatalog.js` atualiza dados e cancela leituras antigas.

| Estado | Apresentação e recuperação |
| --- | --- |
| ready / free | Valor confirmado; desconto só quando atual; grátis somente quando explícito |
| pending | Consultando preço; atualização automática |
| no_source | Preço não monitorado; explica falta de vínculo desta edição com a Steam |
| unavailable | Sem oferta em reais; oferece conferir a Steam quando há vínculo |
| error | Falha temporária; nova tentativa automática e horário quando conhecido |
| stale | Preserva último valor e data, com aviso; sem destaque de desconto |

O link “Conferir na Steam” usa URL validada, anuncia nova aba, recebe foco
visível e possui estados hover/active. Sem botão de compra ou busca aproximada
por título. `GenreTags.jsx` continua como dono das etiquetas de gêneros e temas.
O site já respeita `prefers-reduced-motion`; ofertas não acrescentam animações.

O filtro de seção em `Catalogo.jsx` usa select nativo: o sistema operacional
controla o popup e o teclado. Não há exigência de geometria personalizada para
esse menu; a escolha está registrada em `premium-ui.json`.

## Do's and Don'ts

### Entrada do catálogo

As âncoras de categorias e “Explorar categorias” usam a rolagem suave nativa
de `base.css`, preservando URL, histórico e os offsets responsivos existentes.
Em `games.css`, o título de destino recebe uma chegada de 1,4 s com deslocamento
de 8px e brilho ciano discreto; resultados filtrados entram em 450 ms.
A curva é `cubic-bezier(.22, 1, .36, 1)`, sem alterar a geometria do documento.
Esses movimentos só são habilitados em `prefers-reduced-motion: no-preference`.

O destaque editorial continua primeiro, com espaçamento e tipografia mais
compactos e um atalho visível para as categorias antes dele. Em telas de até
480px, as seis categorias formam uma grade de duas colunas com ícone, título
e contagem; textos auxiliares saem para evitar rolagem excessiva. Categorias
não recebem numeração decorativa porque não são etapas nem um ranking.

A busca e a categoria ficam em `q` e `section` na URL, preservando o contexto
ao recarregar e usar Voltar do navegador. O X junto ao campo limpa somente o
texto e devolve o foco; “Limpar busca” remove texto e categoria. Composição de
texto é concluída antes de iniciar consultas; o cancelamento e debounce continuam
centralizados em `useCatalog.js`. No celular o cabeçalho segue o fluxo normal
para não ocupar a área útil com três linhas fixas. Estados de foco usam ciano.
Verificação: `App.test.jsx`, lint/build, auditoria e inspeção desktop/mobile.

### Biblioteca pessoal

`/biblioteca` reúne a união dos favoritos, jogos comentados e jogos com nota maior que zero,
conforme `GamesProvider.jsx` e o contrato de armazenamento descrito no README.
Não representa compras. Registros antigos de visitante ficam disponíveis para leitura no navegador;
novos favoritos, notas e comentários exigem sessão e ficam na conta, conforme explicado na tela. IDs salvos são consultados diretamente na API, sem
depender dos resultados parciais da página inicial. Falhas preservam os IDs e
notas, apresentam cards identificáveis e oferecem nova tentativa.

A composição usa pares de capa vertical e ficha pessoal, com a nota em destaque
em vez do preço. Reutiliza os seis tokens de cor e as duas fontes acima; não
introduz um tema. Grade com duas colunas no desktop e uma abaixo de 900px.
Busca, filtro e ordenação ficam na URL; toda a coleção é exibida, sem paginação.
O select de ordenação é nativo, com popup e teclado do sistema operacional.

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Navegação | Header.jsx | App.jsx | Catálogo, Minha biblioteca | App.test.jsx, Biblioteca.test.jsx |
| Avaliação | StarRating.jsx | GamesProvider.jsx | Compacta, padrão; setas/Home/End | Biblioteca.test.jsx |
| Favoritos | FavoriteButton.jsx | GamesProvider.jsx | Card, detalhe, biblioteca | Biblioteca.test.jsx |
| Scrollbar | base.css | Tokens globais existentes | Sistema em forced-colors | Auditoria estática e navegador |

Sem novas dependências. As verificações de biblioteca cobrem recuperação,
filtros, ordenação, teclado, falha parcial e persistência das notas.

- Reutilizar `Price` em todas as telas; manter dados de origem e data visíveis.
- Distinguir falta de vínculo, ausência de oferta e erro recuperável.
- Não confundir uma consulta pendente com gratuidade ou remoção definitiva.
- Não substituir uma edição, plataforma ou moeda para preencher um preço ausente.

### Estatísticas da biblioteca

O painel começa recolhido e só é montado ao clicar em “Visualizar estatísticas”.
O mesmo botão permite “Ocultar estatísticas”, com aria-expanded e aria-controls.
Os filtros de gênero, plataforma, ano e nota ficam dentro do painel e só afetam
a seleção enquanto ele está aberto; seus valores são preservados ao recolher.
Busca, coleção, ordenação e os cards permanecem na apresentação da biblioteca.

LibraryInsights.jsx apresenta gráficos circulares interativos de notas, gêneros e plataformas,
com os tokens e fontes da biblioteca. Legendas são botões com contagem textual,
aria-pressed e teclado nativo; listas longas têm rolagem própria. Filtros combinados
por coleção (incluindo favoritos avaliados), busca, gênero, plataforma, ano de
lançamento e nota ficam na URL. Selects mantêm o popup nativo do sistema.
Resumo, gráficos e cards usam a mesma seleção; clicar novamente numa fatia ou legenda
remove seu filtro. As opções dos selects vêm da coleção inteira, permitindo
sair de seleções vazias. A média exclui notas zero; categorias múltiplas contam
o jogo uma vez por categoria; metadados ausentes são “Não informado”. Não se
infere data de avaliação a partir da data de lançamento. Alterações pessoais
atualizam imediatamente a seleção. Biblioteca.test.jsx verifica esses contratos.

Os gráficos agora usam SVG circular, com alternância independente entre rosquinha
(padrão para notas e plataformas) e pizza (padrão para gêneros). Fatias e legendas
aplicam os mesmos filtros; Enter/Espaço também acionam fatias. Legendas mostram
contagem e percentual sobre ocorrências, inclusive em categorias múltiplas.
O círculo vazio e a categoria única têm representação explícita. A paleta reutiliza
ciano, roxo e magenta e acrescenta os tokens locais --chart-gold (#f0d28a),
--chart-blue (#a6c3ff) e --chart-coral (#ffac87), já presentes no catálogo.


### Interesse da semana

`Catalogo.jsx` apresenta o aviso de seleção alternativa recebido da API no texto
da seção, inclusive na busca. `GameCard.jsx` mostra a data da coleta e o estado
de atualização pendente usando o mesmo padrão de Em alta. Dados antigos não são
apresentados como medições atuais; sem histórico, a seleção usa jogos do catálogo
por quantidade de avaliações, sem métricas de interesse inventadas.


### Política de privacidade

A rota /privacidade reutiliza Header, tokens e btn-ghost, com resumo, índice de
âncoras e coluna de leitura responsiva. O título recebe foco na entrada. O
rodapé e o aviso de cookies levam à mesma página. A revisão usa o controle
central de App.jsx. Nome e e-mail foram informados pelo proprietário; prazos
da infraestrutura não confirmados não são inventados. App.test.jsx cobre
acesso direto, navegação e revisão de cookies.

### Perfil

`NicknameEditor.jsx`, em Informações da conta, reutiliza campos e botões de
`auth.css`, `communityApi` e a sessão de `GamesProvider`. Salvar mostra feedback
inline, preserva o texto em erro e informa a data da próxima troca em pt-BR.
Fonte da regra: `PUT /api/auth/nickname`, descrito em `backend/README.md`.
Usuários comuns aguardam 30 dias entre alterações; administradores são isentos
do prazo e da exclusividade. Não há tokens ou dependências novos.

`/perfil` permite cadastro, entrada e saída da conta por `Account.jsx`.
Visitantes podem consultar registros locais antigos; novas ações exigem login. Contas possuem favoritos, avaliações e comentários persistentes. A identidade vem exclusivamente da sessão. O e-mail é exibido
apenas no próprio perfil; nome, foto e biblioteca da conta também aparecem no perfil público, conforme o recurso de comunidade solicitado.

A assinatura visual é o cartão de jogador: emblema de controle, órbitas sutis
e divisão pontilhada como uma credencial. `profile.css` consome os tokens de
`base.css`, Chakra Petch nos títulos e Rajdhani no texto, sem novos tokens
globais, fontes, dependências ou animações. Duas colunas tornam-se uma em 560px;
as quatro estatísticas tornam-se duas em 800px. Informações não são truncadas.

GamesProvider continua dono de favoritos, avaliações e sessão. O total é a união
dos IDs favoritos, avaliados e comentados; favoritos são únicos e a média exclui notas zero. Sem jogos, a chamada
orienta a favoritar no catálogo. Atalhos abrem filtros reais da biblioteca;
privacidade e cookies reutilizam a rota e o controle de App.jsx. Dados locais
não são apresentados como dados de conta. O título recebe foco na entrada.

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Navegação de perfil | Header.jsx / App.jsx | Rota /perfil | Visitante ou sessão autenticada | Perfil.test.jsx |
| Resumo pessoal | GamesProvider.jsx | Favoritos e notas da conta; legado local somente para leitura | Total, favoritos, avaliados, média | Perfil.test.jsx |
| Privacidade | App.jsx / Privacidade.jsx | Escolha de cookies no navegador e sessão de GamesProvider | Aviso automático para visitante sem escolha; revisão manual para todos | App.test.jsx, Perfil.test.jsx |


### Comentários e conta

`Comments.jsx` é o dono compartilhado do formulário, contador 0–500, listagem,
edição e exclusão. Detalhes abrem a seção; biblioteca usa disclosure e carrega
somente ao abrir. As páginas seguem cursor de 10 itens, mais recentes primeiro.
`Account.jsx` possui o formulário de autenticação. `GamesProvider` compartilha
sessão, avaliações e contador recebido do servidor após cada escrita.

Feedback é inline com status/alert; erros preservam texto. Exclusão exige confirmação
inline com cancelar; não usa diálogo nativo. Apenas o autor vê editar/excluir e
as APIs verificam novamente a autoria. Comentário próprio também fica acessível
quando está fora da página atual. Um comentário por usuário/jogo, editável.
Notas zero não aparecem; datas seguem pt-BR e fuso do navegador.

Os estilos de `comments.css` reutilizam cores/fontes/botões existentes e respeitam
quebra de linhas no celular, foco visível, labels e campos de senha mascarados.
Não há nova dependência, animação ou token global. Fonte: contrato de API em
`backend/README.md`, implementação `community.js` e requisito de comentários.

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Form / CRUD de comentários | Comments.jsx | community.js e backend/README.md | Detalhes e disclosure na biblioteca | Comments.test.jsx, comments.test.js |
| Conta e sessão | Account.jsx / GamesProvider.jsx | community.js | Visitante e autenticado | Comments.test.jsx, comments.test.js |
| Feedback | Status/alert inline em Comments.jsx e Account.jsx | Resposta da API | Sucesso, falha, carregamento | Comments.test.jsx |

### Login contextual e Google

A solicitação atual substitui o contrato anterior que permitia novas avaliações
ou favoritos de visitante: o catálogo e os comentários continuam públicos;
avaliar, favoritar e adicionar comentário abrem o mesmo login quando não há sessão.
O legado local é preservado para leitura. Favoritos novos, notas e comentários
pertencem à conta no SQLite, conforme backend/README.md.

A assinatura é a credencial de jogador inclinada, com controle vetorial ciano,
divisão pontilhada e a frase “Jogar é só o começo”. O resto do formulário usa
superfícies discretas e espaçamento regular. `auth.css` consome as seis cores,
as duas fontes e o raio existentes de `base.css`, sem alterar tokens globais.
A marca Google mantém suas cores oficiais e botão claro como exceção de provedor.

`LoginDialog.jsx` usa dialog nativo/showModal na camada superior do navegador,
acima do aviso de cookies, com fundo inerte, Escape, foco inicial no fechar,
restauração ao acionador e bloqueio temporário da rolagem do documento. O conteúdo
rola dentro dos limites de 100dvh; abaixo de 700px, a assinatura vira cabeçalho
compacto e o formulário ocupa uma coluna. Entrada de 180ms somente sem preferência
por movimento reduzido. Fechar pelo X ou “Continuar explorando” não altera a rota.

`Account.jsx` é o formulário único do modal e do perfil. Tem cadastro, senha
mascarada com alternância acessível, labels, validação inline, prevenção de envio
duplicado e recuperação de falhas. E-mail é preservado na falha de credenciais.
Após login o modal fecha e a pessoa pode repetir a ação na mesma página. Sessão
expirada reabre o modal; o texto de comentário permanece em memória. Google só
inicia por escolha explícita; sem configuração o motivo aparece junto do botão.
Vinculação ocorre no perfil autenticado. Retorno OAuth preserva caminho, filtros
e âncora; erros são mensagens fixas, sem expor conteúdo arbitrário do provedor.
No celular e no desktop, o retorno Google permanece na origem que iniciou o login,
desde que ela esteja explicitamente configurada. Um endereço não configurado
mostra erro no formulário antes de navegar; não redireciona o celular ao localhost.

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Login e proteção de ações | GamesProvider.jsx / LoginDialog.jsx | Requisito atual; community.js | Favoritar, avaliar, comentar, entrar | LoginDialog.test.jsx, auth.test.js |
| Formulário de conta | Account.jsx | community.js / googleAuth.js | Modal, perfil, cadastro, vínculo Google | LoginDialog.test.jsx, Comments.test.jsx |
| Modal | LoginDialog.jsx, dialog/showModal nativo | DESIGN.md | Login contextual | Navegador desktop/mobile, teclado |
| Favoritos da conta | FavoriteButton.jsx / GamesProvider.jsx | user_favorites, community.js | Card, detalhe, biblioteca | auth.test.js, Biblioteca.test.jsx |

Reconciliação: o antigo armazenamento de novas ações de visitante foi substituído
pelo login solicitado; docs, mensagens e testes acompanham essa mudança. A paleta,
tipografia e navegação permanecem coerentes com o perfil existente.

### Critérios de criação de conta

O formulário canônico `Account.jsx` serve cadastro no modal e no perfil. As regras
puras em `shared/accountPolicy.mjs` são reutilizadas pela API; a política está em
`backend/README.md` (Segurança do cadastro). A lista de critérios aparece antes do
primeiro envio e muda para ciano com marca de conclusão ao atender cada item,
com texto de estado acessível. O mesmo bloco usa superfície, borda e fontes de
`auth.css`, sem tokens novos. Senha e confirmação têm visibilidade independente,
autocomplete new-password e permitem colar. Falhas apontam o primeiro campo
inválido; respostas da API restauram foco após o fim do envio. Login mantém
compatibilidade com contas antigas. Não há confirmação de e-mail sem serviço de
envio configurado; a interface não afirma que o endereço foi verificado.

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Critérios de cadastro | Account.jsx / shared/accountPolicy.mjs | backend/README.md, pedido de segurança de conta | Modal, perfil; login legado | LoginDialog.test.jsx, account-security.test.js |
| Foto de perfil | ProfilePhotoEditor.jsx e Avatar.jsx | Foto personalizada, seguida da imagem da conta Google | Cartão de jogador e autoria dos comentários | auth.test.js |

## Administração

A área administrativa reutiliza Logo, os campos de autenticação, os botões e os tokens do catálogo. A navegação lateral agrupa administração e registros, mostra a identidade da sessão e destaca a seção atual em ciano. No celular, o menu recolhível fica acima dos dados. Tabelas paginadas têm rolagem horizontal local.
No dashboard administrativo, a linha contínua ciano e a linha tracejada roxa distinguem cadastros e revisões. A tabela expansível oferece os valores diários. Rosquinha e barras mostram a distribuição atual dos perfis e das notas.

### Comunidade e perfis públicos

`/comunidade` apresenta jogadores por nome; `/perfil/:id` abre a credencial pública,
biblioteca e conexões. A comunidade usa os tokens de `base.css`, Avatar, ReviewBadge,
Header e os cards de `library.css`. `community.css` mantém a divisão pontilhada da
credencial, ciano para seleção e Chakra Petch para títulos. Não há tokens ou dependências novos.

Fonte de comportamento: pedido de perfis/bibliotecas visíveis e interação entre usuários;
contrato da API em `backend/README.md`, implementado por `social.js` e `community.js`.
A projeção pública expõe somente nome, foto, selo, contagens, favoritos e notas. E-mail,
credenciais, vínculo Google e sessão continuam privados. Legado local não é publicado.
O cadastro, o próprio perfil público e a política de privacidade explicam essa visibilidade.

Busca explícita por botão/Enter (sem consulta por tecla), X imediato com retorno de foco,
URL com busca, aba, filtro e página. Leituras usam cancelamento, timeout e chave de sessão;
respostas antigas não substituem a seleção atual. Listas públicas usam páginas de 12;
a API ajusta páginas que excedem o total. Vazio, falha com repetição e carregamento
ficam inline. Biblioteca pública é somente leitura e identifica a nota do dono;
o link “Conversar sobre o jogo” abre a seção compartilhada de comentários.

Seguir/deixar de seguir e curtir/descurtir exigem sessão, têm estado ocupado e só mudam
após confirmação da API. Visitante ou sessão expirada abre LoginDialog. Não se oferece
seguir a própria conta; o servidor verifica novamente. Um vínculo por par de usuários
e uma curtida por usuário/comentário. Comentários continuam editáveis apenas pelo autor.
O nome do autor abre seu perfil. Conexões e curtidas persistem no mesmo SQLite.

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Comunidade / perfil público | Comunidade.jsx, App.jsx, Header.jsx | social.js; backend/README.md | Busca, biblioteca, seguidores, seguindo | Comunidade.test.jsx, social.test.js, community-browser.cjs |
| Seguir | FollowButton em Comunidade.jsx | user_follows; identidade de sessão | Diretório e perfil | social.test.js, navegador |
| Curtir / autoria | Comments.jsx | comment_likes; community.js | Detalhes e biblioteca | social.test.js, Comments.test.jsx, navegador |
| Busca e paginação públicas | Comunidade.jsx | social.js, páginas de 12 | Enter/botão, X, links de abas | Comunidade.test.jsx, navegador |

Reconciliação: a regra anterior restringia a identidade à página própria. O pedido atual
introduz perfis e bibliotecas públicos; a projeção da API e os avisos foram atualizados
juntos. Paleta, tipografia, biblioteca pessoal e autoria das alterações foram preservadas.

### Botões sociais e movimento

`SocialButton.jsx` é o dono da apresentação de seguir e curtir, compartilhado por
FollowButton e Comments. As requisições, autenticação e erros continuam nesses
consumidores. `social-actions.css` usa `--social-accent` local: `--neon-cyan` ao
seguir e `--neon-magenta` ao curtir, com `--bg-1`, `--line`, `--text-hi` e
`--font-display` existentes. Nenhum token global, fonte ou dependência foi adicionado.

Contorno tonal, superfície com iluminação discreta, ícone SVG de 22px, altura
mínima de 46px e raio de 12px distinguem a ação social. O rótulo reserva a largura
da maior mensagem; o contador tem algarismos tabulares e separador próprio.
Hover em dispositivos com mouse eleva 1px; pressionar dá uma resposta curta.
Teclado mantém foco ciano externo e labels explícitos “Deixar de seguir”/“Descurtir”.

Somente uma nova relação confirmada pela API dispara o efeito: ícone com retorno
elástico de 720ms, halo de 620ms e passagem de luz de 680ms. Seguir desenha a marca
de confirmação em 420ms; curtir preenche o coração, emite seis pontos discretos
por 580ms e atualiza o contador com transição de 350ms. Não há celebração ao
carregar a página, desfazer, abrir login ou falhar. Uma trava evita cliques concorrentes.

Durante a gravação o ícone dá lugar a um indicador circular, preservando largura,
contagem e estado confirmado. Não há animação contínua fora da requisição.
Movimento reduzido desativa efeitos e deslocamentos; texto, preenchimento e ícones
mantêm a informação. O modo forced-colors preserva contorno e marca de seleção.

Reconciliação: `.sr-only` estava restrito aos critérios de senha, deixando os
status sociais visíveis e alterando a largura do botão. A utilidade agora pertence
a `base.css`, compartilhada por todos os usos existentes; a regra duplicada de
`auth.css` foi removida. Status permanecem anunciados sem afetar o layout.

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Botão social | SocialButton.jsx / social-actions.css | Confirmação de FollowButton e Comments | Seguir, curtir, ocupado, selecionado, desabilitado | SocialButton.test.jsx, community-browser.cjs |
| Texto somente acessível | base.css, .sr-only | Semântica dos status existentes | Status e labels auxiliares | Navegador, largura estável |

### Perfil completo e conexões navegáveis

O plano de fundo personaliza a faixa superior. `ProfileBackground.jsx`
compartilha a imagem decorativa entre perfil pessoal e público. No perfil pessoal,
o degradê até `--bg-1` mantém os textos legíveis atrás do avatar. No público,
a capa ocupa uma faixa própria em 3:1, preservando o recorte salvo em qualquer
largura; avatar, nome e ações ficam abaixo sobre superfície sólida. O degradê
fica restrito aos 15% inferiores, sem escurecer a imagem inteira.
`profile-background.css` reutiliza os tokens
existentes, sem nova paleta, fonte ou animação. Sem imagem, mantém o fundo original;
se o carregamento falhar, mantém uma superfície escura legível. O arquivo é
recortado pelo usuário em 3:1 (900 × 300).
`ProfilePhotoEditor.jsx` é o dono do seletor nativo, validação, envio imediato,
estado ocupado, remoção e feedback inline, com variantes foto e plano de fundo.
Um disclosure nativo “Plano de fundo” mantém a capa livre: o painel abre ancorado
no botão, sem mover o cartão; Escape fecha e devolve foco ao acionador.
Só o dono edita em `/perfil`; visitantes veem a capa em `/perfil/:id` sem login.
JPG, PNG e WebP até 8 MB são reencodificados em PNG antes do envio; metadados do
arquivo original não são publicados. Falha mantém a capa salva, e sessão expirada
reabre o login canônico. Fonte: pedido de capa pública e backend/README.md.

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Upload de imagem do perfil | ProfilePhotoEditor.jsx | community.js / backend/README.md | Avatar e plano de fundo público | profile-background.test.js, profile-background-browser.cjs |
| Capa pública | ProfileBackground.jsx / profile-background.css | profile_backgrounds, social.js | Perfil pessoal e público | Navegador desktop/mobile e visitante |

O perfil pessoal reúne a credencial, conexões, coleção e dados da conta. Nome,
identificação, foto, selo de revisão, e-mail, comentários e vínculo Google são
apresentados conforme a sessão; e-mail fica identificado como “Só você”. Senhas,
tokens e dados internos de autenticação nunca são apresentados. Nome abre o perfil
público; os quatro indicadores da coleção abrem a biblioteca com os filtros
correspondentes. Comentários da conta abrem a lista pública do autor.

Os três contadores sociais ficam dentro da credencial principal, logo abaixo
do nome e junto à foto, seguindo a hierarquia familiar de perfis de redes sociais.
Não há seção separada “Seu lado social”. A variante pessoal conserva os cards,
ícones, cores e animações em dimensões compactas, sem legendas auxiliares;
“Explorar comunidade” fica entre os atalhos da credencial.

`ProfileSocialStats.jsx` é o dono dos três atalhos sociais, compartilhado pelo
perfil pessoal e público. Cada card inteiro é um link: seguidores, seguindo e
curtidas recebidas. “Curtidas recebidas” soma as reações nos comentários do autor;
o destino lista os comentários com alguma curtida, com contagem e link à conversa
do jogo. Uma aba separada permite consultar todos os comentários publicados.
Listas usam as páginas de 12 da API, com URL, Voltar, vazio e recuperação inline.
`useCommunityQuery.js` centraliza o cancelamento e a invalidação por sessão que
antes pertenciam a Comunidade.jsx. Falha de conexões não oculta a conta nem vira zero.

A assinatura da credencial continua sendo a divisão pontilhada e o avatar.
O novo trio social usa números tabulares, ícones de pessoas/coração e seta de
navegação, sem novo tema. `profile-social.css` deriva `--connection-accent` de
`--neon-cyan`, `--neon-purple` e `--neon-magenta`; superfícies, fontes e raio vêm
de `base.css`. A entrada de 550ms tem intervalos de 65ms, hover com elevação de
3px e resposta curta ao pressionar. O cartão entra em 650ms e a troca do conteúdo
público em 300ms. Tudo é finito e habilitado apenas sem movimento reduzido.
Mobile mantém os três atalhos e rótulos, recolhendo somente as legendas auxiliares;
comentários passam de duas colunas a uma. Foco ciano e contorno em forced-colors.

Reconciliação: a descrição anterior de perfil sem animações aplica-se à versão
anterior; o pedido atual aprova os movimentos acima. Paleta, fontes, estado de
sessão, privacidade e botões sociais existentes são preservados.

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Contadores sociais e destinos | ProfileSocialStats.jsx | social.js, backend/README.md | Perfil pessoal e público | Perfil.test.jsx, Comunidade.test.jsx, profile-social-browser.cjs |
| Leituras públicas canceláveis | useCommunityQuery.js | communityApi.js, sessão de GamesProvider | Comunidade, perfil, conexões | Testes de perfil e navegador |
| Comentários e curtidas recebidas | Comunidade.jsx | social.js, comentários públicos já existentes | Todos / com curtidas, páginas de 12 | social.test.js, Comunidade.test.jsx, navegador |

### Respostas a comentários

Comments.jsx compartilha respostas recuadas entre detalhes e biblioteca. O botão
Responder / ver respostas abre a conversa com páginas de 20 respostas e formulário
inline. Cada conta pode publicar duas respostas por comentário, com até 35 pontos
de código Unicode por resposta (o mesmo contador no cliente, API e SQLite).
As respostas têm um único nível, exigem sessão e preservam o texto em falhas.
community.js é dono da API e do limite atômico no banco; excluir o comentário
remove suas respostas. Tokens e botões existentes são reutilizados.



### Recorte de imagens do perfil

`PhotoCropDialog.jsx` é o editor compartilhado de avatar (1:1, saída 128 × 128)
e fundo (3:1, saída 900 × 300). `ProfilePhotoEditor.jsx` valida o arquivo e só
faz o upload após “Salvar recorte”. Cancelar/Escape descarta o rascunho local;
falhas de envio preservam o enquadramento para tentar novamente. URLs locais
são liberadas ao concluir, cancelar ou desmontar. Não há dependência nova.
O dialog/showModal segue a variante modal nativa de LoginDialog, com fundo
inerte, bloqueio de rolagem e restauração de foco. Durante o envio, os ajustes
ficam desabilitados. A grade de terços ciano é a assinatura visual do editor;
zoom de 100–300%, arraste e controles nativos horizontal/vertical oferecem
alternativas por toque e teclado. Os estilos locais em photo-crop.css consomem
os tokens de base.css, sem novas cores de marca ou animações. O cartão público
preserva a proporção 3:1 do recorte, sem cortes adicionais nas laterais.
Verificação: tests/e2e/profile-background-browser.cjs cobre ambos os recortes,
cancelamento sem upload, arraste, teclado, reset, 320px e recuperação offline.


### Skeleton loading em todo o site

Por solicitação explícita, `components/ui/Skeleton.jsx` e `skeleton.css` são os
donos canônicos do carregamento de conteúdo. Variantes: cards para catálogo e
busca, library para bibliotecas, players para comunidade/conexões, profile e
details para fichas, rows para comentários, form para conta, stats para métricas
e table/dashboard para administração. Perfil e biblioteca aguardam a sessão
antes de mostrar estados vazios ou de visitante. Páginas estáticas e conteúdo
já disponível não recebem atrasos artificiais. Erros substituem os skeletons
pelas mensagens e recuperação existentes; ações de salvar mantêm seus controles.
Os blocos usam misturas de --text-lo e --bg-1, bordas --line e --radius de base.css.
Há uma mensagem de status por região e formas aria-hidden, sem foco. A pulsação
só é habilitada sem preferência por movimento reduzido. Não há timers artificiais,
dependências ou mudanças de API. Verificação: testes de componente e
`tests/e2e/skeleton-browser.cjs` com respostas retidas, falhas e viewport de 320px.
