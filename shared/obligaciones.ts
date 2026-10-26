// Lo que conecta gastos fijos y tarjetas con los movimientos (la parte pura; cada app guarda con su cliente).
import { todayISO } from "./format";
import { cycleRange, inCycle, type Cobro } from "./cobro";

// Fecha del gasto que se crea al pagar algo del mes «month»: hoy si hoy cae en ese mes (de cobro a cobro,
// o de calendario sin día de cobro); si no, el día de vencimiento, llevado adentro de ese mes.
export function payDate(month: string, dueDay: number | null, cobro?: Cobro | null) {
  const today = todayISO();
  if (inCycle(today, month, cobro)) return today;
  const due = month + "-" + String(Math.min(28, Math.max(1, dueDay ?? 10))).padStart(2, "0");
  if (inCycle(due, month, cobro)) return due;
  const { from, to } = cycleRange(month, cobro);
  return due < from ? from : to;
}

export const fixedExternalId = (fixedId: string, month: string) => "fijo:" + fixedId + ":" + month;
export const cardExternalId = (cardId: string, month: string) => "tarjeta:" + cardId + ":" + month;

export type LinkedExpense = { externalId: string; description: string; amount: number; category: string; date: string; source: string };

// El gasto que se crea al marcar algo como pagado (con un id propio, para poder borrarlo al desmarcar).
export const linkedExpenseRow = (userId: string, input: LinkedExpense) => ({
  user_id: userId, description: input.description, amount: input.amount, category: input.category, movement_type: "gasto", movement_date: input.date, paid: true, currency: "ARS", source: input.source, external_id: input.externalId,
});
