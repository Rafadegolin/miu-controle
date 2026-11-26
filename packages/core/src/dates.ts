/**
 * Datas de lançamento são strings "YYYY-MM-DD" sem fuso (tipo `date` no Postgres).
 * Meses são "YYYY-MM". Toda aritmética é feita em UTC para não sofrer com horário local.
 */
export type ISODate = string;
export type YearMonth = string;

const pad = (n: number) => String(n).padStart(2, "0");

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function parseDate(date: ISODate): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new RangeError(`Data inválida: ${date}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

/** Monta uma data normalizando o mês e limitando o dia ao fim do mês (31/fev → 28 ou 29/fev). */
export function makeDate(year: number, month: number, day: number): ISODate {
  let y = year;
  let m = month;
  while (m > 12) {
    m -= 12;
    y++;
  }
  while (m < 1) {
    m += 12;
    y--;
  }
  return `${y}-${pad(m)}-${pad(Math.min(day, daysInMonth(y, m)))}`;
}

/** Soma meses mantendo o dia, com clamp (31/jan + 1 mês = 28/fev, nunca 3/mar). */
export function addMonths(date: ISODate, months: number): ISODate {
  const { y, m, d } = parseDate(date);
  return makeDate(y, m + months, d);
}

export function addDays(date: ISODate, days: number): ISODate {
  const { y, m, d } = parseDate(date);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function toYearMonth(date: ISODate): YearMonth {
  return date.slice(0, 7);
}

export function addYearMonth(ym: YearMonth, months: number): YearMonth {
  return makeDate(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) + months, 1).slice(0, 7);
}

/** "Hoje" no fuso do usuário, como data local. */
export function todayIn(timeZone = "America/Sao_Paulo", now = new Date()): ISODate {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
