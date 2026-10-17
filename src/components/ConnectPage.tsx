import { useEffect, useState } from "react";
import { Check, Copy, CreditCard as CardIcon, ExternalLink, Mail, RefreshCw, ShieldCheck } from "lucide-react";
import { supabase } from "../lib/supabase";
import { buildAccountsScript } from "../lib/ualaScript";
import { AUTO_PROVIDERS, PROVIDERS, type Provider } from "../lib/providers";
import { useCards } from "../lib/cards";
import { useAuth } from "./AuthGate";
import { Card, ErrorBox, sheetField as field, sheetLabel as label } from "./ui";
import { NewCardSheet, ProviderIcon } from "./sheets";
import { Link } from "react-router-dom";

type TokenRow = { token: string; last_import_at: string | null; last_result: { movimientos?: number; resumenes?: number } | null };

const newToken = () => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const readSaved = <T,>(key: string, fallback: T): T => { try { const value = localStorage.getItem(key); return value ? (JSON.parse(value) as T) : fallback; } catch { return fallback; } };
const save = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* sin almacenamiento */ } };

export default function ConnectPage() {
  const { user } = useAuth();
  const cardsData = useCards(user.id);
  const [row, setRow] = useState<TokenRow | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [ownName, setOwnName] = useState(() => readSaved("finanzas-own-name-v2", ""));
  const [selected, setSelected] = useState<string[]>(() => readSaved("finanzas-providers", AUTO_PROVIDERS.map((provider) => provider.id)));
  const [script, setScript] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState<Provider | null>(null);
  const [added, setAdded] = useState("");

  useEffect(() => {
    if (!supabase) return;
    supabase.from("import_tokens").select("token, last_import_at, last_result").maybeSingle().then(({ data, error: loadError }) => {
      if (loadError) setError("No se pudo cargar la conexión. ¿Ya se actualizó la base de datos?");
      setRow((data as TokenRow | null) ?? null);
      setLoaded(true);
    });
  }, [user.id]);

  useEffect(() => { save("finanzas-own-name-v2", ownName); }, [ownName]);
  useEffect(() => { save("finanzas-providers", selected); }, [selected]);

  useEffect(() => {
    if (!row) { setScript(""); return; }
    let active = true;
    buildAccountsScript({ url: import.meta.env.VITE_SUPABASE_URL, key: import.meta.env.VITE_SUPABASE_ANON_KEY, token: row.token, ownName, providers: selected })
      .then((text) => { if (active) setScript(text); })
      .catch(() => { if (active) setError("No se pudo preparar el programa. Recargá la página."); });
    return () => { active = false; };
  }, [row, ownName, selected]);

  const generate = async () => {
    if (!supabase) return;
    if (row && !window.confirm("Si generás un código nuevo, el programa que ya pegaste deja de funcionar hasta que pegues el nuevo. ¿Seguir?")) return;
    setBusy(true);
    const { data, error: saveError } = await supabase.from("import_tokens").upsert({ user_id: user.id, token: newToken() }, { onConflict: "user_id" }).select("token, last_import_at, last_result").single();
    setBusy(false);
    if (saveError || !data) { setError("No se pudo generar el código. Probá de nuevo."); return; }
    setError("");
    setRow(data as TokenRow);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(script);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("No se pudo copiar. Seleccioná el texto y copialo a mano.");
    }
  };

  const toggle = (id: string) => setSelected((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));
  const manual = PROVIDERS.filter((provider) => !provider.auto);
  const hasCard = (provider: Provider) => cardsData.cards.some((card) => card.provider === provider.id || card.name.toLowerCase() === provider.name.toLowerCase());

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <ErrorBox message={error || cardsData.error} />
      <section className="rounded-[28px] bg-[var(--hero)] p-5 text-[var(--hero-text)]">
        <p className="flex items-center gap-2 text-sm opacity-80"><Mail size={16} />Bancos, billeteras y tarjetas</p>
        <p className="mt-1 text-2xl font-bold">Conectá tus cuentas</p>
        <p className="mt-2 text-sm opacity-80">Las que mandan avisos por mail se cargan solas cada 5 días. El resto las agregás como tarjeta y cargás las cuotas una vez: después avanzan solas mes a mes.</p>
        {row?.last_import_at && (
          <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs">
            <Check size={14} />Última lectura: {new Date(row.last_import_at).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            {row.last_result && <> · {row.last_result.movimientos ?? 0} movimientos nuevos</>}
          </p>
        )}
      </section>

      <Card className="space-y-3">
        <div>
          <p className="font-semibold">Se cargan solas por mail</p>
          <p className="text-sm text-[var(--muted)]">Elegí cuáles querés que lea el programa.</p>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {AUTO_PROVIDERS.map((provider) => {
            const on = selected.includes(provider.id);
            return (
              <label key={provider.id} className="flex cursor-pointer items-center gap-3 py-3">
                <ProviderIcon name={provider.name} color={provider.color} />
                <span className="min-w-0 flex-1"><span className="block font-semibold">{provider.name}</span><span className="block text-xs text-[var(--muted)]">{provider.auto}</span></span>
                <input type="checkbox" checked={on} onChange={() => toggle(provider.id)} className="h-6 w-6 accent-[var(--primary)]" />
              </label>
            );
          })}
        </div>
        <p className="flex gap-2 text-xs text-[var(--muted)]"><ShieldCheck size={16} className="shrink-0 text-[var(--income)]" />No entra a tus cuentas ni a tus tarjetas: solo lee los avisos que ya te llegaron al mail. Compras con débito o QR que no mandan aviso las seguís cargando a mano.</p>
      </Card>

      <Card className="space-y-3">
        <div>
          <p className="font-semibold">Otros bancos y billeteras</p>
          <p className="text-sm text-[var(--muted)]">Todavía no mandan avisos que se puedan leer. Agregá su tarjeta y cargá las cuotas o débitos: se ven en Fijos y tarjetas y en Inicio.</p>
        </div>
        {added && <p className="rounded-2xl bg-[var(--surface-2)] px-3 py-2 text-sm">Listo, agregaste {added}. Cargá sus cuotas desde <Link to="/gastos-fijos" className="font-semibold text-[var(--primary-text)]">Fijos y tarjetas</Link>.</p>}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {manual.map((provider) => {
            const done = hasCard(provider);
            return (
              <button key={provider.id} type="button" disabled={done} onClick={() => setAdding(provider)} className="flex items-center gap-2 rounded-2xl border border-[var(--border)] p-2 text-left hover:bg-[var(--surface-2)] disabled:opacity-70">
                <ProviderIcon name={provider.name} color={provider.color} size={32} />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{provider.name}</span><span className="block text-xs text-[var(--muted)]">{done ? "Agregada" : "Agregar tarjeta"}</span></span>
                {done ? <Check size={16} className="text-[var(--income)]" /> : <CardIcon size={16} className="text-[var(--muted)]" />}
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--primary-text)]">Paso 1</p>
          <p className="font-semibold">Generá tu código personal</p>
        </div>
        <label className="block">
          <span className={label}>Tu nombre como aparece en tus cuentas</span>
          <input value={ownName} onChange={(event) => setOwnName(event.target.value)} placeholder="Ej.: Gino Sebastian Agostinelli" className={field} />
          <span className="mt-1 block text-xs text-[var(--muted)]">Así no cuenta como gasto la plata que te pasás a vos mismo (por ejemplo, de Macro a Ualá).</span>
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
              <p className="text-sm text-[var(--muted)]">Si después cambiás las cuentas elegidas, volvé a copiarlo y pegarlo.</p>
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
              <li>Abrí <a href="https://script.google.com/home/projects/create" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-[var(--primary-text)]">script.google.com <ExternalLink size={13} /></a> con la cuenta de Gmail donde te llegan los avisos.</li>
              <li>Borrá lo que aparece escrito, pegá el programa y tocá el ícono de guardar.</li>
              <li>Arriba, en el menú de funciones, elegí <strong>activar</strong> y tocá <strong>Ejecutar</strong>.</li>
              <li>Google te pide permiso: tocá <strong>Revisar permisos</strong> y elegí tu cuenta. Si aparece "Google no verificó esta app", tocá <strong>Configuración avanzada</strong> → <strong>Ir a … (no seguro)</strong> → <strong>Permitir</strong>. Es tu propio programa.</li>
              <li>Listo: trae los últimos 60 días y después se actualiza solo cada 5 días.</li>
            </ol>
          </Card>
        </>
      )}

      {adding && <NewCardSheet initial={adding} onSave={async (input) => { const created = await cardsData.addCard(input); if (created) setAdded(created.name); return created; }} onClose={() => setAdding(null)} />}
    </div>
  );
}
