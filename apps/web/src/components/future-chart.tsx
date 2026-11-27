import { useId, useRef, useState } from "react";
import { money, monthShort } from "@/lib/format";

export type FutureMarker = { index: number; label: string; tone: "goal" | "bill" | "negative" };

const TONE = { goal: "var(--primary)", bill: "var(--warn)", negative: "var(--danger)" };

/**
 * Patrimônio mês a mês. Sem cenário: uma linha cheia. Com cenário: "sem mudanças" tracejada e o
 * cenário cheio por cima. Marcos como pontos; tocar ou passar o mouse mostra o mês.
 */
export function FutureChart({
  months,
  base,
  scenario,
  markers = [],
  height = 200,
}: {
  months: string[];
  base: number[];
  scenario?: number[] | undefined;
  markers?: FutureMarker[];
  height?: number;
}) {
  const id = useId().replace(/:/g, "");
  const svg = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 340;
  const H = height;
  const padX = 10;
  const padY = 12;
  const main = scenario ?? base;
  const all = [...base, ...(scenario ?? []), 0];
  const hi = Math.max(...all);
  const lo = Math.min(...all);
  const span = Math.max(1, hi - lo) * 1.1;
  const top = hi + (span - (hi - lo)) / 2;
  const n = Math.max(2, months.length);
  const x = (i: number) => padX + (i / (n - 1)) * (W - padX * 2);
  const y = (v: number) => padY + ((top - v) / span) * (H - padY * 2);
  const path = (arr: number[]) =>
    arr.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const baseline = Math.min(H - padY, Math.max(padY, y(0)));

  const pick = (clientX: number) => {
    const r = svg.current?.getBoundingClientRect();
    if (!r) return;
    const px = ((clientX - r.left) / r.width) * W;
    setHover(Math.round(Math.min(n - 1, Math.max(0, ((px - padX) / (W - padX * 2)) * (n - 1)))));
  };
  const h = hover !== null && hover < months.length ? hover : null;

  return (
    <div className="relative select-none">
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-pan-y overflow-visible"
        role="img"
        aria-label="Patrimônio previsto mês a mês"
        onPointerMove={(e) => pick(e.clientX)}
        onPointerDown={(e) => pick(e.clientX)}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`fut-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {lo < 0 ? (
          <line x1={padX} x2={W - padX} y1={y(0)} y2={y(0)} stroke="var(--line-strong)" strokeWidth="1" />
        ) : null}
        <path
          d={`${path(main)} L${x(main.length - 1).toFixed(1)} ${baseline} L${x(0).toFixed(1)} ${baseline} Z`}
          fill={`url(#fut-${id})`}
          className="chart-fade"
          style={{ animationDelay: "500ms" }}
        />
        {scenario ? (
          <path
            d={path(base)}
            fill="none"
            stroke="var(--muted)"
            strokeWidth="2"
            strokeDasharray="4 5"
            strokeLinecap="round"
            className="chart-fade"
          />
        ) : null}
        <path
          key={scenario ? "cen" : "base"}
          d={path(main)}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          pathLength={1}
          className="chart-line"
        />
        {markers.map((m) => (
          <circle
            key={`${m.tone}-${m.index}-${m.label}`}
            cx={x(m.index)}
            cy={y(main[m.index] ?? 0)}
            r="5"
            fill={TONE[m.tone]}
            stroke="var(--surface)"
            strokeWidth="2"
            className="chart-dot"
          >
            <title>{m.label}</title>
          </circle>
        ))}
        {h !== null ? (
          <>
            <line x1={x(h)} x2={x(h)} y1={padY} y2={H - padY} stroke="var(--line-strong)" strokeWidth="1" />
            <circle
              cx={x(h)}
              cy={y(main[h] ?? 0)}
              r="5"
              fill="var(--surface)"
              stroke="var(--primary)"
              strokeWidth="2.5"
            />
          </>
        ) : null}
      </svg>
      {h !== null ? (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-[10px] border border-line bg-surface px-2.5 py-1.5 text-[12.5px] shadow-[var(--shadow-pop)]"
          style={{ left: `${Math.min(82, Math.max(18, (x(h) / W) * 100))}%` }}
        >
          <p className="font-medium">{monthShort(months[h] ?? "")}</p>
          <p className="num">{money(main[h] ?? 0)}</p>
          {scenario ? <p className="num text-muted">sem mudanças {money(base[h] ?? 0)}</p> : null}
          {markers
            .filter((m) => m.index === h)
            .map((m) => (
              <p key={m.label} className="text-fg-2">
                {m.label}
              </p>
            ))}
        </div>
      ) : null}
      <div className="mt-1 flex justify-between text-[12px] text-muted">
        <span>{monthShort(months[0] ?? "")}</span>
        <span>{monthShort(months[Math.floor((months.length - 1) / 2)] ?? "")}</span>
        <span>{monthShort(months.at(-1) ?? "")}</span>
      </div>
    </div>
  );
}
