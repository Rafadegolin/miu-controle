import { describe, expect, it } from "vitest";
import { type FutureInput, futureMonths, futureTip, monthsBetween, projectFuture } from "./future";
import { monthlyYieldEstimate } from "./yield";

const months = futureMonths("2026-11-27", 12);
const input = (over: Partial<FutureInput> = {}): FutureInput => ({
  today: "2026-11-27",
  months: months.map((month) => ({ month, knownTotalCents: 1_000_000, billsCents: 0 })),
  firstNegative: null,
  variableMonthlyCents: 0,
  currentMonthVariableLeftCents: 0,
  categories: [],
  goals: [],
  boxes: [],
  cdiAnnualPercent: null,
  ...over,
});

describe("futuro", () => {
  it("sem gasto variável nem rendimento, é a própria projeção", () => {
    const r = projectFuture(input());
    expect(r.months.map((m) => m.totalCents)).toEqual(months.map(() => 1_000_000));
    expect(r.milestones).toEqual([]);
  });

  it("desconta o que falta do variável no mês atual e a média nos seguintes", () => {
    const r = projectFuture(input({ variableMonthlyCents: 200_000, currentMonthVariableLeftCents: 30_000 }));
    expect(r.months[0]?.totalCents).toBe(970_000);
    expect(r.months[1]?.totalCents).toBe(770_000);
    expect(r.months[3]?.totalCents).toBe(370_000);
    // fica negativo no mês 5: marco de saldo negativo
    expect(r.milestones).toContainEqual({ kind: "negative", month: months[5], accountId: null });
  });

  it("caixinha rende com juros compostos a partir do mês que vem", () => {
    const r = projectFuture(
      input({
        boxes: [{ accountId: "b", balanceCents: 1_000_000, cdiPercent: 10000 }],
        cdiAnnualPercent: 12,
      }),
    );
    const y1 = monthlyYieldEstimate(1_000_000, 12, 10000);
    const y2 = monthlyYieldEstimate(1_000_000 + y1, 12, 10000);
    expect(r.months[0]?.totalCents).toBe(1_000_000);
    expect(r.months[1]?.totalCents).toBe(1_000_000 + y1);
    expect(r.months[2]?.totalCents).toBe(1_000_000 + y1 + y2);
  });

  it("cenários: cortar categoria, compra parcelada e renda", () => {
    const base = input({
      categories: [{ id: "rest", name: "Restaurantes", averageCents: 100_000, lastMonthCents: 100_000 }],
    });
    const cut = projectFuture(base, [{ kind: "cut", categoryId: "rest", percent: 50 }]);
    expect(cut.months[0]?.totalCents).toBe(1_000_000);
    expect(cut.months[2]?.totalCents).toBe(1_100_000);

    const buy = projectFuture(base, [
      { kind: "purchase", totalCents: 100_001, installments: 2, startMonth: months[1] as string },
    ]);
    expect(buy.months[1]?.totalCents).toBe(1_000_000 - 50_001);
    expect(buy.months[2]?.totalCents).toBe(1_000_000 - 100_001);
    expect(buy.months[5]?.totalCents).toBe(1_000_000 - 100_001);

    const inc = projectFuture(base, [{ kind: "income", monthlyCents: -10_000, startMonth: "2020-01" }]);
    expect(inc.months[0]?.totalCents).toBe(990_000);
    expect(inc.months[1]?.totalCents).toBe(980_000);
  });

  it("guardar a mais antecipa a meta; numa caixinha, o rendimento soma no total", () => {
    const goal = {
      id: "g",
      name: "Viagem",
      targetCents: 600_000,
      savedCents: 0,
      recentMonthlyCents: 50_000,
      cdiPercent: null,
    };
    const plain = projectFuture(input({ goals: [goal] }));
    expect(plain.goals[0]?.reachMonth).toBe(null); // 50 mil × 11 = 550 mil
    const faster = projectFuture(input({ goals: [goal] }), [
      { kind: "save", goalId: "g", monthlyCents: 50_000 },
    ]);
    expect(faster.goals[0]?.reachMonth).toBe(months[6]);
    expect(faster.months.at(-1)?.totalCents).toBe(1_000_000); // só move dinheiro
    expect(faster.milestones).toContainEqual({ kind: "goal", month: months[6], goalId: "g", name: "Viagem" });

    const box = { ...goal, cdiPercent: 10000 };
    const boxed = projectFuture(input({ goals: [box], cdiAnnualPercent: 12 }), [
      { kind: "save", goalId: "g", monthlyCents: 50_000 },
    ]);
    expect(boxed.months.at(-1)?.totalCents ?? 0).toBeGreaterThan(1_000_000);
  });

  it("fatura bem acima do normal vira marco", () => {
    const r = projectFuture(
      input({
        months: months.map((month, i) => ({
          month,
          knownTotalCents: 1_000_000,
          billsCents: i === 7 ? 300_000 : 100_000,
        })),
      }),
    );
    expect(r.milestones).toEqual([{ kind: "bill", month: months[7], billsCents: 300_000 }]);
  });

  it("conta negativa da projeção vence se vier antes", () => {
    const r = projectFuture(input({ firstNegative: { month: months[2] as string, accountId: "nu" } }));
    expect(r.milestones).toEqual([{ kind: "negative", month: months[2], accountId: "nu" }]);
  });

  it("dica: categoria que subiu, saldo negativo ou guardar mais", () => {
    const goal = {
      id: "g",
      name: "Viagem",
      targetCents: 600_000,
      savedCents: 0,
      recentMonthlyCents: 50_000,
      cdiPercent: null,
    };
    const tip = futureTip(
      input({
        goals: [goal],
        categories: [
          { id: "rest", name: "Restaurantes", averageCents: 100_000, lastMonthCents: 130_000 },
          { id: "mer", name: "Mercado", averageCents: 100_000, lastMonthCents: 105_000 },
        ],
      }),
    );
    expect(tip).toMatchObject({
      kind: "category",
      categoryId: "rest",
      percentUp: 30,
      extraMonthlyCents: 30_000,
    });
    expect(tip.kind === "category" && tip.goal?.reachMonth).toBe(months[8]);

    expect(futureTip(input({ variableMonthlyCents: 300_000 }))).toMatchObject({
      kind: "negative",
      month: months[4],
    });
    expect(futureTip(input({ variableMonthlyCents: 10_000 }))).toMatchObject({
      kind: "save",
      monthlyCents: 5000,
    });
  });

  it("meses entre datas", () => {
    expect(monthsBetween("2026-11", "2027-02")).toBe(3);
  });
});
