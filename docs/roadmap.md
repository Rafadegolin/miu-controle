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
- **Painéis no iPhone** (o "+" e "Mais" abriam vazios no Safari/PWA): resolvido em
  `apps/web/src/components/sheet.tsx` (`flex-auto` + `min-h-0` no lugar de `flex-1`, foco no campo
  inicial); confirmado pelo usuário no aparelho em 2026-11-27.
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
- **Movimento e fluidez (M1 + M2):**
  - safe area no topo do iPhone instalado;
  - View Transitions na troca de tela;
  - loaders que esperam os dados (`lib/loaders.ts`), com skeletons do mesmo formato da tela;
  - painéis com entrada e saída;
  - números que contam (`components/animated-number.tsx`);
  - gráficos que se desenham, barras que crescem, cards em sequência e pílula deslizante no
    segmentado;
  - tokens e keyframes em `styles.css`; movimento reduzido desliga tudo.
- **F1. Cartão ligado à conta + projeção:**
  - `accounts.pay_from_account_id` (migration 0008);
  - "Pagar fatura" sai da conta ligada;
  - projeção mês a mês por conta (`@miu/core/projection`, `GET /api/insights/projection`), com a Visão geral usando a mesma conta;
  - "nesse ritmo, o mês fecha em R$ X" (`projectMonthSpend`);
  - excluir meta no rodapé.
- **F2. Importação inteligente:**
  - parcelas do extrato do cartão ("PARC 03/10", "Parcela 3 de 10", "(3/10)"; "03/10" solto como sugestão) criam a parcela na fatura escolhida e as próximas nas seguintes (`detectInstallment`/`importedInstallments` no core);
  - a próxima importação reconhece a parcela já criada;
  - "Pagamento de fatura" no extrato da conta vira transferência para o cartão ligado;
  - repetidos em ±2 dias;
  - desfazer apaga também as parcelas futuras.
- **F3. Caixinhas com rendimento (% do CDI):**
  - a meta pode ser uma caixinha: conta `savings` ligada (`goals.account_id`), o guardado é o saldo dela;
  - guardar e resgatar são transferências de/para uma conta; meta simples continua igual e pode "Transformar em caixinha";
  - `cdi_percent` em poupança/investimento; o Cron busca o CDI (SGS série 12) em `cdi_rates` e lança o
    rendimento do mês anterior em Rendimentos (idempotente via `yield_postings`); a tela estima o do mês atual;
  - "Ajustar saldo" lança a diferença com o saldo do banco.

- **F4. Futuro:**
  - `GET /api/insights/future` entrega só a entrada (projeção do que é certo, faturas por mês, gasto
    variável médio dos 3 meses fechados sem recorrências e parcelas, metas e caixinhas, CDI);
  - `projectFuture` e `futureTip` (`packages/core/src/future.ts`) rodam no aparelho: patrimônio mês a mês,
    rendimento composto das caixinhas, data de cada meta, marcos (meta, fatura alta, saldo negativo) e cenários;
  - tela Futuro (menu Visão estratégica, 12/24 meses): gráfico com "sem mudanças" tracejado, marcos e simulador
    "E se…" (cortar categoria, guardar todo mês, compra parcelada, mudar a renda); "Aplicar" vira orçamento
    ou recorrência de transferência para a caixinha;
  - passo "Seu futuro" no Resumo do mês, com a recomendação do `futureTip`.

- **Notificações push** (2026-11-28):
  - Web Push próprio (RFC 8291/8292 com WebCrypto, conferido contra a `http_ece` e com envio real pelo
    serviço de push da Microsoft); tabela `push_subscriptions` e preferências `push_alerts`/`push_reminder`;
  - avisos de fatura e orçamento também por push (canal independente do e-mail no `sent_alerts`);
  - lembrete opcional às 20h ("Lançou tudo hoje?") só nos dias sem lançamento;
  - Configurações → "Notificações no celular": ativar neste aparelho, **enviar notificação de teste**,
    desativar, interruptores e lista de aparelhos; no iPhone, passo a passo para instalar o app.

## Próximos passos

O plano F1–F4 e o push estão prontos (push confirmado no iPhone em 2026-11-28; a Apple recusa o cabeçalho
`Topic`, por isso ele não é enviado). Agora é fase de **uso real por 2–3 semanas**, anotando o que irrita ou
falta, antes de novas funcionalidades.

Antes de confiar o dinheiro ao app (segurança, nesta ordem):

1. **Resend + domínio próprio.** Sem isso não há recuperação de senha (o e-mail de redefinição só vai para o
   log), nem confirmação de conta ou avisos por e-mail. O Resend exige domínio verificado para enviar a
   qualquer endereço. Falta o usuário escolher e comprar o domínio.
2. **Erros de produção visíveis:** ligar o registro de logs do Workers (`observability` no `wrangler.jsonc`)
   e revisar o painel.
3. **CPU do login:** o PBKDF2 gasta ~14 ms de CPU e o plano grátis permite 10 ms por request. Medir em
   produção e ajustar se houver recusas.

Ideias maiores, depois do uso real: medir e enxugar o carregamento no 4G; conta compartilhada (casal ou
família); Open Finance (sincronizar com o banco, com custo mensal de um intermediário).

### R3. A definir

Os atalhos do ícone, que eram o item 3 aprovado, já entraram na R1. Eles só aparecem no Android: o iOS
não oferece atalhos de manifest para apps instalados pelo Safari. A opção "abrir o app já no novo
lançamento" foi oferecida como alternativa no iPhone e recusada. Candidatos para a R3:

- ~~lembrete à noite, opcional ("Lançou tudo hoje?")~~: entrou com o push;
- sugerir o banco da conta pelo código do banco no OFX importado.

## Pendências fora do roadmap

- **Resend** (e-mail): sem ele, ninguém recupera a senha nem confirma cadastro. A chave vai em
  `apps/api/.env` e no secret do Worker.
- Domínio próprio, quando quiser.
