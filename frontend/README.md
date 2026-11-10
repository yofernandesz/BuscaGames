# BuscaGames — Frontend

![CI](https://github.com/yofernandesz/BuscaGames/actions/workflows/ci.yml/badge.svg)

Catálogo responsivo de jogos feito com React, React Router e Vite. Reúne busca e detalhes dos jogos, biblioteca pessoal, avaliações, comentários, contas, perfis públicos e administração. Os títulos são importados pela API, via IGDB.

## Executar localmente

Use Node.js 24 e npm, como no ambiente de integração contínua. Execute os comandos abaixo dentro da pasta `frontend/`.

```sh
npm ci
npm run dev
```

Abra o endereço exibido pelo Vite no terminal.

## Comandos

| Comando | Finalidade |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento com atualização automática |
| `npm run lint` | Verificação de JavaScript, JSX e regras de hooks |
| `npm test` | Testes automatizados com Vitest e Testing Library |
| `npm run build` | Build de produção na pasta `dist/` |
| `npm run preview` | Prévia local do build de produção |

## Estrutura

```text
public/                      # Arquivos servidos diretamente, como a logo
src/
  main.jsx                   # Inicialização do React, router e estilos
  app/
    App.jsx                  # Rotas e composição da aplicação
    App.test.jsx             # Testes dos fluxos completos
  components/
    layout/                  # Header, Footer e Logo
    ui/                      # Elementos compartilhados e seus estilos próprios
  features/
    account/                 # Login, cadastro e perfil pessoal
      components/            # Account, LoginDialog e ProfilePhotoEditor
      pages/                 # Perfil e seus testes
      styles/                # Autenticação e perfil
    admin/                   # Painel administrativo
      components/            # Gráficos do dashboard
      pages/                 # Página Admin
      styles/                # Estilos administrativos
    community/               # Diretório de jogadores e perfis públicos
      pages/                 # Comunidade, PerfilPublico e testes
      styles/                # Estilos da comunidade
    games/
      components/            # Cards, preços, favoritos, avaliações e comentários
      context/               # GamesProvider: catálogo, sessão e dados pessoais
      hooks/                 # useGames e consultas ao catálogo
      model/                 # Busca, normalização e conversão dos dados
      pages/                 # Catálogo, detalhes e biblioteca
      styles/                # Jogos, biblioteca e estilos compartilhados de comentários/conta
  hooks/                     # useCommunityQuery, compartilhado entre perfil e comunidade
  lib/                       # communityApi e testes do transporte HTTP
  pages/                     # Privacidade: página institucional
  styles/
    index.css                # Entrada dos estilos e ordem de carregamento
    base.css                 # Fontes, variáveis, resets e fundo
    layout.css               # Cabeçalho, conteúdo e rodapé
    components.css           # Botões e estados vazios
    responsive.css           # Regras de tela, toque e movimento reduzido
  test/
    setup.js                 # Configuração compartilhada dos testes
```

A integração contínua fica em `../.github/workflows/ci.yml` e executa lint, testes frontend/backend, build e verificações HTTP pelo Compose a cada push/PR para `main`.

## Convenções

- Código específico de jogos fica em `features/games`. Novas funcionalidades podem ter sua própria pasta em `features/`.
- Componentes usados por diferentes funcionalidades ficam em `components/`.
- O transporte HTTP comum fica em `lib/`; hooks compartilhados ficam em `hooks/`.
- Cada área reúne suas páginas, componentes, testes e estilos. `pages/` na raiz contém páginas institucionais.
- Regras de dados ficam em `model/`, sem JSX; elementos visuais ficam em `components/` ou `pages/`.
- O contexto, o provider e o hook ficam separados para manter responsabilidades claras e permitir Fast Refresh.
- Testes ficam próximos do código testado; `test/` guarda apenas a configuração comum.
- Importe arquivos diretamente, evitando arquivos intermediários que apenas reexportam outros módulos.
- Adicione estilos à camada correspondente e preserve a ordem dos imports em `styles/index.css`.

## Rotas e dados

- `/`: catálogo e busca de jogos.
- `/jogo/:id`: detalhes e avaliação pessoal de um jogo.
- `/biblioteca`: favoritos, avaliações e comentários da coleção pessoal.
- `/perfil`: conta e personalização do perfil.
- `/perfil/:id`: perfil público, biblioteca e conexões de um jogador.
- `/comunidade`: diretório e busca de jogadores.
- `/privacidade`: política e preferências de cookies.
- `/admin/:section?`: painel administrativo com autenticação própria.
- Outras rotas redirecionam para o catálogo; IDs inexistentes exibem um estado de jogo não encontrado.

O catálogo vem de `/api/home`, `/api/games` e `/api/games/:id`, alimentados pela sincronização diária no backend. Novos favoritos, avaliações e comentários exigem login e ficam na conta. Um modal compartilhado abre ao tentar essas ações sem sessão; o catálogo é público. Dados locais antigos continuam somente para leitura. Notas da IGDB são separadas das avaliações pessoais. O catálogo é gerenciado exclusivamente pela sincronização com a IGDB. Consulte [configuração do backend](../backend/README.md).

`GamesProvider` continua sendo o dono do estado existente de catálogo, sessão,
notas e favoritos; sua lógica não foi dividida na reorganização. Os imports
diretos de CSS mantêm a ordem de carregamento. Os [scripts de navegador](../tests/e2e/README.md)
ficam separados dos testes de componente.

## Publicação

Execute `npm run build` dentro de `frontend/`. A hospedagem deve servir `frontend/dist/`, encaminhar `/api` ao backend e servir `index.html` nas rotas da aplicação. O Docker Compose da raiz já inclui essa configuração. Em desenvolvimento, o proxy do Vite usa a API na porta 3001.
