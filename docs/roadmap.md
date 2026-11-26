# Roadmap do Miu

Estado em 2026-11-26. Produção: https://miu-controle.miu-api.workers.dev (push na `main` publica sozinho pelo CI).

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

## Próximos passos

### 0. Bugs da R1 no celular

O usuário vai mandar o retorno do uso no celular, tudo de uma vez. Corrigir antes de começar a R2.

### R2. Lançar sem internet

Lançamento feito offline (metrô, sinal ruim) fica guardado no aparelho e sobe sozinho quando a conexão
volta.

- **Cache local** de `me`, contas, categorias e sugestões, para o app abrir e o painel funcionar sem
  rede.
  - Hoje `requireMe` (`apps/web/src/lib/guards.ts`) depende da rede e mandaria para `/entrar`.
  - Limpar esse cache ao sair da conta.
- **Fila de lançamentos pendentes** no aparelho:
  - enviar no evento `online` e ao abrir o app;
  - aviso "Salvo no aparelho, envia quando voltar a internet";
  - contador de pendentes no app.
- **Idempotência:**
  - o cliente gera o `id` (UUID) do lançamento e a API aceita esse `id` opcional no `POST
    /api/transactions`;
  - se já existir para o mesmo usuário, devolve o existente; se for de outra pessoa, responde com erro
    genérico, sem vazar nada.
  - Isso evita duplicar quando a resposta se perde no caminho.
- **Testes de API:** reenvio com o mesmo `id` não duplica; `id` de outro usuário é recusado.

### R3. A definir

Os atalhos do ícone, que eram o item 3 aprovado, já entraram na R1. Candidatos para a R3:

- lembrete à noite, opcional ("Lançou tudo hoje?"), por e-mail ou notificação;
- sugerir o banco da conta pelo código do banco no OFX importado.

## Pendências fora do roadmap

- **Resend** (e-mail): sem ele, ninguém recupera a senha nem confirma cadastro. A chave vai em
  `apps/api/.env` e no secret do Worker.
- Domínio próprio, quando quiser.
