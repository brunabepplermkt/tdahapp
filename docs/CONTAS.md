# Contas e login (cada pessoa com a sua)

O Leve tem dois modos, escolhidos só pelas variáveis de ambiente do deploy:

| Modo | Quando | O que acontece |
| --- | --- | --- |
| **Local** | sem `NEXT_PUBLIC_SUPABASE_*` | sem login; dados só neste aparelho (como antes) |
| **Conta** | com as duas variáveis | login obrigatório (e-mail + senha); dados separados por pessoa; envio e sincronização automáticos |

No modo conta uma pessoa nova começa **sem dados de exemplo**. Quem já usava o app no modo local vê, uma única vez,
a pergunta “trazer os dados deste aparelho para a conta?”.

## Ligar o modo conta (uma vez)

1. **Criar o projeto** em supabase.com (o plano grátis serve). Região: South America (São Paulo).
2. **Criar as tabelas:** SQL Editor → colar e rodar, nesta ordem, o conteúdo de
   `supabase/migrations/0001_init.sql` e depois `0002_sync_audit_agents.sql`.
   Confirme em Table Editor que todas as tabelas mostram “RLS enabled” (já vem nas migrations).
3. **Autenticação** (Authentication → Sign In / Providers → Email): deixar **Email** ligado.
   - **Confirm email**: para testar com poucas pessoas, **desligue** (o cadastro entra direto).
     Ligado, o Supabase só envia e-mails para membros do próprio projeto até você configurar um SMTP
     próprio (Authentication → SMTP Settings; ex.: Resend). **Antes de abrir para outras pessoas, configure o SMTP**
     — sem ele, a confirmação e o “esqueci a senha” não chegam.
   - Authentication → URL Configuration: **Site URL** = endereço do app (ex.: `https://tdahapp.vercel.app`);
     em **Redirect URLs** adicione o mesmo endereço.
4. **Variáveis no deploy** (Vercel → Project → Settings → Environment Variables), nos 3 ambientes:
   `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Project Settings → API → Project URL e a chave
   **anon / publishable**). **Nunca** use a `service_role`/`secret`: o app recusa essa chave, mas não cole.
5. **Redeploy** (Deployments → ⋯ → Redeploy). As variáveis `NEXT_PUBLIC_*` só valem a partir de um novo build.

## Teste de 5 minutos

1. Abrir o app → aparece a tela **Entrar**.
2. **Criar conta** com e-mail e senha (8+ caracteres) → entra no app, vazio.
3. Capturar algo. No Supabase → Table Editor → `items`: a linha aparece com o seu `user_id`.
4. Mais → **Sair da conta** → volta para a tela de entrada, sem dados na tela.
5. Criar uma **segunda conta** com outro e-mail → não vê nada da primeira. Em `items`, cada linha tem um `user_id` diferente.
6. Entrar de novo com a primeira conta → os dados voltam (inclusive em outro aparelho).

## Como funciona (resumo)

- Cada tabela tem `user_id` + **RLS**: o banco só devolve linhas da pessoa logada (testado em Postgres real, ver `supabase/rls.test.ts`).
- A chave pública (anon) é pública por desenho; quem protege os dados é a RLS.
- Localmente, cada pessoa tem o próprio espaço no aparelho; sair da conta esvazia a tela, mas **não apaga** a cópia local
  (ela só abre com o login). Em aparelho compartilhado, limpe os dados do site depois de sair.
- Sem internet: tudo funciona e é salvo no aparelho; sobe sozinho quando a conexão volta.
- Se os dados locais de uma pessoa sumirem (ex.: o Safari limpou), o app **só traz** da nuvem, nunca apaga lá.

## O que ainda não existe

- **Excluir conta** pelo app (exige uma função no servidor com permissão de administrador). Por enquanto, apagar o
  usuário no painel do Supabase remove tudo dele (as tabelas usam `on delete cascade`).
- **Login com Google/Apple** e **código por e-mail** (o link mágico foi trocado por senha porque abre no Safari, e não no app instalado).
- O link de “esqueci a senha” abre no Safari: troque a senha lá e volte ao app para entrar.
- Isto foi testado com um Supabase **simulado** (e a RLS em Postgres real, em memória). Ainda não foi testado contra
  um projeto Supabase de verdade — o teste de 5 minutos acima é justamente isso.
