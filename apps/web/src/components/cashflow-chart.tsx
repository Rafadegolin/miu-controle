import type { CashflowMonth } from "@miu/shared";
import { money, monthShort } from "@/lib/format";

/** "R$ 8 mil", "R$ 950" — rótulos curtos do eixo. */
function axisLabel(cents: number) {
  const v = cents / 100;
  if (v >= 1000) return `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return `R$ ${Math.round(v)}`;
}

const STEPS = [
  50_00, 100_00, 200_00, 250_00, 500_00, 1000_00, 2000_00, 2500_00, 5000_00, 10000_00, 20000_00, 50000_00,
];

/**
 * Receitas x despesas por mês, em SVG puro (sem biblioteca de gráficos: zero KB a mais).
 * A parte prevista de cada barra aparece hachurada.
 */
export function CashflowChart({ data, highlight }: { data: CashflowMonth[]; highlight?: string }) {
  const W = 720;
  const H = 260;
  const L = 64;
  const R = 8;
  const T = 12;
  const B = 30;
  const max = Math.max(1, ...data.flatMap((d) => [d.incomeCents, d.expenseCents]));
  const step = STEPS.find((s) => max / s <= 5) ?? 100000_00;
  const top = Math.ceil(max / step) * step;
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  const cw = (W - L - R) / data.length;
  const bw = Math.min(22, cw / 3.2);
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full min-w-[560px]"
      role="img"
      aria-label="Receitas e despesas por mês"
    >
      <defs>
        <pattern
          id="hatch-in"
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="3" height="6" fill="var(--accent-fill)" opacity="0.55" />
        </pattern>
        <pattern
          id="hatch-out"
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="3" height="6" fill="var(--fg-2)" opacity="0.45" />
        </pattern>
      </defs>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" />
          <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">
            {axisLabel(v)}
          </text>
        </g>
      ))}
      {data.map((d, i) => {
        const cx = L + cw * i + cw / 2;
        const bar = (
          value: number,
          planned: number,
          x: number,
          solid: string,
          hatch: string,
          label: string,
        ) => {
          const posted = value - planned;
          return (
            <g>
              <title>{`${label} ${monthShort(d.month)}: ${money(value)}${planned ? ` (${money(planned)} previsto)` : ""}`}</title>
              <rect
                x={x}
                y={y(posted)}
                width={bw}
                height={Math.max(0, y(0) - y(posted))}
                rx="3"
                fill={solid}
              />
              {planned > 0 ? (
                <rect
                  x={x}
                  y={y(value)}
                  width={bw}
                  height={Math.max(0, y(posted) - y(value))}
                  fill={`url(#${hatch})`}
                />
              ) : null}
            </g>
          );
        };
        return (
          <g key={d.month}>
            {bar(
              d.incomeCents,
              d.plannedIncomeCents,
              cx - bw - 2,
              "var(--accent-fill)",
              "hatch-in",
              "Receitas",
            )}
            {bar(d.expenseCents, d.plannedExpenseCents, cx + 2, "var(--fg-2)", "hatch-out", "Despesas")}
            <text
              x={cx}
              y={H - 10}
              textAnchor="middle"
              fontSize="11"
              fill={d.month === highlight ? "var(--fg)" : "var(--muted)"}
              fontWeight={d.month === highlight ? 600 : 400}
            >
              {monthShort(d.month)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
