// Lo que conecta gastos fijos y tarjetas con los movimientos:
// al marcar algo como pagado se crea el gasto (con un id propio) y al desmarcarlo se borra.
import { supabase } from "./supabase";
import { currentMonthISO, todayISO } from "./format";

export const payDate = (month: string, dueDay: number | null) =>
  month === currentMonthISO() ? todayISO() : month + "-" + String(Math.min(28, Math.max(1, dueDay ?? 10))).padStart(2, "0");

export async function addLinkedExpense(userId: string, input: { externalId: string; description: string; amount: number; category: string; date: string; source: string }) {
  if (!supabase) return false;
  const { error } = await supabase.from("movements").upsert(
    { user_id: userId, description: input.description, amount: input.amount, category: input.category, movement_type: "gasto", movement_date: input.date, paid: true, currency: "ARS", source: input.source, external_id: input.externalId },
    { onConflict: "user_id,external_id" },
  );
  return !error;
}

export async function removeLinkedExpense(externalId: string) {
  if (!supabase) return false;
  const { error } = await supabase.from("movements").delete().eq("external_id", externalId);
  return !error;
}

export const fixedExternalId = (fixedId: string, month: string) => "fijo:" + fixedId + ":" + month;
export const cardExternalId = (cardId: string, month: string) => "tarjeta:" + cardId + ":" + month;
