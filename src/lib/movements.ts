import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import { readCache, writeCache } from "./cache";
import { findProvider } from "./providers";

export type MovementType = "gasto" | "ingreso";
export type Currency = "ARS" | "USD";
// manual: lo cargaste vos · legacy: entró por Gmail antes de los avisos verificados · verified: lo avisó el banco (app oficial o mail firmado)
// doubtful: llegó sin un aviso verificado; no suma hasta que lo confirmes.
export type Trust = "manual" | "legacy" | "verified" | "doubtful";
export type Channel = "mail" | "push";
// "amount" siempre está en pesos. Si se cargó en dólares, "original" y "rate" guardan el monto en US$ y la cotización usada.
export type Movement = {
  id: string; description: string; amount: number; category: string; date: string; createdAt: string; type: MovementType; paid: boolean;
  currency: Currency; original: number | null; rate: number | null; source: string | null; trust: Trust; confirmedAt: string | null; channels: Channel[];
};
export type NewMovement = { description: string; amount: number; category: string; date: string; type: MovementType; paid: boolean; currency?: Currency; original?: number | null; rate?: number | null };
export type MovementRow = {
  id: string; description: string; amount: number | string; category: string; movement_type: MovementType; movement_date: string; paid: boolean; created_at: string;
  currency?: string | null; original_amount?: number | string | null; exchange_rate?: number | string | null; source?: string | null;
  trust?: string | null; confirmed_at?: string | null; incoming_notices?: { channel: string }[] | null;
};

// Cada movimiento trae de qué vías llegó (notificación, mail o las dos).
export const MOVEMENT_COLUMNS = "*, incoming_notices(channel)";

// Si la base todavía no tiene el registro de avisos (migración 009 sin correr), se cargan igual, sin las vías.
export async function loadMovementRows() {
  if (!supabase) return { data: [] as MovementRow[], error: null };
  const query = (columns: string) => supabase!.from("movements").select(columns).order("movement_date", { ascending: false }).order("created_at", { ascending: false });
  const first = await query(MOVEMENT_COLUMNS);
  if (!first.error) return { data: (first.data ?? []) as unknown as MovementRow[], error: null };
  const plain = await query("*");
  return { data: (plain.data ?? []) as unknown as MovementRow[], error: plain.error };
}

const numberOrNull = (value: number | string | null | undefined) => (value === null || value === undefined || value === "" ? null : Number(value));
const TRUSTS: Trust[] = ["manual", "legacy", "verified", "doubtful"];

export const fromRow = (row: MovementRow): Movement => ({
  id: row.id, description: row.description, amount: Number(row.amount), category: row.category, date: row.movement_date, createdAt: row.created_at, type: row.movement_type, paid: row.paid,
  currency: row.currency === "USD" ? "USD" : "ARS", original: numberOrNull(row.original_amount), rate: numberOrNull(row.exchange_rate), source: row.source ?? null,
  trust: TRUSTS.includes(row.trust as Trust) ? (row.trust as Trust) : "manual", confirmedAt: row.confirmed_at ?? null,
  channels: [...new Set((row.incoming_notices ?? []).map((notice) => notice.channel))].filter((channel): channel is Channel => channel === "mail" || channel === "push").sort(),
});

// Lo dudoso no suma (ni al saldo, ni a los gráficos, ni a la descarga) hasta que lo confirmes.
export const counts = (item: Movement) => item.trust !== "doubtful" || item.confirmedAt !== null;

// "Verificado · notificación y mail de Galicia", "desde Ualá"…
export function originLabel(item: Movement) {
  const provider = findProvider(item.source)?.name;
  if (!provider) return "";
  const via = item.channels.length === 2 ? "notificación y mail" : item.channels[0] === "push" ? "notificación" : item.channels[0] === "mail" ? "mail" : "";
  if (item.trust === "verified") return "Verificado · " + (via ? via + " de " : "") + provider;
  return via ? via[0].toUpperCase() + via.slice(1) + " de " + provider : "desde " + provider;
}

const sortMovements = (list: Movement[]) => [...list].sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)));

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

// "luz", "gas"... sirve para diferenciar dentro de una misma categoría
export const hasDetail = (item: { description: string }, categoryName: string) => {
  const text = item.description.trim().toLowerCase();
  return text !== "" && text !== "gasto" && text !== "ingreso" && text !== "ahorro" && text !== categoryName.toLowerCase();
};
