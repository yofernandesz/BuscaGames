# Retorno Google no celular — 2026-11-02

Causa: `GOOGLE_REDIRECT_URI` apontava apenas para `http://localhost:5173`.
No Safari do celular, esse endereço aponta para o próprio aparelho.

Correção: retornos adicionais configuráveis por `GOOGLE_REDIRECT_URIS`; seleção
pela origem exata do POST, limitada à lista configurada. URI persistida no fluxo
e reutilizada na troca do código. Migração aditiva preserva contas e sessões.
Origens desconhecidas recebem erro no formulário, sem ir ao Google/localhost.

Verificações:

- `npm --prefix backend test`: 29 testes passaram (com acesso à rede local).
- Fluxo HTTP real por localhost: 200, retorno localhost correto, cookie Secure.
- Fluxo HTTP real pelo túnel HTTPS: 200, retorno no mesmo domínio público,
  cookie Secure.
- Testes cobrem origens local/pública, origem desconhecida, mudança de retorno
  padrão durante o fluxo, uso da URI original na troca e migração idempotente.
- A API foi reiniciada com a configuração atualizada.

Pendente externo: cadastrar o callback público exato no cliente OAuth Google e
concluir um novo login no Safari. O cadastro no Google não foi alterado nesta
verificação. A aba de teste do túnel não carregou no navegador automatizado;
isso não substitui a validação no aparelho. O início do fluxo pelo HTTPS foi
verificado diretamente via HTTP. Não foi alegado um login móvel completo.
