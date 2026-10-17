import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

// Resúmenes de tarjeta que llegan en PDF al Gmail conectado. La app pregunta antes de analizarlos.
export type StatementResult = { tarjeta: string; mes: string; total: number; total_usd: number; vence: string | null; minimo: number | null; consumos: number; cargos: number; cuotas: number; pendiente: number; hasta: string | null };
export type StatementSource = {
  id: string; label: string; provider: string | null; brand: string | null; card_id: string | null;
  last_message_id: string | null; last_mail_at: string | null; last_subject: string | null;
  analyzed_message_id: string | null; analyzed_at: string | null; status: string; result: StatementResult | null;
  auto: boolean; dismissed: boolean; password_saved: boolean;
};
export type AnalyzeOptions = { clave?: string; recordar?: boolean; auto?: boolean };

const COLUMNS = "id, label, provider, brand, card_id, last_message_id, last_mail_at, last_subject, analyzed_message_id, analyzed_at, status, result, auto, dismissed, password_saved";

// Hay un resumen que todavía no se analizó (nunca, o llegó uno nuevo).
export const isPending = (source: StatementSource) => !source.dismissed && Boolean(source.last_message_id) && source.last_message_id !== source.analyzed_message_id;
export const needsPassword = (source: StatementSource) => source.status === "clave" || source.status === "clave-incorrecta";

export function useStatementSources(userId: string) {
  const [sources, setSources] = useState<StatementSource[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error: loadError } = await supabase.from("statement_sources").select(COLUMNS).order("last_mail_at", { ascending: false });
    if (!loadError) setSources((data ?? []) as StatementSource[]);
    setLoaded(true);
  }, []);

  useEffect(() => { load(); }, [load, userId]);

  const scan = async () => {
    if (!supabase) return;
    setBusy("buscar");
    setError("");
    const { data, error: scanError } = await supabase.functions.invoke("gmail", { body: { accion: "tarjetas" } });
    setBusy(null);
    if (scanError || data?.error) setError(data?.error === "permiso" ? "Google ya no nos deja leer tu Gmail. Volvé a conectarlo." : "No se pudo buscar en tu Gmail. Probá en un rato.");
    await load();
  };

  const analyze = async (source: StatementSource, options: AnalyzeOptions = {}) => {
    if (!supabase) return null;
    setBusy(source.id);
    setError("");
    const { data, error: analyzeError } = await supabase.functions.invoke("gmail", { body: { accion: "analizar", fuente: source.id, ...options } });
    setBusy(null);
    await load();
    if (analyzeError) { setError("No se pudo analizar el resumen. Probá en un rato."); return null; }
    return data as { ok?: boolean; resultado?: StatementResult; error?: string };
  };

  const update = async (source: StatementSource, values: { auto?: boolean; dismissed?: boolean }) => {
    if (!supabase) return;
    setSources((current) => current.map((entry) => (entry.id === source.id ? { ...entry, ...values } : entry)));
    const { error: saveError } = await supabase.from("statement_sources").update(values).eq("id", source.id);
    if (saveError) { setError("No se pudo guardar."); await load(); }
  };

  return { sources, loaded, busy, error, scan, analyze, setAuto: (source: StatementSource, auto: boolean) => update(source, { auto }), dismiss: (source: StatementSource, dismissed = true) => update(source, { dismissed }) };
}
