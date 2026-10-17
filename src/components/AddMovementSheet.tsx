import { useEffect, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { COLORS, ICON_GROUPS, ICONS, type Category } from "../lib/categories";
import { daysAgoISO, money, parseAmount, todayISO, usd } from "../lib/format";
import type { Currency, MovementType, NewMovement } from "../lib/movements";
import { getDollarQuote, type DollarQuote } from "../lib/dollar";
import { CategoryIcon, Tabs } from "./ui";

type Props = {
  open: boolean;
  initialKind: MovementType;
  categories: Category[];
  onAddCategory: (input: { name: string; kind: MovementType; icon: string; color: string }) => Promise<Category | null>;
  onSave: (input: NewMovement) => Promise<boolean>;
  onClose: () => void;
};

const field = "h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 text-base outline-none focus:border-[var(--primary)]";

function CategoryCreator({ kind, onCreate, onCancel }: { kind: MovementType; onCreate: Props["onAddCategory"]; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("Tag");
  const [color, setColor] = useState(COLORS[5]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const create = async () => {
    if (!name.trim()) { setError("Poné un nombre para la categoría."); return; }
    setBusy(true);
    const created = await onCreate({ name: name.trim(), kind, icon, color });
    setBusy(false);
    if (!created) setError("No se pudo crear la categoría. Probá de nuevo.");
  };

  return (
    <div className="space-y-4 rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
      <div className="flex items-center gap-3">
        <CategoryIcon category={{ icon, color }} size={44} />
        <input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder={kind === "gasto" ? "Ej.: Plataformas" : "Ej.: Alquiler cobrado"} className={field + " bg-[var(--surface)]"} />
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Color</p>
        <div className="flex flex-wrap gap-2">
          {COLORS.map((value) => <button key={value} type="button" onClick={() => setColor(value)} aria-label={"Color " + value} className="flex h-8 w-8 items-center justify-center rounded-full text-white" style={{ backgroundColor: value }}>{color === value && <Check size={16} />}</button>)}
        </div>
      </div>
      <div className="max-h-56 space-y-3 overflow-y-auto pr-1">
        {ICON_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{group.label}</p>
            <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
              {group.icons.map((name) => { const Icon = ICONS[name]; const active = icon === name; return <button key={name} type="button" onClick={() => setIcon(name)} aria-label={name} className="flex aspect-square items-center justify-center rounded-full border" style={active ? { backgroundColor: color, borderColor: color, color: "#fff" } : { borderColor: "var(--border)" }}><Icon size={18} /></button>; })}
            </div>
          </div>
        ))}
      </div>
      {error && <p className="text-sm text-[var(--expense)]">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="h-11 flex-1 rounded-2xl border border-[var(--border)] font-semibold">Cancelar</button>
        <button type="button" disabled={busy} onClick={create} className="h-11 flex-1 rounded-2xl bg-[var(--primary)] font-semibold text-white disabled:opacity-60">{busy ? "Creando…" : "Crear categoría"}</button>
      </div>
    </div>
  );
}

export default function AddMovementSheet({ open, initialKind, categories, onAddCategory, onSave, onClose }: Props) {
  const [kind, setKind] = useState<MovementType>(initialKind);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [date, setDate] = useState(todayISO());
  const [description, setDescription] = useState("");
  const [paid, setPaid] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [currency, setCurrency] = useState<Currency>("ARS");
  const [rate, setRate] = useState("");
  const [rateTouched, setRateTouched] = useState(false);
  const [quote, setQuote] = useState<DollarQuote | null>(null);
  const [quoteState, setQuoteState] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    if (!open) return;
    setKind(initialKind); setAmount(""); setCategory(""); setDate(todayISO()); setDescription(""); setPaid(true); setCreating(false); setError("");
    setCurrency("ARS"); setRate(""); setRateTouched(false);
  }, [open, initialKind]);

  // Al elegir dólares, trae la cotización del momento y la propone (se puede cambiar).
  useEffect(() => {
    if (!open || currency !== "USD" || quote) return;
    let active = true;
    setQuoteState("loading");
    getDollarQuote().then((result) => { if (!active) return; setQuote(result); setQuoteState(result ? "idle" : "error"); });
    return () => { active = false; };
  }, [open, currency, quote]);

  useEffect(() => {
    if (currency !== "USD" || !quote || rateTouched) return;
    setRate(String(Math.round(kind === "ingreso" ? quote.buy : quote.sell)));
  }, [currency, quote, kind, rateTouched]);

  if (!open) return null;

  const list = categories.filter((item) => item.kind === kind);
  const value = parseAmount(amount);
  const rateValue = parseAmount(rate);
  const pesos = currency === "USD" ? Math.round(value * rateValue * 100) / 100 : value;
  const quickDates = [{ label: "Hoy", value: todayISO() }, { label: "Ayer", value: daysAgoISO(1) }, { label: "Anteayer", value: daysAgoISO(2) }];
  const isQuick = quickDates.some((item) => item.value === date);

  const changeKind = (next: MovementType) => { setKind(next); setCategory(""); setCreating(false); };

  const save = async () => {
    if (!(value > 0)) { setError("Escribí un monto mayor a cero."); return; }
    if (currency === "USD" && !(rateValue > 0)) { setError("Escribí a cuántos pesos está el dólar."); return; }
    if (!category) { setError("Elegí una categoría."); return; }
    if (!date) { setError("Elegí una fecha."); return; }
    setBusy(true);
    const ok = await onSave({ description: description.trim(), amount: pesos, category, date, type: kind, paid: kind === "ingreso" ? true : paid, ...(currency === "USD" ? { currency: "USD" as const, original: value, rate: rateValue } : {}) });
    setBusy(false);
    if (ok) onClose();
    else setError("No se pudo guardar. Revisá tu conexión y probá de nuevo.");
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Agregar movimiento" onClick={(event) => event.stopPropagation()} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[28px] bg-[var(--surface)] p-5 pb-8 text-[var(--text)] shadow-2xl sm:rounded-[28px]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Nuevo movimiento</h2>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-[var(--surface-2)]" aria-label="Cerrar"><X size={20} /></button>
        </div>
        <Tabs value={kind} onChange={changeKind} options={[{ value: "gasto", label: "Gasto" }, { value: "ingreso", label: "Ingreso" }]} />

        <div className="mt-4 flex justify-center">
          <div className="flex rounded-full bg-[var(--surface-2)] p-1 text-sm font-semibold">
            {(["ARS", "USD"] as const).map((item) => <button key={item} type="button" onClick={() => setCurrency(item)} className={"h-8 rounded-full px-4 " + (currency === item ? "bg-[var(--surface)] text-[var(--text)] shadow-sm" : "text-[var(--muted)]")}>{item === "ARS" ? "$ Pesos" : "US$ Dólares"}</button>)}
          </div>
        </div>

        <div className="mt-3 text-center">
          <input value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^\d.,]/g, ""))} inputMode="decimal" placeholder="0" aria-label="Monto" className="w-full bg-transparent text-center text-4xl font-bold tabular-nums outline-none placeholder:text-[var(--muted)]" style={{ color: kind === "gasto" ? "var(--expense)" : "var(--income)" }} />
          {currency === "ARS" ? (
            <p className="mt-1 text-sm text-[var(--muted)]">{value > 0 ? money(value) : "Pesos argentinos"}</p>
          ) : (
            <div className="mt-2 space-y-2">
              <p className="text-sm text-[var(--muted)]">{value > 0 ? usd(value) : "Dólares"}{value > 0 && rateValue > 0 && <> ≈ <strong className="text-[var(--text)]">{money(pesos)}</strong></>}</p>
              <label className="mx-auto flex max-w-xs items-center gap-2 rounded-2xl bg-[var(--surface-2)] px-4 py-2 text-left">
                <span className="whitespace-nowrap text-sm text-[var(--muted)]">1 US$ =</span>
                <input value={rate} onChange={(event) => { setRate(event.target.value.replace(/[^\d.,]/g, "")); setRateTouched(true); }} inputMode="decimal" placeholder="Cotización" aria-label="Cotización del dólar en pesos" className="w-full bg-transparent text-base font-semibold tabular-nums outline-none" />
                <span className="text-sm text-[var(--muted)]">pesos</span>
              </label>
              <p className="text-xs text-[var(--muted)]">
                {quoteState === "loading" ? "Buscando la cotización…" : quote ? <>Sugerida: {quote.source} ({kind === "ingreso" ? "compra" : "venta"}). Cambiala por la de Wallbit si es distinta.</> : quoteState === "error" ? "No pude traer la cotización: escribí la que te muestra Wallbit." : ""}
              </p>
            </div>
          )}
        </div>

        <p className="mb-3 mt-5 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Categoría</p>
        {creating ? (
          <CategoryCreator kind={kind} onCancel={() => setCreating(false)} onCreate={async (input) => { const created = await onAddCategory(input); if (created) { setCategory(created.id); setCreating(false); } return created; }} />
        ) : (
          <div className="grid grid-cols-4 gap-x-2 gap-y-4">
            {list.map((item) => {
              const active = category === item.id;
              return (
                <button key={item.id} type="button" onClick={() => setCategory(item.id)} className="flex flex-col items-center gap-1.5">
                  <span className={"rounded-full p-0.5 " + (active ? "ring-2 ring-[var(--text)] ring-offset-2 ring-offset-[var(--surface)]" : "")}><CategoryIcon category={item} size={48} /></span>
                  <span className={"w-full truncate text-center text-xs " + (active ? "font-bold" : "text-[var(--muted)]")}>{item.name}</span>
                </button>
              );
            })}
            <button type="button" onClick={() => setCreating(true)} className="flex flex-col items-center gap-1.5">
              <span className="flex h-[52px] w-[52px] items-center justify-center rounded-full border-2 border-dashed border-[var(--border)] text-[var(--muted)]"><Plus size={22} /></span>
              <span className="text-xs text-[var(--muted)]">Crear</span>
            </button>
          </div>
        )}

        <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Fecha</p>
        <div className="flex flex-wrap items-center gap-2">
          {quickDates.map((item) => <button key={item.label} type="button" onClick={() => setDate(item.value)} className={"h-10 rounded-full px-4 text-sm font-semibold " + (date === item.value ? "bg-[var(--primary)] text-white" : "bg-[var(--surface-2)] text-[var(--muted)]")}>{item.label}</button>)}
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} aria-label="Otra fecha" className={"h-10 rounded-full border px-3 text-sm " + (isQuick ? "border-[var(--border)] bg-transparent text-[var(--muted)]" : "border-[var(--primary)] bg-[var(--primary-soft)]")} />
        </div>

        <label className="mt-5 block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Detalle <span className="normal-case tracking-normal">(opcional)</span></span>
          <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder={kind === "gasto" ? "Ej.: luz, gas, súper" : "Ej.: sueldo de octubre"} className={field} />
        </label>

        {kind === "gasto" && (
          <label className="mt-4 flex cursor-pointer items-center justify-between rounded-2xl bg-[var(--surface-2)] px-4 py-3">
            <span><span className="block font-semibold">Ya lo pagué</span><span className="text-sm text-[var(--muted)]">Si no, queda como pendiente de pago.</span></span>
            <input type="checkbox" checked={paid} onChange={(event) => setPaid(event.target.checked)} className="h-6 w-6 accent-[var(--primary)]" />
          </label>
        )}

        {error && <p role="alert" className="mt-4 rounded-2xl bg-[var(--expense-soft)] px-4 py-3 text-sm text-[var(--expense)]">{error}</p>}

        <button type="button" disabled={busy} onClick={save} className="mt-5 h-13 w-full rounded-2xl bg-[var(--accent)] py-3.5 text-base font-bold text-[var(--accent-text)] disabled:opacity-60">
          {busy ? "Guardando…" : kind === "gasto" ? "Agregar gasto" : "Agregar ingreso"}
        </button>
      </div>
    </div>
  );
}
