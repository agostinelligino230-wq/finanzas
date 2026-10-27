import { useState } from "react";
import { FileText, KeyRound, Loader2, RefreshCw, Search, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { isPending, needsPassword, useStatementSources, type StatementSource } from "../lib/statements";
import { money, monthLabel, usd } from "../lib/format";
import { resolveProvider } from "../lib/providers";
import { ProviderIcon } from "./sheets";
import { ErrorBox } from "./ui";

const shortDate = (value: string) => new Date(value.length === 10 ? value + "T12:00:00" : value).toLocaleDateString("es-AR", { day: "numeric", month: "long" });

const FAILS: Record<string, string> = {
  "no-se-pudo-leer": "No pudimos leer este resumen. Puede que tu banco use un formato distinto: avisanos y lo sumamos.",
  "sin-pdf": "Ese mail ya no tiene el PDF del resumen.",
  permiso: "Google ya no nos deja leer tu Gmail. Volvé a conectarlo.",
};

// "¿Querés que analicemos tu último resumen?" para cada tarjeta encontrada en el Gmail.
// En Inicio (onlyPending) solo aparecen las que tienen un resumen sin analizar.
export default function StatementSources({ userId, onlyPending = false }: { userId: string; onlyPending?: boolean }) {
  const data = useStatementSources(userId);
  // Las que se analizan ahora siguen a la vista (para ver el resultado) aunque ya no estén pendientes.
  const [done, setDone] = useState<string[]>([]);
  const visible = onlyPending ? data.sources.filter((source) => isPending(source) || (done.includes(source.id) && !source.dismissed)) : data.sources;
  const pending = data.sources.filter((source) => isPending(source) && !needsPassword(source));
  const [all, setAll] = useState(false);
  const analyze = (source: StatementSource, options: { clave?: string; recordar?: boolean; auto?: boolean }) => {
    setDone((list) => (list.includes(source.id) ? list : [...list, source.id]));
    return data.analyze(source, options);
  };

  if (onlyPending && visible.length === 0) return null;

  const analyzeAll = async () => {
    setAll(true);
    for (const source of pending) await analyze(source, { auto: true });
    setAll(false);
  };

  return (
    <section id="tarjetas" className="space-y-3 rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary-text)]"><Sparkles size={20} /></span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{onlyPending ? (visible.length === 1 ? "Encontramos el resumen de tu tarjeta en tu Gmail" : "Encontramos los resúmenes de tus tarjetas en tu Gmail") : "Resúmenes de tus tarjetas"}</p>
          <p className="text-sm text-[var(--muted)]">Si nos dejás, leemos el PDF del resumen y cargamos solo lo que gastaste, cuándo vence, cuánto tenés que pagar y las cuotas que te quedan.</p>
        </div>
      </div>
      <ErrorBox message={data.error} />

      {pending.length > 1 && (
        <button type="button" disabled={all || data.busy !== null} onClick={analyzeAll} className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--primary)] font-semibold text-white disabled:opacity-60">
          {all ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}{all ? "Analizando…" : "Sí, analizar las " + pending.length + " tarjetas"}
        </button>
      )}

      {data.loaded && !onlyPending && visible.length === 0 && (
        <div className="rounded-2xl bg-[var(--surface-2)] p-3 text-sm">
          <p>No encontramos resúmenes de tarjeta en PDF en tu Gmail de los últimos dos meses.</p>
          <button type="button" disabled={data.busy !== null} onClick={data.scan} className="mt-2 inline-flex items-center gap-1.5 font-semibold text-[var(--primary-text)] disabled:opacity-60"><Search size={15} />{data.busy === "buscar" ? "Buscando…" : "Buscar de nuevo"}</button>
        </div>
      )}

      <div className="space-y-3">
        {visible.map((source) => <SourceRow key={source.id} source={source} busy={data.busy === source.id || (all && isPending(source))} disabled={data.busy !== null || all} onAnalyze={(options) => analyze(source, options)} onAuto={(auto) => data.setAuto(source, auto)} onDismiss={(dismissed) => data.dismiss(source, dismissed)} />)}
      </div>

      {!onlyPending && visible.length > 0 && (
        <button type="button" disabled={data.busy !== null} onClick={data.scan} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--muted)] disabled:opacity-60"><RefreshCw size={13} className={data.busy === "buscar" ? "animate-spin" : ""} />{data.busy === "buscar" ? "Buscando…" : "Buscar otras tarjetas"}</button>
      )}
    </section>
  );
}

function SourceRow({ source, busy, disabled, onAnalyze, onAuto, onDismiss }: {
  source: StatementSource; busy: boolean; disabled: boolean;
  onAnalyze: (options: { clave?: string; recordar?: boolean; auto?: boolean }) => Promise<unknown>; onAuto: (auto: boolean) => void; onDismiss: (dismissed: boolean) => void;
}) {
  const [auto, setAuto] = useState(true);
  const [clave, setClave] = useState("");
  const [recordar, setRecordar] = useState(true);
  const color = resolveProvider(source.provider, source.label)?.color ?? "#5B6CF0";
  const pending = isPending(source);
  const result = source.result;
  const fail = FAILS[source.status];

  return (
    <div className="space-y-3 rounded-2xl border border-[var(--border)] p-3">
      <div className="flex items-center gap-3">
        <ProviderIcon name={source.label} color={color} provider={source.provider} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{source.label}</p>
          <p className="truncate text-xs text-[var(--muted)]">{source.last_mail_at ? "Último resumen: llegó el " + shortDate(source.last_mail_at) : "Resumen por mail"}</p>
        </div>
        {busy && <Loader2 size={20} className="shrink-0 animate-spin text-[var(--primary-text)]" />}
      </div>

      {busy ? (
        <p className="text-sm text-[var(--muted)]">Leyendo el PDF del resumen…</p>
      ) : needsPassword(source) ? (
        <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); if (clave.trim()) onAnalyze({ clave, recordar, auto: true }); }}>
          <p className="flex items-start gap-2 text-sm"><KeyRound size={16} className="mt-0.5 shrink-0 text-[var(--primary-text)]" />{source.status === "clave-incorrecta" ? "Esa clave no abrió el PDF. Probá de nuevo." : "Tu banco protege el resumen con una clave. Casi siempre es tu número de documento, sin puntos."}</p>
          <div className="flex gap-2">
            <input value={clave} onChange={(event) => setClave(event.target.value)} type="password" inputMode="numeric" autoComplete="off" placeholder="Clave del PDF" className="h-11 min-w-0 flex-1 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-3 text-base outline-none focus:border-[var(--primary)]" />
            <button type="submit" disabled={disabled || !clave.trim()} className="h-11 shrink-0 rounded-2xl bg-[var(--primary)] px-4 font-semibold text-white disabled:opacity-60">Abrir</button>
          </div>
          <label className="flex items-center gap-2 text-xs text-[var(--muted)]"><input type="checkbox" checked={recordar} onChange={(event) => setRecordar(event.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />Recordarla para leer solos los próximos resúmenes</label>
        </form>
      ) : pending && !source.auto ? (
        <div className="space-y-2">
          <p className="text-sm">{fail ?? (source.analyzed_message_id ? "Llegó un resumen nuevo. ¿Querés que lo analicemos?" : "¿Querés que analicemos tu último resumen?")}</p>
          <div className="flex gap-2">
            <button type="button" disabled={disabled} onClick={() => onAnalyze({ auto })} className="h-11 flex-1 rounded-2xl bg-[var(--primary)] font-semibold text-white disabled:opacity-60">{fail ? "Probar de nuevo" : "Sí, analizar"}</button>
            <button type="button" disabled={disabled} onClick={() => onDismiss(true)} className="h-11 rounded-2xl border border-[var(--border)] px-4 font-semibold text-[var(--muted)] disabled:opacity-60">Ahora no</button>
          </div>
          <label className="flex items-center gap-2 text-xs text-[var(--muted)]"><input type="checkbox" checked={auto} onChange={(event) => setAuto(event.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />Analizar solos los próximos resúmenes de esta tarjeta</label>
        </div>
      ) : pending && source.auto ? (
        <div className="flex items-center justify-between gap-2 text-sm">
          <p className="text-[var(--muted)]">{fail ?? "Llegó un resumen nuevo: se analiza solo en la próxima lectura."}</p>
          <button type="button" disabled={disabled} onClick={() => onAnalyze({})} className="shrink-0 font-semibold text-[var(--primary-text)] disabled:opacity-60">Analizar ya</button>
        </div>
      ) : source.dismissed ? (
        <div className="flex items-center justify-between gap-2 text-sm">
          <p className="text-[var(--muted)]">No se analiza.</p>
          <button type="button" disabled={disabled} onClick={() => { onDismiss(false); onAnalyze({ auto: true }); }} className="shrink-0 font-semibold text-[var(--primary-text)] disabled:opacity-60">Analizar</button>
        </div>
      ) : null}

      {!busy && result && !needsPassword(source) && (
        <div className="space-y-1 rounded-2xl bg-[var(--surface-2)] p-3 text-sm">
          <p className="flex items-center gap-2 font-semibold"><FileText size={16} className="text-[var(--primary-text)]" />Resumen de {monthLabel(result.mes).toLowerCase()}: {money(result.total)}{result.total_usd > 0 && " + " + usd(result.total_usd)}</p>
          <p className="text-[var(--muted)]">{[result.vence && "Vence el " + shortDate(result.vence), result.minimo && "pago mínimo " + money(result.minimo)].filter(Boolean).join(" · ")}</p>
          <p className="text-[var(--muted)]">{result.consumos} {result.consumos === 1 ? "consumo" : "consumos"}{result.cuotas > 0 && " · " + result.cuotas + (result.cuotas === 1 ? " compra en cuotas" : " compras en cuotas")}{result.cargos > 0 && " · " + money(result.cargos) + " de impuestos y cargos"}</p>
          {result.pendiente > 0 && <p className="font-medium">Te quedan {money(result.pendiente)} en cuotas por pagar{result.hasta && " (hasta " + monthLabel(result.hasta).toLowerCase() + ")"}.</p>}
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
            <Link to="/tarjetas" className="font-semibold text-[var(--primary-text)]">Ver el detalle en Tarjetas</Link>
            {/* Ya analizado: se puede leer de nuevo el mismo PDF (por ejemplo, después de una mejora del lector). */}
            {!pending && <button type="button" disabled={disabled} onClick={() => onAnalyze({})} className="font-semibold text-[var(--primary-text)] disabled:opacity-60">Volver a analizar</button>}
          </div>
        </div>
      )}

      {!busy && !pending && !source.dismissed && source.result && (
        <label className="flex items-center gap-2 text-xs text-[var(--muted)]"><input type="checkbox" checked={source.auto} onChange={(event) => onAuto(event.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />Analizar solos los próximos resúmenes{source.password_saved && " (la clave del PDF quedó guardada)"}</label>
      )}
    </div>
  );
}
