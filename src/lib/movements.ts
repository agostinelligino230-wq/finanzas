import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import { readCache, writeCache } from "./cache";
import { MOVEMENT_COLUMNS, counts, fromRow, isListed, needsReview, rereadErrorMessage, sortMovements, type Movement, type MovementRow, type NewMovement } from "../../shared/movimientos";
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

const TICKETS = "tickets";

// Las fotos están en un bucket privado: se ven con una dirección que vence en una hora.
export async function photoUrl(path: string) {
  if (!supabase) return "";
  const { data } = await supabase.storage.from(TICKETS).createSignedUrl(path, 3600);
  return data?.signedUrl ?? "";
}

export function useMovements(userId: string) {
  const [all, setAll] = useState<Movement[]>(() => readCache<Movement[]>("movements_v2", userId) ?? (readCache<MovementRow[]>("raw:movements", userId) ?? []).map(fromRow));
  const [error, setError] = useState("");

  useEffect(() => { writeCache("movements_v2", userId, all); }, [all, userId]);

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
  const toReview = useMemo(() => all.filter(needsReview), [all]);
  const listed = useMemo(() => all.filter(isListed), [all]);
  const patch = (id: string, changes: Partial<Movement>) => setAll((current) => current.map((movement) => (movement.id === id ? { ...movement, ...changes } : movement)));

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

  // Volver a leer el mail del que salió, con los lectores de hoy: el servidor corrige monto y descripción.
  const reread = async (item: Movement) => {
    if (!supabase) return;
    const { data, error: callError } = await supabase.functions.invoke("gmail", { body: { accion: "releer", movimiento: item.id } });
    if (callError || data?.error) { setError(rereadErrorMessage(data?.error)); return; }
    setError("");
    const { data: row } = await supabase.from("movements").select(MOVEMENT_COLUMNS).eq("id", item.id).maybeSingle();
    if (!row) return;
    const next = fromRow(row as unknown as MovementRow);
    setAll((current) => current.map((movement) => (movement.id === item.id ? next : movement)));
  };

  const saveDetail = async (item: Movement, input: { note: string; category: string }) => {
    if (!supabase) return false;
    const note = input.note.trim() || null;
    const { error: saveError } = await supabase.from("movements").update({ note, category: input.category }).eq("id", item.id);
    if (saveError) return false;
    patch(item.id, { note, category: input.category });
    return true;
  };

  // «No es un gasto»: se ve en la lista, pero no suma.
  const setExcluded = async (item: Movement, excluded: boolean) => {
    if (!supabase) return;
    const { error: saveError } = await supabase.from("movements").update({ excluded }).eq("id", item.id);
    if (saveError) { setError("No se pudo actualizar el movimiento."); return; }
    patch(item.id, { excluded });
  };

  const setPlace = async (item: Movement, point: { lat: number; lng: number } | null, name: string, address: string) => {
    if (!supabase) return false;
    const lat = point?.lat ?? item.place.lat;
    const lng = point?.lng ?? item.place.lng;
    const { error: saveError } = await supabase.rpc("set_movement_place", { p_id: item.id, p_lat: lat, p_lng: lng, p_place_name: name, p_place_address: address });
    if (saveError) return false;
    patch(item.id, { place: { ...item.place, lat, lng, name, address: address || null, at: item.place.at ?? new Date().toISOString() } });
    return true;
  };

  const split = async (item: Movement, amount: number, category: string) => {
    if (!supabase) return false;
    const { error: saveError } = await supabase.rpc("split_movement", { p_id: item.id, p_amount: amount, p_category: category });
    if (saveError) return false;
    reload();
    return true;
  };

  const uploadPhoto = async (item: Movement, file: File) => {
    if (!supabase) return false;
    const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = userId + "/" + item.id + "-" + Date.now() + "." + ext;
    const { error: uploadError } = await supabase.storage.from(TICKETS).upload(path, file, { contentType: file.type || undefined });
    if (uploadError) return false;
    const { error: saveError } = await supabase.from("movements").update({ photo_path: path }).eq("id", item.id);
    if (saveError) { await supabase.storage.from(TICKETS).remove([path]); return false; }
    if (item.photoPath) await supabase.storage.from(TICKETS).remove([item.photoPath]);
    patch(item.id, { photoPath: path });
    return true;
  };

  const removePhoto = async (item: Movement) => {
    if (!supabase || !item.photoPath) return false;
    const { error: saveError } = await supabase.from("movements").update({ photo_path: null }).eq("id", item.id);
    if (saveError) { setError("No se pudo borrar la foto."); return false; }
    await supabase.storage.from(TICKETS).remove([item.photoPath]);
    patch(item.id, { photoPath: null });
    return true;
  };

  const remove = async (item: Movement) => {
    if (!supabase) return;
    const { error: saveError } = await supabase.from("movements").delete().eq("id", item.id);
    if (saveError) { setError("No se pudo eliminar el movimiento."); return; }
    setAll((current) => current.filter((movement) => movement.id !== item.id));
  };

  return { all, movements, listed, toReview, error, add, togglePaid, confirm, reread, remove, reload, saveDetail, setExcluded, setPlace, split, uploadPhoto, removePhoto };
}
