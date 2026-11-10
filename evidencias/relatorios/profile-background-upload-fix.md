# Correção do upload de background

Causa confirmada em 05/11/2026: API local em 3001 executava código antigo, sem
recarga automática e sem a rota de background. O Vite em 5173 tinha a UI atual.

Antes: PUT sem sessão com 9.000 caracteres retornou HTTP 413 / Dados muito longos.
A consulta pública não incluía backgroundUrl. A rota atual rejeita a falta de
sessão antes da leitura do corpo; a versão antiga aplicava o limite genérico de
8 KiB antes de reconhecer a operação.

Ação: somente o processo identificado da API foi reiniciado com --watch, usando
os mesmos arquivos de ambiente, diretório backend e banco. Não alteramos imagens
ou perfis de contas reais. Após o reinício, verificamos diretamente em 3001 e pelo
proxy Vite em 5173 a mensagem específica da rota e backgroundUrl na consulta pública.

Regressão no Edge com banco/conta temporários: PNG detalhado de 929.674 bytes,
requisição JSON final de 1.239.580 bytes, salvo com sucesso (limite 2.097.152).
O script profile-background-browser.cjs também passou os cenários anteriores:
erros, tamanho, upload, teclado, reload, offline, visitante, celular e remoção.

A interface agora explica HTTP 413 tanto em resposta JSON quanto HTML de proxy.
7 testes de communityApi passaram; lint e build passaram. Nenhuma dependência nova.
O arquivo original continua limitado a 8 MiB e é recortado/redimensionado para
900 × 300 antes do envio. Não foi necessário ampliar limites nem trocar o formato.
