import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { readCache, writeCache } from "./cache";

export type MovementType = "gasto" | "ingreso";
export type Movement = { id: string; description: string; amount: number; category: string; date: string; createdAt: string; type: MovementType; paid: boolean };
export type NewMovement = { description: string; amount: number; category: string; date: string; type: MovementType; paid: boolean };
type MovementRow = { id: string; description: string; amount: number | string; category: string; movement_type: MovementType; movement_date: string; paid: boolean; created_at: string };

export const fromRow = (row: MovementRow): Movement => ({ id: row.id, description: row.description, amount: Number(row.amount), category: row.category, date: row.movement_date, createdAt: row.created_at, type: row.movement_type, paid: row.paid });

const sortMovements = (list: Movement[]) => [...list].sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)));

export function useMovements(userId: string) {
  const [movements, setMovements] = useState<Movement[]>(() => readCache<Movement[]>("movements", userId) ?? (readCache<MovementRow[]>("raw:movements", userId) ?? []).map(fromRow));
  const [error, setError] = useState("");

  useEffect(() => { writeCache("movements", userId, movements); }, [movements, userId]);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.from("movements").select("*").order("movement_date", { ascending: false }).order("created_at", { ascending: false }).then(({ data, error: loadError }) => {
      if (!active) return;
      if (loadError) setError("No se pudieron cargar los movimientos. Revisá tu conexión.");
      else setMovements(((data ?? []) as MovementRow[]).map(fromRow));
    });
    return () => { active = false; };
  }, [userId]);

  const add = async (input: NewMovement) => {
    if (!supabase) return false;
    const { data, error: saveError } = await supabase.from("movements").insert({ user_id: userId, description: input.description, amount: input.amount, category: input.category, movement_type: input.type, movement_date: input.date, paid: input.paid }).select().single();
    if (saveError || !data) { setError("No se pudo guardar. Probá de nuevo."); return false; }
    setError("");
    setMovements((current) => sortMovements([fromRow(data as MovementRow), ...current]));
    return true;
  };

  const togglePaid = async (item: Movement) => {
    if (!supabase) return;
    const { error: saveError } = await supabase.from("movements").update({ paid: !item.paid }).eq("id", item.id);
    if (saveError) { setError("No se pudo actualizar el movimiento."); return; }
    setMovements((current) => current.map((movement) => (movement.id === item.id ? { ...movement, paid: !movement.paid } : movement)));
  };

  const remove = async (item: Movement) => {
    if (!supabase) return;
    const { error: saveError } = await supabase.from("movements").delete().eq("id", item.id);
    if (saveError) { setError("No se pudo eliminar el movimiento."); return; }
    setMovements((current) => current.filter((movement) => movement.id !== item.id));
  };

  return { movements, error, add, togglePaid, remove };
}

// "luz", "gas"... sirve para diferenciar dentro de una misma categoría
export const hasDetail = (item: { description: string }, categoryName: string) => {
  const text = item.description.trim().toLowerCase();
  return text !== "" && text !== "gasto" && text !== "ingreso" && text !== "ahorro" && text !== categoryName.toLowerCase();
};
