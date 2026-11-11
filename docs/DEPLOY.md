# Publicação: Vercel e AWS

## Estado

Preparação local; ainda não publicado. O backend atual usa SQLite local e
workers dentro do processo Node. A hospedagem deve preservar o arquivo do banco
e permitir que o processo execute os trabalhos agendados.

O Render gratuito não serve para a instalação atual com dados duráveis:
o filesystem é efêmero, não há disco persistente e o processo suspende por
inatividade. Não publicar contas reais nessa configuração.

## 1. Frontend na Vercel

1. Entre na Vercel e importe `yofernandesz/BuscaGames`.
2. Use a raiz do repositório (`.`) como Root Directory. O frontend importa
   regras de `shared/`, por isso essa pasta também precisa estar no build.
3. Selecione Node.js 24.x nas configurações do projeto.
4. O `vercel.json` define instalação, build, saída e fallback das rotas React.
5. Não configure `VITE_GITHUB_PAGES=true`; essa opção desliga a API.
6. Não envie `.env`, SQLite ou credenciais IGDB/Google para o frontend.

As configurações locais precisam estar no commit importado pela Vercel.
O frontend pode ser publicado primeiro, mas catálogo e contas só funcionarão
após a integração com o backend. Até lá, `/api` retorna 404, sem receber o HTML
da SPA. Não tratar essa etapa como implantação completa.

## 2. Backend em uma VM AWS

Escolha confirmada pelo usuário: avaliar AWS, mantendo SQLite e Docker.
A AWS Free Plan para contas novas elegíveis dura até seis meses ou até esgotar
os créditos, o que ocorrer primeiro. Não é hospedagem gratuita permanente.
Antes de criar recursos, verificar o plano, validade e saldo da conta, incluindo
consumo de EC2, volume EBS e rede. Não migrar para plano pago nem criar recursos
sem cobertura dentro da exigência de custo zero.

O arquivo `compose.vm.yaml` executa somente a API, com volume persistente,
cookies seguros, reinício automático e rotação de logs. A porta fica restrita
ao loopback da VM. Após instalar Docker e o plugin Compose na VM, enviar o
código e criar um `.env` privado com as credenciais IGDB. Executar na raiz:

```sh
docker compose -f compose.vm.yaml config --quiet
docker compose -f compose.vm.yaml up -d --build --wait
curl --fail http://127.0.0.1:3001/api/health
```

Falta configurar o proxy HTTPS da VM e seu endereço público antes de conectar
a Vercel. Não expor a porta 3001 diretamente. Configurar SSH restrito ao IP
administrativo e liberar somente as portas públicas necessárias para HTTPS.
O domínio/certificado e o tratamento do IP de origem serão definidos quando
houver uma VM acessível. Os cookies Secure exigem HTTPS para uso no navegador.

O volume Docker preserva dados entre atualizações, mas não substitui backup
fora da VM. Nunca usar `down --volumes` na instalação com dados reais.
Para uma cópia consistente, parar a API durante a cópia do volume completo ou
usar a API de backup do SQLite; não copiar apenas o arquivo principal em uso.

### Alternativas avaliadas

- **VM Oracle Always Free:** candidata para preservar SQLite e os workers,
  reutilizando Docker. Depende de cadastro, capacidade na região, configuração
  de HTTPS, backups e administração da VM; instâncias ociosas podem ser
  recuperadas pelo provedor. Usar apenas recursos elegíveis Always Free.
- **Render gratuito + PostgreSQL externo gratuito:** mantém o provedor pedido,
  mas exige migração do código e dos dados, revisão de quotas e outra estratégia
  de agendamento. Não basta trocar DATABASE_PATH por uma URL PostgreSQL.

Nenhuma migração de banco ou contratação paga foi iniciada.

## 3. Conectar a API após escolher o backend

Adicionar como primeira regra de `rewrites` no `vercel.json`, substituindo o
domínio de exemplo pela URL HTTPS real e verificada:

```json
{ "source": "/api/:path*", "destination": "https://API-REAL.example/api/:path*" }
```

O navegador continuará acessando `/api` no domínio do frontend. Isso preserva
o transporte `credentials: 'same-origin'` e os cookies `SameSite=Lax` existentes,
incluindo imagens, administração e callback Google.

No backend, usar Node.js 24, `NODE_ENV=production`,
`SESSION_COOKIE_SECURE=true` e `DATABASE_PATH` em armazenamento persistente
se SQLite for mantido. Configurar IGDB somente no backend. Para Google,
configurar as credenciais e `GOOGLE_REDIRECT_URI` como
`https://DOMINIO-VERCEL/api/auth/google/callback`, registrando a mesma URI no
console Google. Não ativar `TRUST_PROXY=true` em uma API pública: o código
atual só confia em um cabeçalho próprio sobrescrito pelo proxy privado do Compose.
A limitação de login por IP também deve ser verificada na topologia escolhida.

## 4. Aceitação da publicação completa

- Build e lint do frontend passam.
- `/perfil` e `/jogo/ID` abrem diretamente e após recarregar.
- `/api/health` retorna JSON com `ok: true` pelo domínio da Vercel.
- Cadastro, login, logout, favoritos e cookies seguros funcionam em HTTPS.
- Google retorna ao domínio público correto, se configurado.
- Dados persistem após reiniciar e republicar o backend.
- Sincronização funciona sem uma aba do site aberta.

## Referências

- [Vite na Vercel](https://vercel.com/docs/frameworks/frontend/vite)
- [Rewrites da Vercel](https://vercel.com/docs/routing/rewrites)
- [Limitações do Render gratuito](https://render.com/docs/free)
- [Discos persistentes do Render](https://render.com/docs/disks)
- [Oracle Always Free](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
- [AWS: condições do plano gratuito](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html)
