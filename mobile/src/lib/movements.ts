import { useCallback, useEffect, useMemo, useState } from "react";
import { MOVEMENT_COLUMNS, counts, fromRow, rereadErrorMessage, sortMovements, type Movement, type MovementRow, type NewMovement } from "../../../shared/movimientos";
import { toast } from "../components/Toast";
import { supabase } from "./supabase";

// Memoria entre pestañas: cada pantalla abre con lo último que se cargó y se actualiza sola.
const cache = new Map<string, Movement[]>();
const listeners = new Set<() => void>();
const publish = (userId: string, list: Movement[]) => { cache.set(userId, list); listeners.forEach((listener) => listener()); };

async function loadRows() {
  if (!supabase) return { data: [] as MovementRow[], error: null };
  const query = (columns: string) => supabase!.from("movements").select(columns).order("movement_date", { ascending: false }).order("created_at", { ascending: false });
  const first = await query(MOVEMENT_COLUMNS);
  if (!first.error) return { data: (first.data ?? []) as unknown as MovementRow[], error: null };
  const plain = await query("*"); // Base sin el registro de avisos: se cargan igual, sin las vías.
  return { data: (plain.data ?? []) as unknown as MovementRow[], error: plain.error };
}

export function useMovements(userId: string) {
  const [, setTick] = useState(0);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const all = cache.get(userId) ?? [];
  const loaded = cache.has(userId);
  const set = (update: (current: Movement[]) => Movement[]) => publish(userId, update(cache.get(userId) ?? []));

  useEffect(() => {
    const listener = () => setTick((value) => value + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  const reload = useCallback(async () => {
    setRefreshing(true);
    const { data, error: loadError } = await loadRows();
    setRefreshing(false);
    if (loadError) { setError("No se pudieron cargar los movimientos. Revisá tu conexión."); return; }
    setError("");
    publish(userId, data.map(fromRow));
  }, [userId]);

  useEffect(() => { reload(); }, [reload]);

  // Al instante: lo que entra por mail o por notificación aparece sin recargar.
  useEffect(() => {
    const client = supabase;
    if (!client) return;
    const channel = client.channel("movimientos:" + userId + ":" + Math.random().toString(36).slice(2))
      .on("postgres_changes", { event: "*", schema: "public", table: "movements", filter: "user_id=eq." + userId }, (payload) => {
        if (payload.eventType === "DELETE") {
          const id = (payload.old as { id?: string }).id;
          if (id) set((current) => current.filter((item) => item.id !== id));
          return;
        }
        const id = (payload.new as { id: string }).id;
        client.from("movements").select(MOVEMENT_COLUMNS).eq("id", id).maybeSingle().then(({ data }) => {
          if (!data) return;
          const item = fromRow(data as MovementRow);
          set((current) => sortMovements([item, ...current.filter((entry) => entry.id !== item.id)]));
        });
      })
      .subscribe();
    return () => { client.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const movements = useMemo(() => all.filter(counts), [all]);
  const toReview = useMemo(() => all.filter((item) => !counts(item)), [all]);

  const add = async (input: NewMovement) => {
    if (!supabase) return false;
    const { data, error: saveError } = await supabase.from("movements").insert({ user_id: userId, description: input.description, amount: input.amount, category: input.category, movement_type: input.type, movement_date: input.date, paid: input.paid, ...(input.currency === "USD" ? { currency: "USD", original_amount: input.original, exchange_rate: input.rate } : {}) }).select().single();
    if (saveError || !data) { setError("No se pudo guardar. Probá de nuevo."); return false; }
    setError("");
    const item = fromRow(data as MovementRow);
    set((current) => sortMovements([item, ...current.filter((entry) => entry.id !== item.id)]));
    return true;
  };

  // Se ve al instante; si no se guarda, vuelve como estaba y avisa.
  const togglePaid = async (item: Movement) => {
    if (!supabase) return;
    const flip = (paid: boolean) => set((current) => current.map((entry) => (entry.id === item.id ? { ...entry, paid } : entry)));
    flip(!item.paid);
    const { error: saveError } = await supabase.from("movements").update({ paid: !item.paid }).eq("id", item.id);
    if (saveError) { flip(item.paid); toast("No se pudo marcar como " + (item.paid ? "pendiente" : "pagado") + ". Revisá tu conexión.", { action: { label: "Reintentar", onPress: () => togglePaid(item) } }); }
  };

  // Confirmar un dudoso: desde ahora suma.
  const confirm = async (item: Movement) => {
    if (!supabase) return;
    const confirmedAt = new Date().toISOString();
    const { error: saveError } = await supabase.from("movements").update({ confirmed_at: confirmedAt }).eq("id", item.id);
    if (saveError) { toast("No se pudo confirmar «" + item.description + "». Revisá tu conexión.", { action: { label: "Reintentar", onPress: () => confirm(item) } }); return; }
    set((current) => current.map((entry) => (entry.id === item.id ? { ...entry, confirmedAt } : entry)));
    toast("Listo: ya suma a tus " + (item.type === "gasto" ? "gastos." : "ingresos."), { ok: true });
  };

  // Corregir un movimiento que llegó solo (por ejemplo, la IA leyó mal el monto). Queda confirmado.
  const update = async (item: Movement, input: NewMovement) => {
    if (!supabase) return false;
    const confirmedAt = item.confirmedAt ?? new Date().toISOString();
    const usd = input.currency === "USD";
    const { error: saveError } = await supabase.from("movements").update({
      description: input.description, amount: input.amount, category: input.category, movement_type: input.type, movement_date: input.date, paid: input.paid,
      currency: usd ? "USD" : "ARS", original_amount: usd ? input.original : null, exchange_rate: usd ? input.rate : null, confirmed_at: confirmedAt,
    }).eq("id", item.id);
    if (saveError) return false;
    set((current) => sortMovements(current.map((entry) => (entry.id === item.id ? {
      ...entry, description: input.description, amount: input.amount, category: input.category, type: input.type, date: input.date, paid: input.paid,
      currency: usd ? "USD" : "ARS", original: usd ? input.original ?? null : null, rate: usd ? input.rate ?? null : null, confirmedAt,
    } : entry))));
    return true;
  };

  // Volver a leer el mail del que salió, con los lectores de hoy: el servidor corrige monto y descripción.
  // Devuelve el problema para mostrarlo, o "" si salió bien.
  const reread = async (item: Movement) => {
    if (!supabase) return rereadErrorMessage();
    const { data, error: callError } = await supabase.functions.invoke("gmail", { body: { accion: "releer", movimiento: item.id } });
    if (callError || data?.error) return rereadErrorMessage(data?.error);
    const { data: row } = await supabase.from("movements").select(MOVEMENT_COLUMNS).eq("id", item.id).maybeSingle();
    if (row) {
      const next = fromRow(row as unknown as MovementRow);
      set((current) => sortMovements(current.map((entry) => (entry.id === item.id ? next : entry))));
    }
    return "";
  };

  const remove = async (item: Movement) => {
    if (!supabase) return;
    const { error: saveError } = await supabase.from("movements").delete().eq("id", item.id);
    if (saveError) { toast("No se pudo borrar «" + item.description + "». Revisá tu conexión.", { action: { label: "Reintentar", onPress: () => remove(item) } }); return; }
    set((current) => current.filter((entry) => entry.id !== item.id));
  };

  return { all, loaded, movements, toReview, error, refreshing, add, update, reread, togglePaid, confirm, remove, reload };
}
