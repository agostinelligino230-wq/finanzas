// Día de cobro: «tu mes» va de un cobro al siguiente (si cobrás el 5, del 5/10 al 4/11), así el sueldo y lo que
// se gasta con él quedan juntos. Lo usan la web y la app del celular. Sin día de cobro, el mes es el de calendario.
import { shiftMonth, todayISO } from "./format";

// dia: 1 a 31 (si el mes no lo tiene, el último). ultimoHabil: el último día hábil del mes.
// Si el día cae sábado o domingo, se cobra el viernes antes. null en los dos: sin día fijo (mes de calendario).
export type Cobro = { dia: number | null; ultimoHabil: boolean };
export type CobroRow = { pay_day: number | null; pay_last_business_day: boolean };

export const SIN_DIA: Cobro = { dia: null, ultimoHabil: false };
export const cobroFromRow = (row: CobroRow): Cobro => ({ dia: row.pay_day, ultimoHabil: row.pay_last_business_day });
export const cobroToRow = (cobro: Cobro): CobroRow => ({ pay_day: cobro.ultimoHabil ? null : cobro.dia, pay_last_business_day: cobro.ultimoHabil });

const tieneDia = (cobro: Cobro | null | undefined): cobro is Cobro => Boolean(cobro && (cobro.ultimoHabil || cobro.dia));
const iso = (date: Date) => date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
const lastDay = (month: string) => new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0, 12).getDate();
const addDays = (day: string, days: number) => {
  const date = new Date(day + "T12:00:00");
  date.setDate(date.getDate() + days);
  return iso(date);
};

// Qué día se cobra en un mes de calendario ("2026-10" → "2026-10-05").
export function diaDeCobro(month: string, cobro: Cobro) {
  const day = cobro.ultimoHabil ? lastDay(month) : Math.min(cobro.dia ?? 1, lastDay(month));
  const date = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, day, 12);
  const weekday = date.getDay();
  if (weekday === 6) date.setDate(date.getDate() - 1);
  if (weekday === 0) date.setDate(date.getDate() - 2);
  return iso(date);
}

// Quien cobra a fin de mes (del 20 en adelante, o el último hábil) vive ese sueldo el mes siguiente:
// lo que cobra el 28/10 es su mes de noviembre. El resto, el mismo mes en que cobra.
const adelantado = (cobro: Cobro) => cobro.ultimoHabil || (cobro.dia ?? 1) >= 20;

// Primer y último día (inclusive) del mes «month» de la persona.
export function cycleRange(month: string, cobro?: Cobro | null) {
  if (!tieneDia(cobro)) return { from: month + "-01", to: month + "-" + String(lastDay(month)).padStart(2, "0") };
  const start = adelantado(cobro) ? shiftMonth(month, -1) : month;
  return { from: diaDeCobro(start, cobro), to: addDays(diaDeCobro(shiftMonth(start, 1), cobro), -1) };
}

export function inCycle(date: string, month: string, cobro?: Cobro | null) {
  if (!tieneDia(cobro)) return date.startsWith(month);
  const { from, to } = cycleRange(month, cobro);
  const day = date.slice(0, 10);
  return day >= from && day <= to;
}

// El mes de la persona en el que cae hoy (o el día que se pase).
export function currentCycle(cobro?: Cobro | null, today = todayISO()) {
  const month = today.slice(0, 7);
  if (!tieneDia(cobro)) return month;
  return [month, shiftMonth(month, 1), shiftMonth(month, -1)].find((candidate) => inCycle(today, candidate, cobro)) ?? month;
}

// "del 5/10 al 4/11" para mostrar debajo del mes. Vacío si es el mes de calendario.
export function cycleText(month: string, cobro?: Cobro | null) {
  if (!tieneDia(cobro)) return "";
  const { from, to } = cycleRange(month, cobro);
  const short = (day: string) => Number(day.slice(8, 10)) + "/" + Number(day.slice(5, 7));
  return "del " + short(from) + " al " + short(to);
}

// "el 5 de cada mes", "el último día hábil" o "sin día fijo".
export function cobroText(cobro: Cobro) {
  if (cobro.ultimoHabil) return "el último día hábil de cada mes";
  return cobro.dia ? "el " + cobro.dia + " de cada mes" : "sin día fijo (mes de calendario)";
}
