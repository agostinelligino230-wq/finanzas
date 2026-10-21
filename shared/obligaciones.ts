// Lo que conecta gastos fijos y tarjetas con los movimientos (la parte pura; cada app guarda con su cliente).
import { currentMonthISO, todayISO } from "./format";

export const payDate = (month: string, dueDay: number | null) =>
  month === currentMonthISO() ? todayISO() : month + "-" + String(Math.min(28, Math.max(1, dueDay ?? 10))).padStart(2, "0");

export const fixedExternalId = (fixedId: string, month: string) => "fijo:" + fixedId + ":" + month;
export const cardExternalId = (cardId: string, month: string) => "tarjeta:" + cardId + ":" + month;

export type LinkedExpense = { externalId: string; description: string; amount: number; category: string; date: string; source: string };

// El gasto que se crea al marcar algo como pagado (con un id propio, para poder borrarlo al desmarcar).
export const linkedExpenseRow = (userId: string, input: LinkedExpense) => ({
  user_id: userId, description: input.description, amount: input.amount, category: input.category, movement_type: "gasto", movement_date: input.date, paid: true, currency: "ARS", source: input.source, external_id: input.externalId,
});
