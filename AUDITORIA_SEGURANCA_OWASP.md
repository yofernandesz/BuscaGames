# Auditoria de segurança — BuscaGames — OWASP Top 10:2025

Data: 10/11/2026 (America/Sao_Paulo). Escopo: arquivos atuais do workspace, incluindo arquivos ainda não versionados. Não é uma certificação OWASP nem uma auditoria jurídica de LGPD.

## A. Resumo executivo

Foram revisados os limites de confiança da aplicação, autenticação, autorização, consultas SQLite, integrações, uploads, frontend, dependências e configurações de entrega. A aplicação possui boas defesas existentes: consultas parametrizadas, sessões aleatórias armazenadas como hash, scrypt, limitação de tentativas de login, separação de sessão administrativa, proteção contra CSRF e OAuth com state/PKCE.

Foram eliminados os cinco alertas de severidade alta encontrados pelo npm em pacotes da cadeia de desenvolvimento/testes. Não foi demonstrada exploração desses pacotes na aplicação publicada. A auditoria final informa **0 críticas, 0 altas e 4 moderadas**, estas associadas ao mesmo problema de minimatch na cadeia do ESLint. A consulta com `--omit=dev` informa **zero alertas**; isso não cobre Node, Nginx, Alpine nem todos os riscos do código.

Foi também reproduzida e corrigida uma condição de corrida: operações iniciadas com sessão válida podiam modificar dados depois do logout ou expiração, durante a leitura do corpo da requisição. A validação da sessão agora é repetida após essa leitura.

Validação final: **59 testes de backend e 68 testes de frontend aprovados**, lint e build aprovados. Não foi confirmada vulnerabilidade crítica. A configuração padrão de entrega usa HTTP e permite cookies sem Secure; ela não deve ser tratada como uma configuração pronta para exposição pública com contas reais. TLS real, cabeçalhos na borda, imagens de containers e OAuth real permanecem sem validação dinâmica.

## B. Escopo e metodologia

### Arquitetura e versões

| Camada | Implementação observada |
| --- | --- |
| Frontend | React/React DOM 19.2.8, React Router DOM 7.18.3; SPA em `frontend/src` |
| Ferramentas após atualização | Vite 8.3.7, Vitest 5.1.0, ESLint 10.14.0, jsdom 30.0.1; versões resolvidas no lockfile |
| Backend | Node 24 ou superior, módulos ESM, `node:http`, `node:crypto`, `node:sqlite`; sem dependências npm próprias |
| Ambiente de verificação | Node 24.19.0; npm 11.17.0; Windows/PowerShell |
| Persistência | SQLite, WAL, chaves estrangeiras, índices, triggers e transações; volume `catalog-data` no Compose |
| Entrega | Build multi-stage; Nginx sem root em 8080; API sem root em 3001, não publicada pelo Compose |
| Autenticação | Senhas com scrypt; sessões opacas em cookies; login e vínculo Google OAuth |
| Autorização | Identidade derivada de sessão; propriedade dos comentários; tabela de administradores e sessão administrativa independente |
| Integrações | Twitch OAuth/IGDB, Steam, MyMemory; Google OAuth/UserInfo; imagens IGDB e Google; fontes externas e YouTube opcional no navegador |
| CI | GitHub Actions executa Docker Compose, lint, testes e smoke HTTP |

Senhas: salt aleatório de 16 bytes, scrypt N=16384/r=8/p=5, comparação constante e migração de hashes legados no login. Sessões: token de 32 bytes aleatórios, SHA-256 no banco; usuário por 30 dias, administrador por 8 horas. Cookies HttpOnly/SameSite=Lax; Secure depende da configuração. Não são JWTs. Os tokens Google são usados no intercâmbio e não persistidos como sessão da aplicação.

### Mapa de interfaces

| Acesso | Métodos e rotas |
| --- | --- |
| Público, catálogo | GET/HEAD `/api/health`, `/api/home`, `/api/games`, `/api/games/igdb-:id` |
| Público, autenticação | POST `/api/auth/register`, `/api/auth/login`, `/api/auth/google/start`, `/api/admin/login`; GET `/api/auth/google/callback` com state e cookie do fluxo |
| Consulta de sessão | GET `/api/auth/me`: conta da própria sessão ou null |
| Público, comunidade | GET `/api/users`, `/api/users/:id`, `/api/users/:id/{followers,following,library,comments,likes}`; GET comentários e respostas |
| Público, imagens | GET `/api/avatars/:id/:hash.png`, `/api/backgrounds/:id/:hash.png` |
| Conta autenticada | POST logout; PUT nickname/avatar/background; PUT favoritos/notas; POST comentários/respostas; PATCH/DELETE comentário próprio; PUT seguir/curtir |
| Administrativo | GET `/api/admin/{dashboard,usuarios,verificacoes,administradores,registros,atividades,rotina,vinculos,chat,relatorios}`; POST logout/chat/usuarios/administradores/verificacoes |
| Operação local | `backend/src/admin-access.js` concede/revoga papel; `server.js --sync` sincroniza catálogo. Não há endpoint HTTP público equivalente |

O frontend exibe `/admin`, mas a autorização efetiva ocorre na API. Não foram encontradas interfaces GraphQL, WebSocket, NoSQL ou execução de comandos a partir de entradas HTTP.

### Dados e limites de confiança

- Navegador → API: JSON com limites de bytes; IDs, paginação, tipos e conteúdo verificados no servidor. Campos arbitrários de papel/identidade não concedem acesso.
- API → SQLite: e-mail, nome, hashes de senha, sessões, vínculos Google, fotos, fundos, relações sociais e eventos administrativos. Perfis públicos usam projeção explícita que exclui e-mail e hashes.
- Provedores → workers: catálogo, preços e textos são persistidos; consultas públicas não fazem fetch de URL arbitrária enviada pelo usuário. URLs Steam derivam de IDs extraídos de domínio conhecido.
- API → Google: endpoints HTTPS fixos; redirect URIs configuradas, state de uso único, cookie de navegador e PKCE. O vínculo exige a sessão iniciadora, inclusive após a chamada externa. Não há associação automática por coincidência de e-mail.
- Frontend: textos renderizados por React; busca por `dangerouslySetInnerHTML`, `innerHTML`, `eval` e `new Function` não encontrou sinks no código da aplicação. Links de catálogo relevantes são construídos por código; CSV administrativo contém métricas fixas e números.
- Segredos: `.env` existe e contém configurações preenchidas; só nomes e presença foram inspecionados. Não está versionado e é ignorado pelo Git. Docker usa allowlist e exclui `.env*`, chaves e dependências. Busca por padrões de chaves privadas e tokens comuns fora dos diretórios excluídos não encontrou correspondências; não equivale a varredura completa de segredos ou do histórico Git.

### Técnicas e limites

Leitura manual dos módulos de segurança e persistência, busca estática com `rg`, análise de configuração, npm audit online, testes existentes, reprodução determinística com SQLite em memória e testes HTTP em loopback. O teste de corrida usa um stream controlado no handler, sem atrasar ou atacar serviço externo.

Não foram executados ataques contra Google, IGDB, Steam, MyMemory ou site publicado. Testes OAuth/provedores usam mocks. Docker, Semgrep e Gitleaks não foram encontrados no PATH; não houve scanner SAST dedicado, análise de imagens ou execução do Nginx. A revisão estática não prova ausência de vulnerabilidades. Os scripts adicionais de navegador em `tests/e2e` não foram executados nesta auditoria; testes de componentes usam jsdom. Não houve acesso ao banco real ou alteração de credenciais/infraestrutura. Alterações preexistentes do workspace foram preservadas.

Referências consultadas: [OWASP Top 10:2025](https://top10.owasp.org/2025/), [ASVS 5.0.0](https://asvs.owasp.org/), [Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) e [Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html). ASVS foi usado como referência complementar, sem verificação integral de um nível de certificação.

## C. Vulnerabilidades e lacunas identificadas

As linhas abaixo referem-se ao estado final dos arquivos. Severidade contextual da aplicação é distinguida da classificação do fornecedor. “Confirmada” descreve evidência local; “potencial” depende do ambiente ou de uma condição adicional.

| ID | Categoria | Severidade | Localização | Impacto | Status |
| --- | --- | --- | --- | --- | --- |
| SEG-01 | A03 | Alta no advisory; alcance condicionado ao uso das ferramentas | `frontend/package-lock.json`:1432,3087,3220,3271,3556 | Falhas publicadas em ferramentas/dependências de desenvolvimento | Corrigida para os cinco pacotes classificados como altos |
| SEG-02 | A03 | Média | `frontend/package-lock.json`:2643; cadeia ESLint | Consumo excessivo ao processar padrões glob não confiáveis | Confirmada no inventário; exploração no projeto não demonstrada |
| SEG-03 | A01/A07 | Média | `communityHandler`, `backend/src/community/community.js`:169–181 | Escritas após revogação/expiração durante leitura do corpo | Corrigida |
| SEG-04 | A02/A04 | Alta se usado publicamente sem TLS | `compose.yaml`:11,29; `nginx.conf`:2; `community.js`:210 | Captura de credenciais e sessões em transporte HTTP | Potencial na implantação pública; configuração local confirmada |
| SEG-05 | A02 | Média | `nginx.conf`:1–33; `frontend/index.html` | Enquadramento da aplicação e ausência de CSP no documento | Confirmada na configuração; borda real não verificada |
| SEG-06 | A08/A10 | Baixa | PUT avatar, `community.js`:329–337 | Persistência/publicação de bytes que não formam PNG válido | Confirmada por reprodução; pendente |
| SEG-07 | A09 | Média | `community.js`:423–425; `googleAuth.js`:139; `admin.js`:18–55 | Baixa visibilidade de falhas de autenticação e abuso | Confirmada no código; alertas externos não verificados |
| SEG-08 | A06/A10 | Média | `community.js`:162–168; `social.js`:90–107; `server.js`:13–80 | Automação de escritas/leitura onerosa sem cota geral | Lacuna confirmada; impacto em disponibilidade não medido |
| SEG-09 | A03/A08 | Baixa | `.github/workflows/ci.yml`:18; `Dockerfile`:4,20; `backend/Dockerfile`:1 | Builds dependem de referências mutáveis | Confirmada como lacuna de hardening |
| SEG-10 | A09 | Baixa | Callback `googleAuth.js`:74–76; `nginx.conf`:8–16 | Possível registro de code/state e buscas em access log | Potencial; configuração herdada do Nginx não executada |

### SEG-01 — dependências vulneráveis corrigidas

**Evidência:** `evidencias/seguranca/npm-audit-antes.json` contém 11 pacotes afetados, cinco de severidade alta: brace-expansion, source-map-js, undici, vite e zod. Há também alertas moderados em Vitest/mocker. São contagens de pacotes, não de vulnerabilidades independentes nem de explorações confirmadas.

**Cenário controlado:** consultar a árvore travada com `npm audit --json`, sem executar payload de DoS ou comandos. Vite escutava em `0.0.0.0` e permitia domínios `.trycloudflare.com`, tornando relevante corrigir falhas do servidor de desenvolvimento. Não foi testado um túnel externo.

**Impacto:** conforme cada advisory, interpretação de comandos no servidor de desenvolvimento Windows, consumo excessivo em parsing e falhas no cliente HTTP. Não atribuir automaticamente esses efeitos à API de produção, que usa bibliotecas nativas do Node, ou ao bundle React.

**Correção:** `npm audit fix --ignore-scripts`, sem `--force`, respeitando as faixas dos manifestos. Versões finais: brace-expansion 5.0.12, source-map-js 1.2.2, undici 8.12.4, Vite 8.3.7, zod 4.6.7 e Vitest 5.1.0. Novos pacotes transitivos decorreram das atualizações; nenhuma dependência direta foi adicionada.

**CVSS:** o relatório bruto fornece 7.5 para diversos advisories de DoS e 7.4 para um advisory de TLS do undici. Esses escores são dos advisories, não um escore calculado para o BuscaGames. URLs, faixas afetadas, CWE e vetores estão preservados no JSON anterior.

### SEG-02 — minimatch na cadeia do ESLint

**Evidência:** minimatch 10.2.6; [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249), registrado pelo npm. Os quatro alertas finais são minimatch, ESLint, @eslint/js e @eslint/config-array, por propagação na árvore.

**Impacto/cenário:** processamento de padrões glob hostis pode consumir recursos durante lint; não foi identificado caminho HTTP da aplicação para esse parser. Nenhum teste de exaustão foi executado.

**Recomendação/status:** pendente. O npm sugere mudança de major/downgrade do ESLint para parte da árvore. Não foi aplicada mudança incompatível nem override forçando major de minimatch. Atualizar quando a cadeia oferecer versão compatível corrigida, ou avaliar migração com os responsáveis pelo projeto. Não é bloqueio de aprovação; é preservação deliberada da compatibilidade para risco residual moderado.

### SEG-03 — revogação durante leitura do corpo

**Evidência anterior:** `userId` era resolvido antes de `await readBody(req)` e reutilizado para gravar nickname, favoritos, respostas e relações sociais. Logout removia a sessão, mas o handler já tinha capturado a identidade.

**Reprodução:** `backend/test/session-revocation.test.js` cria usuário/sessão em memória, revoga ou expira a sessão quando começa a leitura do stream e envia uma operação pequena. Antes da correção, os oito casos de logout/expiração retornaram sucesso em vez de 401. No bloqueio, a rota de respostas também aceitava a escrita porque verificava a conta antes do await. Outros casos de bloqueio já recusavam com 403; as falhas desses testes anteriores eram diferença de status, não bypass.

**Impacto:** quem já possui uma sessão pode manter uma requisição em curso e concluir uma alteração após sua revogação. Não demonstra acesso a outra conta nem elevação a administrador.

**Correção/status:** corrigida no ponto compartilhado de leitura do corpo: a sessão exata deve continuar presente, pertencer ao usuário e não estar expirada após o await. As rotas administrativas mantêm sua revalidação independente. Doze casos finais retornam 401 sem escrita. Nenhuma mudança de esquema ou API pública.

### SEG-04 — transporte e cookies de implantação

**Evidência:** `ports: "8080:8080"`, Nginx `listen 8080`, `SESSION_COOKIE_SECURE: ${SESSION_COOKIE_SECURE:-false}`. O backend permite desabilitar Secure explicitamente, mesmo em produção.

**Impacto/cenário:** se esse Compose atender clientes por HTTP em rede não confiável, um observador da rede pode obter senha/cookie. O padrão está confirmado por leitura; a exposição real e uma interceptação não foram testadas.

**Recomendação:** antes de publicar, terminar TLS em borda confiável, redirecionar HTTP, configurar Secure=true e HSTS após confirmar HTTPS em todas as rotas. Manter a API privada e o proxy sobrescrevendo o IP usado pelo limitador. Não foi ativado HSTS nem alterada a infraestrutura porque isso exigiria conhecer domínio/certificado e poderia quebrar o fluxo local HTTP.

### SEG-05 — cabeçalhos do documento

**Evidência:** Nginx configura Cache-Control, mas não CSP, frame-ancestors/X-Frame-Options ou Referrer-Policy para HTML. `nosniff` e CSP restritiva das imagens existem na API, mas não protegem o documento principal.

**Cenário:** uma página externa pode tentar enquadrar a interface em iframe e induzir cliques; a possibilidade efetiva depende das políticas da borda e das regras de cookies do navegador. Não foi executado teste em navegador/Nginx.

**Recomendação:** frame-ancestors 'none', política de referência, nosniff e CSP ajustada às fontes, imagens, estilos inline e player YouTube existentes, inicialmente com observação de violações. Verificar herança de `add_header` nas locations que já definem Cache-Control. Evitar política genérica que quebre recursos. Status: pendente.

### SEG-06 — validação incompleta de avatar

**Evidência:** apenas assinatura, tamanho mínimo, dimensões 128×128 e bytes finais são verificados. Um buffer de 45 bytes com esses campos, mas sem IDAT e sem CRC válido do IHDR, recebeu HTTP lógico 200 e foi persistido. Resultado: `evidencias/seguranca/avatar-invalido.json`. Teste somente no handler com banco em memória.

**Impacto:** conteúdo malformado é hospedado como imagem pública; pode causar imagem quebrada e armazenar bytes não validados. Não foi demonstrado XSS, execução de código ou vulnerabilidade do decodificador. Content-Type image/png, nosniff e CSP sandbox reduzem o impacto.

**Recomendação:** validação estrutural, CRC e descompressão limitada, ou decodificação/reencodificação confiável. Reutilizar a abordagem de `profileBackground.js`, preservando os formatos PNG legítimos já aceitos para avatar (inclusive grayscale). Não aplicar diretamente a restrição RGB/RGBA do fundo a avatares sem testes de compatibilidade. Status: confirmada, pendente, baixa severidade.

### SEG-07 — registros e alertas incompletos

**Evidência:** `account_events` registra cadastros, vínculos, logins administrativos e ações críticas; `auditedChange` grava evento e mudança atomicamente. Entretanto, erros esperados 401/403/429 não são registrados pelo catch da comunidade, e o catch OAuth descarta a falha. `auth_attempts` é contador temporário, não trilha histórica de incidentes. Não foi encontrada integração de alerta.

**Impacto/cenário:** tentativas repetidas de login ou acesso negado podem não produzir informação suficiente para investigação. Comparar os eventos gerados pelos testes de login incorreto com a tabela de eventos e os pontos de logging; não foi provocado ataque em produção.

**Recomendação:** eventos estruturados de autenticação, autorização e throttling com tipo, resultado, horário e identificador de correlação; proteção/retensão dos logs e alertas de limiar. Não registrar senha, cookies, tokens, código OAuth ou corpo integral. A ausência de alerta externo não pode ser confirmada apenas pelo repositório.

### SEG-08 — prevenção de abuso parcial

**Evidência:** limitador persistido atua nos POST de login/cadastro/início Google; scrypt tem teto de quatro operações simultâneas; respostas têm teto por autor/comentário. As escritas sociais e leituras públicas não passam por limitador geral. Consultas SQLite síncronas e gravações repetidas compartilham o processo da API.

**Impacto/cenário:** uma conta pode repetir atualizações e uploads, ou um cliente enumerar páginas públicas, além do ritmo de uso normal. Efeito em disponibilidade depende de volume/dados/infraestrutura; não foi executado teste de carga ou DoS.

**Recomendação:** cotas por conta/rota e limitação de tráfego na borda, com 429/Retry-After e limites definidos por uso observado; controlar custo de busca e crescimento de armazenamento. Não bloquear funcionalidades existentes com limites arbitrários durante a auditoria.

### SEG-09 — referências mutáveis no build

**Evidência:** checkout@v4, node:24-alpine e nginx-unprivileged:stable-alpine sem SHA/digest; workflow sem bloco explícito de permissions. O efeito das permissões depende dos defaults do repositório/organização, que não foram consultados.

**Impacto/cenário:** uma alteração futura da tag muda o código executado no build. Não há evidência de pacote/imagem comprometido. npm ci e integridade no lockfile são controles positivos; não são prova de confiabilidade do conteúdo.

**Recomendação:** pinar actions/imagens por SHA/digest com atualização automatizada, declarar contents: read, auditar dependências/imagens no CI e limitar scripts de instalação conforme compatibilidade. Não mudar pins sem resolver e validar as imagens reais.

### SEG-10 — parâmetros sensíveis em logs da borda

**Evidência:** callback recebe `code`/`state` por query string e `nginx.conf` não define formato de log sanitizado. O formato efetivo depende da configuração herdada da imagem e da borda.

**Impacto/cenário:** o access log pode guardar a URL completa, incluindo parâmetros OAuth e busca do usuário. State, PKCE e uso único limitam o reaproveitamento do código; isso não torna apropriado retê-lo em logs. Não foram lidos logs reais nem expostos códigos.

**Recomendação:** verificar configuração efetiva e registrar caminho sem query nos endpoints sensíveis, sem Referer que reintroduza parâmetros; definir acesso/retensão de logs. Status potencial, pendente de validação.

## D. Correções implementadas

1. `frontend/package-lock.json`: atualização compatível da árvore de ferramentas para remover alertas altos e os de Vitest/mocker. `frontend/package.json` não foi alterado. Não foi usado audit fix --force nem adicionada biblioteca direta.
2. `backend/src/community/community.js`: parser renomeado para `readJsonBody`; wrapper por requisição revalida a sessão após receber JSON, compartilhado pelas rotas de conta, comunidade e início de OAuth.
3. `backend/test/session-revocation.test.js`: 12 regressões determinísticas para logout, expiração e bloqueio em quatro fluxos de escrita.
4. Este relatório e `evidencias/seguranca/`: resultados antes/depois, testes e reprodução de avatar. Não houve migração do banco real, remoção de funcionalidades, alteração de credenciais, edição de UI ou deploy.

O npm emitiu aviso EPERM ao limpar uma antiga DLL de rolldown carregada no Windows. As versões novas foram resolvidas e build/testes passaram. Não foram encerrados processos do usuário nem forçada a exclusão do arquivo antigo. Um servidor Vite que já estivesse aberto precisa ser reiniciado para carregar as novas dependências.

## E. Resultados dos testes

| Verificação | Resultado | Evidência |
| --- | --- | --- |
| Regressão de revogação antes | 12 asserts falharam; 8 bypasses de logout/expiração e 1 de bloqueio; 3 recusas já existentes com status diferente | `revogacao-antes.txt` |
| Regressão de revogação depois | 12/12 aprovados, sem escrita após revogação | `revogacao-depois.txt` |
| `node --test backend/test/*.test.js` | 59/59 aprovados | `backend-tests.txt` |
| `npm test -- --reporter=dot` em frontend | 68/68 aprovados em 14 arquivos | `frontend-tests.txt` |
| `npm run lint` | Aprovado, exit 0 | `lint.txt` |
| `npm run build` | Aprovado, exit 0 | `build.txt` |
| `npm audit --json` antes | 5 altas, 6 moderadas, 0 críticas; exit 1 por alertas | `npm-audit-antes.json` |
| `npm audit fix --ignore-scripts --json` | Atualizou a árvore; exit 1 por alertas residuais | `npm-audit-fix.json` |
| `npm audit --json` depois | 0 altas, 4 moderadas, 0 críticas | `npm-audit-depois.json` |
| `npm audit --omit=dev --json` | Zero alertas no inventário de produção npm | `npm-audit-producao.json` |
| Upload de avatar malformado | Aceito/persistido: problema confirmado | `avatar-invalido.json` |
| `git diff --check` | Sem erro de whitespace nos diffs rastreados; avisos de CRLF | saída do comando; arquivos novos também revisados |
| Nginx/Compose/TLS/imagens | Não executados; Docker indisponível no PATH | Limitação do ambiente |
| E2E em navegador, OAuth real, scanner dedicado | Não executados | Fora da validação dinâmica realizada |

Todos os nomes de evidência da tabela estão sob `evidencias/seguranca/`. A primeira tentativa de npm audit falhou por DNS do sandbox; a consulta online foi refeita com sucesso. A primeira execução dos testes HTTP foi impedida por EACCES no loopback do sandbox; a execução final autorizada passou. Não confundir essas limitações com falhas de código. jsdom emitiu avisos sobre scrollTo não implementado, sem reprovação de testes.

As suítes existentes cobrem IDOR de comentários/favoritos, privilégios administrativos, bloqueio/revogação, concorrência de cadastros, proteção CSRF, tamanho de corpo, hashes, cookies Secure quando configurados, expiração, throttling, OAuth state/PKCE/replay/vínculo, paginação, projeção pública, uploads de fundo e rollback/backoff das integrações. XSS foi avaliado por sinks/escaping e testes de componentes; não houve prova dinâmica abrangente em navegador real.

## F. Riscos residuais e limites

- SEG-02 e SEG-04 a SEG-10 continuam com os estados indicados. Zero alertas npm em produção não significa aplicação plenamente segura.
- Nenhuma verificação do certificado, HTTPS/HSTS, proxy público, firewall, permissões reais do volume, criptografia de disco/backup ou restauração foi feita.
- Não há MFA próprio nem reautenticação para promoção de administradores; a política aceita 8 a 20 caracteres no cadastro e até 128 no login legado. Recomenda-se revisar política e recuperação de conta. Não existe fluxo de recuperação de senha para auditar; sua ausência é limitação funcional, não prova de bypass.
- E-mail local não é verificado. O vínculo Google é protegido contra associação automática por e-mail, mas registro prévio pode impedir cadastro Google pelo mesmo endereço. Não foi demonstrada tomada de conta por esse caminho.
- Sessões não têm timeout de inatividade nem interface de revogação de todos os dispositivos. Logout normal e administrativo são separados por projeto.
- Sob princípios de minimização/transparência, a projeção pública evita e-mail e hashes e a interface avisa sobre dados públicos. Entretanto, prazos efetivos para contas, imagens, eventos e backups e processo operacional de exclusão/exportação não estão comprovados. Não há endpoint de exclusão integral de conta. Ausência de endpoint não prova descumprimento legal, pois pode existir atendimento manual. A política contém orientação sobre dados legados locais; convém revisar sua coerência com os dados atuais no servidor.
- Avatares Google são URLs HTTPS externas; o carregamento pode expor IP do visitante ao provedor. O servidor não faz fetch arbitrário dessas URLs. O consentimento de player é distinto de carregamento de imagens/fontes, conforme a política.
- Workers usam destinos fixos e timeouts, mas respostas JSON externas não têm limite explícito de bytes em todos os fetches. Não foi demonstrado abuso; considerar limites e egress restrito para defesa adicional.
- Histórico completo do Git, todas as classes de segredo e configurações externas não foram auditados. Nenhuma rotação de segredo foi realizada porque não houve comprovação de vazamento.

## G. Recomendações priorizadas

1. Antes de expor contas reais, validar TLS, Secure, HSTS, rede privada da API e cabeçalhos efetivos, incluindo painel administrativo. Reiniciar processos de desenvolvimento para usar o lockfile atualizado.
2. Planejar resolução compatível do alerta minimatch; integrar audit e scanner de imagens no CI, sem executar automaticamente atualizações incompatíveis.
3. Completar validação do avatar com testes para PNGs legítimos e malformados. Adicionar limites de abuso por rota/conta com métricas de uso.
4. Implantar eventos de segurança e alertas com sanitização de query/cookies/tokens, acesso restrito e retenção definida.
5. Revisar MFA administrativo, duração/revogação de sessões, política de senhas e recuperação de conta; manter o vínculo Google explícito e state/PKCE.
6. Definir e testar backup/restauração, exclusão/exportação de dados, retenção e resposta a incidentes. Validar aplicação no navegador e no ambiente real de entrega antes da publicação.

## H. Checklist OWASP Top 10:2025

“Conforme” se refere somente ao controle e escopo explicitados, nunca a conformidade integral com OWASP/ASVS.

| Categoria oficial | Controles verificados e evidências | Situação |
| --- | --- | --- |
| A01 — Broken Access Control | Propriedade, papéis server-side, projeção pública, sessões administrativas separadas; testes admin/comments/social; corrida SEG-03 corrigida; fetches com destinos conhecidos, sem SSRF confirmado | Parcialmente conforme |
| A02 — Security Misconfiguration | CORS sem liberação cross-origin, containers sem root, API privada no Compose; ausência de headers HTML e padrão HTTP, SEG-04/05 | Não conforme |
| A03 — Software Supply Chain Failures | npm ci/lock/integrity, audit antes/depois; altos corrigidos; minimatch pendente; tags mutáveis e imagens não escaneadas | Parcialmente conforme |
| A04 — Cryptographic Failures | scrypt/salt, tokens aleatórios e hash no banco, HTTPS nos provedores; testes de hashes/cookies; TLS de entrega e criptografia em repouso não validados | Parcialmente conforme |
| A05 — Injection | SQL parametrizado, fragmentos dinâmicos de allowlists, React escaping, ausência de sinks HTML/exec identificados; escopo limitado à revisão estática e testes executados | Conforme |
| A06 — Insecure Design | Limites de login/hash/respostas, propriedade, transações; cotas sociais e políticas operacionais incompletas, SEG-08 | Parcialmente conforme |
| A07 — Authentication Failures | Login, rotação/expiração, throttling persistido, bloqueio, OAuth state/PKCE/vínculo; SEG-03 corrigida; MFA/inatividade e OAuth real não verificados integralmente | Parcialmente conforme |
| A08 — Software or Data Integrity Failures | Transações, audit trail atômico, versões de comentário, validação de preços e imagens de fundo; avatar malformado aceito e pins ausentes | Parcialmente conforme |
| A09 — Security Logging and Alerting Failures | Eventos administrativos existentes; falhas de login/acesso e alertas incompletos; possível query sensível em access log, SEG-07/10 | Não conforme |
| A10 — Mishandling of Exceptional Conditions | Erros públicos genéricos, rollback, timeout/backoff/cooldown, retomada de filas e corrida corrigida; limites gerais e validação de avatar pendentes | Parcialmente conforme |

Conclusão: houve melhoria verificável da cadeia de dependências e da revogação de sessão. A aplicação continua exigindo trabalho de implantação segura e controles operacionais; não há evidência suficiente para declarar segurança ou conformidade plena em produção.
