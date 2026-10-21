import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { STATEMENT_COLUMNS as COLUMNS, scanErrorMessage, type AnalyzeOptions, type AnalyzeResponse, type StatementSource } from "../../shared/resumenes";
// Tipos y reglas compartidos con la app del celular (shared/resumenes.ts).
export { isPending, needsPassword, type AnalyzeOptions, type StatementResult, type StatementSource } from "../../shared/resumenes";

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
    if (scanError || data?.error) setError(scanErrorMessage(data?.error));
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
    return data as AnalyzeResponse;
  };

  const update = async (source: StatementSource, values: { auto?: boolean; dismissed?: boolean }) => {
    if (!supabase) return;
    setSources((current) => current.map((entry) => (entry.id === source.id ? { ...entry, ...values } : entry)));
    const { error: saveError } = await supabase.from("statement_sources").update(values).eq("id", source.id);
    if (saveError) { setError("No se pudo guardar."); await load(); }
  };

  return { sources, loaded, busy, error, scan, analyze, setAuto: (source: StatementSource, auto: boolean) => update(source, { auto }), dismiss: (source: StatementSource, dismissed = true) => update(source, { dismissed }) };
}
