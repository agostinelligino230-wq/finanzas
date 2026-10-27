import { useCallback, useEffect, useState } from "react";
import * as WebBrowser from "expo-web-browser";
import { toast } from "../components/Toast";
import { supabase, SUPABASE_URL } from "./supabase";

// Conexión con Gmail desde el celular: el mismo botón que la web. Google vuelve a la app (finanzas://conectar).
export type GmailLink = { email: string | null; name: string | null; providers: string[]; last_sync_at: string | null; last_result: { movimientos?: number; error?: string } | null; watch_expires_at?: string | null };
export type ConnectResult = "ok" | "cancelado" | "sin-permiso" | "error";

export const isInstant = (link: GmailLink | null) => Boolean(link?.watch_expires_at && new Date(link.watch_expires_at).getTime() > Date.now());

const APP_RETURN = "finanzas://";
const COLUMNS = "email, name, providers, last_sync_at, last_result";

export function useGmail(userId: string) {
  const [link, setLink] = useState<GmailLink | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!supabase) return;
    let { data, error: loadError } = await supabase.from("gmail_links").select(COLUMNS + ", watch_expires_at").maybeSingle();
    if (loadError) ({ data, error: loadError } = await supabase.from("gmail_links").select(COLUMNS).maybeSingle());
    // Si no se pudo leer, no se muestra «Conectá tu Gmail» a quien ya lo tiene conectado: queda el error con Reintentar.
    if (loadError) { setError("No se pudo cargar la conexión con Gmail. Revisá tu conexión."); return; }
    setError("");
    setLink((data as GmailLink | null) ?? null);
    setLoaded(true);
  }, []);

  useEffect(() => { load(); }, [load, userId]);

  const connect = async (): Promise<ConnectResult | null> => {
    if (!supabase) return null;
    setBusy(true);
    setError("");
    const { data, error: startError } = await supabase.rpc("start_gmail_link", { p_return_to: APP_RETURN });
    if (startError || !data) { setBusy(false); setError("No se pudo empezar la conexión. Probá de nuevo."); return null; }
    const result = await WebBrowser.openAuthSessionAsync(SUPABASE_URL + "/functions/v1/gmail?start=" + encodeURIComponent(String(data)), APP_RETURN + "conectar");
    setBusy(false);
    await load();
    if (result.type !== "success") return "cancelado";
    return (new URL(result.url).searchParams.get("gmail") as ConnectResult | null) ?? "error";
  };

  // todo: «Volver a leer todo Gmail» (los últimos 60 días, con los lectores de hoy).
  const refresh = async (todo = false) => {
    if (!supabase) return null;
    setBusy(true);
    setError("");
    const { data, error: syncError } = await supabase.functions.invoke("gmail", { body: todo ? { accion: "releer-todo" } : { ahora: true } });
    setBusy(false);
    if (syncError || data?.error) { setError(data?.error === "permiso" ? "Google ya no nos deja leer tu Gmail. Volvé a conectarlo." : "No se pudo actualizar. Probá en un rato."); await load(); return null; }
    await load();
    return data as { movimientos?: number; corregidos?: number };
  };

  const disconnect = async () => {
    if (!supabase) return;
    setBusy(true);
    const { data, error: disconnectError } = await supabase.functions.invoke("gmail", { body: { accion: "desconectar" } });
    setBusy(false);
    if (disconnectError || data?.error) { toast("No se pudo desconectar tu Gmail. Revisá tu conexión.", { action: { label: "Reintentar", onPress: disconnect } }); return; }
    setLink(null);
    toast("Listo: desconectamos tu Gmail. Lo que ya se cargó queda.", { ok: true });
  };

  const setProviders = async (providers: string[]) => {
    if (!supabase || !link) return;
    setLink({ ...link, providers });
    const { error: saveError } = await supabase.from("gmail_links").update({ providers }).eq("user_id", userId);
    if (saveError) { setLink(link); toast("No se pudo guardar qué cuentas leer. Revisá tu conexión."); }
  };

  return { link, loaded, busy, error, connect, refresh, disconnect, setProviders, reload: load };
}
