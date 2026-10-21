// Lo que conecta gastos fijos y tarjetas con los movimientos:
// al marcar algo como pagado se crea el gasto (con un id propio) y al desmarcarlo se borra.
import { supabase } from "./supabase";
import { linkedExpenseRow, type LinkedExpense } from "../../shared/obligaciones";
// La parte pura vive en shared/obligaciones.ts (la usa también la app del celular).
export { cardExternalId, fixedExternalId, payDate } from "../../shared/obligaciones";

export async function addLinkedExpense(userId: string, input: LinkedExpense) {
  if (!supabase) return false;
  const { error } = await supabase.from("movements").upsert(linkedExpenseRow(userId, input), { onConflict: "user_id,external_id" });
  return !error;
}

export async function removeLinkedExpense(externalId: string) {
  if (!supabase) return false;
  const { error } = await supabase.from("movements").delete().eq("external_id", externalId);
  return !error;
}
