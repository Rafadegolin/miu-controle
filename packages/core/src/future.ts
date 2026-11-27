import { addYearMonth, type ISODate, type YearMonth } from "./dates";
import type { Cents } from "./money";
import { monthlyYieldEstimate } from "./yield";

/*
 * Futuro: patrimônio mês a mês, marcos no tempo e cenários "e se".
 * A API entrega a entrada (o que é certo + médias); a conta roda aqui, no aparelho, para a simulação
 * responder na hora. O mês 0 é o mês atual.
 */

export type FutureInput = {
  today: ISODate;
  months: {
    month: YearMonth;
    /** Saldo previsto (contas + faturas sem conta) só com o que é certo: o da projeção. */
    knownTotalCents: Cents;
    /** Faturas de cartão que vencem no mês. */
    billsCents: Cents;
  }[];
  /** Primeira conta que fica negativa só com o que é certo (da projeção). */
  firstNegative: { month: YearMonth; accountId: string | null } | null;
  /** Gasto variável médio por mês (sem recorrências e parcelas), últimos 3 meses fechados. */
  variableMonthlyCents: Cents;
  /** Quanto ainda deve sair de gasto variável no mês atual, pelo ritmo. */
  currentMonthVariableLeftCents: Cents;
  categories: {
    id: string;
    name: string;
    /** Média variável por mês (3 meses fechados). */
    averageCents: Cents;
    /** Variável do último mês fechado. */
    lastMonthCents: Cents;
  }[];
  goals: {
    id: string;
    name: string;
    targetCents: Cents;
    savedCents: Cents;
    recentMonthlyCents: Cents;
    /** Caixinha que rende (% do CDI × 100); null = não rende. */
    cdiPercent: number | null;
  }[];
  /** Caixinhas e investimentos que rendem, com o saldo de hoje. */
  boxes: { accountId: string; balanceCents: Cents; cdiPercent: number }[];
  /** CDI atual em % ao ano; null = sem taxa (nada rende na conta). */
  cdiAnnualPercent: number | null;
};

export type Scenario =
  /** Cortar `percent`% (1–100) do gasto variável de uma categoria, a partir do mês que vem. */
  | { kind: "cut"; categoryId: string; percent: number }
  /** Guardar a mais por mês numa meta, a partir do mês que vem (move dinheiro, não gasta). */
  | { kind: "save"; goalId: string; monthlyCents: Cents }
  /** Compra de `totalCents` em `installments` vezes, a primeira em `startMonth`. */
  | { kind: "purchase"; totalCents: Cents; installments: number; startMonth: YearMonth }
  /** Renda a mais (ou a menos, se negativo) por mês a partir de `startMonth`. */
  | { kind: "income"; monthlyCents: Cents; startMonth: YearMonth };

export type Milestone =
  | { kind: "goal"; month: YearMonth; goalId: string; name: string }
  | { kind: "bill"; month: YearMonth; billsCents: Cents }
  | { kind: "negative"; month: YearMonth; accountId: string | null };

export type FutureResult = {
  months: { month: YearMonth; totalCents: Cents }[];
  /** Mês em que cada meta chega no alvo; null = não chega dentro do horizonte. Já alcançada = mês atual. */
  goals: { id: string; reachMonth: YearMonth | null }[];
  milestones: Milestone[];
};

/** Rendimento do mês (0 sem CDI ou sem % do CDI). */
const yieldOf = (balance: Cents, input: FutureInput, cdiPercent: number | null) =>
  input.cdiAnnualPercent && cdiPercent
    ? monthlyYieldEstimate(balance, input.cdiAnnualPercent, cdiPercent)
    : 0;

/** Parcelas exatas em centavos: a primeira leva o resto. */
function split(total: Cents, n: number): Cents[] {
  const base = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => (i === 0 ? total - base * (n - 1) : base));
}

/**
 * Caminho de uma meta: guardado + ritmo + extra por mês (a partir do mês que vem), com rendimento se
 * for caixinha. Devolve o valor no fim de cada mês do horizonte.
 */
function goalPath(goal: FutureInput["goals"][number], input: FutureInput, extraMonthly: Cents): Cents[] {
  const out: Cents[] = [];
  let value = goal.savedCents;
  input.months.forEach((_, k) => {
    if (k > 0)
      value += yieldOf(value, input, goal.cdiPercent) + Math.max(0, goal.recentMonthlyCents) + extraMonthly;
    out.push(value);
  });
  return out;
}

export function projectFuture(input: FutureInput, scenarios: Scenario[] = []): FutureResult {
  const n = input.months.length;
  const delta = new Array<number>(n).fill(0);
  const monthIndex = new Map(input.months.map((m, i) => [m.month, i]));
  const fromMonth = (start: YearMonth) => {
    const first = input.months[0]?.month ?? start;
    const s = start < first ? first : start;
    return monthIndex.get(s) ?? n;
  };

  // Gasto variável: o que falta no mês atual e a média nos meses seguintes (acumulado).
  // Rendimento das caixinhas: juros compostos sobre o saldo de hoje.
  const boxBalances = input.boxes.map((b) => b.balanceCents);
  let spent = 0;
  let earned = 0;
  const base: number[] = input.months.map((m, k) => {
    spent += k === 0 ? input.currentMonthVariableLeftCents : input.variableMonthlyCents;
    if (k > 0) {
      input.boxes.forEach((b, i) => {
        const y = yieldOf(boxBalances[i] ?? 0, input, b.cdiPercent);
        boxBalances[i] = (boxBalances[i] ?? 0) + y;
        earned += y;
      });
    }
    return m.knownTotalCents - spent + earned;
  });

  // Cenários viram diferenças por mês (fluxo), acumuladas depois.
  const flow = new Array<number>(n).fill(0);
  const extraByGoal = new Map<string, number>();
  for (const s of scenarios) {
    if (s.kind === "cut") {
      const cat = input.categories.find((c) => c.id === s.categoryId);
      const cut = Math.round(((cat?.averageCents ?? 0) * Math.min(100, Math.max(0, s.percent))) / 100);
      for (let k = 1; k < n; k++) flow[k] = (flow[k] ?? 0) + cut;
    } else if (s.kind === "purchase") {
      const parts = split(s.totalCents, Math.max(1, s.installments));
      const i0 = fromMonth(s.startMonth);
      parts.forEach((p, j) => {
        if (i0 + j < n) flow[i0 + j] = (flow[i0 + j] ?? 0) - p;
      });
    } else if (s.kind === "income") {
      for (let k = fromMonth(s.startMonth); k < n; k++) flow[k] = (flow[k] ?? 0) + s.monthlyCents;
    } else {
      extraByGoal.set(s.goalId, (extraByGoal.get(s.goalId) ?? 0) + Math.max(0, s.monthlyCents));
    }
  }
  let acc = 0;
  for (let k = 0; k < n; k++) {
    acc += flow[k] ?? 0;
    delta[k] = acc;
  }

  // Metas: data em que chegam; guardar a mais numa caixinha também rende (soma no total).
  const goals = input.goals.map((g) => {
    const extra = extraByGoal.get(g.id) ?? 0;
    const path = goalPath(g, input, extra);
    if (extra > 0 && g.cdiPercent) {
      const without = goalPath(g, input, 0);
      path.forEach((v, k) => {
        // diferença de rendimento = caminho com extra − sem extra − o próprio dinheiro guardado
        delta[k] = (delta[k] ?? 0) + (v - (without[k] ?? 0) - extra * k);
      });
    }
    const reach = path.findIndex((v) => v >= g.targetCents);
    return { id: g.id, name: g.name, reachMonth: reach >= 0 ? (input.months[reach]?.month ?? null) : null };
  });

  const months = input.months.map((m, k) => ({
    month: m.month,
    totalCents: Math.round((base[k] ?? 0) + (delta[k] ?? 0)),
  }));

  // Marcos.
  const milestones: Milestone[] = [];
  const first = input.months[0]?.month;
  for (const g of goals) {
    if (g.reachMonth && g.reachMonth !== first)
      milestones.push({ kind: "goal", month: g.reachMonth, goalId: g.id, name: g.name });
  }
  const bills = input.months
    .map((m) => m.billsCents)
    .filter((b) => b > 0)
    .sort((a, b) => a - b);
  const median = bills.length ? (bills[Math.floor((bills.length - 1) / 2)] ?? 0) : 0;
  if (median > 0) {
    const high = input.months.find((m) => m.billsCents > median * 1.3);
    if (high) milestones.push({ kind: "bill", month: high.month, billsCents: high.billsCents });
  }
  const totalNeg = months.find((m) => m.totalCents < 0);
  const known = input.firstNegative;
  const neg =
    known && (!totalNeg || known.month <= totalNeg.month)
      ? { month: known.month, accountId: known.accountId }
      : totalNeg
        ? { month: totalNeg.month, accountId: null }
        : null;
  if (neg) milestones.push({ kind: "negative", ...neg });
  milestones.sort((a, b) => a.month.localeCompare(b.month));

  return { months, goals: goals.map(({ id, reachMonth }) => ({ id, reachMonth })), milestones };
}

/** Diferença em meses entre dois meses (b − a). */
export function monthsBetween(a: YearMonth, b: YearMonth): number {
  return (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));
}

export type FutureTip =
  /** Categoria que subiu: voltando à média sobra `extraMonthlyCents`; guardando na meta, ela chega antes. */
  | {
      kind: "category";
      categoryId: string;
      name: string;
      percentUp: number;
      extraMonthlyCents: Cents;
      goal: { id: string; name: string; reachMonth: YearMonth | null; monthsEarlier: number | null } | null;
    }
  | { kind: "negative"; month: YearMonth; accountId: string | null }
  /** Tudo em ordem: quanto guardar a mais (10% do variável) e o efeito. */
  | {
      kind: "save";
      monthlyCents: Cents;
      endCents: Cents;
      goal: { id: string; name: string; reachMonth: YearMonth | null; monthsEarlier: number | null } | null;
    };

/** Meta aberta mais perto do fim (maior progresso), para dar exemplo concreto. */
function focusGoal(input: FutureInput) {
  return (
    input.goals
      .filter((g) => g.savedCents < g.targetCents)
      .sort((a, b) => b.savedCents / b.targetCents - a.savedCents / a.targetCents)[0] ?? null
  );
}

function goalEffect(input: FutureInput, goalId: string, monthlyCents: Cents) {
  const before = projectFuture(input).goals.find((g) => g.id === goalId)?.reachMonth ?? null;
  const after =
    projectFuture(input, [{ kind: "save", goalId, monthlyCents }]).goals.find((g) => g.id === goalId)
      ?.reachMonth ?? null;
  return { reachMonth: after, monthsEarlier: before && after ? monthsBetween(after, before) : null };
}

/** A recomendação do passo "Seu futuro": uma frase concreta a partir dos números. */
export function futureTip(input: FutureInput): FutureTip {
  const goal = focusGoal(input);
  const up = input.categories
    .filter(
      (c) =>
        c.averageCents > 0 &&
        c.lastMonthCents >= c.averageCents * 1.2 &&
        c.lastMonthCents - c.averageCents >= 5000,
    )
    .sort((a, b) => b.lastMonthCents - b.averageCents - (a.lastMonthCents - a.averageCents))[0];
  if (up) {
    const extra = up.lastMonthCents - up.averageCents;
    return {
      kind: "category",
      categoryId: up.id,
      name: up.name,
      percentUp: Math.round((up.lastMonthCents / up.averageCents - 1) * 100),
      extraMonthlyCents: extra,
      goal: goal ? { id: goal.id, name: goal.name, ...goalEffect(input, goal.id, extra) } : null,
    };
  }
  const neg = projectFuture(input).milestones.find((m) => m.kind === "negative");
  if (neg && neg.kind === "negative") return { kind: "negative", month: neg.month, accountId: neg.accountId };
  const monthly = Math.max(5000, Math.round(input.variableMonthlyCents / 10 / 5000) * 5000);
  const scenario: Scenario[] = goal ? [{ kind: "save", goalId: goal.id, monthlyCents: monthly }] : [];
  const end = projectFuture(input, scenario).months.at(-1)?.totalCents ?? 0;
  return {
    kind: "save",
    monthlyCents: monthly,
    endCents: end,
    goal: goal ? { id: goal.id, name: goal.name, ...goalEffect(input, goal.id, monthly) } : null,
  };
}

/** Meses do horizonte a partir do mês de `today`. */
export function futureMonths(today: ISODate, count: number): YearMonth[] {
  return Array.from({ length: count }, (_, i) => addYearMonth(today.slice(0, 7), i));
}
