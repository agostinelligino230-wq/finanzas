import { supabase } from "./supabase";
import { loadMovementRows } from "./movements";

// Memoria compartida entre pestañas: al volver a una sección se muestra
// al instante lo último que se cargó, y se actualiza en segundo plano.
type Entry = { userId: string; data: unknown };
const store = new Map<string, Entry>();

export function readCache<T>(key: string, userId: string): T | undefined {
  const entry = store.get(key);
  return entry && entry.userId === userId ? (entry.data as T) : undefined;
}

export function writeCache(key: string, userId: string, data: unknown) {
  store.set(key, { userId, data });
}

export function clearCache() {
  store.clear();
}

export function currentMonth() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 7);
}

// Se llama una vez al entrar: trae todo en paralelo para que cada pestaña abra al instante.
export function prefetchAll(userId: string) {
  if (!supabase) return;
  const month = currentMonth();
  loadMovementRows().then(({ data, error }) => { if (!error) writeCache("raw:movements", userId, data); });
  supabase.from("fixed_expenses").select("*").order("created_at", { ascending: false })
    .then(({ data, error }) => { if (!error && data) writeCache("raw:fixed_expenses", userId, data); });
  supabase.from("savings_goals").select("*").order("created_at", { ascending: false })
    .then(({ data, error }) => { if (!error && data) writeCache("raw:savings_goals", userId, data); });
  supabase.from("fixed_expense_payments").select("fixed_expense_id").eq("month", month)
    .then(({ data, error }) => {
      if (!error && data && !readCache("payments:" + month, userId)) writeCache("payments:" + month, userId, (data as { fixed_expense_id: string }[]).map((row) => row.fixed_expense_id));
    });
}
