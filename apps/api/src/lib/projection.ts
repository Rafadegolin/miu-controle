import {
  addDays,
  addYearMonth,
  daysInMonth,
  firstNegative,
  occurrencesBetween,
  type ProjectionEvent,
  projectBalances,
  statementDates,
  statementMonthFor,
} from "@miu/core";
import { and, type Db, eq, isNull, schema } from "@miu/db";
import type { Projection } from "@miu/shared";
import { cardLedger, summarize } from "./cards";
import { accountBalances, userToday } from "./user-data";

const { accounts, transactions, recurringRules } = schema;

/**
 * Saldo previsto das contas nos próximos `months` meses (o mês atual é o primeiro).
 * Junta: previstos nas contas, faturas em aberto (atuais e futuras, com parcelas) na conta que paga
 * o cartão, e recorrências além do que já foi gerado. Compra no cartão entra pela fatura; pagamento
 * de fatura previsto não entra (a fatura já está contada).
 */
export async function buildProjection(db: Db, userId: string, months: number): Promise<Projection> {
  const [today, accountRows, balances, planned, rules] = await Promise.all([
    userToday(db, userId),
    db.select().from(accounts).where(eq(accounts.userId, userId)),
    accountBalances(db, userId),
    db
      .select()
      .from(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.status, "planned"))),
    db
      .select()
      .from(recurringRules)
      .where(and(eq(recurringRules.userId, userId), isNull(recurringRules.pausedAt))),
  ]);

  const lastMonth = addYearMonth(today.slice(0, 7), months - 1);
  const horizonEnd = `${lastMonth}-${String(daysInMonth(Number(lastMonth.slice(0, 4)), Number(lastMonth.slice(5, 7)))).padStart(2, "0")}`;

  const active = accountRows.filter((a) => !a.archivedAt);
  const banks = active.filter((a) => a.kind !== "credit_card");
  const cards = active.filter((a) => a.kind === "credit_card" && a.closingDay && a.dueDay);
  const byId = new Map(accountRows.map((a) => [a.id, a]));
  const isBank = (id: string | null | undefined) => {
    const a = id ? byId.get(id) : undefined;
    return Boolean(a && !a.archivedAt && a.kind !== "credit_card");
  };
  /** Conta que paga a fatura do cartão (null = sem conta ligada: entra só no total). */
  const payerOf = (cardId: string) => {
    const pay = byId.get(cardId)?.payFromAccountId;
    return pay && isBank(pay) ? pay : null;
  };

  const startBalances: Record<string, number> = {};
  for (const b of banks) startBalances[b.id] = b.initialBalanceCents + (balances.get(b.id) ?? 0);

  const events: ProjectionEvent[] = [];
  const billsByMonth: Record<string, number> = {};
  const add = (date: string, accountId: string | null, deltaCents: number) => {
    if (deltaCents !== 0 && date <= horizonEnd) events.push({ date, accountId, deltaCents });
  };

  // 1) Previstos que passam pelas contas.
  for (const t of planned) {
    if (!isBank(t.accountId)) continue; // compra prevista no cartão: entra pela fatura
    if (t.kind === "income") add(t.date, t.accountId, t.amountCents);
    else if (t.kind === "expense") add(t.date, t.accountId, -t.amountCents);
    else if (t.toAccountId && isBank(t.toAccountId)) {
      add(t.date, t.accountId, -t.amountCents);
      add(t.date, t.toAccountId, t.amountCents);
    }
    // transferência prevista para cartão = pagamento de fatura: a fatura já é contada abaixo
  }

  // 2) Faturas com saldo a pagar (atrasadas, a atual e as futuras com parcelas).
  const ledgers = await Promise.all(cards.map((c) => cardLedger(db, userId, c.id)));
  cards.forEach((c, i) => {
    const card = {
      id: c.id,
      closingDay: c.closingDay as number,
      dueDay: c.dueDay as number,
      creditLimitCents: c.creditLimitCents ?? 0,
    };
    for (const m of (ledgers[i] ?? new Map()).keys()) {
      const s = summarize(card, m, ledgers[i] ?? new Map(), today);
      if (s.remainingCents > 0 && s.dueDate <= horizonEnd) {
        add(s.dueDate, payerOf(c.id), -s.remainingCents);
        // atrasada conta no mês atual, como na projeção
        const due = s.dueDate < today ? today.slice(0, 7) : s.dueDate.slice(0, 7);
        billsByMonth[due] = (billsByMonth[due] ?? 0) + s.remainingCents;
      }
    }
  });

  // 3) Recorrências além do horizonte já gerado (os previstos só vão até ~45 dias).
  const cardById = new Map(cards.map((c) => [c.id, c]));
  for (const r of rules) {
    const after = r.generatedUntil ? addDays(r.generatedUntil, 1) : r.startDate;
    // biome-ignore lint/complexity/useMathMinMax: datas ISO em texto; Math.max não compara strings
    const from = after > today ? after : today;
    if (from > horizonEnd) continue;
    const dates = occurrencesBetween(
      {
        frequency: r.frequency,
        interval: r.interval,
        startDate: r.startDate,
        endDate: r.endDate,
        dayOfMonth: r.dayOfMonth,
      },
      from,
      horizonEnd,
    );
    const card = cardById.get(r.accountId);
    for (const d of dates) {
      if (card && r.kind === "expense") {
        // assinatura no cartão: cai na fatura do mês de fechamento e sai da conta que paga
        const due = statementDates(
          statementMonthFor(d, card.closingDay as number),
          card.closingDay as number,
          card.dueDay as number,
        ).dueDate;
        add(due, payerOf(card.id), -r.amountCents);
        if (due <= horizonEnd) {
          billsByMonth[due.slice(0, 7)] = (billsByMonth[due.slice(0, 7)] ?? 0) + r.amountCents;
        }
      } else if (isBank(r.accountId)) {
        if (r.kind === "income") add(d, r.accountId, r.amountCents);
        else if (r.kind === "expense") add(d, r.accountId, -r.amountCents);
        else if (r.toAccountId && isBank(r.toAccountId)) {
          add(d, r.accountId, -r.amountCents);
          add(d, r.toAccountId, r.amountCents);
        }
      }
    }
  }

  const result = projectBalances({ today, months, balances: startBalances, events });
  return {
    today,
    months: result,
    firstNegative: firstNegative(result),
    cardsWithoutPayer: cards.filter((c) => !payerOf(c.id)).map((c) => c.id),
    billsByMonth,
  };
}
