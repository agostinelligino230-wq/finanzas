import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import { readCache, writeCache } from "./cache";
import { MOVEMENT_COLUMNS, counts, fromRow, sortMovements, type Movement, type MovementRow, type NewMovement } from "../../shared/movimientos";
// Tipos y reglas compartidos con la app del celular (shared/movimientos.ts).
export * from "../../shared/movimientos";

// Si la base todavía no tiene el registro de avisos (migración 009 sin correr), se cargan igual, sin las vías.
export async function loadMovementRows() {
  if (!supabase) return { data: [] as MovementRow[], error: null };
  const query = (columns: string) => supabase!.from("movements").select(columns).order("movement_date", { ascending: false }).order("created_at", { ascending: false });
  const first = await query(MOVEMENT_COLUMNS);
  if (!first.error) return { data: (first.data ?? []) as unknown as MovementRow[], error: null };
  const plain = await query("*");
  return { data: (plain.data ?? []) as unknown as MovementRow[], error: plain.error };
}

export function useMovements(userId: string) {
  const [all, setAll] = useState<Movement[]>(() => readCache<Movement[]>("movements", userId) ?? (readCache<MovementRow[]>("raw:movements", userId) ?? []).map(fromRow));
  const [error, setError] = useState("");

  useEffect(() => { writeCache("movements", userId, all); }, [all, userId]);

  const [version, setVersion] = useState(0);
  const reload = () => setVersion((value) => value + 1);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    loadMovementRows().then(({ data, error: loadError }) => {
      if (!active) return;
      if (loadError) setError("No se pudieron cargar los movimientos. Revisá tu conexión.");
      else setAll(data.map(fromRow));
    });
    return () => { active = false; };
  }, [userId, version]);

  // Al instante: lo que entra por mail o por notificación aparece sin recargar.
  useEffect(() => {
    const client = supabase;
    if (!client) return;
    const channel = client.channel("movimientos:" + userId + ":" + Math.random().toString(36).slice(2))
      .on("postgres_changes", { event: "*", schema: "public", table: "movements", filter: "user_id=eq." + userId }, (payload) => {
        if (payload.eventType === "DELETE") {
          // Realtime no filtra por usuario en los borrados: solo se saca un id que ya estaba en la lista.
          const id = (payload.old as { id?: string }).id;
          if (id) setAll((current) => current.filter((item) => item.id !== id));
          return;
        }
        const id = (payload.new as { id: string }).id;
        client.from("movements").select(MOVEMENT_COLUMNS).eq("id", id).maybeSingle().then(({ data }) => {
          if (!data) return;
          const item = fromRow(data as MovementRow);
          setAll((current) => sortMovements([item, ...current.filter((entry) => entry.id !== item.id)]));
        });
      })
      .subscribe();
    return () => { client.removeChannel(channel); };
  }, [userId]);

  const movements = useMemo(() => all.filter(counts), [all]);
  const toReview = useMemo(() => all.filter((item) => !counts(item)), [all]);

  const add = async (input: NewMovement) => {
    if (!supabase) return false;
    const { data, error: saveError } = await supabase.from("movements").insert({ user_id: userId, description: input.description, amount: input.amount, category: input.category, movement_type: input.type, movement_date: input.date, paid: input.paid, ...(input.currency === "USD" ? { currency: "USD", original_amount: input.original, exchange_rate: input.rate } : {}) }).select().single();
    if (saveError || !data) { setError("No se pudo guardar. Probá de nuevo."); return false; }
    setError("");
    setAll((current) => sortMovements([fromRow(data as MovementRow), ...current.filter((item) => item.id !== (data as MovementRow).id)]));
    return true;
  };

  const togglePaid = async (item: Movement) => {
    if (!supabase) return;
    const { error: saveError } = await supabase.from("movements").update({ paid: !item.paid }).eq("id", item.id);
    if (saveError) { setError("No se pudo actualizar el movimiento."); return; }
    setAll((current) => current.map((movement) => (movement.id === item.id ? { ...movement, paid: !movement.paid } : movement)));
  };

  // Confirmar un dudoso: desde ahora suma.
  const confirm = async (item: Movement) => {
    if (!supabase) return;
    const confirmedAt = new Date().toISOString();
    const { error: saveError } = await supabase.from("movements").update({ confirmed_at: confirmedAt }).eq("id", item.id);
    if (saveError) { setError("No se pudo confirmar el movimiento."); return; }
    setAll((current) => current.map((movement) => (movement.id === item.id ? { ...movement, confirmedAt } : movement)));
  };

  const remove = async (item: Movement) => {
    if (!supabase) return;
    const { error: saveError } = await supabase.from("movements").delete().eq("id", item.id);
    if (saveError) { setError("No se pudo eliminar el movimiento."); return; }
    setAll((current) => current.filter((movement) => movement.id !== item.id));
  };

  return { movements, toReview, error, add, togglePaid, confirm, remove, reload };
}
