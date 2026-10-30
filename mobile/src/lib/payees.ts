import { useCallback, useEffect } from "react";
import { payeeFromRow, payeeKey, type Payee, type PayeeRow } from "../../../shared/destinatarios";
import type { Movement } from "../../../shared/movimientos";
import { createStore } from "./store";
import { supabase } from "./supabase";

// Destinatarios frecuentes: el ícono, el color y el lugar que la persona le puso a un CBU, CVU o alias.
const store = createStore<Payee[]>([]);
const loading = new Set<string>();

async function load(userId: string) {
  if (!supabase || loading.has(userId)) return;
  loading.add(userId);
  const { data, error } = await supabase.from("payees").select("*");
  loading.delete(userId);
  // Sin la migración 015 sigue todo igual, sin destinatarios.
  store.set(userId, (current) => (error ? current : ((data ?? []) as PayeeRow[]).map(payeeFromRow)));
}

export function usePayees(userId: string) {
  const payees = store.useValue(userId);
  useEffect(() => { if (!store.has(userId)) load(userId); }, [userId]);

  // Guarda los datos de la otra parte de este movimiento; lo que no viene queda como estaba.
  const savePayee = useCallback(async (item: Movement, input: { icon?: string | null; color?: string | null; placeName?: string | null }) => {
    const match = payeeKey(item);
    if (!supabase || !match) return false;
    const { data, error } = await supabase.from("payees").upsert({
      user_id: userId, match, name: item.counterpartyName,
      ...(input.icon !== undefined ? { icon: input.icon } : {}), ...(input.color !== undefined ? { color: input.color } : {}), ...(input.placeName !== undefined ? { place_name: input.placeName } : {}),
    }, { onConflict: "user_id,match" }).select().single();
    if (error || !data) return false;
    const saved = payeeFromRow(data as PayeeRow);
    store.set(userId, (current) => [...current.filter((entry) => entry.match !== match), saved]);
    return true;
  }, [userId]);

  return { payees, savePayee };
}
