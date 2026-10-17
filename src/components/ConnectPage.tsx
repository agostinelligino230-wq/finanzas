import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Mail, RefreshCw, ShieldCheck } from "lucide-react";
import { supabase } from "../lib/supabase";
import { buildUalaScript } from "../lib/ualaScript";
import { useAuth } from "./AuthGate";
import { Card, ErrorBox, sheetField as field, sheetLabel as label } from "./ui";

type TokenRow = { token: string; last_import_at: string | null; last_result: { movimientos?: number; resumenes?: number } | null };

const newToken = () => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

export default function ConnectPage() {
  const { user } = useAuth();
  const [row, setRow] = useState<TokenRow | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [ownName, setOwnName] = useState(() => { try { return localStorage.getItem("finanzas-own-name") ?? ""; } catch { return ""; } });
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase) return;
    supabase.from("import_tokens").select("token, last_import_at, last_result").maybeSingle().then(({ data, error: loadError }) => {
      if (loadError) setError("No se pudo cargar la conexión. ¿Ya se actualizó la base de datos?");
      setRow((data as TokenRow | null) ?? null);
      setLoaded(true);
    });
  }, [user.id]);

  useEffect(() => { try { localStorage.setItem("finanzas-own-name", ownName); } catch { /* sin almacenamiento */ } }, [ownName]);

  const generate = async () => {
    if (!supabase) return;
    if (row && !window.confirm("Si generás un código nuevo, el programa que ya pegaste deja de funcionar hasta que pegues el nuevo. ¿Seguir?")) return;
    setBusy(true);
    const token = newToken();
    const { data, error: saveError } = await supabase.from("import_tokens").upsert({ user_id: user.id, token }, { onConflict: "user_id" }).select("token, last_import_at, last_result").single();
    setBusy(false);
    if (saveError || !data) { setError("No se pudo generar el código. Probá de nuevo."); return; }
    setError("");
    setRow(data as TokenRow);
  };

  const [script, setScript] = useState("");
  useEffect(() => {
    if (!row) { setScript(""); return; }
    let active = true;
    buildUalaScript({ url: import.meta.env.VITE_SUPABASE_URL, key: import.meta.env.VITE_SUPABASE_ANON_KEY, token: row.token, ownName })
      .then((text) => { if (active) setScript(text); })
      .catch(() => { if (active) setError("No se pudo preparar el programa. Recargá la página."); });
    return () => { active = false; };
  }, [row, ownName]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(script);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("No se pudo copiar. Seleccioná el texto y copialo a mano.");
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <ErrorBox message={error} />
      <section className="rounded-[28px] bg-[var(--hero)] p-5 text-[var(--hero-text)]">
        <p className="flex items-center gap-2 text-sm opacity-80"><Mail size={16} />Ualá por mail</p>
        <p className="mt-1 text-2xl font-bold">Cargá tus transferencias solas</p>
        <p className="mt-2 text-sm opacity-80">Un programa chico corre en tu Gmail cada 5 días, lee solo los mails de Ualá y carga las transferencias que hiciste y el total del resumen de la tarjeta.</p>
        {row?.last_import_at && (
          <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs">
            <Check size={14} />Última lectura: {new Date(row.last_import_at).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            {row.last_result && <> · {row.last_result.movimientos ?? 0} movimientos nuevos</>}
          </p>
        )}
      </section>

      <Card className="flex gap-3 text-sm">
        <ShieldCheck size={20} className="shrink-0 text-[var(--income)]" />
        <p className="text-[var(--muted)]">No toca tu cuenta de Ualá ni tu tarjeta: solo lee mails que ya te llegaron. Las compras con débito, QR o la plata que recibís no llegan por mail, así que esas seguís cargándolas a mano.</p>
      </Card>

      <Card className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--primary-text)]">Paso 1</p>
          <p className="font-semibold">Generá tu código personal</p>
        </div>
        <label className="block">
          <span className={label}>Tu nombre como aparece en Ualá <span className="normal-case tracking-normal">(opcional)</span></span>
          <input value={ownName} onChange={(event) => setOwnName(event.target.value)} placeholder="Ej.: Gino Sebastian Agostinelli" className={field} />
          <span className="mt-1 block text-xs text-[var(--muted)]">Así no cuenta como gasto la plata que te pasás a vos mismo.</span>
        </label>
        {loaded && (
          <button type="button" disabled={busy} onClick={generate} className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[var(--primary)] px-5 font-semibold text-white disabled:opacity-60">
            <RefreshCw size={16} />{row ? "Generar código nuevo" : "Generar mi código"}
          </button>
        )}
      </Card>

      {row && (
        <>
          <Card className="space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--primary-text)]">Paso 2</p>
              <p className="font-semibold">Copiá el programa</p>
            </div>
            <button type="button" disabled={!script} onClick={copy} className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[var(--accent)] px-5 font-bold text-[var(--accent-text)]">{copied ? <><Check size={18} />Copiado</> : <><Copy size={18} />Copiar programa</>}</button>
            <textarea readOnly value={script} rows={6} onFocus={(event) => event.currentTarget.select()} className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-3 font-mono text-xs" aria-label="Programa para Google Apps Script" />
          </Card>

          <Card className="space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--primary-text)]">Paso 3</p>
              <p className="font-semibold">Pegalo en Google y activalo</p>
            </div>
            <ol className="list-decimal space-y-2 pl-5 text-sm">
              <li>Abrí <a href="https://script.google.com/home/projects/create" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-[var(--primary-text)]">script.google.com <ExternalLink size={13} /></a> con la cuenta de Gmail donde te llegan los mails de Ualá.</li>
              <li>Borrá lo que aparece escrito, pegá el programa y tocá el ícono de guardar.</li>
              <li>Arriba, en el menú de funciones, elegí <strong>activar</strong> y tocá <strong>Ejecutar</strong>.</li>
              <li>Google te pide permiso: tocá <strong>Revisar permisos</strong>, elegí tu cuenta. Si aparece "Google no verificó esta app", tocá <strong>Configuración avanzada</strong> → <strong>Ir a … (no seguro)</strong> → <strong>Permitir</strong>. Es tu propio programa.</li>
              <li>Listo: trae los últimos 60 días y después se actualiza solo cada 5 días.</li>
            </ol>
          </Card>
        </>
      )}
    </div>
  );
}
