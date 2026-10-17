import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { readCache, writeCache } from "./cache";
import { monthsBetween, shiftMonth } from "./format";

export type CreditCard = { id: string; name: string; color: string; dueDay: number | null };
export type CardItemKind = "cuotas" | "fijo";
// "amount" es lo que se paga por mes (la cuota, o el cargo fijo).
// "firstMonth" es el mes en que se paga la primera cuota (o desde cuándo corre el fijo).
export type CardItem = { id: string; cardId: string; description: string; kind: CardItemKind; amount: number; installments: number | null; firstMonth: string; endMonth: string | null };
export type CardStatement = { id: string; cardId: string; month: string; total: number; totalUsd: number; dueDate: string | null; paid: boolean; source: string | null };

type CardRow = { id: string; name: string; color: string; due_day: number | null };
type ItemRow = { id: string; card_id: string; description: string; kind: CardItemKind; amount: number | string; installments: number | null; first_month: string; end_month: string | null };
type StatementRow = { id: string; card_id: string; month: string; total: number | string; total_usd: number | string; due_date: string | null; paid: boolean; source: string | null };

const cardFromRow = (row: CardRow): CreditCard => ({ id: row.id, name: row.name, color: row.color, dueDay: row.due_day });
const itemFromRow = (row: ItemRow): CardItem => ({ id: row.id, cardId: row.card_id, description: row.description, kind: row.kind, amount: Number(row.amount), installments: row.installments, firstMonth: row.first_month, endMonth: row.end_month });
const statementFromRow = (row: StatementRow): CardStatement => ({ id: row.id, cardId: row.card_id, month: row.month, total: Number(row.total), totalUsd: Number(row.total_usd), dueDate: row.due_date, paid: row.paid, source: row.source });

// Número de cuota que toca en un mes (1 = primera). null si ese mes no corresponde.
export function installmentNumber(item: CardItem, month: string): number | null {
  const n = monthsBetween(item.firstMonth, month) + 1;
  if (n < 1) return null;
  if (item.kind === "cuotas") return n <= (item.installments ?? 1) ? n : null;
  if (item.endMonth && month > item.endMonth) return null;
  return n;
}

export const lastMonth = (item: CardItem) => (item.kind === "cuotas" ? shiftMonth(item.firstMonth, (item.installments ?? 1) - 1) : item.endMonth);

export const itemsForMonth = (items: CardItem[], cardId: string, month: string) => items.filter((item) => item.cardId === cardId && installmentNumber(item, month) !== null);

export function cardMonthSummary(items: CardItem[], statements: CardStatement[], cardId: string, month: string) {
  const loaded = itemsForMonth(items, cardId, month).reduce((sum, item) => sum + item.amount, 0);
  const statement = statements.find((entry) => entry.cardId === cardId && entry.month === month) ?? null;
  // Si llegó el resumen del mes, manda el total real del resumen.
  return { loaded, statement, total: statement ? statement.total : loaded };
}

export function cardsMonthTotal(cards: CreditCard[], items: CardItem[], statements: CardStatement[], month: string) {
  return cards.reduce((sum, card) => sum + cardMonthSummary(items, statements, card.id, month).total, 0);
}

type State = { cards: CreditCard[]; items: CardItem[]; statements: CardStatement[] };

export function useCards(userId: string) {
  const [state, setState] = useState<State>(() => readCache<State>("cards", userId) ?? { cards: [], items: [], statements: [] });
  const [error, setError] = useState("");

  useEffect(() => { writeCache("cards", userId, state); }, [state, userId]);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    Promise.all([
      supabase.from("credit_cards").select("*").order("created_at", { ascending: true }),
      supabase.from("card_items").select("*").order("created_at", { ascending: true }),
      supabase.from("card_statements").select("*").order("month", { ascending: false }),
    ]).then(([cards, items, statements]) => {
      if (!active) return;
      if (cards.error || items.error || statements.error) { setError("No se pudieron cargar las tarjetas. Revisá tu conexión."); return; }
      setState({ cards: ((cards.data ?? []) as CardRow[]).map(cardFromRow), items: ((items.data ?? []) as ItemRow[]).map(itemFromRow), statements: ((statements.data ?? []) as StatementRow[]).map(statementFromRow) });
    });
    return () => { active = false; };
  }, [userId]);

  const fail = (message: string) => { setError(message); return false; };

  const addCard = async (input: { name: string; color: string; dueDay: number | null }) => {
    if (!supabase) return false;
    const { data, error: saveError } = await supabase.from("credit_cards").insert({ user_id: userId, name: input.name, color: input.color, due_day: input.dueDay }).select().single();
    if (saveError || !data) return fail("No se pudo crear la tarjeta. Probá de nuevo.");
    setError("");
    setState((current) => ({ ...current, cards: [...current.cards, cardFromRow(data as CardRow)] }));
    return true;
  };

  const removeCard = async (card: CreditCard) => {
    if (!supabase) return false;
    const { error: saveError } = await supabase.from("credit_cards").delete().eq("id", card.id);
    if (saveError) return fail("No se pudo eliminar la tarjeta.");
    setState((current) => ({ cards: current.cards.filter((entry) => entry.id !== card.id), items: current.items.filter((entry) => entry.cardId !== card.id), statements: current.statements.filter((entry) => entry.cardId !== card.id) }));
    return true;
  };

  const saveItem = async (input: Omit<CardItem, "id"> & { id?: string }) => {
    if (!supabase) return false;
    const row = { card_id: input.cardId, description: input.description, kind: input.kind, amount: input.amount, installments: input.kind === "cuotas" ? input.installments : null, first_month: input.firstMonth, end_month: input.kind === "fijo" ? input.endMonth : null };
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

  const toggleStatementPaid = async (statement: CardStatement) => {
    if (!supabase) return false;
    const { error: saveError } = await supabase.from("card_statements").update({ paid: !statement.paid }).eq("id", statement.id);
    if (saveError) return fail("No se pudo actualizar el resumen.");
    setState((current) => ({ ...current, statements: current.statements.map((entry) => (entry.id === statement.id ? { ...entry, paid: !entry.paid } : entry)) }));
    return true;
  };

  return { ...state, error, addCard, removeCard, saveItem, removeItem, toggleStatementPaid };
}
