import { useEffect } from "react";
import { cobroFromRow, cobroToRow, SIN_DIA, type Cobro, type CobroRow } from "../../../shared/cobro";
import { createStore } from "./store";
import { supabase } from "./supabase";

// Día de cobro de la persona. undefined = cargando; null = nunca lo eligió (se le pregunta al entrar).
const store = createStore<Cobro | null | undefined>(undefined);
const loading = new Set<string>();

async function load(userId: string) {
  if (!supabase || loading.has(userId)) return;
  loading.add(userId);
  const { data, error } = await supabase.from("user_settings").select("pay_day, pay_last_business_day").maybeSingle();
  loading.delete(userId);
  // Si no se pudo leer (sin conexión, o falta la migración 013), se sigue con el mes de calendario sin trabar la entrada.
  store.set(userId, () => (error ? SIN_DIA : data ? cobroFromRow(data as CobroRow) : null));
}

export function useCobro(userId: string | undefined) {
  const value = store.useValue(userId ?? "");
  useEffect(() => {
    if (userId && !store.has(userId)) load(userId);
  }, [userId]);
  return userId ? value : undefined;
}

// Para las pantallas de adentro (ya pasaron por el layout de las pestañas, que lo cargó).
export const useMiCobro = (userId: string) => useCobro(userId) ?? SIN_DIA;

export async function saveCobro(userId: string, cobro: Cobro): Promise<string | null> {
  if (!supabase) return "Falta configurar Supabase.";
  const { error } = await supabase.from("user_settings").upsert({ user_id: userId, ...cobroToRow(cobro), updated_at: new Date().toISOString() });
  if (error) return "No se pudo guardar. Probá de nuevo.";
  store.set(userId, () => cobro);
  return null;
}
