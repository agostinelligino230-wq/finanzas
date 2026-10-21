import { useCallback, useEffect, useMemo, useState } from "react";
import { shiftMonth } from "../../../shared/format";
import { fixedExternalId, payDate } from "../../../shared/obligaciones";
import {
  FIXED_EXPENSE_CATEGORY, amountFromRow, fixedFromRow, fixedPaymentFromRow, fixedRowsFor, mergeAmountChanges, scheduled,
  type AmountChange, type AmountRow, type Fixed, type FixedInput, type FixedPayment, type FixedPaymentRow, type FixedRow, type FixedRowView,
} from "../../../shared/fijos";
import { addLinkedExpense, removeLinkedExpense } from "./obligations";
import { createStore } from "./store";
import { toast } from "../components/Toast";
import { supabase } from "./supabase";

// Los gastos fijos y sus cambios de precio (por persona) y los pagos de cada mes (por persona y mes).
const base = createStore<{ items: Fixed[]; changes: AmountChange[]; loaded: boolean }>({ items: [], changes: [], loaded: false });
const paid = createStore<FixedPayment[]>([]);

export function useFixed(userId: string, month: string) {
  const payKey = userId + ":" + month;
  const data = base.useValue(userId);
  const payments = paid.useValue(payKey);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const loadBase = useCallback(async () => {
    if (!supabase) return;
    const [fixed, amounts] = await Promise.all([
      supabase.from("fixed_expenses").select("*").order("created_at", { ascending: true }),
      supabase.from("fixed_expense_amounts").select("*"),
    ]);
    if (fixed.error) { setError("No se pudieron cargar los gastos fijos."); return; }
    base.set(userId, (current) => ({ items: ((fixed.data ?? []) as FixedRow[]).map(fixedFromRow), changes: amounts.error ? current.changes : ((amounts.data ?? []) as AmountRow[]).map(amountFromRow), loaded: true }));
  }, [userId]);

  const loadPayments = useCallback(async () => {
    if (!supabase) return;
    const { data: rows, error: loadError } = await supabase.from("fixed_expense_payments").select("*").eq("month", month);
    if (loadError) { setError("No se pudieron cargar los pagos del mes."); return; }
    paid.set(userId + ":" + month, () => ((rows ?? []) as FixedPaymentRow[]).map(fixedPaymentFromRow));
  }, [userId, month]);

  useEffect(() => { loadBase(); }, [loadBase]);
  useEffect(() => { loadPayments(); }, [loadPayments]);

  const reload = useCallback(async () => {
    setRefreshing(true);
    setError("");
    await Promise.all([loadBase(), loadPayments()]);
    setRefreshing(false);
  }, [loadBase, loadPayments]);

  const rows: FixedRowView[] = useMemo(() => fixedRowsFor(data.items, payments, data.changes, month), [data, payments, month]);

  // Las acciones que fallan avisan arriba de la pantalla (la lista puede estar scrolleada); el error fijo queda para la carga.
  const fail = (message: string) => { toast(message + " Revisá tu conexión."); return false; };
  const setItems = (update: (items: Fixed[]) => Fixed[]) => base.set(userId, (current) => ({ ...current, items: update(current.items) }));
  const setPayments = (update: (list: FixedPayment[]) => FixedPayment[]) => paid.set(payKey, update);

  // Pagar: guarda el monto de ese mes y (si se elige) lo suma a los gastos del mes.
  const pay = async (row: FixedRowView, amount: number, addToExpenses: boolean) => {
    if (!supabase) return false;
    const { error: saveError } = await supabase.from("fixed_expense_payments").upsert({ user_id: userId, fixed_expense_id: row.item.id, month, amount }, { onConflict: "fixed_expense_id,month" });
    if (saveError) return fail("No se pudo marcar como pagado.");
    if (addToExpenses) {
      const ok = await addLinkedExpense(userId, { externalId: fixedExternalId(row.item.id, month), description: row.item.name, amount, category: FIXED_EXPENSE_CATEGORY[row.item.category], date: payDate(month, row.item.dueDay), source: "fijo" });
      if (!ok) return fail("Se marcó como pagado, pero no se pudo sumar a tus gastos.");
    }
    setPayments((current) => [...current.filter((entry) => entry.fixedId !== row.item.id), { fixedId: row.item.id, amount }]);
    setError("");
    return true;
  };

  const unpay = async (row: FixedRowView) => {
    if (!supabase) return false;
    const { error: saveError } = await supabase.from("fixed_expense_payments").delete().eq("fixed_expense_id", row.item.id).eq("month", month);
    if (saveError) return fail("No se pudo actualizar el pago.");
    await removeLinkedExpense(fixedExternalId(row.item.id, month));
    setPayments((current) => current.filter((entry) => entry.fixedId !== row.item.id));
    setError("");
    return true;
  };

  const create = async (input: FixedInput) => {
    if (!supabase) return false;
    const { data: row, error: saveError } = await supabase.from("fixed_expenses").insert({ user_id: userId, name: input.name, amount: input.amount, category: input.category, due_day: input.dueDay, start_month: month }).select().single();
    if (saveError || !row) return fail("No se pudo guardar el gasto fijo.");
    setError("");
    setItems((current) => [...current, fixedFromRow(row as FixedRow)]);
    return true;
  };

  // Cambiar un fijo: el monto nuevo vale "desde" este mes en adelante, o "solo" para este mes.
  const update = async (item: Fixed, input: FixedInput & { scope: "desde" | "solo" }) => {
    if (!supabase) return false;
    const { error: saveError } = await supabase.from("fixed_expenses").update({ name: input.name, category: input.category, due_day: input.dueDay }).eq("id", item.id);
    if (saveError) return fail("No se pudo guardar el gasto fijo.");
    setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, name: input.name, category: input.category, dueDay: input.dueDay } : entry)));

    const changes = base.get(userId).changes;
    const payment = paid.get(payKey).find((entry) => entry.fixedId === item.id);
    const current = payment?.amount ?? scheduled(item, changes, month);
    if (input.amount !== current) {
      const nextMonth = shiftMonth(month, 1);
      const nextBefore = scheduled(item, changes, nextMonth);
      const upserts = [{ user_id: userId, fixed_expense_id: item.id, month, amount: input.amount }];
      if (input.scope === "solo" && !changes.some((change) => change.fixedId === item.id && change.month === nextMonth)) upserts.push({ user_id: userId, fixed_expense_id: item.id, month: nextMonth, amount: nextBefore });
      const { data: savedRows, error: amountError } = await supabase.from("fixed_expense_amounts").upsert(upserts, { onConflict: "fixed_expense_id,month" }).select();
      if (amountError) return fail("No se pudo guardar el nuevo monto.");
      if (input.scope === "desde") {
        const { error: deleteError } = await supabase.from("fixed_expense_amounts").delete().eq("fixed_expense_id", item.id).gt("month", month);
        if (deleteError) return fail("No se pudo guardar el nuevo monto.");
      }
      const saved = ((savedRows ?? []) as AmountRow[]).map(amountFromRow);
      base.set(userId, (state) => ({ ...state, changes: mergeAmountChanges(state.changes, item.id, saved, input.scope, month) }));
      if (payment) {
        const { error: paymentError } = await supabase.from("fixed_expense_payments").update({ amount: input.amount }).eq("fixed_expense_id", item.id).eq("month", month);
        if (paymentError) return fail("No se pudo actualizar el pago de este mes.");
        await supabase.from("movements").update({ amount: input.amount, description: input.name }).eq("external_id", fixedExternalId(item.id, month));
        setPayments((list) => list.map((entry) => (entry.fixedId === item.id ? { ...entry, amount: input.amount } : entry)));
      }
    }
    setError("");
    return true;
  };

  // Dejar de pagarlo: deja de aparecer desde este mes (los meses anteriores quedan).
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

  return { rows, loaded: data.loaded, error, refreshing, reload, pay, unpay, create, update, stop, remove };
}
