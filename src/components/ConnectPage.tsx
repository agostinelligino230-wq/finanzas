import { useEffect, useState } from "react";
import { CalendarDays, Check, Mail, Plus, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { AUTO_PROVIDERS, KIND_LABELS, PROVIDERS, type Provider } from "../lib/providers";
import { useCards } from "../lib/cards";
import { isInstant, useGmail } from "../lib/gmail";
import { useAuth } from "./AuthGate";
import { Card, ErrorBox, sheetLabel as label } from "./ui";
import { NewCardSheet, ProviderIcon } from "./sheets";
import StatementSources from "./StatementSources";
import CobroForm from "./CobroForm";
import { cobroText, currentCycle, cycleText } from "../../shared/cobro";

const RETURN_MESSAGES: Record<string, { text: string; ok: boolean }> = {
  ok: { text: "¡Listo! Tu Gmail quedó conectado y ya trajimos tus últimos movimientos. Abajo te preguntamos si analizamos los resúmenes de tus tarjetas.", ok: true },
  cancelado: { text: "No se conectó: cancelaste en la pantalla de Google.", ok: false },
  "sin-permiso": { text: "Falta un permiso: en la pantalla de Google tildá “Ver tus mensajes de correo electrónico” y probá de nuevo.", ok: false },
  error: { text: "Algo falló al conectar. Probá de nuevo.", ok: false },
};

export default function ConnectPage() {
  const { user, cobro, setCobro } = useAuth();
  const [editingCobro, setEditingCobro] = useState(false);
  const cardsData = useCards(user.id);
  const gmail = useGmail(user.id);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState<Provider | null>(null);
  const [added, setAdded] = useState("");

  // Mensaje al volver de Google (…/conectar?gmail=ok).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("gmail");
    if (!status) return;
    setNotice(RETURN_MESSAGES[status] ?? RETURN_MESSAGES.error);
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const link = gmail.link;
  const providers = link?.providers ?? AUTO_PROVIDERS.map((provider) => provider.id);
  const toggle = (id: string) => gmail.setProviders(providers.includes(id) ? providers.filter((entry) => entry !== id) : [...providers, id]);
  const text = query.trim().toLowerCase();
  const manual = PROVIDERS.filter((provider) => !provider.auto && (!text || provider.name.toLowerCase().includes(text)));
  const hasCard = (provider: Provider) => cardsData.cards.some((card) => card.provider === provider.id || card.name.toLowerCase() === provider.name.toLowerCase());

  const refresh = async () => {
    const result = await gmail.refresh();
    if (result) setNotice({ text: result.movimientos ? "Actualizado: " + result.movimientos + (result.movimientos === 1 ? " movimiento nuevo." : " movimientos nuevos.") : "Actualizado: no había movimientos nuevos.", ok: true });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <ErrorBox message={gmail.error || cardsData.error} />
      {notice && <p role="status" className={"rounded-2xl px-4 py-3 text-sm font-medium " + (notice.ok ? "bg-[var(--surface)] text-[var(--income)]" : "bg-[var(--expense-soft)] text-[var(--expense)]")}>{notice.text}</p>}

      <section className="rounded-[28px] bg-[var(--hero)] p-5 text-[var(--hero-text)]">
        <p className="flex items-center gap-2 text-sm opacity-80"><Mail size={16} />Bancos, billeteras y tarjetas</p>
        <p className="mt-1 text-2xl font-bold">Conectá tus cuentas</p>
        <p className="mt-2 text-sm opacity-80">Conectá tu Gmail y los avisos de tus cuentas se cargan solos, apenas llegan. Las demás las agregás como tarjeta.</p>
      </section>

      <Card className="space-y-3">
        {editingCobro ? <CobroForm userId={user.id} current={cobro} onSaved={(value) => { setCobro(value); setEditingCobro(false); }} /> : (
          <div className="flex items-center gap-3">
            <CalendarDays size={20} className="shrink-0 text-[var(--primary-text)]" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Cobrás {cobroText(cobro)}</p>
              <p className="text-sm text-[var(--muted)]">{cycleText(currentCycle(cobro), cobro) ? "Tu mes de ahora va " + cycleText(currentCycle(cobro), cobro) + "." : "Tus meses van del 1 al último día."}</p>
            </div>
            <button type="button" onClick={() => setEditingCobro(true)} className="h-10 shrink-0 rounded-xl border border-[var(--border)] px-3 text-sm font-semibold hover:bg-[var(--surface-2)]">Cambiar</button>
          </div>
        )}
      </Card>

      <Card className="space-y-4">
        {link ? (
          <>
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-2)] text-[var(--income)]"><Check size={22} /></span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">Gmail conectado</p>
                <p className="truncate text-sm text-[var(--muted)]">{link.email ?? "Tu cuenta de Google"}</p>
                <p className="text-xs text-[var(--muted)]">{isInstant(link) ? <><span className="font-semibold text-[var(--income)]">Al instante</span>: cada aviso entra apenas llega el mail.</> : "Se lee una vez por día y cuando tocás «Actualizar ahora»."}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[var(--surface-2)] px-3 py-2 text-sm">
              <span className="text-[var(--muted)]">{link.last_sync_at ? "Última lectura: " + new Date(link.last_sync_at).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Todavía no se leyó"}{link.last_result?.movimientos ? " · " + link.last_result.movimientos + " nuevos" : ""}</span>
              <button type="button" disabled={gmail.busy} onClick={refresh} className="inline-flex items-center gap-1.5 font-semibold text-[var(--primary-text)] disabled:opacity-60"><RefreshCw size={15} className={gmail.busy ? "animate-spin" : ""} />{gmail.busy ? "Leyendo…" : "Actualizar ahora"}</button>
            </div>
          </>
        ) : (
          <>
            <div>
              <p className="text-lg font-semibold">Conectá tu Gmail</p>
              <p className="text-sm text-[var(--muted)]">Entrás con tu cuenta de Google, aceptás y listo. Se hace una sola vez.</p>
            </div>
            <button type="button" disabled={!gmail.loaded || gmail.busy} onClick={gmail.connect} className="flex h-13 w-full items-center justify-center gap-3 rounded-2xl border border-[var(--border)] bg-white py-3.5 text-base font-semibold text-[#1f1f1f] shadow-sm disabled:opacity-60">
              <Mail size={20} className="text-[#ea4335]" />{gmail.busy ? "Abriendo Google…" : "Conectar con Google"}
            </button>
            <p className="text-xs text-[var(--muted)]">Como la app es nueva, Google puede mostrarte un aviso: tocá <strong>Configuración avanzada</strong> → <strong>Ir a Finanzas Personales</strong> y después <strong>Continuar</strong>.</p>
          </>
        )}

        <div>
          <p className={label}>{link ? "Qué se carga solo" : "Qué se va a cargar solo"}</p>
          <div className="divide-y divide-[var(--border)]">
            {AUTO_PROVIDERS.map((provider) => (
              <label key={provider.id} className={"flex items-center gap-3 py-3 " + (link ? "cursor-pointer" : "")}>
                <ProviderIcon name={provider.name} color={provider.color} provider={provider.id} />
                <span className="min-w-0 flex-1"><span className="block font-semibold">{provider.name}</span><span className="block text-xs text-[var(--muted)]">{provider.auto}</span></span>
                {link && <input type="checkbox" checked={providers.includes(provider.id)} onChange={() => toggle(provider.id)} className="h-6 w-6 accent-[var(--primary)]" />}
              </label>
            ))}
          </div>
        </div>

        <p className="flex gap-2 text-xs text-[var(--muted)]"><ShieldCheck size={16} className="shrink-0 text-[var(--income)]" />Solo pedimos permiso para leer: nunca enviamos, borramos ni tocamos tus mails, y solo miramos los avisos de estas cuentas.</p>
        {link && <button type="button" onClick={() => { if (window.confirm("¿Desconectar tu Gmail? Los movimientos que ya se cargaron quedan.")) gmail.disconnect(); }} className="text-xs font-semibold text-[var(--muted)] hover:text-[var(--expense)]">Desconectar Gmail</button>}
      </Card>

      {link && <StatementSources userId={user.id} />}

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

      {adding && <NewCardSheet initial={adding.id ? adding : undefined} onSave={async (input) => { const created = await cardsData.addCard(input); if (created) setAdded(created.name); return created; }} onClose={() => setAdding(null)} />}
    </div>
  );
}
