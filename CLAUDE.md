# Miu Controle

Controle financeiro pessoal. Monorepo pnpm + Turborepo + Biome, rodando num único Cloudflare Worker com Neon Postgres via Hyperdrive.

## Estrutura

- `apps/api`: Worker Hono. Serve `/api/*`; o resto vem dos assets de `apps/web/dist` (`run_worker_first`). Config em `wrangler.jsonc`.
- `apps/web`: SPA React 19 + Vite + TanStack Router (rotas em arquivos, `src/routes`) + TanStack Query + Tailwind v4.
- `packages/core`: regras de negócio puras e testadas (dinheiro, datas, depois fatura, parcelas e recorrência). Sem I/O.
- `packages/shared`: schemas Zod e tipos compartilhados entre web e api.
- `packages/db`: schema Drizzle, migrations e `createDb()`.
- `packages/tsconfig`: tsconfigs base (`base`, `worker`, `react`).

## Comandos

- `pnpm dev`: Vite em :5173 com proxy de `/api` para o wrangler em :8787.
- `pnpm db:local`: Postgres local em PGlite (porta 5433) para desenvolver sem o Neon.
- `pnpm check`: lint, typecheck, testes e build (o mesmo que o CI roda).
- `pnpm db:generate` / `pnpm db:migrate`: precisam de `DATABASE_URL` (conexão direta do Neon, nunca a do Hyperdrive).
- `pnpm run deploy` (o `run` é obrigatório, `pnpm deploy` é um comando do pnpm): build da web e `wrangler deploy` da api. Normalmente não precisa: push na `main` publica sozinho pelo CI.

## Testes

- Testes da API (`apps/api/test`) rodam o app inteiro contra um Postgres real em memória (`createTestDb()` de `@miu/db/testing`, PGlite com as migrations). Use `setup()` e `signUpVerified()` de `test/harness.ts`.
- Toda rota nova precisa de teste de isolamento: um usuário nunca vê nem altera dado de outro.

## Segurança e infraestrutura

- Sessão sem cache em cookie (`cookieCache` desligado em `apps/api/src/lib/auth.ts`): sair dos outros aparelhos, trocar senha e excluir conta valem na hora.
- Cabeçalhos da SPA (CSP etc.) ficam em `apps/web/public/_headers` (os estáticos não passam pelo Hono). Domínio externo novo (script, fonte, iframe) precisa entrar na CSP de lá.
- Nada de script inline no `index.html` (a CSP não permite): use arquivo em `apps/web/public`.
- Exportação CSV neutraliza fórmulas (`csvText` em `apps/api/src/routes/imports.ts`); todo texto livre exportado passa por ela.
- Rotina diária (Cron Trigger, `apps/api/src/index.ts`): recorrências e avisos por e-mail. Avisos são idempotentes via `sent_alerts`.
- Ícones do PWA: `node apps/web/scripts/generate-icons.mjs` (desenhados a partir do logo, sem dependências).

## Regras

- Dinheiro é sempre inteiro em centavos (`bigint` no banco, `number` no JSON). Nunca use float para somar.
- Datas de lançamento são `YYYY-MM-DD` sem fuso; use os helpers de `@miu/core` (clamp de fim de mês).
- Saldo é derivado das transações, nunca gravado.
- Toda tabela de domínio tem `user_id`, e toda query filtra por ele.
- Senhas usam PBKDF2 nativo (`apps/api/src/lib/password.ts`), não o scrypt do Better Auth, por causa do limite de CPU do plano grátis.
- Erros da API usam o formato `{ erro, mensagem, detalhes? }` (`apps/api/src/lib/errors.ts`).
- O frontend usa só os tokens de cor de `apps/web/src/styles.css` (`bg-surface`, `text-muted`...). Nada de hex em componente.
- Dados no frontend vêm só do TanStack Query com o cliente RPC `api` (`apps/web/src/lib/api.ts`). Nada de `useEffect` com fetch.
- Textos da interface em português do Brasil, falando com o usuário pelo que ele reconhece.
- Plano completo e fases: ver o histórico do projeto.
