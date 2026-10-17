import { useEffect, useState } from "react";
import { Check, ChevronDown, Copy, ExternalLink, Mail, Plus, Search, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { buildAccountsScript } from "../lib/ualaScript";
import { AUTO_PROVIDERS, KIND_LABELS, PROVIDERS, type Provider } from "../lib/providers";
import { useCards } from "../lib/cards";
import { useAuth } from "./AuthGate";
import { Card, ErrorBox, Sheet, sheetField as field, sheetLabel as label } from "./ui";
import { NewCardSheet, ProviderIcon } from "./sheets";

type TokenRow = { token: string; last_import_at: string | null; last_result: { movimientos?: number; resumenes?: number } | null };

const newToken = () => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const readSaved = <T,>(key: string, fallback: T): T => { try { const value = localStorage.getItem(key); return value ? (JSON.parse(value) as T) : fallback; } catch { return fallback; } };
const save = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* sin almacenamiento */ } };

// Guía para conectar Gmail: se hace una sola vez. El código personal se crea solo y nunca se muestra.
function GmailSetup({ row, providers, onRow, onClose }: { row: TokenRow | null; providers: string[]; onRow: (row: TokenRow) => void; onClose: () => void }) {
  const { user } = useAuth();
  const [ownName, setOwnName] = useState(() => readSaved("finanzas-own-name-v2", ""));
  const [script, setScript] = useState("");
  const [copied, setCopied] = useState(false);
  const [showText, setShowText] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { save("finanzas-own-name-v2", ownName); }, [ownName]);

  // Si todavía no hay código personal, se crea en silencio al abrir la guía.
  useEffect(() => {
    if (row || !supabase) return;
    supabase.from("import_tokens").upsert({ user_id: user.id, token: newToken() }, { onConflict: "user_id" }).select("token, last_import_at, last_result").single().then(({ data, error: saveError }) => {
      if (saveError || !data) setError("No se pudo preparar la conexión. ¿Ya se actualizó la base de datos?");
      else onRow(data as TokenRow);
    });
  }, [row, user.id, onRow]);

  useEffect(() => {
    if (!row) return;
    let active = true;
    buildAccountsScript({ url: import.meta.env.VITE_SUPABASE_URL, key: import.meta.env.VITE_SUPABASE_ANON_KEY, token: row.token, ownName, providers })
      .then((text) => { if (active) setScript(text); })
      .catch(() => { if (active) setError("No se pudo preparar el lector. Recargá la página."); });
    return () => { active = false; };
  }, [row, ownName, providers]);

  const copyAndOpen = async () => {
    try {
      await navigator.clipboard.writeText(script);
      setCopied(true);
    } catch {
      setShowText(true);
      setError("No se pudo copiar solo. Abrí “Ver el texto” y copialo a mano.");
    }
    window.open("https://script.google.com/home/projects/create", "_blank", "noopener");
  };

  return (
    <Sheet title="Conectar tu Gmail" onClose={onClose}>
      <p className="-mt-2 text-sm text-[var(--muted)]">Se hace <strong className="text-[var(--text)]">una sola vez</strong>. Google no deja que una app lea tu Gmail sin una revisión de seguridad muy cara, así que el lector queda guardado en tu propia cuenta de Google y desde ahí carga tus avisos cada 5 días.</p>

      <label className="mt-4 block">
        <span className={label}>1 · Tu nombre como aparece en tus cuentas</span>
        <input value={ownName} onChange={(event) => setOwnName(event.target.value)} placeholder="Ej.: Gino Sebastian Agostinelli" className={field} />
        <span className="mt-1 block text-xs text-[var(--muted)]">Para no contar como gasto la plata que te pasás a vos mismo.</span>
      </label>

      <div className="mt-4">
        <p className={label}>2 · Copiá el lector y abrí Google</p>
        <button type="button" disabled={!script} onClick={copyAndOpen} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] font-bold text-[var(--accent-text)] disabled:opacity-60">{copied ? <><Check size={18} />Copiado · se abrió Google</> : <><Copy size={18} />Copiar y abrir Google</>}</button>
        <p className="mt-1 text-xs text-[var(--muted)]">Entrá con la cuenta de Gmail donde te llegan los avisos.</p>
      </div>

      <div className="mt-4">
        <p className={label}>3 · En Google</p>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm">
          <li>Borrá lo que aparece escrito y pegá (mantené apretado → Pegar, o Ctrl+V).</li>
          <li>Tocá el ícono de guardar.</li>
          <li>Arriba elegí <strong>activar</strong> y tocá <strong>Ejecutar</strong>.</li>
          <li>Tocá <strong>Revisar permisos</strong> → tu cuenta. Si dice "Google no verificó esta app": <strong>Configuración avanzada</strong> → <strong>Ir a… (no seguro)</strong> → <strong>Permitir</strong>. Es tu propio lector.</li>
        </ol>
      </div>

      {error && <p role="alert" className="mt-4 text-sm text-[var(--expense)]">{error}</p>}
      <button type="button" onClick={() => setShowText((value) => !value)} className="mt-4 flex items-center gap-1 text-xs font-semibold text-[var(--muted)]"><ChevronDown size={14} className={showText ? "rotate-180" : ""} />Ver el texto</button>
      {showText && <textarea readOnly value={script} rows={5} onFocus={(event) => event.currentTarget.select()} className="mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-3 font-mono text-xs" aria-label="Lector para Google" />}
      <button type="button" onClick={onClose} className="mt-5 h-11 w-full rounded-2xl border border-[var(--border)] font-semibold">Listo</button>
    </Sheet>
  );
}

export default function ConnectPage() {
  const { user } = useAuth();
  const cardsData = useCards(user.id);
  const [row, setRow] = useState<TokenRow | null>(null);
  const [selected, setSelected] = useState<string[]>(() => readSaved("finanzas-providers", AUTO_PROVIDERS.map((provider) => provider.id)));
  const [error, setError] = useState("");
  const [setup, setSetup] = useState(false);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState<Provider | null>(null);
  const [added, setAdded] = useState("");

  useEffect(() => {
    if (!supabase) return;
    supabase.from("import_tokens").select("token, last_import_at, last_result").maybeSingle().then(({ data, error: loadError }) => {
      if (loadError) setError("No se pudo cargar la conexión. ¿Ya se actualizó la base de datos?");
      setRow((data as TokenRow | null) ?? null);
    });
  }, [user.id]);

  useEffect(() => { save("finanzas-providers", selected); }, [selected]);

  const toggle = (id: string) => setSelected((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));
  const connected = Boolean(row?.last_import_at);
  const text = query.trim().toLowerCase();
  const manual = PROVIDERS.filter((provider) => !provider.auto && (!text || provider.name.toLowerCase().includes(text)));
  const hasCard = (provider: Provider) => cardsData.cards.some((card) => card.provider === provider.id || card.name.toLowerCase() === provider.name.toLowerCase());

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <ErrorBox message={error || cardsData.error} />
      <section className="rounded-[28px] bg-[var(--hero)] p-5 text-[var(--hero-text)]">
        <p className="flex items-center gap-2 text-sm opacity-80"><Mail size={16} />Bancos, billeteras y tarjetas</p>
        <p className="mt-1 text-2xl font-bold">Conectá tus cuentas</p>
        <p className="mt-2 text-sm opacity-80">Las que te mandan avisos por mail se cargan solas. Las demás las agregás como tarjeta y cargás las cuotas una vez.</p>
      </section>

      <Card className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold">Se cargan solas por mail</p>
            <p className="text-sm text-[var(--muted)]">{connected ? "Tu Gmail está conectado." : "Conectá tu Gmail una vez y listo."}</p>
          </div>
          {connected && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--surface-2)] px-3 py-1 text-xs font-semibold text-[var(--income)]"><Check size={14} />Conectado</span>}
        </div>
        <div className="divide-y divide-[var(--border)]">
          {AUTO_PROVIDERS.map((provider) => (
            <label key={provider.id} className="flex cursor-pointer items-center gap-3 py-3">
              <ProviderIcon name={provider.name} color={provider.color} provider={provider.id} />
              <span className="min-w-0 flex-1"><span className="block font-semibold">{provider.name}</span><span className="block text-xs text-[var(--muted)]">{provider.auto}</span></span>
              <input type="checkbox" checked={selected.includes(provider.id)} onChange={() => toggle(provider.id)} className="h-6 w-6 accent-[var(--primary)]" />
            </label>
          ))}
        </div>
        {connected ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[var(--surface-2)] px-3 py-2 text-sm">
            <span>Última lectura: {new Date(row!.last_import_at!).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}{row?.last_result && " · " + (row.last_result.movimientos ?? 0) + " nuevos"}</span>
            <button type="button" onClick={() => setSetup(true)} className="text-xs font-semibold text-[var(--primary-text)]">Volver a configurar</button>
          </div>
        ) : (
          <button type="button" onClick={() => setSetup(true)} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--primary)] font-semibold text-white"><Mail size={18} />Conectar Gmail</button>
        )}
        <p className="flex gap-2 text-xs text-[var(--muted)]"><ShieldCheck size={16} className="shrink-0 text-[var(--income)]" />No entra a tus cuentas ni a tus tarjetas: solo lee los avisos que ya te llegaron al mail.</p>
      </Card>

      <Card className="space-y-3">
        <div>
          <p className="font-semibold">Otros bancos, billeteras y tarjetas</p>
          <p className="text-sm text-[var(--muted)]">Agregá su tarjeta y cargá cuotas o débitos: se ven en Fijos y tarjetas y en Inicio.</p>
        </div>
        <label className="flex h-12 items-center gap-2 rounded-2xl bg-[var(--surface-2)] px-4">
          <Search size={18} className="text-[var(--muted)]" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar: Santander, Naranja X, Brubank…" className="w-full bg-transparent text-base outline-none" />
        </label>
        {added && <p className="rounded-2xl bg-[var(--surface-2)] px-3 py-2 text-sm">Listo, agregaste {added}. Cargá sus cuotas desde <Link to="/gastos-fijos" className="font-semibold text-[var(--primary-text)]">Fijos y tarjetas</Link>.</p>}
        {(["billetera", "banco", "tarjeta"] as const).map((kind) => {
          const group = manual.filter((provider) => provider.kind === kind);
          if (group.length === 0) return null;
          return (
            <div key={kind}>
              <p className={label}>{KIND_LABELS[kind]}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {group.map((provider) => {
                  const done = hasCard(provider);
                  return (
                    <button key={provider.id} type="button" disabled={done} onClick={() => setAdding(provider)} className="flex items-center gap-2 rounded-2xl border border-[var(--border)] p-2 text-left hover:bg-[var(--surface-2)] disabled:opacity-70">
                      <ProviderIcon name={provider.name} color={provider.color} provider={provider.id} size={34} />
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{provider.name}</span><span className="block text-xs text-[var(--muted)]">{done ? "Agregada" : "Agregar"}</span></span>
                      {done ? <Check size={16} className="shrink-0 text-[var(--income)]" /> : <Plus size={16} className="shrink-0 text-[var(--muted)]" />}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {manual.length === 0 && (
          <button type="button" onClick={() => setAdding({ id: "", name: query.trim(), kind: "tarjeta", color: "#5B6CF0" })} className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--border)] text-sm font-semibold text-[var(--muted)]"><Plus size={16} />Agregar “{query.trim()}”</button>
        )}
      </Card>

      {setup && <GmailSetup row={row} providers={selected} onRow={setRow} onClose={() => setSetup(false)} />}
      {adding && <NewCardSheet initial={adding.id ? adding : undefined} onSave={async (input) => { const created = await cardsData.addCard(input); if (created) setAdded(created.name); return created; }} onClose={() => setAdding(null)} />}
      <a href="https://script.google.com/home" target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1 text-xs text-[var(--muted)]">Ver tu lector en Google <ExternalLink size={12} /></a>
    </div>
  );
}
