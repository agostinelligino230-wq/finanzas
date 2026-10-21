// Tarjetas de crédito: tipos y cálculos que comparten la web y la app del celular.
import { monthsBetween, shiftMonth } from "./format";

export type CreditCard = { id: string; name: string; color: string; dueDay: number | null; provider: string | null };
export type CardItemKind = "cuotas" | "fijo";
// "amount" es lo que se paga por mes (la cuota, o el cargo fijo).
// "firstMonth" es el mes en que se paga la primera cuota (o desde cuándo corre el fijo).
export type CardItem = { id: string; cardId: string; description: string; kind: CardItemKind; amount: number; installments: number | null; firstMonth: string; endMonth: string | null };
export type CardPayment = { cardId: string; month: string; amount: number };
export type StatementLine = { date: string | null; description: string; amount: number; currency: "ARS" | "USD"; kind: "consumo" | "cargo" | "pago"; cuota?: { n: number; m: number } };
export type CardStatement = { id: string; cardId: string; month: string; total: number; totalUsd: number; dueDate: string | null; paid: boolean; source: string | null; closingDate: string | null; minPayment: number | null; lines: StatementLine[] };
export type CardsState = { cards: CreditCard[]; items: CardItem[]; statements: CardStatement[]; payments: CardPayment[] };

export type CardRow = { id: string; name: string; color: string; due_day: number | null; provider?: string | null };
export type CardPaymentRow = { card_id: string; month: string; amount: number | string };
export type CardItemRow = { id: string; card_id: string; description: string; kind: CardItemKind; amount: number | string; installments: number | null; first_month: string; end_month: string | null };
export type CardStatementRow = { id: string; card_id: string; month: string; total: number | string; total_usd: number | string; due_date: string | null; paid: boolean; source: string | null; closing_date?: string | null; min_payment?: number | string | null; details?: { consumos?: StatementLine[] } | null };

export const cardFromRow = (row: CardRow): CreditCard => ({ id: row.id, name: row.name, color: row.color, dueDay: row.due_day, provider: row.provider ?? null });
export const cardPaymentFromRow = (row: CardPaymentRow): CardPayment => ({ cardId: row.card_id, month: row.month, amount: Number(row.amount) });
export const cardItemFromRow = (row: CardItemRow): CardItem => ({ id: row.id, cardId: row.card_id, description: row.description, kind: row.kind, amount: Number(row.amount), installments: row.installments, firstMonth: row.first_month, endMonth: row.end_month });
export const statementFromRow = (row: CardStatementRow): CardStatement => ({ id: row.id, cardId: row.card_id, month: row.month, total: Number(row.total), totalUsd: Number(row.total_usd), dueDate: row.due_date, paid: row.paid, source: row.source, closingDate: row.closing_date ?? null, minPayment: row.min_payment == null ? null : Number(row.min_payment), lines: row.details?.consumos ?? [] });

// La fila que se guarda en card_items (las cuotas no tienen mes final; los fijos no tienen cantidad de cuotas).
export const cardItemToRow = (input: Omit<CardItem, "id">) => ({ card_id: input.cardId, description: input.description, kind: input.kind, amount: input.amount, installments: input.kind === "cuotas" ? input.installments : null, first_month: input.firstMonth, end_month: input.kind === "fijo" ? input.endMonth : null });

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

export function cardMonthSummary(items: CardItem[], statements: CardStatement[], cardId: string, month: string, payments: CardPayment[] = []) {
  const loaded = itemsForMonth(items, cardId, month).reduce((sum, item) => sum + item.amount, 0);
  const statement = statements.find((entry) => entry.cardId === cardId && entry.month === month) ?? null;
  const payment = payments.find((entry) => entry.cardId === cardId && entry.month === month) ?? null;
  // Lo que se pagó manda; si no, el total real del resumen; si no llegó, la suma de cuotas y fijos cargados.
  return { loaded, statement, payment, total: payment ? payment.amount : statement ? statement.total : loaded };
}

export function cardsMonthTotal(cards: CreditCard[], items: CardItem[], statements: CardStatement[], month: string, payments: CardPayment[] = []) {
  return cards.reduce((sum, card) => sum + cardMonthSummary(items, statements, card.id, month, payments).total, 0);
}

// Sacar una tarjeta y todo lo suyo (al borrarla).
export const withoutCard = (state: CardsState, cardId: string): CardsState => ({
  cards: state.cards.filter((entry) => entry.id !== cardId), items: state.items.filter((entry) => entry.cardId !== cardId),
  statements: state.statements.filter((entry) => entry.cardId !== cardId), payments: state.payments.filter((entry) => entry.cardId !== cardId),
});
