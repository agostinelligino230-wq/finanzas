import { useCallback, useEffect, useState } from "react";
import { cardExternalId, payDate } from "../../../shared/obligaciones";
import {
  cardFromRow, cardItemFromRow, cardItemToRow, cardPaymentFromRow, statementFromRow, withoutCard,
  type CardItem, type CardItemRow, type CardPaymentRow, type CardRow, type CardStatementRow, type CardsState, type CreditCard,
} from "../../../shared/tarjetas";
import { addLinkedExpense, removeLinkedExpense } from "./obligations";
import { createStore } from "./store";
import { toast } from "../components/Toast";
import { supabase } from "./supabase";

// Tarjetas, sus cuotas y fijos, los resúmenes que llegaron y lo que se pagó cada mes (lo mismo que en la web).
const store = createStore<CardsState & { loaded: boolean }>({ cards: [], items: [], statements: [], payments: [], loaded: false });

export function useCards(userId: string) {
  const state = store.useValue(userId);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const set = (update: (current: CardsState) => CardsState) => store.set(userId, (current) => ({ ...update(current), loaded: current.loaded }));

  const reload = useCallback(async () => {
    if (!supabase) return;
    setRefreshing(true);
    const [cards, items, statements, payments] = await Promise.all([
      supabase.from("credit_cards").select("*").order("created_at", { ascending: true }),
      supabase.from("card_items").select("*").order("created_at", { ascending: true }),
      supabase.from("card_statements").select("*").order("month", { ascending: false }),
      supabase.from("card_payments").select("*"),
    ]);
    setRefreshing(false);
    if (cards.error || items.error || statements.error) { setError("No se pudieron cargar las tarjetas. Revisá tu conexión."); return; }
    setError("");
    store.set(userId, () => ({
      cards: ((cards.data ?? []) as CardRow[]).map(cardFromRow), items: ((items.data ?? []) as CardItemRow[]).map(cardItemFromRow),
      statements: ((statements.data ?? []) as CardStatementRow[]).map(statementFromRow), payments: payments.error ? [] : ((payments.data ?? []) as CardPaymentRow[]).map(cardPaymentFromRow), loaded: true,
    }));
  }, [userId]);

  useEffect(() => { reload(); }, [reload]);

  // Las acciones que fallan avisan arriba de la pantalla (la lista puede estar scrolleada); el error fijo queda para la carga.
  const fail = (message: string) => { toast(message + " Revisá tu conexión."); return false; };

  const addCard = async (input: { name: string; color: string; dueDay: number | null; provider: string | null }) => {
    if (!supabase) return null;
    const { data, error: saveError } = await supabase.from("credit_cards").insert({ user_id: userId, name: input.name, color: input.color, due_day: input.dueDay, provider: input.provider }).select().single();
    if (saveError || !data) { fail("No se pudo crear la tarjeta."); return null; }
    const created = cardFromRow(data as CardRow);
    setError("");
    set((current) => ({ ...current, cards: [...current.cards, created] }));
    return created;
  };

  const removeCard = async (card: CreditCard) => {
    if (!supabase) return false;
    const { error: saveError } = await supabase.from("credit_cards").delete().eq("id", card.id);
    if (saveError) return fail("No se pudo eliminar la tarjeta.");
    set((current) => withoutCard(current, card.id));
    return true;
  };

  const saveItem = async (input: Omit<CardItem, "id"> & { id?: string }) => {
    if (!supabase) return false;
    const row = cardItemToRow(input);
    const query = input.id ? supabase.from("card_items").update(row).eq("id", input.id).select().single() : supabase.from("card_items").insert({ user_id: userId, ...row }).select().single();
    const { data, error: saveError } = await query;
    if (saveError || !data) return fail("No se pudo guardar.");
    const saved = cardItemFromRow(data as CardItemRow);
    setError("");
    set((current) => ({ ...current, items: input.id ? current.items.map((entry) => (entry.id === saved.id ? saved : entry)) : [...current.items, saved] }));
    return true;
  };

  const removeItem = async (item: CardItem) => {
    if (!supabase) return false;
    const { error: saveError } = await supabase.from("card_items").delete().eq("id", item.id);
    if (saveError) return fail("No se pudo eliminar.");
    set((current) => ({ ...current, items: current.items.filter((entry) => entry.id !== item.id) }));
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
    set((current) => ({ ...current, payments: [...current.payments.filter((entry) => !(entry.cardId === card.id && entry.month === month)), { cardId: card.id, month, amount }] }));
    return true;
  };

  const unpayCard = async (card: CreditCard, month: string) => {
    if (!supabase) return false;
    const { error: saveError } = await supabase.from("card_payments").delete().eq("card_id", card.id).eq("month", month);
    if (saveError) return fail("No se pudo actualizar el pago.");
    await removeLinkedExpense(cardExternalId(card.id, month));
    setError("");
    set((current) => ({ ...current, payments: current.payments.filter((entry) => !(entry.cardId === card.id && entry.month === month)) }));
    return true;
  };

  return { ...state, error, refreshing, reload, addCard, removeCard, saveItem, removeItem, payCard, unpayCard };
}
