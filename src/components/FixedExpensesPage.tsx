import { useEffect, useState } from "react";
import { CalendarClock, Check, CreditCard as CardIcon, Home, MoreHorizontal, Plus, Search, Trash2, TrendingDown, TrendingUp, Wifi, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { money, monthLabel, parseAmount, usd } from "../lib/format";
import { currentCycle } from "../../shared/cobro";
import { FIXED_KINDS, FIXED_LABELS, PAYMENT_LABELS, PAYMENT_METHODS, REMINDER_OPTIONS, countedFixedRows, insideStatement, useFixed, type Fixed, type FixedInput, type FixedKind, type FixedRowView, type PaymentMethod } from "../lib/fixed";
import { COLORS } from "../lib/categories";
import { SERVICE_PROVIDERS, type Provider } from "../lib/providers";
import { cardMonthSummary, installmentNumber, itemsForMonth, lastMonth, useCards, type CreditCard } from "../lib/cards";
import { useAuth } from "./AuthGate";
import IconColorPicker from "./IconColorPicker";
import { Card, CategoryIcon, ErrorBox, MonthPicker, Sheet, sheetField as field, sheetLabel as label } from "./ui";
import { CardItemSheet, NewCardSheet, PaySheet, ProviderIcon, type ItemDraft } from "./sheets";

const ICONS = { impuesto: Zap, suscripcion: CardIcon, alquiler: Home, servicio: Wifi, otro: MoreHorizontal };

function ServicePicker({ query, onQuery, onPick, onOther }: { query: string; onQuery: (text: string) => void; onPick: (provider: Provider) => void; onOther: () => void }) {
  const text = query.trim().toLowerCase();
  const list = SERVICE_PROVIDERS.filter((provider) => !text || provider.name.toLowerCase().includes(text));
  return (
    <>
      <label className="flex h-12 items-center gap-2 rounded-2xl bg-[var(--surface-2)] px-4">
        <Search size={18} className="text-[var(--muted)]" />
        <input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Buscar: Edenor, Netflix, alquiler…" aria-label="Buscar servicio" className="w-full bg-transparent text-base outline-none" />
      </label>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {list.map((provider) => (
          <button key={provider.id} type="button" onClick={() => onPick(provider)} className="flex items-center gap-2 rounded-2xl border border-[var(--border)] p-2 text-left hover:bg-[var(--surface-2)]">
            <ProviderIcon name={provider.name} color={provider.color} provider={provider.id} size={34} />
            <span className="min-w-0 truncate text-sm font-semibold">{provider.name}</span>
          </button>
        ))}
      </div>
      <button type="button" onClick={onOther} className="mt-3 h-11 w-full rounded-2xl border-2 border-dashed border-[var(--border)] text-sm font-semibold text-[var(--muted)]">{query.trim() ? "Usar “" + query.trim() + "”" : "Otro (escribir el nombre)"}</button>
    </>
  );
}

function FixedSheet({ item, month, amountNow, cards, onClose, onCreate, onUpdate, onStop, onDelete }: {
  item?: Fixed; month: string; amountNow: number | null; cards: CreditCard[]; onClose: () => void;
  onCreate: (input: FixedInput) => Promise<boolean>;
  onUpdate: (item: Fixed, input: FixedInput & { scope: "desde" | "solo" }) => Promise<boolean>;
  onStop: (item: Fixed) => Promise<boolean>;
  onDelete: (item: Fixed) => Promise<boolean>;
}) {
  const [choosing, setChoosing] = useState(!item);
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState<string | null>(item?.provider ?? null);
  const [name, setName] = useState(item?.name ?? "");
  const [color, setColor] = useState(item?.color ?? COLORS[5]);
  const [icon, setIcon] = useState(item?.icon ?? "Tag");
  const [styling, setStyling] = useState(false);
  const [amount, setAmount] = useState(amountNow !== null ? String(amountNow).replace(".", ",") : "");
  const [currency, setCurrency] = useState<"ARS" | "USD">(item?.currency ?? "ARS");
  const [variable, setVariable] = useState(item?.variable ?? false);
  const [category, setCategory] = useState<FixedKind>(item?.category ?? "servicio");
  const [method, setMethod] = useState<PaymentMethod | null>(item?.paymentMethod ?? null);
  const [cardId, setCardId] = useState(item?.cardId ?? cards[0]?.id ?? "");
  const [dueDay, setDueDay] = useState(item ? String(item.dueDay) : "");
  const [reminder, setReminder] = useState<number | null>(item?.reminderDays ?? null);
  const [start, setStart] = useState(item ? item.startMonth ?? "" : month);
  const [end, setEnd] = useState(item?.endMonth ?? "");
  const [note, setNote] = useState(item?.note ?? "");
  const [scope, setScope] = useState<"desde" | "solo">("desde");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const value = parseAmount(amount);
  const changedAmount = item && amountNow !== null && value !== amountNow;
  const monthName = monthLabel(month).toLowerCase();
  const day = Number(dueDay);
  const pick = (entry: Provider) => { setProvider(entry.id); setName(entry.name); setColor(entry.color); if (entry.fixedKind) setCategory(entry.fixedKind); setChoosing(false); };

  const save = async () => {
    if (!name.trim()) { setError("Elegí el servicio o escribí qué gasto es."); return; }
    if (!(value >= 0) || amount.trim() === "") { setError("Escribí el monto."); return; }
    if (!(day >= 1 && day <= 31)) { setError("Escribí el día de vencimiento, del 1 al 31."); return; }
    if (method === "tarjeta" && !cardId) { setError("Elegí la tarjeta."); return; }
    if (start && end && end < start) { setError("El mes de fin no puede ser anterior al de inicio."); return; }
    const input: FixedInput = { name: name.trim(), amount: value, category, dueDay: day, provider, icon: provider ? null : icon, color, currency, paymentMethod: method, cardId: method === "tarjeta" ? cardId : null, reminderDays: reminder, variable, startMonth: start || null, endMonth: end || null, note };
    setBusy(true);
    const ok = item ? await onUpdate(item, { ...input, scope }) : await onCreate(input);
    setBusy(false);
    if (ok) onClose(); else setError("No se pudo guardar. Probá de nuevo.");
  };

  const run = async (action: () => Promise<boolean>) => { setBusy(true); const ok = await action(); setBusy(false); if (ok) onClose(); };

  return (
    <Sheet title={item ? "Editar gasto fijo" : "Nuevo gasto fijo"} onClose={onClose}>
      <span className={label}>Servicio</span>
      {choosing ? <ServicePicker query={query} onQuery={setQuery} onPick={pick} onOther={() => { setProvider(null); setName(query.trim()); setChoosing(false); }} /> : (
        <>
          <div className="flex items-center gap-3">
            {provider ? <ProviderIcon key={provider} name={name || "?"} color={color} provider={provider} size={44} /> : <CategoryIcon category={{ icon, color }} size={44} />}
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej.: Gimnasio, luz, alquiler" aria-label="Nombre del gasto" className={field} />
          </div>
          <div className="mt-2 flex gap-4 text-sm font-semibold text-[var(--primary-text)]">
            <button type="button" onClick={() => setChoosing(true)}>Elegir otro servicio</button>
            <button type="button" onClick={() => setStyling(!styling)}>{styling ? "Listo" : "Cambiar ícono y color"}</button>
          </div>
          {styling && <div className="mt-3 space-y-3"><IconColorPicker icon={icon} color={color} onIcon={(next) => { setIcon(next); setProvider(null); }} onColor={setColor} /></div>}
          <label className="mt-3 block"><span className={label}>Tipo</span><select value={category} onChange={(event) => setCategory(event.target.value as FixedKind)} className={field}>{FIXED_KINDS.map((kind) => <option key={kind} value={kind}>{FIXED_LABELS[kind]}</option>)}</select></label>
        </>
      )}

      <div className="mt-5 flex items-center justify-between gap-2">
        <span className={label + " mb-0"}>Monto en {monthName}</span>
        <div className="flex rounded-full bg-[var(--surface-2)] p-1 text-xs font-semibold">
          {(["ARS", "USD"] as const).map((entry) => <button key={entry} type="button" disabled={Boolean(item)} onClick={() => setCurrency(entry)} className={"h-7 rounded-full px-3 disabled:opacity-60 " + (currency === entry ? "bg-[var(--surface)] text-[var(--text)] shadow-sm" : "text-[var(--muted)]")}>{entry === "ARS" ? "Pesos" : "Dólares"}</button>)}
        </div>
      </div>
      <input value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^\d.,]/g, ""))} inputMode="decimal" placeholder={currency === "USD" ? "US$ 0" : "$ 0"} aria-label="Monto" className={field + " mt-2 tabular-nums"} />
      <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={variable} onChange={(event) => setVariable(event.target.checked)} className="h-5 w-5 accent-[var(--primary)]" />Varía todos los meses</label>
      {changedAmount && (
        <div className="mt-3 space-y-2 rounded-2xl bg-[var(--surface-2)] p-3 text-sm">
          <p className="font-semibold">¿Desde cuándo cambia el monto?</p>
          <label className="flex cursor-pointer items-start gap-2"><input type="radio" checked={scope === "desde"} onChange={() => setScope("desde")} className="mt-0.5 h-5 w-5 accent-[var(--primary)]" /><span>Desde {monthName} en adelante <span className="block text-xs text-[var(--muted)]">Los meses anteriores quedan como estaban.</span></span></label>
          <label className="flex cursor-pointer items-start gap-2"><input type="radio" checked={scope === "solo"} onChange={() => setScope("solo")} className="mt-0.5 h-5 w-5 accent-[var(--primary)]" /><span>Solo en {monthName} <span className="block text-xs text-[var(--muted)]">El mes que viene vuelve al monto anterior.</span></span></label>
        </div>
      )}

      <p className={label + " mt-5"}>Cómo lo pagás <span className="normal-case tracking-normal">(opcional)</span></p>
      <div className="flex flex-wrap gap-2">
        {PAYMENT_METHODS.map((entry) => <button key={entry} type="button" onClick={() => setMethod(method === entry ? null : entry)} className={"h-10 rounded-full border px-3 text-sm font-semibold " + (method === entry ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-text)]" : "border-[var(--border)]")}>{PAYMENT_LABELS[entry]}</button>)}
      </div>
      {method === "tarjeta" && (cards.length === 0 ? <p className="mt-2 text-sm text-[var(--muted)]">Todavía no cargaste tarjetas: agregala en Tarjetas y volvé.</p> : (
        <div className="mt-2 flex flex-wrap gap-2">
          {cards.map((card) => <button key={card.id} type="button" onClick={() => setCardId(card.id)} className={"flex h-11 items-center gap-2 rounded-2xl border px-3 text-sm font-semibold " + (card.id === cardId ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-text)]" : "border-[var(--border)]")}><ProviderIcon name={card.name} color={card.color} provider={card.provider} size={24} />{card.name}</button>)}
        </div>
      ))}

      <div className="mt-5 grid grid-cols-2 gap-3">
        <label className="block"><span className={label}>Vence el día</span><input value={dueDay} onChange={(event) => setDueDay(event.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" placeholder="1 a 31" className={field + " tabular-nums"} /></label>
        <label className="block"><span className={label}>Aviso</span><select value={reminder ?? ""} onChange={(event) => setReminder(event.target.value === "" ? null : Number(event.target.value))} className={field}>{REMINDER_OPTIONS.map((option) => <option key={option.label} value={option.value ?? ""}>{option.label}</option>)}</select></label>
      </div>
      {day > 28 && day <= 31 && <p className="mt-2 text-xs text-[var(--muted)]">Si el mes tiene menos días, vence el último día del mes.</p>}

      <div className="mt-5 grid grid-cols-2 gap-3">
        <label className="block"><span className={label}>Desde qué mes</span><input type="month" value={start} onChange={(event) => setStart(event.target.value)} className={field} /></label>
        <label className="block"><span className={label}>Hasta <span className="normal-case tracking-normal">(opcional)</span></span><input type="month" value={end} onChange={(event) => setEnd(event.target.value)} className={field} /></label>
      </div>
      <label className="mt-4 block"><span className={label}>Nota <span className="normal-case tracking-normal">(opcional)</span></span><input value={note} onChange={(event) => setNote(event.target.value)} maxLength={200} placeholder="Ej.: número de cliente 12345" className={field} /></label>

      {error && <p role="alert" className="mt-4 text-sm text-[var(--expense)]">{error}</p>}
      <button type="button" disabled={busy} onClick={save} className="mt-5 w-full rounded-2xl bg-[var(--accent)] py-3.5 text-base font-bold text-[var(--accent-text)] disabled:opacity-60">{busy ? "Guardando…" : item ? "Guardar cambios" : "Agregar gasto fijo"}</button>
      {item && (
        <div className="mt-3 flex gap-2">
          <button type="button" disabled={busy} onClick={() => run(() => onStop(item))} className="h-11 flex-1 rounded-2xl border border-[var(--border)] text-sm font-semibold">Ya no lo pago desde {monthName}</button>
          <button type="button" disabled={busy} onClick={() => { if (window.confirm("¿Borrar " + item.name + " de todos los meses, incluido el historial?")) run(() => onDelete(item)); }} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--border)] text-[var(--expense)]" aria-label="Borrar del todo"><Trash2 size={18} /></button>
        </div>
      )}
    </Sheet>
  );
}

// Logo del servicio, el ícono elegido o, en los fijos viejos, el ícono de su tipo.
function FixedIcon({ item }: { item: Fixed }) {
  if (item.provider) return <ProviderIcon name={item.name} color={item.color ?? "#607D8B"} provider={item.provider} />;
  if (item.icon) return <CategoryIcon category={{ icon: item.icon, color: item.color ?? "#607D8B" }} />;
  const Icon = ICONS[item.category];
  return <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary-text)]"><Icon size={19} /></span>;
}

function PaidCheck({ paid, label: text, onClick }: { paid: boolean; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={"flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 " + (paid ? "border-[var(--income)] bg-[var(--income)] text-white" : "border-[var(--border)] text-transparent")} aria-label={text}><Check size={18} /></button>;
}

type Paying = { kind: "fijo"; row: FixedRowView } | { kind: "tarjeta"; card: CreditCard; amount: number };

export default function FixedExpensesPage() {
  const { user, cobro } = useAuth();
  const [month, setMonth] = useState(() => currentCycle(cobro));
  const fixed = useFixed(user.id, month);
  const cardsData = useCards(user.id);
  const { cards, items, statements, payments } = cardsData;
  const [editing, setEditing] = useState<{ item?: Fixed } | null>(null);
  const [cardDraft, setCardDraft] = useState<ItemDraft | null>(null);
  const [newCard, setNewCard] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [paying, setPaying] = useState<Paying | null>(null);

  useEffect(() => { setEditing(null); setCardDraft(null); setPaying(null); }, [month]);

  const cardRows = cards.map((card) => ({ card, summary: cardMonthSummary(items, statements, card.id, month, payments), list: itemsForMonth(items, card.id, month).sort((a, b) => b.amount - a.amount) })).filter((entry) => entry.summary.total > 0 || entry.list.length > 0);
  // Lo pagado con tarjeta ya está adentro del resumen cuando llegó: no se suma dos veces.
  const countedRows = countedFixedRows(fixed.rows, statements, month);
  const fixedTotal = countedRows.reduce((sum, row) => sum + row.amount, 0);
  const cardsTotal = cardRows.reduce((sum, entry) => sum + entry.summary.total, 0);
  const paidTotal = countedRows.filter((row) => row.paid).reduce((sum, row) => sum + row.amount, 0) + cardRows.filter((entry) => entry.summary.payment).reduce((sum, entry) => sum + entry.summary.total, 0);
  const total = fixedTotal + cardsTotal;
  const editingRow = editing?.item ? fixed.rows.find((row) => row.item.id === editing.item!.id) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <ErrorBox message={fixed.error || cardsData.error} />
      <MonthPicker month={month} onChange={setMonth} />

      <section className="rounded-[28px] bg-[var(--hero)] p-5 text-[var(--hero-text)]">
        <p className="text-sm opacity-80">Fijos y tarjetas de {monthLabel(month).toLowerCase()}</p>
        <p className="mt-1 text-4xl font-bold tracking-tight tabular-nums">{money(total)}</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white/10 p-3"><p className="text-xs opacity-80">Ya pagado</p><p className="mt-1 text-lg font-bold tabular-nums">{money(paidTotal)}</p></div>
          <div className="rounded-2xl bg-white/10 p-3"><p className="text-xs opacity-80">Falta pagar</p><p className="mt-1 text-lg font-bold tabular-nums">{money(total - paidTotal)}</p></div>
        </div>
        <p className="mt-3 text-xs opacity-75">Al marcar algo como pagado se suma a tus gastos del mes en Inicio.</p>
      </section>

      <section className="space-y-2">
        <h2 className="flex items-center justify-between px-2 text-sm font-semibold text-[var(--muted)]"><span className="flex items-center gap-2"><CalendarClock size={16} />Gastos fijos</span><span className="tabular-nums">{money(fixedTotal)}</span></h2>
        {fixed.rows.length === 0 ? (
          <Card className="py-6 text-center text-sm text-[var(--muted)]">No hay gastos fijos en {monthLabel(month).toLowerCase()}. Agregá alquiler, luz o gimnasio con el botón +.</Card>
        ) : (
          <div className="divide-y divide-[var(--border)] overflow-hidden rounded-3xl bg-[var(--surface)]">
            {fixed.rows.map((row) => {
              const card = row.item.paymentMethod === "tarjeta" ? cards.find((entry) => entry.id === row.item.cardId) : null;
              return (
                <div key={row.item.id} className="flex items-center gap-3 p-3 sm:p-4">
                  <PaidCheck paid={row.paid} label={row.paid ? "Marcar " + row.item.name + " como pendiente" : "Pagar " + row.item.name} onClick={() => { if (row.paid) { if (window.confirm("¿Desmarcar " + row.item.name + "? Si lo sumaste a tus gastos, también se quita.")) fixed.unpay(row); } else setPaying({ kind: "fijo", row }); }} />
                  <button type="button" onClick={() => setEditing({ item: row.item })} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <FixedIcon item={row.item} />
                    <span className="min-w-0 flex-1">
                      <span className={"block truncate font-semibold " + (row.paid ? "text-[var(--muted)]" : "")}>{row.item.name}</span>
                      <span className="block truncate text-xs text-[var(--muted)]">{FIXED_LABELS[row.item.category]} · vence el {row.item.dueDay}{card && " · en tarjeta " + card.name}{insideStatement(row, statements, month) && " · dentro del resumen"}{row.item.variable && " · varía"}{row.paid && " · pagado"}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-semibold tabular-nums">{row.usd !== null ? usd(row.usd) : money(row.amount)}</span>
                      {row.usd !== null && row.amount > 0 && <span className="block text-xs text-[var(--muted)] tabular-nums">≈ {money(row.amount)}</span>}
                      {row.previous !== null && <span className="flex items-center justify-end gap-1 text-xs text-[var(--muted)]">{row.amount > row.previous ? <TrendingUp size={12} /> : <TrendingDown size={12} />}antes {money(row.previous)}</span>}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="flex items-center justify-between px-2 text-sm font-semibold text-[var(--muted)]"><span className="flex items-center gap-2"><CardIcon size={16} />De tarjeta</span><span className="tabular-nums">{money(cardsTotal)}</span></h2>
        {cardRows.length === 0 ? (
          <Card className="py-6 text-center text-sm text-[var(--muted)]">No hay cuotas ni débitos de tarjeta en {monthLabel(month).toLowerCase()}.</Card>
        ) : cardRows.map(({ card, summary, list }) => (
          <div key={card.id} className="overflow-hidden rounded-3xl bg-[var(--surface)]">
            <div className="flex items-center gap-3 p-3 sm:p-4">
              <PaidCheck paid={Boolean(summary.payment)} label={summary.payment ? "Desmarcar el pago de " + card.name : "Pagar " + card.name} onClick={() => { if (summary.payment) { if (window.confirm("¿Desmarcar el pago de " + card.name + "? También se quita de tus gastos del mes.")) cardsData.unpayCard(card, month); } else setPaying({ kind: "tarjeta", card, amount: summary.total }); }} />
              <ProviderIcon name={card.name} color={card.color} provider={card.provider} />
              <div className="min-w-0 flex-1">
                <p className={"truncate font-semibold " + (summary.payment ? "text-[var(--muted)]" : "")}>Tarjeta {card.name}</p>
                <p className="text-xs text-[var(--muted)]">{summary.payment ? "Pagada" : summary.statement ? "Según el resumen del mail" : list.length + (list.length === 1 ? " cuota o débito" : " cuotas y débitos")}{card.dueDay ? " · vence el " + card.dueDay : ""}</p>
              </div>
              <span className="shrink-0 font-bold tabular-nums">{money(summary.total)}</span>
            </div>
            {list.length > 0 && (
              <div className="divide-y divide-[var(--border)] border-t border-[var(--border)] pl-[60px] pr-3 sm:pr-4">
                {list.map((item) => {
                  const n = installmentNumber(item, month) ?? 1;
                  const last = lastMonth(item);
                  return (
                    <button key={item.id} type="button" onClick={() => setCardDraft({ card, item })} className="flex w-full items-center gap-3 py-2.5 text-left">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{item.description}</span>
                        <span className="block text-xs text-[var(--muted)]">{item.kind === "cuotas" ? "Cuota " + n + " de " + item.installments + (n === item.installments ? " · última" : last ? " · termina en " + monthLabel(last).toLowerCase() : "") : "Débito fijo"}</span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">{money(item.amount)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
        <Link to="/tarjetas" className="block px-2 text-sm font-semibold text-[var(--primary-text)]">Ver tarjetas y resúmenes →</Link>
      </section>

      <button type="button" onClick={() => setChoosing(true)} className="fixed bottom-24 right-5 z-40 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-text)] shadow-xl transition hover:scale-105 lg:bottom-8 lg:right-8" aria-label="Agregar"><Plus size={30} strokeWidth={2.5} /></button>

      {choosing && (
        <Sheet title="¿Qué querés agregar?" onClose={() => setChoosing(false)}>
          <div className="space-y-2">
            <button type="button" onClick={() => { setChoosing(false); setEditing({}); }} className="flex w-full items-center gap-3 rounded-2xl border border-[var(--border)] p-4 text-left hover:bg-[var(--surface-2)]"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary-text)]"><CalendarClock size={20} /></span><span><span className="block font-semibold">Gasto fijo</span><span className="text-sm text-[var(--muted)]">Alquiler, luz, gimnasio, internet…</span></span></button>
            <button type="button" onClick={() => { setChoosing(false); if (cards.length === 0) setNewCard(true); else setCardDraft({}); }} className="flex w-full items-center gap-3 rounded-2xl border border-[var(--border)] p-4 text-left hover:bg-[var(--surface-2)]"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary-text)]"><CardIcon size={20} /></span><span><span className="block font-semibold">Cuota o débito de tarjeta</span><span className="text-sm text-[var(--muted)]">Ventilador en 12 cuotas, Spotify en la tarjeta…</span></span></button>
          </div>
        </Sheet>
      )}

      {editing && <FixedSheet key={(editing.item?.id ?? "new") + month} item={editing.item} month={month} amountNow={editingRow ? editingRow.usd ?? editingRow.amount : null} cards={cards} onClose={() => setEditing(null)} onCreate={fixed.create} onUpdate={fixed.update} onStop={fixed.stop} onDelete={fixed.remove} />}
      {cardDraft && <CardItemSheet key={(cardDraft.item?.id ?? "new") + month} draft={cardDraft} cards={cards} month={month} onSave={cardsData.saveItem} onRemove={cardsData.removeItem} onNewCard={() => { setCardDraft(null); setNewCard(true); }} onClose={() => setCardDraft(null)} />}
      {newCard && <NewCardSheet onSave={async (input) => { const created = await cardsData.addCard(input); if (created) setTimeout(() => setCardDraft({ card: created }), 0); return created; }} onClose={() => setNewCard(false)} />}
      {paying?.kind === "fijo" && <PaySheet title={paying.row.item.name} month={month} suggested={paying.row.amount} onConfirm={(amount, add) => fixed.pay(paying.row, amount, add)} onClose={() => setPaying(null)} />}
      {paying?.kind === "tarjeta" && <PaySheet title={"tarjeta " + paying.card.name} detail={"Resumen de " + monthLabel(month).toLowerCase()} month={month} suggested={paying.amount} onConfirm={(amount, add) => cardsData.payCard(paying.card, month, amount, add)} onClose={() => setPaying(null)} />}
    </div>
  );
}
