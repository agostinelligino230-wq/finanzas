import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import { readCache, writeCache } from "./cache";
import { shiftMonth } from "./format";
import { addLinkedExpense, fixedExternalId, payDate, removeLinkedExpense } from "./obligations";

export type FixedKind = "impuesto" | "suscripcion" | "alquiler" | "servicio" | "otro";
export type Fixed = { id: string; name: string; amount: number; category: FixedKind; dueDay: number; startMonth: string | null; endMonth: string | null };
type AmountChange = { id: string; fixedId: string; month: string; amount: number };
type Payment = { fixedId: string; amount: number | null };
export type FixedRowView = { item: Fixed; amount: number; paid: boolean; previous: number | null };

type FixedRow = { id: string; name: string; amount: number | string; category: string; due_day: number; start_month?: string | null; end_month?: string | null };
type AmountRow = { id: string; fixed_expense_id: string; month: string; amount: number | string };
type PaymentRow = { fixed_expense_id: string; amount?: number | string | null };

export const FIXED_KINDS: FixedKind[] = ["impuesto", "suscripcion", "alquiler", "servicio", "otro"];
export const FIXED_LABELS: Record<FixedKind, string> = { impuesto: "Impuesto", suscripcion: "Suscripción", alquiler: "Alquiler", servicio: "Servicio", otro: "Otro" };
// En qué categoría de gastos cae cada gasto fijo cuando se paga.
const EXPENSE_CATEGORY: Record<FixedKind, string> = { impuesto: "impuestos", suscripcion: "ocio", alquiler: "hogar", servicio: "hogar", otro: "otro" };

const fixedFromRow = (row: FixedRow): Fixed => ({ id: row.id, name: row.name, amount: Number(row.amount), category: (FIXED_KINDS.includes(row.category as FixedKind) ? row.category : "otro") as FixedKind, dueDay: row.due_day, startMonth: row.start_month ?? null, endMonth: row.end_month ?? null });
const amountFromRow = (row: AmountRow): AmountChange => ({ id: row.id, fixedId: row.fixed_expense_id, month: row.month, amount: Number(row.amount) });
const paymentFromRow = (row: PaymentRow): Payment => ({ fixedId: row.fixed_expense_id, amount: row.amount === null || row.amount === undefined ? null : Number(row.amount) });

const activeIn = (item: Fixed, month: string) => (!item.startMonth || item.startMonth <= month) && (!item.endMonth || month <= item.endMonth);

// Monto programado para un mes: el último cambio de precio desde ese mes hacia atrás, o el monto original.
function scheduled(item: Fixed, changes: AmountChange[], month: string) {
  const latest = changes.filter((change) => change.fixedId === item.id && change.month <= month).sort((a, b) => b.month.localeCompare(a.month))[0];
  return latest ? latest.amount : item.amount;
}

export type FixedInput = { name: string; amount: number; category: FixedKind; dueDay: number };

export function useFixed(userId: string, month: string) {
  const [items, setItems] = useState<Fixed[]>(() => readCache<Fixed[]>("fixed_v2", userId) ?? (readCache<FixedRow[]>("raw:fixed_expenses", userId) ?? []).map(fixedFromRow));
  const [changes, setChanges] = useState<AmountChange[]>(() => readCache<AmountChange[]>("fixed_amounts", userId) ?? []);
  const [payments, setPayments] = useState<Payment[]>(() => readCache<Payment[]>("payments2:" + month, userId) ?? []);
  const [error, setError] = useState("");

  useEffect(() => { writeCache("fixed_v2", userId, items); }, [items, userId]);
  useEffect(() => { writeCache("fixed_amounts", userId, changes); }, [changes, userId]);

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
  }, [userId]);

  useEffect(() => {
    setPayments(readCache<Payment[]>("payments2:" + month, userId) ?? []);
    if (!supabase) return;
    let active = true;
    supabase.from("fixed_expense_payments").select("*").eq("month", month).then(({ data, error: loadError }) => {
      if (!active) return;
      if (loadError) { setError("No se pudieron cargar los pagos del mes."); return; }
      const list = ((data ?? []) as PaymentRow[]).map(paymentFromRow);
      writeCache("payments2:" + month, userId, list);
      setPayments(list);
    });
    return () => { active = false; };
  }, [userId, month]);

  const setMonthPayments = (update: (current: Payment[]) => Payment[]) => setPayments((current) => { const next = update(current); writeCache("payments2:" + month, userId, next); return next; });

  const rows: FixedRowView[] = useMemo(() => items.filter((item) => activeIn(item, month)).map((item) => {
    const payment = payments.find((entry) => entry.fixedId === item.id);
    const amount = payment?.amount ?? scheduled(item, changes, month);
    const previousMonth = shiftMonth(month, -1);
    const previous = activeIn(item, previousMonth) ? scheduled(item, changes, previousMonth) : null;
    return { item, amount, paid: Boolean(payment), previous: previous !== null && previous !== amount ? previous : null };
  }).sort((a, b) => a.item.dueDay - b.item.dueDay), [items, payments, changes, month]);

  const fail = (message: string) => { setError(message); return false; };

  // Pagar: guarda el monto de ese mes y (si se elige) lo suma a los gastos del mes.
  const pay = async (row: FixedRowView, amount: number, addToExpenses: boolean) => {
    if (!supabase) return false;
    const { error: saveError } = await supabase.from("fixed_expense_payments").upsert({ user_id: userId, fixed_expense_id: row.item.id, month, amount }, { onConflict: "fixed_expense_id,month" });
    if (saveError) return fail("No se pudo marcar como pagado.");
    if (addToExpenses) {
      const ok = await addLinkedExpense(userId, { externalId: fixedExternalId(row.item.id, month), description: row.item.name, amount, category: EXPENSE_CATEGORY[row.item.category], date: payDate(month, row.item.dueDay), source: "fijo" });
      if (!ok) return fail("Se marcó como pagado, pero no se pudo sumar a tus gastos.");
    }
    setMonthPayments((current) => [...current.filter((entry) => entry.fixedId !== row.item.id), { fixedId: row.item.id, amount }]);
    setError("");
    return true;
  };

  const unpay = async (row: FixedRowView) => {
    if (!supabase) return false;
    const { error: saveError } = await supabase.from("fixed_expense_payments").delete().eq("fixed_expense_id", row.item.id).eq("month", month);
    if (saveError) return fail("No se pudo actualizar el pago.");
    await removeLinkedExpense(fixedExternalId(row.item.id, month));
    setMonthPayments((current) => current.filter((entry) => entry.fixedId !== row.item.id));
    setError("");
    return true;
  };

  const create = async (input: FixedInput) => {
    if (!supabase) return false;
    const { data, error: saveError } = await supabase.from("fixed_expenses").insert({ user_id: userId, name: input.name, amount: input.amount, category: input.category, due_day: input.dueDay, start_month: month }).select().single();
    if (saveError || !data) return fail("No se pudo guardar el gasto fijo.");
    setError("");
    setItems((current) => [...current, fixedFromRow(data as FixedRow)]);
    return true;
  };

  const update = async (item: Fixed, input: FixedInput & { scope: "desde" | "solo" }) => {
    if (!supabase) return false;
    const { error: saveError } = await supabase.from("fixed_expenses").update({ name: input.name, category: input.category, due_day: input.dueDay }).eq("id", item.id);
    if (saveError) return fail("No se pudo guardar el gasto fijo.");
    setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, name: input.name, category: input.category, dueDay: input.dueDay } : entry)));

    const payment = payments.find((entry) => entry.fixedId === item.id);
    const current = payment?.amount ?? scheduled(item, changes, month);
    if (input.amount !== current) {
      const nextMonth = shiftMonth(month, 1);
      const nextBefore = scheduled(item, changes, nextMonth);
      const upserts = [{ user_id: userId, fixed_expense_id: item.id, month, amount: input.amount }];
      if (input.scope === "solo" && !changes.some((change) => change.fixedId === item.id && change.month === nextMonth)) upserts.push({ user_id: userId, fixed_expense_id: item.id, month: nextMonth, amount: nextBefore });
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
        await supabase.from("movements").update({ amount: input.amount, description: input.name }).eq("external_id", fixedExternalId(item.id, month));
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

  return { rows, error, pay, unpay, create, update, stop, remove };
}
