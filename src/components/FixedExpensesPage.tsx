import { useEffect, useMemo, useState } from "react";
import { Check, CreditCard, Home, MoreHorizontal, Plus, Trash2, TrendingDown, TrendingUp, Wifi, Zap } from "lucide-react";
import { supabase } from "../lib/supabase";
import { readCache, writeCache } from "../lib/cache";
import { currentMonthISO, money, monthLabel, parseAmount, shiftMonth } from "../lib/format";
import { useAuth } from "./AuthGate";
import { Card, ErrorBox, MonthPicker, Sheet, sheetField as field, sheetLabel as label } from "./ui";

type Kind = "impuesto" | "suscripcion" | "alquiler" | "servicio" | "otro";
type Fixed = { id: string; name: string; amount: number; category: Kind; dueDay: number; startMonth: string | null; endMonth: string | null };
type AmountChange = { id: string; fixedId: string; month: string; amount: number };
type Payment = { fixedId: string; amount: number | null };

type FixedRow = { id: string; name: string; amount: number | string; category: string; due_day: number; start_month?: string | null; end_month?: string | null };
type AmountRow = { id: string; fixed_expense_id: string; month: string; amount: number | string };
type PaymentRow = { fixed_expense_id: string; amount?: number | string | null };

const KINDS: Kind[] = ["impuesto", "suscripcion", "alquiler", "servicio", "otro"];
const LABELS: Record<Kind, string> = { impuesto: "Impuesto", suscripcion: "Suscripción", alquiler: "Alquiler", servicio: "Servicio", otro: "Otro" };
const ICONS = { impuesto: Zap, suscripcion: CreditCard, alquiler: Home, servicio: Wifi, otro: MoreHorizontal };

const fixedFromRow = (row: FixedRow): Fixed => ({ id: row.id, name: row.name, amount: Number(row.amount), category: (KINDS.includes(row.category as Kind) ? row.category : "otro") as Kind, dueDay: row.due_day, startMonth: row.start_month ?? null, endMonth: row.end_month ?? null });
const amountFromRow = (row: AmountRow): AmountChange => ({ id: row.id, fixedId: row.fixed_expense_id, month: row.month, amount: Number(row.amount) });
const paymentFromRow = (row: PaymentRow): Payment => ({ fixedId: row.fixed_expense_id, amount: row.amount === null || row.amount === undefined ? null : Number(row.amount) });

const activeIn = (item: Fixed, month: string) => (!item.startMonth || item.startMonth <= month) && (!item.endMonth || month <= item.endMonth);

// Monto programado para un mes: el último cambio de precio desde ese mes hacia atrás, o el monto original.
function scheduled(item: Fixed, changes: AmountChange[], month: string) {
  const latest = changes.filter((change) => change.fixedId === item.id && change.month <= month).sort((a, b) => b.month.localeCompare(a.month))[0];
  return latest ? latest.amount : item.amount;
}

type Draft = { item?: Fixed };

function FixedSheet({ draft, month, amountNow, onClose, onCreate, onUpdate, onStop, onDelete }: {
  draft: Draft; month: string; amountNow: number | null; onClose: () => void;
  onCreate: (input: { name: string; amount: number; category: Kind; dueDay: number }) => Promise<boolean>;
  onUpdate: (item: Fixed, input: { name: string; amount: number; category: Kind; dueDay: number; scope: "desde" | "solo" }) => Promise<boolean>;
  onStop: (item: Fixed) => Promise<boolean>;
  onDelete: (item: Fixed) => Promise<boolean>;
}) {
  const item = draft.item;
  const [name, setName] = useState(item?.name ?? "");
  const [amount, setAmount] = useState(amountNow !== null ? String(amountNow).replace(".", ",") : "");
  const [category, setCategory] = useState<Kind>(item?.category ?? "servicio");
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
        <label className="block"><span className={label}>Tipo</span><select value={category} onChange={(event) => setCategory(event.target.value as Kind)} className={field}>{KINDS.map((kind) => <option key={kind} value={kind}>{LABELS[kind]}</option>)}</select></label>
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

export default function FixedExpensesPage() {
  const { user } = useAuth();
  const [month, setMonth] = useState(currentMonthISO());
  const [items, setItems] = useState<Fixed[]>(() => readCache<Fixed[]>("fixed_v2", user.id) ?? (readCache<FixedRow[]>("raw:fixed_expenses", user.id) ?? []).map(fixedFromRow));
  const [changes, setChanges] = useState<AmountChange[]>(() => readCache<AmountChange[]>("fixed_amounts", user.id) ?? []);
  const [payments, setPayments] = useState<Payment[]>(() => readCache<Payment[]>("payments2:" + currentMonthISO(), user.id) ?? []);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => { writeCache("fixed_v2", user.id, items); }, [items, user.id]);
  useEffect(() => { writeCache("fixed_amounts", user.id, changes); }, [changes, user.id]);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    Promise.all([
      supabase.from("fixed_expenses").select("*").order("created_at", { ascending: true }),
      supabase.from("fixed_expense_amounts").select("*"),
    ]).then(([fixed, amounts]) => {
      if (!active) return;
      if (fixed.error) { setError("No se pudieron cargar los gastos fijos."); return; }
      setItems(((fixed.data ?? []) as FixedRow[]).map(fixedFromRow));
      if (!amounts.error) setChanges(((amounts.data ?? []) as AmountRow[]).map(amountFromRow));
    });
    return () => { active = false; };
  }, [user.id]);

  useEffect(() => {
    setPayments(readCache<Payment[]>("payments2:" + month, user.id) ?? []);
    if (!supabase) return;
    let active = true;
    supabase.from("fixed_expense_payments").select("*").eq("month", month).then(({ data, error: loadError }) => {
      if (!active) return;
      if (loadError) { setError("No se pudieron cargar los pagos del mes."); return; }
      const list = ((data ?? []) as PaymentRow[]).map(paymentFromRow);
      writeCache("payments2:" + month, user.id, list);
      setPayments(list);
    });
    return () => { active = false; };
  }, [user.id, month]);

  const setMonthPayments = (update: (current: Payment[]) => Payment[]) => setPayments((current) => { const next = update(current); writeCache("payments2:" + month, user.id, next); return next; });

  const rows = useMemo(() => items.filter((item) => activeIn(item, month)).map((item) => {
    const payment = payments.find((entry) => entry.fixedId === item.id);
    const amount = payment?.amount ?? scheduled(item, changes, month);
    const previousMonth = shiftMonth(month, -1);
    const previous = activeIn(item, previousMonth) ? scheduled(item, changes, previousMonth) : null;
    return { item, amount, paid: Boolean(payment), previous: previous !== null && previous !== amount ? previous : null };
  }).sort((a, b) => a.item.dueDay - b.item.dueDay), [items, payments, changes, month]);

  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const paidTotal = rows.filter((row) => row.paid).reduce((sum, row) => sum + row.amount, 0);

  const fail = (message: string) => { setError(message); return false; };

  const togglePaid = async (row: (typeof rows)[number]) => {
    if (!supabase) return;
    if (row.paid) {
      const { error: saveError } = await supabase.from("fixed_expense_payments").delete().eq("fixed_expense_id", row.item.id).eq("month", month);
      if (saveError) { fail("No se pudo actualizar el pago."); return; }
      setMonthPayments((current) => current.filter((entry) => entry.fixedId !== row.item.id));
    } else {
      // Al marcarlo pagado se guarda el monto de ese mes: aunque después cambie el precio, este registro no se toca.
      const { error: saveError } = await supabase.from("fixed_expense_payments").insert({ user_id: user.id, fixed_expense_id: row.item.id, month, amount: row.amount });
      if (saveError) { fail("No se pudo actualizar el pago."); return; }
      setMonthPayments((current) => [...current, { fixedId: row.item.id, amount: row.amount }]);
    }
    setError("");
  };

  const create = async (input: { name: string; amount: number; category: Kind; dueDay: number }) => {
    if (!supabase) return false;
    const { data, error: saveError } = await supabase.from("fixed_expenses").insert({ user_id: user.id, name: input.name, amount: input.amount, category: input.category, due_day: input.dueDay, start_month: month }).select().single();
    if (saveError || !data) return fail("No se pudo guardar el gasto fijo.");
    setError("");
    setItems((current) => [...current, fixedFromRow(data as FixedRow)]);
    return true;
  };

  const update = async (item: Fixed, input: { name: string; amount: number; category: Kind; dueDay: number; scope: "desde" | "solo" }) => {
    if (!supabase) return false;
    const { error: saveError } = await supabase.from("fixed_expenses").update({ name: input.name, category: input.category, due_day: input.dueDay }).eq("id", item.id);
    if (saveError) return fail("No se pudo guardar el gasto fijo.");
    setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, name: input.name, category: input.category, dueDay: input.dueDay } : entry)));

    const payment = payments.find((entry) => entry.fixedId === item.id);
    const current = payment?.amount ?? scheduled(item, changes, month);
    if (input.amount !== current) {
      const nextMonth = shiftMonth(month, 1);
      const nextBefore = scheduled(item, changes, nextMonth);
      const upserts = [{ user_id: user.id, fixed_expense_id: item.id, month, amount: input.amount }];
      if (input.scope === "solo" && !changes.some((change) => change.fixedId === item.id && change.month === nextMonth)) upserts.push({ user_id: user.id, fixed_expense_id: item.id, month: nextMonth, amount: nextBefore });
      const { data, error: amountError } = await supabase.from("fixed_expense_amounts").upsert(upserts, { onConflict: "fixed_expense_id,month" }).select();
      if (amountError) return fail("No se pudo guardar el nuevo monto.");
      if (input.scope === "desde") {
        const { error: deleteError } = await supabase.from("fixed_expense_amounts").delete().eq("fixed_expense_id", item.id).gt("month", month);
        if (deleteError) return fail("No se pudo guardar el nuevo monto.");
      }
      const saved = ((data ?? []) as AmountRow[]).map(amountFromRow);
      setChanges((list) => [
        ...list.filter((change) => change.fixedId !== item.id || (!saved.some((entry) => entry.month === change.month) && !(input.scope === "desde" && change.month > month))),
        ...saved,
      ]);
      if (payment) {
        const { error: paymentError } = await supabase.from("fixed_expense_payments").update({ amount: input.amount }).eq("fixed_expense_id", item.id).eq("month", month);
        if (paymentError) return fail("No se pudo actualizar el pago de este mes.");
        setMonthPayments((list) => list.map((entry) => (entry.fixedId === item.id ? { ...entry, amount: input.amount } : entry)));
      }
    }
    setError("");
    return true;
  };

  const stop = async (item: Fixed) => {
    if (!supabase) return false;
    const endMonth = shiftMonth(month, -1);
    const { error: saveError } = await supabase.from("fixed_expenses").update({ end_month: endMonth }).eq("id", item.id);
    if (saveError) return fail("No se pudo actualizar el gasto fijo.");
    setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, endMonth } : entry)));
    return true;
  };

  const remove = async (item: Fixed) => {
    if (!supabase) return false;
    const { error: saveError } = await supabase.from("fixed_expenses").delete().eq("id", item.id);
    if (saveError) return fail("No se pudo eliminar el gasto fijo.");
    setItems((current) => current.filter((entry) => entry.id !== item.id));
    return true;
  };

  const editing = draft?.item ? rows.find((row) => row.item.id === draft.item!.id) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <ErrorBox message={error} />
      <MonthPicker month={month} onChange={(value) => { setMonth(value); setDraft(null); }} />

      <section className="rounded-[28px] bg-[var(--hero)] p-5 text-[var(--hero-text)]">
        <p className="text-sm opacity-80">Gastos fijos de {monthLabel(month).toLowerCase()}</p>
        <p className="mt-1 text-4xl font-bold tracking-tight tabular-nums">{money(total)}</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white/10 p-3"><p className="text-xs opacity-80">Ya pagado</p><p className="mt-1 text-lg font-bold tabular-nums">{money(paidTotal)}</p></div>
          <div className="rounded-2xl bg-white/10 p-3"><p className="text-xs opacity-80">Falta pagar</p><p className="mt-1 text-lg font-bold tabular-nums">{money(total - paidTotal)}</p></div>
        </div>
      </section>

      {rows.length === 0 ? (
        <Card className="py-10 text-center">
          <p className="text-base font-semibold">No hay gastos fijos en {monthLabel(month).toLowerCase()}</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Agregá alquiler, luz, gimnasio o suscripciones.</p>
        </Card>
      ) : (
        <div className="divide-y divide-[var(--border)] overflow-hidden rounded-3xl bg-[var(--surface)]">
          {rows.map((row) => {
            const Icon = ICONS[row.item.category];
            return (
              <div key={row.item.id} className="flex items-center gap-3 p-3 sm:p-4">
                <button type="button" onClick={() => togglePaid(row)} className={"flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 " + (row.paid ? "border-[var(--income)] bg-[var(--income)] text-white" : "border-[var(--border)] text-transparent")} aria-label={row.paid ? "Marcar " + row.item.name + " como pendiente" : "Marcar " + row.item.name + " como pagado"}><Check size={18} /></button>
                <button type="button" onClick={() => setDraft({ item: row.item })} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary-text)]"><Icon size={19} /></span>
                  <span className="min-w-0 flex-1">
                    <span className={"block truncate font-semibold " + (row.paid ? "text-[var(--muted)]" : "")}>{row.item.name}</span>
                    <span className="block text-xs text-[var(--muted)]">{LABELS[row.item.category]} · vence el {row.item.dueDay}{row.paid && " · pagado"}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-semibold tabular-nums">{money(row.amount)}</span>
                    {row.previous !== null && (
                      <span className="flex items-center justify-end gap-1 text-xs text-[var(--muted)]">{row.amount > row.previous ? <TrendingUp size={12} /> : <TrendingDown size={12} />}antes {money(row.previous)}</span>
                    )}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      )}

      <p className="px-2 text-xs text-[var(--muted)]">Tocá un gasto para cambiar el monto. Los meses que ya marcaste como pagados guardan lo que pagaste.</p>

      <button type="button" onClick={() => setDraft({})} className="fixed bottom-24 right-5 z-40 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-text)] shadow-xl transition hover:scale-105 lg:bottom-8 lg:right-8" aria-label="Agregar gasto fijo"><Plus size={30} strokeWidth={2.5} /></button>
      {draft && <FixedSheet key={(draft.item?.id ?? "new") + month} draft={draft} month={month} amountNow={editing ? editing.amount : null} onClose={() => setDraft(null)} onCreate={create} onUpdate={update} onStop={stop} onDelete={remove} />}
    </div>
  );
}
