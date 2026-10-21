import { useCallback, useEffect, useState } from "react";
import { STATEMENT_COLUMNS, scanErrorMessage, type AnalyzeOptions, type AnalyzeResponse, type StatementSource } from "../../../shared/resumenes";
import { createStore } from "./store";
import { supabase } from "./supabase";

// Resúmenes de tarjeta en PDF del Gmail conectado (los mismos que en la web): la lista y la hoja de la clave comparten estado.
const store = createStore<{ sources: StatementSource[]; loaded: boolean; busy: string | null }>({ sources: [], loaded: false, busy: null });

export function useStatementSources(userId: string) {
  const state = store.useValue(userId);
  const [error, setError] = useState("");
  const setBusy = (busy: string | null) => store.set(userId, (current) => ({ ...current, busy }));

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error: loadError } = await supabase.from("statement_sources").select(STATEMENT_COLUMNS).order("last_mail_at", { ascending: false });
    store.set(userId, (current) => ({ ...current, sources: loadError ? current.sources : ((data ?? []) as StatementSource[]), loaded: true }));
  }, [userId]);

  useEffect(() => { load(); }, [load]);

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
    store.set(userId, (current) => ({ ...current, sources: current.sources.map((entry) => (entry.id === source.id ? { ...entry, ...values } : entry)) }));
    const { error: saveError } = await supabase.from("statement_sources").update(values).eq("id", source.id);
    if (saveError) { setError("No se pudo guardar."); await load(); }
  };

  return {
    ...state, error, reload: load, scan, analyze,
    setAuto: (source: StatementSource, auto: boolean) => update(source, { auto }),
    dismiss: (source: StatementSource, dismissed = true) => update(source, { dismissed }),
  };
}
