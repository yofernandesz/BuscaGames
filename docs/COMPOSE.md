# Atividade: Docker Compose no GitHub Codespaces

## Arquivos da entrega

- [compose.yaml](../compose.yaml): executa a imagem `buscagames:1.0` da atividade anterior.
- [compose.ci.yaml](../compose.ci.yaml): adiciona o serviço de testes ao Compose principal.
- [.github/workflows/ci.yml](../.github/workflows/ci.yml): executa o Compose de testes em pushes e pull requests para `main`.

## Escolhas de configuração

O frontend React é servido pelo Nginx. O serviço `api` executa Node.js 24,
SQLite e a sincronização diária da IGDB. O Nginx encaminha `/api` para esse
serviço na rede interna, sem publicar a porta do backend no host.
Preencha as credenciais em `.env` na raiz, conforme [Backend](../backend/README.md).

- **Imagem:** o serviço `app` reutiliza `buscagames:1.0`. `pull_policy: never`
  evita procurar essa imagem local no Docker Hub. `build: .` permite criá-la
  novamente pelo Dockerfile quando necessário.
- **Porta:** `8080:8080` publica o Nginx. No Codespaces, mantenha a porta
  encaminhada com visibilidade privada.
- **Rede:** `app` usa uma rede `bridge` exclusiva do projeto. No CI,
  `network_mode: service:app` faz `tests` compartilhar o namespace de rede
  da aplicação e acessar o Nginx por `http://127.0.0.1:8080`. Isso dispensa
  resolução DNS entre containers e não usa a rede do host.
- **Reinício:** `unless-stopped` reinicia o processo da aplicação se ele
  encerrar, respeitando paradas manuais. No CI, `restart: "no"` evita ciclos
  de reinício. O healthcheck detecta problemas HTTP, mas não provoca sozinho
  um reinício quando o processo continua ativo.
- **Saúde:** o Compose herda o healthcheck do Dockerfile. `up --wait` espera
  o container ficar saudável; `depends_on: condition: service_healthy` faz
  os testes aguardarem a aplicação.
- **Volumes:** `catalog-data` persiste o SQLite do serviço `api` em `/app/data`.
  `docker compose down` preserva os dados; `down --volumes` os apaga.
  O cache npm do BuildKit é independente desse volume de execução.
- **Imagem de testes:** `target: build` reutiliza a primeira etapa do
  Dockerfile, com Node, ferramentas e dependências instaladas por `npm ci`.
  O `.dockerignore` permite os testes e a configuração do ESLint nessa etapa;
  a imagem de produção continua recebendo apenas `dist/`. Durante a execução,
  os testes só precisam acessar a aplicação pela rede do Compose.

## Executar no Codespaces

Reabra o Codespace do BuscaGames e use o terminal Bash na raiz do projeto.
Os arquivos Compose e o frontend atualizado precisam estar nesse ambiente;
arquivos locais não são sincronizados automaticamente com o GitHub.

```bash
docker compose version
docker compose config --quiet
docker image inspect buscagames:1.0 --format 'Imagem anterior: {{.Id}}'
docker compose up -d --wait --wait-timeout 60
docker compose ps
docker compose images
curl -fsS -o /dev/null -w 'Pagina inicial: HTTP %{http_code}\n' http://localhost:8080/
curl -fsS -o /dev/null -w 'Detalhes: HTTP %{http_code}\n' http://localhost:8080/jogo/1
docker compose exec -T app id
docker inspect "$(docker compose ps -q app)" --format 'Reinicio: {{.HostConfig.RestartPolicy.Name}}'
docker network inspect buscagames_app --format 'Rede: {{.Name}} / {{.Driver}}'
```

Se a imagem não existir nesse Codespace, execute `docker compose build` antes
de `up`. Se o container independente da atividade anterior estiver usando a
porta 8080, pare-o com `docker stop buscagames`.

Abra a porta 8080 na aba **Ports** para acessar a interface. Antes de executar
os testes abaixo, libere a porta e remova o serviço da demonstração:

```bash
docker compose down
```

## Testes automáticos com outro Compose

O segundo arquivo complementa o principal. O build executa `npm ci` e compila
o frontend. O serviço `tests` executa lint, os testes React existentes e
verificações HTTP do HTML e do JavaScript, tanto
na raiz quanto na rota `/jogo/1`. Qualquer falha encerra o serviço com erro.

```bash
docker compose -p buscagames-ci -f compose.yaml -f compose.ci.yaml config --quiet
docker compose -p buscagames-ci -f compose.yaml -f compose.ci.yaml up --build --abort-on-container-exit --exit-code-from tests
echo "Codigo de saida: $?"
docker compose -p buscagames-ci -f compose.yaml -f compose.ci.yaml ps -a
docker compose -p buscagames-ci -f compose.yaml -f compose.ci.yaml down --volumes --remove-orphans
```

`--exit-code-from tests` propaga o resultado dos testes ao GitHub Actions.
`--abort-on-container-exit` para a aplicação quando os testes terminam.
O workflow executa a limpeza com `if: always()`, mesmo quando um teste falha.
`--volumes` remove o banco descartável do projeto isolado de CI. Não use essa
opção na instalação de produção se quiser preservar o catálogo.
O `echo` acima é apenas para mostrar o código no terminal; o workflow usa
diretamente o código retornado pelo Compose.

## Encerrar o ambiente e registrar os prints

Capture o terminal com `up`, `ps`, as respostas HTTP, o resultado dos testes
e os comandos `down`. Depois, em [GitHub Codespaces](https://github.com/codespaces),
abra o menu do Codespace e selecione **Stop codespace**. Fechar a aba ou
executar apenas `docker compose down` não equivale a parar a máquina do
Codespaces. Parar a máquina encerra o uso de processamento; o armazenamento
permanece enquanto o Codespace existir.

Referências: [serviços do Compose](https://docs.docker.com/reference/compose-file/services/)
e [comando compose up](https://docs.docker.com/reference/cli/docker/compose/up/).
