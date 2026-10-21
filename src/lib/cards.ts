import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { readCache, writeCache } from "./cache";
import { addLinkedExpense, cardExternalId, payDate, removeLinkedExpense } from "./obligations";
import { cardFromRow, cardItemFromRow as itemFromRow, cardItemToRow, cardPaymentFromRow as paymentFromRow, statementFromRow, withoutCard, type CardItem, type CardItemRow as ItemRow, type CardPaymentRow as PaymentRow, type CardRow, type CardStatementRow as StatementRow, type CardsState as State, type CreditCard } from "../../shared/tarjetas";
// Tipos y cálculos compartidos con la app del celular (shared/tarjetas.ts).
export { cardMonthSummary, cardsMonthTotal, installmentNumber, itemsForMonth, lastMonth, type CardItem, type CardItemKind, type CardPayment, type CardStatement, type CreditCard, type StatementLine } from "../../shared/tarjetas";

export function useCards(userId: string) {
  const [state, setState] = useState<State>(() => readCache<State>("cards_v3", userId) ?? { cards: [], items: [], statements: [], payments: [] });
  const [error, setError] = useState("");

  useEffect(() => { writeCache("cards_v3", userId, state); }, [state, userId]);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    Promise.all([
      supabase.from("credit_cards").select("*").order("created_at", { ascending: true }),
      supabase.from("card_items").select("*").order("created_at", { ascending: true }),
      supabase.from("card_statements").select("*").order("month", { ascending: false }),
      supabase.from("card_payments").select("*"),
    ]).then(([cards, items, statements, payments]) => {
      if (!active) return;
      if (cards.error || items.error || statements.error) { setError("No se pudieron cargar las tarjetas. Revisá tu conexión."); return; }
      setState({ cards: ((cards.data ?? []) as CardRow[]).map(cardFromRow), items: ((items.data ?? []) as ItemRow[]).map(itemFromRow), statements: ((statements.data ?? []) as StatementRow[]).map(statementFromRow), payments: payments.error ? [] : ((payments.data ?? []) as PaymentRow[]).map(paymentFromRow) });
    });
    return () => { active = false; };
  }, [userId]);

  const fail = (message: string) => { setError(message); return false; };

  const addCard = async (input: { name: string; color: string; dueDay: number | null; provider: string | null }) => {
    if (!supabase) return null;
    const { data, error: saveError } = await supabase.from("credit_cards").insert({ user_id: userId, name: input.name, color: input.color, due_day: input.dueDay, provider: input.provider }).select().single();
    if (saveError || !data) { fail("No se pudo crear la tarjeta. Probá de nuevo."); return null; }
    const created = cardFromRow(data as CardRow);
    setError("");
    setState((current) => ({ ...current, cards: [...current.cards, created] }));
    return created;
  };

  const removeCard = async (card: CreditCard) => {
    if (!supabase) return false;
    const { error: saveError } = await supabase.from("credit_cards").delete().eq("id", card.id);
    if (saveError) return fail("No se pudo eliminar la tarjeta.");
    setState((current) => withoutCard(current, card.id));
    return true;
  };

  const saveItem = async (input: Omit<CardItem, "id"> & { id?: string }) => {
    if (!supabase) return false;
    const row = cardItemToRow(input);
    const query = input.id ? supabase.from("card_items").update(row).eq("id", input.id).select().single() : supabase.from("card_items").insert({ user_id: userId, ...row }).select().single();
    const { data, error: saveError } = await query;
    if (saveError || !data) return fail("No se pudo guardar. Probá de nuevo.");
    const saved = itemFromRow(data as ItemRow);
    setError("");
    setState((current) => ({ ...current, items: input.id ? current.items.map((entry) => (entry.id === saved.id ? saved : entry)) : [...current.items, saved] }));
    return true;
  };

  const removeItem = async (item: CardItem) => {
    if (!supabase) return false;
    const { error: saveError } = await supabase.from("card_items").delete().eq("id", item.id);
    if (saveError) return fail("No se pudo eliminar.");
    setState((current) => ({ ...current, items: current.items.filter((entry) => entry.id !== item.id) }));
    return true;
  };

  // Pagar el resumen del mes: queda registrado y (si se elige) se suma a los gastos del mes como "Tarjetas".
  const payCard = async (card: CreditCard, month: string, amount: number, addToExpenses: boolean) => {
    if (!supabase) return false;
    const { error: saveError } = await supabase.from("card_payments").upsert({ user_id: userId, card_id: card.id, month, amount }, { onConflict: "card_id,month" });
    if (saveError) return fail("No se pudo marcar la tarjeta como pagada.");
    if (addToExpenses) {
      const ok = await addLinkedExpense(userId, { externalId: cardExternalId(card.id, month), description: "Resumen " + card.name, amount, category: "tarjeta", date: payDate(month, card.dueDay), source: "tarjeta" });
      if (!ok) return fail("Se marcó como pagada, pero no se pudo sumar a tus gastos.");
    }
    setError("");
    setState((current) => ({ ...current, payments: [...current.payments.filter((entry) => !(entry.cardId === card.id && entry.month === month)), { cardId: card.id, month, amount }] }));
    return true;
  };

  const unpayCard = async (card: CreditCard, month: string) => {
    if (!supabase) return false;
    const { error: saveError } = await supabase.from("card_payments").delete().eq("card_id", card.id).eq("month", month);
    if (saveError) return fail("No se pudo actualizar el pago.");
    await removeLinkedExpense(cardExternalId(card.id, month));
    setError("");
    setState((current) => ({ ...current, payments: current.payments.filter((entry) => !(entry.cardId === card.id && entry.month === month)) }));
    return true;
  };

  return { ...state, error, addCard, removeCard, saveItem, removeItem, payCard, unpayCard };
}
