# Plano de fundo do perfil — verificação

- Frontend Design Premium e Ponytail aplicados, sem novas dependências.
- Upload de JPG/PNG/WebP até 8 MB, recorte central 3:1, gravação em SQLite.
- API exige sessão, ignora ID de destino e valida o PNG. A imagem é pública.
- Editor reaproveita ProfilePhotoEditor; disclosure nativo com Escape e foco.
- npm run lint: passou.
- Frontend: 63 testes passaram (TEMP/TMP em node_modules/.tmp-favorite e maxWorkers=1).
- Backend: 41 testes passaram, incluindo validação, autoria, origem, limites,
  consulta pública, substituição, remoção e bloqueio de conta.
- Build de produção: passou.
- Auditoria Premium strict: zero achados.
- DESIGN.md lint: zero erros; três avisos anteriores sobre tokens sem referência
  nos objetos components (tokens usados no CSS, conforme mapeamento documentado).
- Edge/Playwright: upload real, reload, tipos inválidos, corrupção, tamanho,
  envio pendente, teclado, Escape, offline/repetição, remoção, sessão expirada,
  visitante sem controles de edição/e-mail, movimento reduzido e 320/390/650px.
- Screenshots desktop/mobile e público inspecionados; painel fica dentro do cartão.
- Execução reproduzível: profile-background-browser.cjs com PLAYWRIGHT_MODULE.
- Testes de HTTP/navegador executados fora do isolamento Windows para permitir
  loopback. Usam conta e banco temporários; nenhuma conta real foi alterada.
- Recorte central automático; não há reposicionamento manual nem imagem animada.
- A alteração está no código local; nenhum deploy foi realizado.
