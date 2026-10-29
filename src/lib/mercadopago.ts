import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

// Mercado Pago por API (versión de prueba): un botón lleva a la pantalla oficial de Mercado Pago, la persona
// autoriza y la app trae sus movimientos. El permiso queda cifrado en el servidor y nunca es visible en la app.
export type MpItem = {
  fecha: string; tipo: "gasto" | "ingreso" | null; monto: number; descripcion: string;
  estado: string; via: "pagos" | "reporte"; nota?: string; porMail?: boolean;
};
export type MpMissing = { fecha: string; tipo: string; monto: number; descripcion: string };
export type MpResult = {
  nuevos?: number; unidos?: number; repetidos?: number; descartados?: number; tambienPorMail?: number; dias?: number;
  fuentes?: Record<string, number | string>; reporte?: string; detalle?: MpItem[]; faltan?: MpMissing[]; error?: string;
};
export type MpLink = { nickname: string | null; email: string | null; last_sync_at: string | null; last_result: MpResult | null };

export function useMercadoPago(userId: string) {
  const [link, setLink] = useState<MpLink | null>(null);
  // Sin la migración 014 la tarjeta no se muestra.
  const [available, setAvailable] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error: loadError } = await supabase.from("mp_links").select("nickname, email, last_sync_at, last_result").maybeSingle();
    setAvailable(!loadError);
    setLink(loadError ? null : ((data as MpLink | null) ?? null));
    setLoaded(true);
  }, []);

  useEffect(() => { load(); }, [load, userId]);

  const connect = async () => {
    if (!supabase) return;
    setBusy(true);
    setError("");
    const { data, error: startError } = await supabase.rpc("start_mp_link", { p_return_to: window.location.origin });
    if (startError || !data) { setBusy(false); setError("No se pudo empezar la conexión con Mercado Pago. Probá de nuevo."); return; }
    window.location.href = import.meta.env.VITE_SUPABASE_URL + "/functions/v1/mercadopago?start=" + encodeURIComponent(String(data));
  };

  const refresh = async () => {
    if (!supabase) return null;
    setBusy(true);
    setError("");
    const { data, error: syncError } = await supabase.functions.invoke("mercadopago", { body: { accion: "actualizar" } });
    setBusy(false);
    if (syncError || data?.error) {
      setError(data?.error === "permiso" ? "Mercado Pago ya no nos deja leer tu cuenta. Volvé a conectarla." : "No se pudo actualizar Mercado Pago. Probá en un rato.");
      await load();
      return null;
    }
    await load();
    return data as MpResult;
  };

  const disconnect = async () => {
    if (!supabase) return;
    setBusy(true);
    const { data, error: disconnectError } = await supabase.functions.invoke("mercadopago", { body: { accion: "desconectar" } });
    setBusy(false);
    if (disconnectError || data?.error) { setError("No se pudo desconectar. Probá de nuevo."); return; }
    setLink(null);
  };

  return { link, available, loaded, busy, error, connect, refresh, disconnect };
}
