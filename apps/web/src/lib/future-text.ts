import {
  type FutureResult,
  type FutureTip,
  type Milestone,
  monthsBetween,
  projectFuture,
  type Scenario,
} from "@miu/core";
import type { Future } from "@miu/shared";
import { money, monthLabel, monthShort } from "./format";

/* Frases do Futuro: o resultado da conta em linguagem de gente. */

const meses = (n: number) => `${n} ${n === 1 ? "mês" : "meses"}`;

export function describeScenario(s: Scenario, f: Future): string {
  if (s.kind === "cut") {
    const cat = f.categories.find((c) => c.id === s.categoryId)?.name ?? "uma categoria";
    return `Cortando ${s.percent}% de ${cat}`;
  }
  if (s.kind === "save") {
    const goal = f.goals.find((g) => g.id === s.goalId)?.name ?? "a meta";
    return `Guardando ${money(s.monthlyCents)} a mais por mês em ${goal}`;
  }
  if (s.kind === "purchase") return `Comprando ${money(s.totalCents)} em ${s.installments}x`;
  return s.monthlyCents >= 0
    ? `Ganhando ${money(s.monthlyCents)} a mais por mês`
    : `Ganhando ${money(-s.monthlyCents)} a menos por mês`;
}

/** "a Viagem sai 4 meses antes e você termina nov/27 com R$ 8.400 a mais". */
export function effectText(base: FutureResult, next: FutureResult, f: Future): string {
  const parts: string[] = [];
  for (const g of f.goals) {
    const a = base.goals.find((x) => x.id === g.id)?.reachMonth ?? null;
    const b = next.goals.find((x) => x.id === g.id)?.reachMonth ?? null;
    if (a === b) continue;
    if (a && b) {
      const d = monthsBetween(b, a);
      parts.push(d > 0 ? `${g.name} chega ${meses(d)} antes` : `${g.name} atrasa ${meses(-d)}`);
    } else if (b) parts.push(`${g.name} chega em ${monthShort(b)}`);
    else parts.push(`${g.name} não chega mais no período`);
  }
  const diff = (next.months.at(-1)?.totalCents ?? 0) - (base.months.at(-1)?.totalCents ?? 0);
  const last = monthShort(next.months.at(-1)?.month ?? "");
  if (Math.abs(diff) >= 100) {
    parts.push(`você termina ${last} com ${money(Math.abs(diff))} a ${diff > 0 ? "mais" : "menos"}`);
  } else if (!parts.length) parts.push(`o total em ${last} fica igual`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} e ${parts.at(-1)}` : (parts[0] ?? "");
}

export function scenarioSentence(s: Scenario, f: Future, base: FutureResult): string {
  return `${describeScenario(s, f)}, ${effectText(base, projectFuture(f, [s]), f)}.`;
}

export function milestoneText(m: Milestone, accountName: (id: string) => string | undefined): string {
  if (m.kind === "goal") return `${m.name}: ${monthShort(m.month)}`;
  if (m.kind === "bill") return `Fatura alta em ${monthShort(m.month)} (${money(m.billsCents)})`;
  const acc = m.accountId ? accountName(m.accountId) : undefined;
  return `Saldo negativo em ${monthShort(m.month)}${acc ? ` no ${acc}` : ""}`;
}

/** A frase do passo "Seu futuro" no Resumo do mês. */
export function tipText(tip: FutureTip, f: Future, accountName: (id: string) => string | undefined): string {
  if (tip.kind === "category") {
    const goal = tip.goal;
    const goalPart =
      goal?.reachMonth && goal.monthsEarlier && goal.monthsEarlier > 0
        ? ` Guardando isso em ${goal.name}, ela chega em ${monthShort(goal.reachMonth)}, ${meses(goal.monthsEarlier)} antes.`
        : goal?.reachMonth
          ? ` Guardando isso em ${goal.name}, ela chega em ${monthShort(goal.reachMonth)}.`
          : "";
    return `${tip.name} subiu ${tip.percentUp}% no mês passado. Voltando à média, sobram ${money(tip.extraMonthlyCents)} por mês.${goalPart}`;
  }
  if (tip.kind === "negative") {
    const acc = tip.accountId ? accountName(tip.accountId) : undefined;
    return `No ritmo atual, ${acc ? `o ${acc}` : "o saldo"} fica negativo em ${monthLabel(tip.month).toLowerCase().replace(" ", " de ")}. Vale rever os gastos do dia a dia agora.`;
  }
  const last = monthShort(f.months.at(-1)?.month ?? "");
  if (tip.goal?.reachMonth) {
    const earlier =
      tip.goal.monthsEarlier && tip.goal.monthsEarlier > 0 ? `, ${meses(tip.goal.monthsEarlier)} antes` : "";
    return `Tudo em ordem. Guardando ${money(tip.monthlyCents)} a mais por mês em ${tip.goal.name}, ela chega em ${monthShort(tip.goal.reachMonth)}${earlier}.`;
  }
  return `Tudo em ordem: no ritmo atual, você chega a ${last} com ${money(tip.endCents)} nas contas.`;
}
