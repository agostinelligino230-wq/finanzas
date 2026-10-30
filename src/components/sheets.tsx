import { useState } from "react";
import { Check, Search, Trash2 } from "lucide-react";
import { Sheet, Tabs, sheetField as field, sheetLabel as label } from "./ui";
import { COLORS, ICONS } from "../lib/categories";
import { money, monthLabel, parseAmount, shiftMonth } from "../lib/format";
import { installmentNumber, type CardItem, type CardItemKind, type CreditCard } from "../lib/cards";
import { KIND_LABELS, PROVIDERS, initials, logoUrl, resolveProvider, type Provider } from "../lib/providers";

// Ícono del banco o billetera: se carga desde su web oficial. Mientras carga (o si no hay), se ven las iniciales.
export function ProviderIcon({ name, color, size = 40, provider }: { name: string; color: string; size?: number; provider?: string | null }) {
  const resolved = resolveProvider(provider, name);
  const domain = resolved?.domain;
  const [state, setState] = useState<"loading" | "ok" | "failed">("loading");
  const showLogo = Boolean(domain) && state === "ok";
  // Servicios sin marca (alquiler, expensas…): su ícono sobre el color.
  const ServiceIcon = !domain && resolved?.icon ? ICONS[resolved.icon] : null;
  if (ServiceIcon) return <span className="flex shrink-0 items-center justify-center rounded-2xl text-white" style={{ backgroundColor: color, width: size, height: size }}><ServiceIcon size={Math.round(size * 0.5)} /></span>;
  return (
    <span className={"relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl font-bold " + (showLogo ? "bg-white ring-1 ring-black/5" : "text-white")} style={{ backgroundColor: showLogo ? undefined : color, width: size, height: size, fontSize: Math.round(size * 0.36) }}>
      {!showLogo && initials(name)}
      {domain && state !== "failed" && (
        <img src={logoUrl(domain)} alt="" loading="lazy" referrerPolicy="no-referrer" onLoad={(event) => setState(event.currentTarget.naturalWidth <= 16 ? "failed" : "ok")} onError={() => setState("failed")} style={{ width: Math.round(size * 0.72), height: Math.round(size * 0.72) }} className={"object-contain " + (showLogo ? "" : "absolute opacity-0")} />
      )}
    </span>
  );
}

// Confirmación al marcar algo como pagado: se puede ajustar el monto y elegir si se suma a los gastos.
export function PaySheet({ title, detail, month, suggested, onConfirm, onClose }: { title: string; detail?: string; month: string; suggested: number; onConfirm: (amount: number, addToExpenses: boolean) => Promise<boolean>; onClose: () => void }) {
  const [amount, setAmount] = useState(String(Math.round(suggested * 100) / 100).replace(".", ","));
  const [add, setAdd] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const value = parseAmount(amount);
  const confirm = async () => {
    if (!(value >= 0) || amount.trim() === "") { setError("Escribí cuánto pagaste."); return; }
    setBusy(true);
    const ok = await onConfirm(value, add);
    setBusy(false);
    if (ok) onClose(); else setError("No se pudo guardar. Probá de nuevo.");
  };
  return (
    <Sheet title={"Pagar " + title} onClose={onClose}>
      {detail && <p className="-mt-2 mb-4 text-sm text-[var(--muted)]">{detail}</p>}
      <label className="block"><span className={label}>Cuánto pagaste</span><input autoFocus value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^\d.,]/g, ""))} inputMode="decimal" className={field + " text-lg font-semibold tabular-nums"} /></label>
      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl bg-[var(--surface-2)] p-4">
        <input type="checkbox" checked={add} onChange={(event) => setAdd(event.target.checked)} className="mt-0.5 h-6 w-6 shrink-0 accent-[var(--primary)]" />
        <span><span className="block font-semibold">Sumarlo a mis gastos de {monthLabel(month).toLowerCase()}</span><span className="text-sm text-[var(--muted)]">Así se descuenta de tu disponible en Inicio. Destildalo si ya lo cargaste (por ejemplo, si te aparece como transferencia).</span></span>
      </label>
      {error && <p role="alert" className="mt-4 text-sm text-[var(--expense)]">{error}</p>}
      <button type="button" disabled={busy} onClick={confirm} className="mt-5 w-full rounded-2xl bg-[var(--accent)] py-3.5 text-base font-bold text-[var(--accent-text)] disabled:opacity-60">{busy ? "Guardando…" : "Marcar como pagado"}</button>
    </Sheet>
  );
}

// Elegir banco o billetera para una tarjeta nueva.
export function NewCardSheet({ initial, onSave, onClose }: { initial?: Provider; onSave: (input: { name: string; color: string; dueDay: number | null; provider: string | null }) => Promise<CreditCard | null>; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [step, setStep] = useState<"pick" | "form">(initial ? "form" : "pick");
  const [picked, setPicked] = useState<Provider | null>(initial ?? null);
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? COLORS[6]);
  const [dueDay, setDueDay] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const text = query.trim().toLowerCase();
  const list = PROVIDERS.filter((provider) => !text || provider.name.toLowerCase().includes(text));

  const choose = (provider: Provider | null) => {
    setPicked(provider);
    setName(provider ? provider.name : query.trim());
    setColor(provider ? provider.color : COLORS[6]);
    setStep("form");
  };

  const save = async () => {
    if (!name.trim()) { setError("Poné un nombre para la tarjeta."); return; }
    setBusy(true);
    const created = await onSave({ name: name.trim(), color, dueDay: dueDay ? Math.min(31, Math.max(1, Number(dueDay))) : null, provider: picked?.id ?? null });
    setBusy(false);
    if (created) onClose(); else setError("No se pudo crear la tarjeta.");
  };

  if (step === "pick") {
    return (
      <Sheet title="¿De qué banco o billetera es?" onClose={onClose}>
        <label className="flex h-12 items-center gap-2 rounded-2xl bg-[var(--surface-2)] px-4">
          <Search size={18} className="text-[var(--muted)]" />
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar: Naranja X, Santander…" className="w-full bg-transparent text-base outline-none" />
        </label>
        {(["billetera", "banco", "tarjeta"] as const).map((kind) => {
          const group = list.filter((provider) => provider.kind === kind);
          if (group.length === 0) return null;
          return (
            <div key={kind} className="mt-4">
              <p className={label}>{KIND_LABELS[kind]}</p>
              <div className="grid grid-cols-2 gap-2">
                {group.map((provider) => (
                  <button key={provider.id} type="button" onClick={() => choose(provider)} className="flex items-center gap-2 rounded-2xl border border-[var(--border)] p-2 text-left hover:bg-[var(--surface-2)]">
                    <ProviderIcon name={provider.name} color={provider.color} provider={provider.id} size={34} />
                    <span className="min-w-0 truncate text-sm font-semibold">{provider.name}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        <button type="button" onClick={() => choose(null)} className="mt-4 h-11 w-full rounded-2xl border-2 border-dashed border-[var(--border)] text-sm font-semibold text-[var(--muted)]">{query.trim() ? "Usar “" + query.trim() + "”" : "Otra tarjeta (escribir el nombre)"}</button>
      </Sheet>
    );
  }

  return (
    <Sheet title="Nueva tarjeta" onClose={onClose}>
      <div className="flex items-center gap-3">
        <ProviderIcon key={(picked?.id ?? "") + name} name={name || "?"} color={color} provider={picked?.id} size={48} />
        <input autoFocus={!picked} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej.: Visa Santander" className={field} />
      </div>
      <label className="mt-4 block"><span className={label}>Día de vencimiento <span className="normal-case tracking-normal">(opcional)</span></span><input value={dueDay} onChange={(event) => setDueDay(event.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" placeholder="Ej.: 8" className={field} /></label>
      <p className={label + " mt-4"}>Color</p>
      <div className="flex flex-wrap gap-2">{COLORS.map((value) => <button key={value} type="button" onClick={() => setColor(value)} aria-label={"Color " + value} className="flex h-9 w-9 items-center justify-center rounded-full text-white" style={{ backgroundColor: value }}>{color === value && <Check size={16} />}</button>)}</div>
      {error && <p role="alert" className="mt-4 text-sm text-[var(--expense)]">{error}</p>}
      <button type="button" disabled={busy} onClick={save} className="mt-5 w-full rounded-2xl bg-[var(--accent)] py-3.5 text-base font-bold text-[var(--accent-text)] disabled:opacity-60">{busy ? "Guardando…" : "Crear tarjeta"}</button>
      <button type="button" onClick={() => setStep("pick")} className="mt-2 h-11 w-full text-sm font-semibold text-[var(--muted)]">Elegir otro banco</button>
    </Sheet>
  );
}

// Cuota o cargo fijo de una tarjeta. Si se abre sin tarjeta elegida, deja elegirla.
export type ItemDraft = { item?: CardItem; card?: CreditCard };

export function CardItemSheet({ draft, cards, month, onSave, onRemove, onNewCard, onClose }: {
  draft: ItemDraft; cards: CreditCard[]; month: string;
  onSave: (input: Omit<CardItem, "id"> & { id?: string }) => Promise<boolean>;
  onRemove: (item: CardItem) => Promise<boolean>;
  onNewCard: () => void;
  onClose: () => void;
}) {
  const editing = draft.item;
  const [cardId, setCardId] = useState(draft.card?.id ?? editing?.cardId ?? cards[0]?.id ?? "");
  const [kind, setKind] = useState<CardItemKind>(editing?.kind ?? "cuotas");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [amount, setAmount] = useState(editing ? String(editing.amount).replace(".", ",") : "");
  const [current, setCurrent] = useState(editing?.kind === "cuotas" ? String(Math.max(1, installmentNumber({ ...editing, kind: "fijo", endMonth: null }, month) ?? 1)) : "1");
  const [total, setTotal] = useState(editing?.installments ? String(editing.installments) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const card = cards.find((entry) => entry.id === cardId);

  const value = parseAmount(amount);
  const n = Number(current) || 0;
  const N = Number(total) || 0;
  const valid = kind === "fijo" || (n >= 1 && N >= 1 && n <= N);
  const firstMonth = kind === "cuotas" ? shiftMonth(month, -(n - 1)) : editing?.kind === "fijo" ? editing.firstMonth : month;
  const end = kind === "cuotas" && valid ? shiftMonth(firstMonth, N - 1) : null;

  const save = async () => {
    if (!card) { setError("Elegí la tarjeta."); return; }
    if (!description.trim()) { setError("Escribí qué es, por ejemplo Ventilador."); return; }
    if (!(value > 0)) { setError("Escribí el monto que pagás por mes."); return; }
    if (!valid) { setError("Revisá las cuotas: la cuota de este mes no puede ser mayor al total."); return; }
    setBusy(true);
    const ok = await onSave({ id: editing?.id, cardId: card.id, description: description.trim(), kind, amount: value, installments: kind === "cuotas" ? N : null, firstMonth, endMonth: kind === "fijo" ? editing?.endMonth ?? null : null });
    setBusy(false);
    if (ok) onClose(); else setError("No se pudo guardar.");
  };

  const stopFixed = async () => {
    if (!editing) return;
    setBusy(true);
    const ok = await onSave({ ...editing, endMonth: shiftMonth(month, -1) });
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Sheet title={editing ? "Editar en " + (card?.name ?? "la tarjeta") : "Cuota o débito de tarjeta"} onClose={onClose}>
      {!editing && (
        <div className="mb-4">
          <p className={label}>Tarjeta</p>
          <div className="flex flex-wrap gap-2">
            {cards.map((entry) => (
              <button key={entry.id} type="button" onClick={() => setCardId(entry.id)} className={"flex h-11 items-center gap-2 rounded-2xl border px-3 text-sm font-semibold " + (entry.id === cardId ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-text)]" : "border-[var(--border)]")}>
                <ProviderIcon name={entry.name} color={entry.color} provider={entry.provider} size={24} />{entry.name}
              </button>
            ))}
            <button type="button" onClick={onNewCard} className="h-11 rounded-2xl border-2 border-dashed border-[var(--border)] px-3 text-sm font-semibold text-[var(--muted)]">+ Nueva tarjeta</button>
          </div>
        </div>
      )}
      <Tabs value={kind} onChange={setKind} options={[{ value: "cuotas", label: "En cuotas" }, { value: "fijo", label: "Fijo mensual" }]} />
      <label className="mt-5 block"><span className={label}>Qué es</span><input value={description} onChange={(event) => setDescription(event.target.value)} placeholder={kind === "cuotas" ? "Ej.: Ventilador" : "Ej.: Spotify, seguro"} className={field} /></label>
      <label className="mt-4 block"><span className={label}>{kind === "cuotas" ? "Monto de cada cuota" : "Monto por mes"}</span><input value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^\d.,]/g, ""))} inputMode="decimal" placeholder="$ 0" className={field + " tabular-nums"} /></label>
      {kind === "cuotas" && (
        <div className="mt-4">
          <span className={label}>Cuota que pagás en {monthLabel(month).toLowerCase()}</span>
          <div className="flex items-center gap-3">
            <input value={current} onChange={(event) => setCurrent(event.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" aria-label="Cuota actual" className={field + " text-center tabular-nums"} />
            <span className="text-[var(--muted)]">de</span>
            <input value={total} onChange={(event) => setTotal(event.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" placeholder="12" aria-label="Total de cuotas" className={field + " text-center tabular-nums"} />
          </div>
          {valid && value > 0 && end && (
            <p className="mt-3 rounded-2xl bg-[var(--surface-2)] px-4 py-3 text-sm">
              Se cancela en <strong>{monthLabel(end).toLowerCase()}</strong>. Total de la compra {money(value * N)} · te quedan {money(value * (N - n + 1))} contando esta cuota.
            </p>
          )}
        </div>
      )}
      {error && <p role="alert" className="mt-4 text-sm text-[var(--expense)]">{error}</p>}
      <button type="button" disabled={busy} onClick={save} className="mt-5 w-full rounded-2xl bg-[var(--accent)] py-3.5 text-base font-bold text-[var(--accent-text)] disabled:opacity-60">{busy ? "Guardando…" : "Guardar"}</button>
      {editing && (
        <div className="mt-3 flex gap-2">
          {editing.kind === "fijo" && <button type="button" disabled={busy} onClick={stopFixed} className="h-11 flex-1 rounded-2xl border border-[var(--border)] text-sm font-semibold">Dar de baja desde {monthLabel(month).toLowerCase()}</button>}
          <button type="button" disabled={busy} onClick={async () => { if (window.confirm("¿Eliminar " + editing.description + "? Se borra de todos los meses.")) { if (await onRemove(editing)) onClose(); } }} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-[var(--border)] text-sm font-semibold text-[var(--expense)]"><Trash2 size={16} />Eliminar</button>
        </div>
      )}
    </Sheet>
  );
}
