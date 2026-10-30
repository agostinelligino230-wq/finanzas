import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { payeeFromRow, payeeKey, type Payee, type PayeeRow } from "../../shared/destinatarios";
import type { Movement } from "../../shared/movimientos";
export { findPayee, payeeKey, type Payee } from "../../shared/destinatarios";

// Destinatarios frecuentes: lo que se le asigna a un CBU, CVU o alias se ve solo en las próximas transferencias.
export function usePayees(userId: string) {
  const [payees, setPayees] = useState<Payee[]>([]);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.from("payees").select("*").then(({ data, error }) => { if (active && !error) setPayees(((data ?? []) as PayeeRow[]).map(payeeFromRow)); });
    return () => { active = false; };
  }, [userId]);

  const save = async (item: Movement, input: { icon?: string | null; color?: string | null; placeName?: string | null }) => {
    const match = payeeKey(item);
    if (!supabase || !match) return false;
    const { data, error } = await supabase.from("payees").upsert({
      user_id: userId, match, name: item.counterpartyName,
      ...(input.icon !== undefined ? { icon: input.icon } : {}), ...(input.color !== undefined ? { color: input.color } : {}), ...(input.placeName !== undefined ? { place_name: input.placeName } : {}),
    }, { onConflict: "user_id,match" }).select().single();
    if (error || !data) return false;
    const saved = payeeFromRow(data as PayeeRow);
    setPayees((current) => [...current.filter((entry) => entry.id !== saved.id), saved]);
    return true;
  };

  return { payees, save };
}
