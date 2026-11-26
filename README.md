# Miu Controle

Controle financeiro pessoal: contas, cartões com fatura e parcelas, recorrências, orçamentos e metas.

Roda inteiro no plano grátis da Cloudflare (um Worker servindo a API e a SPA) com Neon Postgres em São Paulo via Hyperdrive.

## Rodar localmente (sem precisar do Neon)

```bash
pnpm install
cp apps/api/.env.example apps/api/.env

# terminal 1: Postgres local (PGlite, porta 5433)
pnpm db:local

# terminal 2: aplica as migrations no banco local (só na primeira vez e quando houver migration nova)
DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433/postgres?sslmode=disable" pnpm db:migrate

# terminal 2: API (wrangler, :8787) + web (Vite, :5173)
pnpm dev
```

Abra http://localhost:5173. Sem provedor de e-mail configurado, o link de confirmação aparece no terminal do `pnpm dev`.

Para rodar a mesma verificação do CI: `pnpm check`.

Detalhes de arquitetura e convenções em [CLAUDE.md](CLAUDE.md).

## Deploy

Cada push na `main` roda o CI (lint, typecheck, testes e build) e, se tudo passar, aplica as migrations no Neon e publica o Worker (`.github/workflows/ci.yml`). Fica ligado pela variável `DEPLOY_ENABLED=true` do repositório e usa os segredos `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` e `DATABASE_URL` (conexão direta do Neon, sem `-pooler`).

Deploy manual, se precisar: `pnpm run deploy`.

O Turnstile usa a chave pública em `apps/web/.env.production` e o segredo `TURNSTILE_SECRET` no Worker.
