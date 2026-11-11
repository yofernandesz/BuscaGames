# BuscaGames

![CI](https://github.com/yofernandesz/BuscaGames/actions/workflows/ci.yml/badge.svg)

Catálogo responsivo de jogos, organizado em frontend e backend.

**Frontend publicado:** [abrir BuscaGames](https://yofernandesz.github.io/BuscaGames/).
Esta versão no GitHub Pages não inclui API, catálogo ou contas.
Consulte o [relatório de acesso e atualização](docs/GITHUB-PAGES.md) para conhecer
os recursos disponíveis, acompanhar publicações e executar a versão completa.

## Estrutura

```text
BuscaGames/
├── frontend/                # Aplicação React; comandos npm executados nesta pasta
│   ├── src/app/             # Composição, rotas e testes da aplicação
│   ├── src/features/        # Jogos, conta/perfil, comunidade e administração
│   ├── src/components/      # Layout e interface compartilhados
│   ├── src/hooks/           # Hooks usados por mais de uma área
│   ├── src/lib/             # Cliente HTTP compartilhado e seus testes
│   ├── src/pages/           # Páginas institucionais, como privacidade
│   ├── src/styles/          # Estilos globais e ordem da cascata
│   ├── src/test/            # Configuração do Vitest
│   └── public/              # Marca e ícones públicos
├── backend/                 # API Node.js e SQLite; sem dependências externas
│   ├── src/catalog/         # Catálogo, IGDB, sincronização, tradução e preços
│   ├── src/community/       # Contas, OAuth, perfis, comentários e relações sociais
│   ├── src/server.js        # Entrada da API e dos workers
│   ├── src/admin.js         # Consultas e operações administrativas
│   ├── src/admin-access.js  # CLI de concessão/revogação de acesso
│   └── test/               # Testes da API, segurança e persistência
├── shared/                  # Regras usadas pelo frontend e pelo backend
├── tests/e2e/               # Scripts de verificação no navegador
├── evidencias/              # Capturas, auditorias, resultados e relatórios
├── docs/                    # Guias das atividades Docker e Compose
├── .github/workflows/ci.yml # Lint, testes e validação HTTP em containers
├── Dockerfile               # Build e hospedagem do frontend
├── compose.yaml             # Aplicação, API e volume SQLite
├── compose.ci.yaml          # Complemento para os testes no CI
├── nginx.conf               # SPA e proxy da API
├── DESIGN.md                # Contratos visuais e de interação
└── README.md
```

Detalhes e convenções: [frontend](frontend/README.md), [backend](backend/README.md),
[testes de navegador](tests/e2e/README.md) e [evidências](evidencias/README.md).
Arquivos de implantação, configuração e entradas executáveis permanecem nos
caminhos usados pelos comandos existentes.

O catálogo é sincronizado diariamente no backend com a IGDB e persistido em SQLite. A página inicial reúne interesse da semana, em alta, retrô, clássicos, lançamentos e próximos lançamentos, com critérios explícitos e paginação. A navegação é livre. Avaliar, comentar e favoritar exige login em um modal, sem sair da página. Contas por e-mail ou Google guardam favoritos, notas e comentários no SQLite. Dados antigos de visitante continuam disponíveis para leitura no navegador, sem migração automática para uma conta.

Para ativar os dados reais, configure as credenciais Twitch/IGDB conforme o [guia do backend](backend/README.md). O servidor deve permanecer ativo para executar a rotina diária, independentemente de visitas ao site.

## Executar o frontend

Use Node.js 24 e npm. Na raiz do repositório:

```sh
cd frontend
npm ci
npm run dev
```

Abra o endereço exibido pelo Vite. Se já havia um servidor de desenvolvimento aberto antes da reorganização, reinicie-o a partir de `frontend/`.

Em outro terminal, entre em `backend/`, copie `.env.example` para `.env`, preencha as credenciais e execute `npm run dev` durante o desenvolvimento. Esse comando reinicia a API quando o código muda; `npm start` é destinado à execução sem recarga automática. Use Node.js 24; o backend não precisa instalar dependências. O Vite encaminha `/api` para `http://127.0.0.1:3001`.

## Validar e gerar o build

Execute dentro de `frontend/`:

```sh
npm run lint
npm test
npm run build
npm run preview
```

Também é possível executar os scripts a partir da raiz usando `npm --prefix frontend run dev`, `npm --prefix frontend test` e `npm --prefix frontend run build`.

O build é gerado em `frontend/dist/`. A hospedagem deve servir `index.html` nas rotas da aplicação e encaminhar `/api` ao backend. A integração contínua executa build, lint, testes frontend/backend e verificação HTTP em containers com Docker Compose. Para testar o backend localmente: `npm --prefix backend test`.

Veja os detalhes em [Frontend](frontend/README.md) e [Backend](backend/README.md).

## Docker

Para a preparação da publicação na Vercel e a avaliação do backend gratuito,
consulte o [guia de implantação](docs/DEPLOY.md).

O [Dockerfile](Dockerfile) compila o frontend com Node.js e serve o resultado
com Nginx em uma imagem Alpine, sem executar como root.

```sh
# Copie .env.example para .env e preencha IGDB_CLIENT_ID e IGDB_CLIENT_SECRET.
docker compose up -d --build --wait
```

Acesse `http://localhost:8080`. Consulte [a entrega Docker](docs/DOCKER.md) para
executar no GitHub Codespaces, verificar o container, capturar a evidência
e entender as escolhas de otimização.

## Docker Compose

O Compose executa Nginx e a API Node, com volume persistente `catalog-data` para o SQLite. A rotina diária ocorre às 06:00 UTC (03:00 São Paulo), configurável por `SYNC_HOUR_UTC`.
O serviço fica disponível na porta 8080. Para encerrar, use `docker compose down`.

O [guia da atividade Compose](docs/COMPOSE.md) explica a rede, a política de reinício,
o volume persistente e a execução no Codespaces. O arquivo
[compose.ci.yaml](compose.ci.yaml) complementa [compose.yaml](compose.yaml)
para executar lint, testes do React e verificações HTTP no CI.

## Acesso administrativo

Cadastre uma conta com Google ou com e-mail e senha, confirme que ela pertence à pessoa autorizada e conceda o acesso no servidor:

```sh
docker compose exec api node src/admin-access.js grant EMAIL_DA_CONTA
```

Contas Google autorizadas entram pelo botão “Entrar com Google” no login administrativo. Abra `/admin` ou use “Acesso administrativo” no rodapé. A sessão administrativa expira em oito horas. Para revogar o acesso e invalidar as sessões administrativas dessa conta, use `revoke` no lugar de `grant`. Em execução local, rode `node backend/src/admin-access.js grant EMAIL_DA_CONTA` com o mesmo DATABASE_PATH da API. Verificações registram revisão manual do cadastro. O histórico começa na instalação desta versão.
