import { useEffect, useState } from "react";
import { CalendarClock, Check, CreditCard as CardIcon, Home, MoreHorizontal, Plus, Trash2, TrendingDown, TrendingUp, Wifi, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { money, monthLabel, parseAmount } from "../lib/format";
import { currentCycle } from "../../shared/cobro";
import { FIXED_KINDS, FIXED_LABELS, useFixed, type Fixed, type FixedInput, type FixedKind, type FixedRowView } from "../lib/fixed";
import { cardMonthSummary, installmentNumber, itemsForMonth, lastMonth, useCards, type CreditCard } from "../lib/cards";
import { useAuth } from "./AuthGate";
import { Card, ErrorBox, MonthPicker, Sheet, sheetField as field, sheetLabel as label } from "./ui";
import { CardItemSheet, NewCardSheet, PaySheet, ProviderIcon, type ItemDraft } from "./sheets";

const ICONS = { impuesto: Zap, suscripcion: CardIcon, alquiler: Home, servicio: Wifi, otro: MoreHorizontal };

function FixedSheet({ item, month, amountNow, onClose, onCreate, onUpdate, onStop, onDelete }: {
  item?: Fixed; month: string; amountNow: number | null; onClose: () => void;
  onCreate: (input: FixedInput) => Promise<boolean>;
  onUpdate: (item: Fixed, input: FixedInput & { scope: "desde" | "solo" }) => Promise<boolean>;
  onStop: (item: Fixed) => Promise<boolean>;
  onDelete: (item: Fixed) => Promise<boolean>;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [amount, setAmount] = useState(amountNow !== null ? String(amountNow).replace(".", ",") : "");
  const [category, setCategory] = useState<FixedKind>(item?.category ?? "servicio");
  const [dueDay, setDueDay] = useState(String(item?.dueDay ?? 1));
  const [scope, setScope] = useState<"desde" | "solo">("desde");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const value = parseAmount(amount);
  const changedAmount = item && amountNow !== null && value !== amountNow;
  const monthName = monthLabel(month).toLowerCase();

  const save = async () => {
    if (!name.trim()) { setError("Escribí qué gasto es, por ejemplo Gimnasio."); return; }
    if (!(value >= 0) || amount.trim() === "") { setError("Escribí el monto."); return; }
    const input = { name: name.trim(), amount: value, category, dueDay: Math.min(31, Math.max(1, Number(dueDay) || 1)) };
    setBusy(true);
    const ok = item ? await onUpdate(item, { ...input, scope }) : await onCreate(input);
    setBusy(false);
    if (ok) onClose(); else setError("No se pudo guardar. Probá de nuevo.");
  };

  const run = async (action: () => Promise<boolean>) => { setBusy(true); const ok = await action(); setBusy(false); if (ok) onClose(); };

  return (
    <Sheet title={item ? "Editar gasto fijo" : "Nuevo gasto fijo"} onClose={onClose}>
      <label className="block"><span className={label}>Qué es</span><input autoFocus={!item} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej.: Gimnasio, luz, alquiler" className={field} /></label>
      <label className="mt-4 block"><span className={label}>Monto en {monthName}</span><input value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^\d.,]/g, ""))} inputMode="decimal" placeholder="$ 0" className={field + " tabular-nums"} /></label>
      {changedAmount && (
        <div className="mt-3 space-y-2 rounded-2xl bg-[var(--surface-2)] p-3 text-sm">
          <p className="font-semibold">¿Desde cuándo cambia el monto?</p>
          <label className="flex cursor-pointer items-start gap-2"><input type="radio" checked={scope === "desde"} onChange={() => setScope("desde")} className="mt-0.5 h-5 w-5 accent-[var(--primary)]" /><span>Desde {monthName} en adelante <span className="block text-xs text-[var(--muted)]">Los meses anteriores quedan como estaban.</span></span></label>
          <label className="flex cursor-pointer items-start gap-2"><input type="radio" checked={scope === "solo"} onChange={() => setScope("solo")} className="mt-0.5 h-5 w-5 accent-[var(--primary)]" /><span>Solo en {monthName} <span className="block text-xs text-[var(--muted)]">El mes que viene vuelve al monto anterior.</span></span></label>
        </div>
      )}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="block"><span className={label}>Tipo</span><select value={category} onChange={(event) => setCategory(event.target.value as FixedKind)} className={field}>{FIXED_KINDS.map((kind) => <option key={kind} value={kind}>{FIXED_LABELS[kind]}</option>)}</select></label>
        <label className="block"><span className={label}>Vence el día</span><input value={dueDay} onChange={(event) => setDueDay(event.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" className={field + " tabular-nums"} /></label>
      </div>
      {!item && <p className="mt-3 text-xs text-[var(--muted)]">Empieza a contar desde {monthName}.</p>}
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
  const fixedTotal = fixed.rows.reduce((sum, row) => sum + row.amount, 0);
  const cardsTotal = cardRows.reduce((sum, entry) => sum + entry.summary.total, 0);
  const paidTotal = fixed.rows.filter((row) => row.paid).reduce((sum, row) => sum + row.amount, 0) + cardRows.filter((entry) => entry.summary.payment).reduce((sum, entry) => sum + entry.summary.total, 0);
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
              const Icon = ICONS[row.item.category];
              return (
                <div key={row.item.id} className="flex items-center gap-3 p-3 sm:p-4">
                  <PaidCheck paid={row.paid} label={row.paid ? "Marcar " + row.item.name + " como pendiente" : "Pagar " + row.item.name} onClick={() => { if (row.paid) { if (window.confirm("¿Desmarcar " + row.item.name + "? Si lo sumaste a tus gastos, también se quita.")) fixed.unpay(row); } else setPaying({ kind: "fijo", row }); }} />
                  <button type="button" onClick={() => setEditing({ item: row.item })} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary-text)]"><Icon size={19} /></span>
                    <span className="min-w-0 flex-1">
                      <span className={"block truncate font-semibold " + (row.paid ? "text-[var(--muted)]" : "")}>{row.item.name}</span>
                      <span className="block text-xs text-[var(--muted)]">{FIXED_LABELS[row.item.category]} · vence el {row.item.dueDay}{row.paid && " · pagado"}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-semibold tabular-nums">{money(row.amount)}</span>
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

      {editing && <FixedSheet key={(editing.item?.id ?? "new") + month} item={editing.item} month={month} amountNow={editingRow ? editingRow.amount : null} onClose={() => setEditing(null)} onCreate={fixed.create} onUpdate={fixed.update} onStop={fixed.stop} onDelete={fixed.remove} />}
      {cardDraft && <CardItemSheet key={(cardDraft.item?.id ?? "new") + month} draft={cardDraft} cards={cards} month={month} onSave={cardsData.saveItem} onRemove={cardsData.removeItem} onNewCard={() => { setCardDraft(null); setNewCard(true); }} onClose={() => setCardDraft(null)} />}
      {newCard && <NewCardSheet onSave={async (input) => { const created = await cardsData.addCard(input); if (created) setTimeout(() => setCardDraft({ card: created }), 0); return created; }} onClose={() => setNewCard(false)} />}
      {paying?.kind === "fijo" && <PaySheet title={paying.row.item.name} month={month} suggested={paying.row.amount} onConfirm={(amount, add) => fixed.pay(paying.row, amount, add)} onClose={() => setPaying(null)} />}
      {paying?.kind === "tarjeta" && <PaySheet title={"tarjeta " + paying.card.name} detail={"Resumen de " + monthLabel(month).toLowerCase()} month={month} suggested={paying.amount} onConfirm={(amount, add) => cardsData.payCard(paying.card, month, amount, add)} onClose={() => setPaying(null)} />}
    </div>
  );
}
