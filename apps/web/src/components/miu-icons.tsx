import type { CategoryIcon } from "@miu/shared";
import { useId } from "react";
import { cn } from "@/lib/cn";

/*
 * Ícones próprios do Miu, estilo "sólido recortado": forma cheia na cor atual e detalhes vazados
 * (como os olhos do gato no logo). O vazado é uma máscara de verdade, então funciona sobre qualquer
 * fundo. Grid 24×24, cantos arredondados, traço 1.8.
 *
 * body: formas cheias · cut: traços vazados dentro da forma · line: traços fora dela
 * dots: círculos cheios [cx, cy, r]
 */
type Glyph = { body?: string; cut?: string; line?: string; dots?: [number, number, number][] };

const c = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
const SQUARE =
  "M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z";

export const GLYPHS: Record<CategoryIcon, Glyph> = {
  house: {
    body: "M4 10.6 11.1 4.7a1.4 1.4 0 0 1 1.8 0L20 10.6v8.2a1.7 1.7 0 0 1-1.7 1.7H5.7A1.7 1.7 0 0 1 4 18.8z",
    cut: "M10 20.5v-4.2a2 2 0 0 1 4 0v4.2",
  },
  "shopping-cart": {
    body: "M5.3 7.5h14.2a.8.8 0 0 1 .8 1l-1.4 6a2 2 0 0 1-1.9 1.5H8.5a2 2 0 0 1-2-1.6z",
    cut: "M9.5 11.2h6",
    line: "M2.8 4.2h1.6a1 1 0 0 1 1 .8l.6 2.5",
    dots: [
      [9, 20.2, 1.5],
      [16.5, 20.2, 1.5],
    ],
  },
  utensils: {
    body: "M3.5 11.5h17a.5.5 0 0 1 .5.6A9 9 0 0 1 3 12.1a.5.5 0 0 1 .5-.6z",
    cut: "M7.5 14.8c1.1 1.3 2.7 2 4.5 2",
    line: "M9 3.8c-.9 1 .9 2.1 0 3.2M12.5 3.2c-.9 1.1.9 2.3 0 3.4M16 3.8c-.9 1 .9 2.1 0 3.2",
  },
  car: {
    body: "M3.8 16.2v-3.4l1.9-4.6a2 2 0 0 1 1.9-1.3h8.8a2 2 0 0 1 1.9 1.3l1.9 4.6v3.4a1 1 0 0 1-1 1H4.8a1 1 0 0 1-1-1z",
    cut: "M6.4 12.3h11.2M7.6 14.6h.01M16.4 14.6h.01",
    line: "M6.8 17.2v1.6M17.2 17.2v1.6",
  },
  "heart-pulse": {
    body: "M12 20.2s-7.8-4.5-7.8-10.3A4.4 4.4 0 0 1 12 7.3a4.4 4.4 0 0 1 7.8 2.6c0 5.8-7.8 10.3-7.8 10.3z",
    cut: "M7.6 12.4h2.1l1.3-2.3 2 4.3 1.3-2h2.1",
  },
  clapperboard: {
    body: "M3.5 8.2a1.7 1.7 0 0 1 1.7-1.7h13.6a1.7 1.7 0 0 1 1.7 1.7v1.6a2.2 2.2 0 0 0 0 4.4v1.6a1.7 1.7 0 0 1-1.7 1.7H5.2a1.7 1.7 0 0 1-1.7-1.7v-1.6a2.2 2.2 0 0 0 0-4.4z",
    cut: "M14.8 7.6v1.4M14.8 11.3v1.4M14.8 15v1.4",
  },
  "shopping-bag": {
    body: "M5.2 8.6h13.6a.8.8 0 0 1 .8.9l-1 9.7a1.6 1.6 0 0 1-1.6 1.4H7a1.6 1.6 0 0 1-1.6-1.4l-1-9.7a.8.8 0 0 1 .8-.9z",
    cut: "M9 12.2a3 3 0 0 0 6 0",
    line: "M8.8 8.6V7.2a3.2 3.2 0 0 1 6.4 0v1.4",
  },
  tv: {
    body: "M3.5 7.6A2.4 2.4 0 0 1 5.9 5.2h12.2a2.4 2.4 0 0 1 2.4 2.4v7.8a2.4 2.4 0 0 1-2.4 2.4H5.9a2.4 2.4 0 0 1-2.4-2.4z",
    cut: "M10.6 9.4v4.2l3.6-2.1z",
    line: "M9 20.6h6",
  },
  "graduation-cap": {
    body: "M2.8 9.3 11.4 5.2a1.4 1.4 0 0 1 1.2 0l8.6 4.1-8.6 4.1a1.4 1.4 0 0 1-1.2 0z",
    cut: "M12 9.3h.01",
    line: "M6.5 11.4v3.9c0 1.5 2.5 3.1 5.5 3.1s5.5-1.6 5.5-3.1v-3.9M21.2 9.3v5",
  },
  briefcase: {
    body: "M3.5 9a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z",
    cut: "M10.5 12.5h3",
    line: "M9 7V5.6A1.6 1.6 0 0 1 10.6 4h2.8A1.6 1.6 0 0 1 15 5.6V7",
  },
  zap: {
    body: "M13.2 2.8 5.6 13a.8.8 0 0 0 .6 1.3H11l-1.2 6.9a.3.3 0 0 0 .5.2l7.6-10.2a.8.8 0 0 0-.6-1.3h-4.8l1.2-6.9a.3.3 0 0 0-.5-.2z",
  },
  "trending-up": { body: SQUARE, cut: "M7.5 15.5l3-3.2 2.2 2 3.8-4.3M14 9.8h2.6v2.6" },
  "piggy-bank": {
    body: "M5 12.5c0-3.6 3.3-6 7.3-6 1.5 0 2.9.3 4 .9l2.2-1.2v2.9a5.6 5.6 0 0 1 1.3 2.4h1.2v3h-1.4a6 6 0 0 1-2.1 2.6V20h-2.8v-1.4a9 9 0 0 1-3 0V20H8.9v-1.9C6.5 16.9 5 14.9 5 12.5z",
    cut: "M16 11.2h.01M10.4 9h3",
    line: "M5 12.5c-1.2 0-1.9-.8-1.9-1.7",
  },
  gift: {
    body: "M4.5 11.8h15v6.8A1.4 1.4 0 0 1 18.1 20H5.9a1.4 1.4 0 0 1-1.4-1.4zM3.5 8.4A1.4 1.4 0 0 1 4.9 7h14.2a1.4 1.4 0 0 1 1.4 1.4v2.4h-17z",
    cut: "M12 7v13",
    line: "M12 7C10.8 4.2 7.4 3.7 7.4 5.8 7.4 7 10 7 12 7zm0 0c1.2-2.8 4.6-3.3 4.6-1.2C16.6 7 14 7 12 7z",
  },
  plane: {
    body: "M4 9.2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9.1a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z",
    cut: "M8.4 7.2v13.1M15.6 7.2v13.1",
    line: "M9.2 7.2V5.6a1.5 1.5 0 0 1 1.5-1.5h2.6a1.5 1.5 0 0 1 1.5 1.5v1.6",
  },
  "paw-print": {
    body: `M12 12.3c-2.9 0-5.1 2.3-5.1 4.4 0 1.5 1.1 2.3 2.5 2.3 1 0 1.6-.5 2.6-.5s1.6.5 2.6.5c1.4 0 2.5-.8 2.5-2.3 0-2.1-2.2-4.4-5.1-4.4z${c(6.8, 10.6, 1.7)}${c(10, 6.9, 1.7)}${c(14, 6.9, 1.7)}${c(17.2, 10.6, 1.7)}`,
  },
  baby: {
    body: c(12, 13, 7.5),
    cut: "M9.3 12.4h.01M14.7 12.4h.01M10 15.6c1.1.9 2.9.9 4 0",
    line: "M12 5.5c0-1.4 1.3-2.1 2.4-1.5",
  },
  dumbbell: {
    body: "M3 9.5a1 1 0 0 1 1-1h1.6a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM6.6 7.5a1 1 0 0 1 1-1h.8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-.8a1 1 0 0 1-1-1zM21 9.5a1 1 0 0 0-1-1h-1.6a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1H20a1 1 0 0 0 1-1zM17.4 7.5a1 1 0 0 0-1-1h-.8a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h.8a1 1 0 0 0 1-1z",
    line: "M9.4 12h5.2",
  },
  receipt: {
    body: "M5.5 3.8h13v16.4l-2.2-1.4-2.1 1.4-2.2-1.4-2.2 1.4-2.1-1.4-2.2 1.4z",
    cut: "M8.8 8.5h6.4M8.8 11.5h6.4M8.8 14.5h3.8",
  },
  shirt: {
    body: "M8.5 4 4 6.3a1 1 0 0 0-.5 1.2l1.2 3.3a.8.8 0 0 0 1 .5l1.3-.5V19a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-8.2l1.3.5a.8.8 0 0 0 1-.5l1.2-3.3a1 1 0 0 0-.5-1.2L15.5 4a3.5 3.5 0 0 1-7 0z",
  },
  fuel: {
    body: "M5 5.5A1.5 1.5 0 0 1 6.5 4h6A1.5 1.5 0 0 1 14 5.5V20H5z",
    cut: "M7.6 7.4h3.8v3.2H7.6z",
    line: "M14 9.5h1.5a1.5 1.5 0 0 1 1.5 1.5v4.5a1.3 1.3 0 0 0 2.6 0V8.6l-2.2-2.2M3.8 20h11.4",
  },
  coffee: {
    body: "M4.5 9h11.5v6a4.5 4.5 0 0 1-4.5 4.5H9A4.5 4.5 0 0 1 4.5 15z",
    cut: "M7.4 12.2v2.4",
    line: "M16 10.5h1.2a2.6 2.6 0 0 1 0 5.2H16M8.5 3.5c-.8.9.8 1.8 0 2.8M12 3.5c-.8.9.8 1.8 0 2.8",
  },
  smartphone: {
    body: "M6.5 4.5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2z",
    cut: "M10.5 18.3h3",
  },
  wrench: {
    body: "M3.5 10a1.5 1.5 0 0 1 1.5-1.5h14a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z",
    cut: "M3.5 13.5h17M10.5 12.5v2M13.5 12.5v2",
    line: "M9 8.5V6.6A1.6 1.6 0 0 1 10.6 5h2.8A1.6 1.6 0 0 1 15 6.6v1.9",
  },
  ellipsis: { body: `${c(6, 12, 2)}${c(12, 12, 2)}${c(18, 12, 2)}` },

  // novos
  pill: {
    body: "M14.4 4.9a3.6 3.6 0 0 1 5.1 5.1l-9.5 9.5a3.6 3.6 0 0 1-5.1-5.1z",
    cut: "M9.7 9.7l4.6 4.6",
  },
  sparkles: {
    body: "M11 3.5c.6 3.6 2.1 5.1 5.7 5.7-3.6.6-5.1 2.1-5.7 5.7-.6-3.6-2.1-5.1-5.7-5.7 3.6-.6 5.1-2.1 5.7-5.7zM17.5 13.5c.3 1.9 1.1 2.7 3 3-1.9.3-2.7 1.1-3 3-.3-1.9-1.1-2.7-3-3 1.9-.3 2.7-1.1 3-3zM6.5 15.5c.2 1.3.7 1.8 2 2-1.3.2-1.8.7-2 2-.2-1.3-.7-1.8-2-2 1.3-.2 1.8-.7 2-2z",
  },
  shield: {
    body: "M12 3.2 19 6v5.6c0 4.4-3 7.6-7 9.2-4-1.6-7-4.8-7-9.2V6z",
    cut: "M9 12.2l2.1 2.1 3.9-4",
  },
  droplet: {
    body: "M12 3.5c3.3 3.9 6 7.1 6 10.3a6 6 0 0 1-12 0c0-3.2 2.7-6.4 6-10.3z",
    cut: "M9.3 14.2a2.8 2.8 0 0 0 2.4 2.6",
  },
  wifi: { body: SQUARE, cut: "M7.2 11a6.8 6.8 0 0 1 9.6 0M9.4 13.4a3.6 3.6 0 0 1 5.2 0M12 16.2h.01" },
  gamepad: {
    body: "M7.2 7h9.6a4.2 4.2 0 0 1 4.1 3.4l.9 4.9a2.5 2.5 0 0 1-4.4 2l-1.8-2.3H8.4l-1.8 2.3a2.5 2.5 0 0 1-4.4-2l.9-4.9A4.2 4.2 0 0 1 7.2 7z",
    cut: "M7.5 10v3M6 11.5h3M15.5 10.8h.01M17.5 12.4h.01",
  },
  music: {
    body: `M10.3 6.3l9.5-2v3.4l-9.5 2z${c(7.5, 17.5, 2.8)}${c(17, 15.5, 2.8)}`,
    line: "M10.3 17.5V7.5M19.8 15.5V5.5",
  },
  book: {
    body: "M5 5.5A2.5 2.5 0 0 1 7.5 3H19v18H7.5A2.5 2.5 0 0 1 5 18.5z",
    cut: "M5.8 17.2c.4-.5 1-.7 1.7-.7H19M9.5 7.5h5.5",
  },
  bus: {
    body: "M5 6a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z",
    cut: "M5 11h14M8 14.5h.01M16 14.5h.01M9.5 5.8h5",
    line: "M7.5 18v2M16.5 18v2",
  },
  bike: {
    line: `${c(5.5, 16.5, 3.3)}${c(18.5, 16.5, 3.3)}M5.5 16.5l3.6-6.8h6.4l3 6.8M9.1 9.7l3.2 6.8 3.2-6.8M13.8 6.5h2.4l-.7 3.2M7.8 7.6h3`,
    dots: [[12.3, 16.5, 1.3]],
  },
  beer: {
    body: "M5 8.5h10v10A2.5 2.5 0 0 1 12.5 21h-5A2.5 2.5 0 0 1 5 18.5zM4.5 7.8a3 3 0 0 1 2.9-3.3 3.5 3.5 0 0 1 5.4-.6 2.8 2.8 0 0 1 2.7 3.9z",
    cut: "M8.2 11.5v6.5M11.8 11.5v6.5M4.5 8.2h11",
    line: "M15 10.5h1.6a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H15",
  },
  "credit-card": {
    body: "M2.8 7.2A2.2 2.2 0 0 1 5 5h14a2.2 2.2 0 0 1 2.2 2.2v9.6A2.2 2.2 0 0 1 19 19H5a2.2 2.2 0 0 1-2.2-2.2z",
    cut: "M2.8 9.6h18.4M6.2 15h3",
  },
  banknote: {
    body: "M3 7.6A1.6 1.6 0 0 1 4.6 6h14.8A1.6 1.6 0 0 1 21 7.6v8.8a1.6 1.6 0 0 1-1.6 1.6H4.6A1.6 1.6 0 0 1 3 16.4z",
    cut: `${c(12, 12, 2.5)}M6.6 9.6h.01M17.4 14.4h.01`,
  },
  coins: {
    body: "M4 8.5c0-1.7 3.1-3 7-3s7 1.3 7 3v7c0 1.7-3.1 3-7 3s-7-1.3-7-3z",
    cut: "M4 8.6c0 1.7 3.1 3 7 3s7-1.3 7-3M4 12.1c0 1.7 3.1 3 7 3s7-1.3 7-3",
    line: "M18.6 11.2c1.4.5 2.4 1.3 2.4 2.3 0 1.7-3.1 3-7 3",
  },
  percent: {
    body: c(12, 12, 8.5),
    cut: `M9 15l6-6${c(9.3, 9.3, 1.1)}${c(14.7, 14.7, 1.1)}`,
  },
};

/** Nome em português de cada ícone (para leitores de tela e busca). */
export const ICON_LABELS: Record<CategoryIcon, string> = {
  house: "Casa",
  "shopping-cart": "Mercado",
  utensils: "Comida",
  car: "Carro",
  "heart-pulse": "Saúde",
  clapperboard: "Lazer",
  "shopping-bag": "Compras",
  tv: "Assinatura",
  "graduation-cap": "Educação",
  briefcase: "Trabalho",
  zap: "Energia",
  "trending-up": "Investimento",
  "piggy-bank": "Poupança",
  gift: "Presente",
  plane: "Viagem",
  "paw-print": "Pet",
  baby: "Filhos",
  dumbbell: "Academia",
  receipt: "Contas",
  shirt: "Roupas",
  fuel: "Combustível",
  coffee: "Café",
  smartphone: "Celular",
  wrench: "Manutenção",
  ellipsis: "Outros",
  pill: "Farmácia",
  sparkles: "Beleza",
  shield: "Seguro",
  droplet: "Água",
  wifi: "Internet",
  gamepad: "Jogos",
  music: "Música",
  book: "Livros",
  bus: "Transporte público",
  bike: "Bicicleta",
  beer: "Bar",
  "credit-card": "Cartão",
  banknote: "Dinheiro",
  coins: "Rendimentos",
  percent: "Impostos",
};

/** Desenha um ícone do Miu. Herda a cor do texto (currentColor) e o tamanho pela className. */
export function MiuIcon({ name, className }: { name: CategoryIcon; className?: string }) {
  const g = GLYPHS[name] ?? GLYPHS.ellipsis;
  const mask = `miu-${useId().replace(/:/g, "")}`;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      {g.cut ? (
        <mask id={mask} maskUnits="userSpaceOnUse" x="-2" y="-2" width="28" height="28">
          <rect x="-2" y="-2" width="28" height="28" fill="white" />
          <path d={g.cut} stroke="black" strokeWidth="1.9" />
        </mask>
      ) : null}
      {g.body ? (
        <path
          d={g.body}
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="1.2"
          mask={g.cut ? `url(#${mask})` : undefined}
        />
      ) : null}
      {g.line ? <path d={g.line} stroke="currentColor" strokeWidth="1.8" /> : null}
      {g.dots?.map(([x, y, r]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="currentColor" />
      ))}
    </svg>
  );
}
