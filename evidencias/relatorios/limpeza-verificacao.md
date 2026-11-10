# Limpeza conservadora — 6 de novembro de 2026

Revisão com Ponytail do estado atual do projeto, preservando a reorganização
frontend/backend e as demais alterações que já existiam no diretório.

## Escopo e remoções

- Análise sintática e referências de 87 arquivos JavaScript/JSX/MJS/CJS,
  incluindo 53 módulos de produção; revisão dos 16 arquivos CSS, dependências,
  entradas, rotas, arquivos públicos, scripts, documentação e configuração de CI/Docker.
- Nenhum módulo de produção órfão. Dependências mantidas por servirem à aplicação,
  ao build, aos testes, ao lint ou à tipagem do editor.
- Removidas regras de 12 classes sem consumidores, incluindo variantes responsivas;
  seletores compartilhados mantiveram as partes utilizadas. Preservadas classes
  construídas dinamicamente dos botões e indicadores sociais.
- Removidas 10 regras duplicadas de botões e estados vazios de `layout.css`;
  as definições equivalentes permanecem em `components.css`, na mesma ordem da cascata.
- CSS: 128 linhas removidas. Bundle CSS reduzido de 94.895 para 92.617 bytes.
- Removido somente o modificador `export` de `mapGame`, `nicknameKey`,
  `steamRetryAt` e `validEmail`, sem consumidores externos. As funções e suas
  chamadas internas foram preservadas; comparação sintática confirmou corpos idênticos.
- Removidas 10 capturas sem referências, totalizando 916.154 bytes:
  `biblioteca-desktop.png`, `catalogo-revisao-320.png`,
  `catalogo-revisao-desktop.png`, `generos-1440.png`, `generos-320.png`,
  `generos-768.png`, `perfil-desktop.png`, `perfil-mobile.png`,
  `precos-erro-1440.png` e `precos-erro-320.png`.

As duas imagens de `frontend/public` continuam necessárias para marca, favicon
e compartilhamento. Capturas referenciadas, geradas pelos scripts de verificação
ou usadas como evidência das atividades Docker/Compose foram preservadas.
Nenhum banco, dado de conta, segredo, contrato de API, validação, fallback,
tratamento de erro ou teste foi removido.

## Validação

- `npm --prefix frontend run lint`: aprovado antes e depois.
- `npm --prefix frontend test`: 65 testes aprovados antes e depois.
- `npm --prefix backend test`: 42 testes aprovados antes e depois.
- `npm --prefix frontend run build`: aprovado antes e depois.
- Análise de variáveis não usadas e código inalcançável no backend/shared: sem achados.
- Nova verificação de referências: nenhum módulo órfão ou exportação sem consumidor externo.
- Auditoria Premium strict: zero erros e avisos, em `limpeza-premium-audit.json`.
- JavaScript de produção idêntico byte a byte antes/depois:
  SHA-256 `c1210e4caafb566b68b123e2f6828ea86ba02b75a81f497c5ce378664d1c5ac5`.
- Edge headless com build de produção e API/SQLite em memória: 63 comparações
  antes/depois em 320, 768 e 1440 px, como visitante e com sessão autenticada.
  Catálogo, busca sem resultados, detalhes, biblioteca, perfil pessoal,
  comunidade, perfil público, privacidade e administração, incluindo filtro
  aberto e foco de teclado. Todos os estilos calculados de 14.595 elementos
  e seus pseudo-elementos permaneceram iguais; nenhum erro JavaScript.
  Movimento reduzido e recursos externos bloqueados tornaram a comparação determinística.

Os testes HTTP foram executados fora do isolamento Windows, que bloqueava
conexões de loopback; os testes usam bancos temporários/em memória. Integrações
externas foram verificadas pelos testes existentes, sem alterar contas reais.
