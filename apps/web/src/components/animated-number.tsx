import { useEffect, useRef, useState } from "react";
import { money } from "@/lib/format";

const reduceMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Desacelera no fim: começa rápido e pousa suave no valor. */
const easeOut = (t: number) => 1 - (1 - t) ** 3;

/**
 * Valor em centavos que "conta" até o número: ao aparecer, sobe de zero; quando muda, vai do
 * anterior ao novo. Sempre inteiro (centavos), formatado a cada quadro. Movimento reduzido: direto.
 * O pai continua com as classes num/num-display (dígitos de largura fixa e modo privacidade).
 */
export function AnimatedNumber({
  value,
  format = money,
  duration = 650,
}: {
  value: number;
  format?: (cents: number) => string;
  duration?: number;
}) {
  const [shown, setShown] = useState(() => (reduceMotion() ? value : 0));
  const from = useRef(shown);

  useEffect(() => {
    if (reduceMotion()) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = from.current;
    const delta = value - start;
    if (delta === 0) return;
    let frame = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      const v = Math.round(start + delta * easeOut(t));
      from.current = v;
      setShown(v);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return <>{format(shown)}</>;
}
