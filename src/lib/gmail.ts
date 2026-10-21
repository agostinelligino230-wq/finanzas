import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

// Conexión con Gmail: un botón que lleva a Google, el usuario da permiso de solo lectura y vuelve a la app.
// Desde ahí Gmail avisa al servidor cada vez que llega un mail (al instante) y además se lee todos los días.
// El permiso nunca queda visible en la app.
export type GmailLink = { email: string | null; name: string | null; providers: string[]; last_sync_at: string | null; last_result: { movimientos?: number; resumenes?: number; error?: string } | null; watch_expires_at?: string | null; last_push_at?: string | null };

// El aviso al instante está andando si Gmail lo aceptó y todavía no venció.
export const isInstant = (link: GmailLink | null) => Boolean(link?.watch_expires_at && new Date(link.watch_expires_at).getTime() > Date.now());

const COLUMNS = "email, name, providers, last_sync_at, last_result";

export function useGmail(userId: string) {
  const [link, setLink] = useState<GmailLink | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!supabase) return;
    let { data, error: loadError } = await supabase.from("gmail_links").select(COLUMNS + ", watch_expires_at, last_push_at").maybeSingle();
    // Base sin la migración 009: se carga igual, sin el estado del aviso al instante.
    if (loadError) ({ data, error: loadError } = await supabase.from("gmail_links").select(COLUMNS).maybeSingle());
    if (loadError) setError("No se pudo cargar la conexión con Gmail.");
    setLink((data as GmailLink | null) ?? null);
    setLoaded(true);
  }, []);

  useEffect(() => { load(); }, [load, userId]);

  const connect = async () => {
    if (!supabase) return;
    setBusy(true);
    const { data, error: startError } = await supabase.rpc("start_gmail_link", { p_return_to: window.location.origin });
    if (startError || !data) { setBusy(false); setError("No se pudo empezar la conexión. Probá de nuevo."); return; }
    window.location.href = import.meta.env.VITE_SUPABASE_URL + "/functions/v1/gmail?start=" + encodeURIComponent(String(data));
  };

  const refresh = async () => {
    if (!supabase) return null;
    setBusy(true);
    setError("");
    const { data, error: syncError } = await supabase.functions.invoke("gmail", { body: { ahora: true } });
    setBusy(false);
    if (syncError || data?.error) { setError(data?.error === "permiso" ? "Google ya no nos deja leer tu Gmail. Volvé a conectarlo." : "No se pudo actualizar. Probá en un rato."); await load(); return null; }
    await load();
    return data as { movimientos?: number };
  };

  // El servidor corta el aviso al instante, le devuelve el permiso a Google y borra la conexión.
  const disconnect = async () => {
    if (!supabase) return;
    setBusy(true);
    const { data, error: disconnectError } = await supabase.functions.invoke("gmail", { body: { accion: "desconectar" } });
    setBusy(false);
    if (disconnectError || data?.error) { setError("No se pudo desconectar. Probá de nuevo."); return; }
    setLink(null);
  };

  const setProviders = async (providers: string[]) => {
    if (!supabase || !link) return;
    setLink({ ...link, providers });
    const { error: saveError } = await supabase.from("gmail_links").update({ providers }).eq("user_id", userId);
    if (saveError) setError("No se pudo guardar qué cuentas leer.");
  };

  return { link, loaded, busy, error, connect, refresh, disconnect, setProviders };
}
