# Roadmap do Miu

Estado em 2026-11-27. Produção: https://miu-controle.miu-api.workers.dev (push na `main` publica sozinho pelo CI).

## Pronto

- Fases 0–8 da reescrita (contas, cartões e faturas, parcelas, recorrências, orçamentos, metas,
  relatórios, importação OFX/CSV, avisos por e-mail, LGPD).
- Redesign v2.1 (D1–D7): tema claro, Visão geral com ritmo de gastos e limite mensal, Lançamentos em
  tabela com ações em lote, Recorrentes com compromissos do ano, Resumo do mês, landing em `/` e app em
  `/inicio`, contraste AA.
- Deploy automático (GitHub Actions) e Turnstile em entrar, cadastro e recuperar senha.
- Trocar senha em Configurações.
- Logos de bancos e bandeiras de cartão (`apps/web/scripts/sync-bank-logos.mjs`).
- Ícones próprios das categorias (`apps/web/src/components/miu-icons.tsx`) e logo refinado.
- **Lançamento relâmpago R1:**
  - linha mágica (`@miu/core/quick-entry`);
  - sugestões pelo histórico (`GET /api/transactions/suggestions`);
  - atalhos de um toque com os mais lançados;
  - conta padrão = a última usada;
  - "Salvar e novo" e "Desfazer";
  - atalhos do ícone do app (`/inicio?novo=gasto|receita`).
- **R2. Lançar sem internet** (`apps/web/src/lib/offline.ts`):
  - cache no aparelho de `me`, contas, categorias e sugestões, para o app abrir e o painel funcionar
    sem rede;
  - fila de lançamentos que envia sozinha ao abrir o app, quando a internet volta e quando o app volta
    à tela;
  - pílula "N lançamentos aguardando internet" e aviso "Sem conexão" na Visão geral;
  - idempotência: `clientId` (UUID do aparelho) vira o id do lançamento, e o reenvio não duplica
    (`apps/api/test/offline.test.ts`);
  - fila presa à conta que lançou; sair da conta apaga cache e fila;
  - verificado de ponta a ponta com Playwright: internet caindo com o app aberto e app aberto já
    offline.

## Próximos passos

### Bug aberto: painéis no celular (iPhone/PWA)

Ao tocar no "+" ou em "Mais", a tela escurece mas o painel não aparece. No Chrome responsivo do
computador funciona.

- **Já feito** (commit "Celular (Safari/iOS): painéis abriam vazios"):
  - reproduzido em WebKit com Playwright: o `<dialog>` abria com 2px de altura porque o conteúdo usava
    `flex-1` (base 0%) sem altura definida;
  - corrigido em `apps/web/src/components/sheet.tsx` (`flex-auto` + `min-h-0`) e verificado em
    WebKit e Chromium.
- **Continua no aparelho do usuário.** O usuário pediu para deixar de lado por enquanto.
- **Para retomar:**
  - confirmar aparelho e versão do iOS ou Android, e se acontece no app instalado e no navegador;
  - pegar um print;
  - checar se o service worker serviu um bundle antigo (versão em `/api/health` vs. a que o app
    carregou);
  - testar `<dialog>` + `showModal()` no iOS < 16.4 (o Tailwind v4 exige Safari 16.4+: `@layer`,
    `@property`, `color-mix`);
  - se for o caso, trocar o `<dialog>` por um painel próprio com `position: fixed`.

### R3. A definir

Os atalhos do ícone, que eram o item 3 aprovado, já entraram na R1. Candidatos para a R3:

- lembrete à noite, opcional ("Lançou tudo hoje?"), por e-mail ou notificação;
- sugerir o banco da conta pelo código do banco no OFX importado.

## Pendências fora do roadmap

- **Resend** (e-mail): sem ele, ninguém recupera a senha nem confirma cadastro. A chave vai em
  `apps/api/.env` e no secret do Worker.
- Domínio próprio, quando quiser.
