import { linkedExpenseRow, type LinkedExpense } from "../../../shared/obligaciones";
import { supabase } from "./supabase";

// Al marcar un fijo o una tarjeta como pagado se crea el gasto (con un id propio) y al desmarcarlo se borra.
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
