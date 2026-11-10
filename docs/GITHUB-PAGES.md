# Publicação e acesso ao BuscaGames

Esta publicação contém apenas o frontend, conforme o escopo escolhido. O GitHub
Pages não executa a API Node.js nem o banco SQLite.

## Links

- Site: https://yofernandesz.github.io/BuscaGames/
- Código: https://github.com/yofernandesz/BuscaGames
- Publicações: https://github.com/yofernandesz/BuscaGames/actions/workflows/pages.yml
- Testes completos: https://github.com/yofernandesz/BuscaGames/actions/workflows/ci.yml
- Configuração: https://github.com/yofernandesz/BuscaGames/settings/pages

## Recursos disponíveis

O link público abre a interface do BuscaGames, com navegação, layout responsivo,
política de privacidade e links de contato do rodapé. As rotas usam `#/` para
permitir abrir e recarregar páginas diretamente no Pages, por exemplo:
https://yofernandesz.github.io/BuscaGames/#/privacidade.

O catálogo atual vem integralmente da API: portanto, jogos, pesquisa, detalhes,
preços e rankings não carregam nesta publicação. Cadastro, login, Google,
favoritos, avaliações, comentários, comunidade e administração também exigem
backend. O site informa essa limitação; não há servidor nem dados de usuários
publicados no Pages. A versão completa continua disponível para execução local
ou via Docker, conforme o README e o guia do backend.

## Como atualizar

1. Edite os arquivos em `frontend/`.
2. Na raiz, execute `npm --prefix frontend run lint`, `npm --prefix frontend test`
   e `npm --prefix frontend run build`.
3. Revise `git diff` e `git status`, adicione somente os arquivos pretendidos,
   faça commit e execute `git push origin main`.
4. Acompanhe **Actions → Publicar frontend no GitHub Pages**. O workflow instala
   as dependências do lockfile, valida, compila e publica `frontend/dist/`.
5. Espere os jobs `build` e `deploy` ficarem verdes e recarregue o link público.

Para publicar novamente sem alterar o código, use **Actions → Publicar frontend
no GitHub Pages → Run workflow → main**. Em **Settings → Pages**, a origem deve
ser **GitHub Actions**.

O workflow define `VITE_GITHUB_PAGES=true` e base `/BuscaGames/`. Builds locais
normais e Docker mantêm o roteamento e as integrações com a API existentes.
Nunca coloque segredos em variáveis `VITE_*`: elas são públicas no JavaScript.
Arquivos `.env`, bancos SQLite e dependências locais ficam fora do Git. O
`.env.example` contém apenas campos vazios e valores públicos de configuração.

## Executar o sistema completo

Com Docker disponível, configure `.env` a partir de `.env.example` e execute:

```sh
docker compose up -d --build --wait
```

Acesse http://localhost:8080. As credenciais IGDB são necessárias para sincronizar
o catálogo; login Google exige também a configuração OAuth descrita em
`backend/README.md`. Para parar sem apagar o banco: `docker compose down`.

## Referências

- https://vite.dev/guide/static-deploy#github-pages
- https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
