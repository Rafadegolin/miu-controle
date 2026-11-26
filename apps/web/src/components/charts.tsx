import type { PaceStatus } from "@miu/shared";
import { type ReactNode, useId } from "react";

/* ---------- Donut ---------- */

export type DonutSegment = { key: string; value: number; color: string; label?: string };

/** Rosca em SVG puro. Segmentos com valor 0 são ignorados; um pequeno espaço separa as fatias. */
export function Donut({
  segments,
  size = 220,
  thickness = 22,
  children,
}: {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  children?: ReactNode;
}) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  const gap = total > 0 && segments.filter((s) => s.value > 0).length > 1 ? 3 : 0;
  let offset = 0;
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90" width={size} height={size} aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--surface-2)"
          strokeWidth={thickness}
        />
        {total > 0
          ? segments
              .filter((s) => s.value > 0)
              .map((s) => {
                const len = (s.value / total) * c;
                const dash = Math.max(0, len - gap);
                const el = (
                  <circle
                    key={s.key}
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={thickness}
                    strokeDasharray={`${dash} ${c - dash}`}
                    strokeDashoffset={-offset}
                  >
                    <title>{s.label}</title>
                  </circle>
                );
                offset += len;
                return el;
              })
          : null}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

/* ---------- Ritmo de gastos ---------- */

const STATUS_COLOR: Record<PaceStatus, string> = {
  below: "var(--primary)",
  near: "var(--warn)",
  above: "var(--danger)",
};

/**
 * Gasto acumulado do mês (linha cheia, cor pela situação) vs. mês passado (tracejado).
 * Eixo X = dias do mês; termina num ponto no dia de hoje.
 */
export function PaceChart({
  current,
  previous,
  daysInMonth,
  status,
  badge,
  height = 150,
}: {
  current: number[];
  previous: number[];
  daysInMonth: number;
  status: PaceStatus;
  badge?: ReactNode;
  height?: number;
}) {
  const id = useId().replace(/:/g, "");
  const W = 320;
  const H = height;
  const pad = 8;
  const max = Math.max(1, ...current, ...previous) * 1.08;
  const x = (i: number) => pad + (i / Math.max(1, daysInMonth - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const path = (arr: number[]) =>
    arr.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const color = STATUS_COLOR[status];
  const last = current.length - 1;
  const lastX = last >= 0 ? x(last) : pad;
  const lastY = last >= 0 ? y(current[last] ?? 0) : H - pad;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full overflow-visible"
        role="img"
        aria-label="Gasto acumulado do mês comparado ao mês passado"
      >
        <defs>
          <linearGradient id={`area-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {previous.length > 1 ? (
          <path
            d={path(previous)}
            fill="none"
            stroke="var(--line-strong)"
            strokeWidth="1.6"
            strokeDasharray="4 5"
          />
        ) : null}
        {current.length > 1 ? (
          <>
            <path
              d={`${path(current)} L${lastX.toFixed(1)} ${H - pad} L${x(0).toFixed(1)} ${H - pad} Z`}
              fill={`url(#area-${id})`}
            />
            <path
              d={path(current)}
              fill="none"
              stroke={color}
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </>
        ) : null}
        {last >= 0 ? (
          <circle cx={lastX} cy={lastY} r="5.5" fill="var(--surface)" stroke={color} strokeWidth="2.5" />
        ) : null}
      </svg>
      {badge && last >= 0 ? (
        <div
          className="pointer-events-none absolute -translate-x-1/2 translate-y-3"
          style={{ left: `${Math.min(80, Math.max(20, (lastX / W) * 100))}%`, top: `${(lastY / H) * 100}%` }}
        >
          {badge}
        </div>
      ) : null}
    </div>
  );
}

export const paceTone = (s: PaceStatus) =>
  s === "below" ? "bg-primary text-on-primary" : s === "near" ? "bg-warn text-white" : "bg-danger text-white";
