# Checklist de publicação

Estado: **pronto localmente, nada publicado.** Sem Supabase, IA, Hermes, WhatsApp ou integrações — o app é 100% local (PWA).

## Antes de publicar
- [ ] CI verde na branch (lint, tipos, 169 testes unitários, build, 51 E2E).
- [ ] Revisar o PR e fazer o merge na `main` **manualmente** (nada foi mergeado automaticamente).
- [ ] Escolher a hospedagem (ex.: Vercel/Netlify — Next.js 16, build `npm run build`, start `npm start`, Node 22).
- [ ] **Não** definir variáveis `NEXT_PUBLIC_SUPABASE_*` por enquanto: sem elas o app não faz nenhuma chamada externa.
- [ ] Servir por **HTTPS** (necessário para o service worker/PWA e “Adicionar à Tela de Início” no iPhone).

## Depois do deploy (smoke test, ~3 min, no iPhone)
1. Abrir a URL → Hoje carrega com os dados de exemplo.
2. Capturar “sexta preciso pagar a VPS e terminar o checkout do Beds24” → “Já organizar” → 2 itens na Semana.
3. Concluir um item e **Desfazer**; recarregar a página → dados continuam.
4. Mais → Exportar backup (JSON) funciona.
5. Ativar modo avião e reabrir → o app abre offline.
6. Mais → “Conta e nuvem” mostra **Desligada**.

## Importante
- Os dados ficam só no navegador do aparelho: limpar dados do Safari apaga tudo → use **Exportar backup**.
- Ligar Supabase/IA/Hermes são etapas separadas, cada uma com credenciais e aprovação: ver `docs/PROXIMA-FASE.md`.
- Rollback: reverter o deploy para o anterior na hospedagem; nenhum dado/migration remoto está envolvido.
