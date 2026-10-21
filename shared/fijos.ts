// Gastos fijos: tipos y cálculos que comparten la web y la app del celular.
import { shiftMonth } from "./format";

export type FixedKind = "impuesto" | "suscripcion" | "alquiler" | "servicio" | "otro";
export type Fixed = { id: string; name: string; amount: number; category: FixedKind; dueDay: number; startMonth: string | null; endMonth: string | null };
export type AmountChange = { id: string; fixedId: string; month: string; amount: number };
export type FixedPayment = { fixedId: string; amount: number | null };
export type FixedRowView = { item: Fixed; amount: number; paid: boolean; previous: number | null };
export type FixedInput = { name: string; amount: number; category: FixedKind; dueDay: number };

export type FixedRow = { id: string; name: string; amount: number | string; category: string; due_day: number; start_month?: string | null; end_month?: string | null };
export type AmountRow = { id: string; fixed_expense_id: string; month: string; amount: number | string };
export type FixedPaymentRow = { fixed_expense_id: string; amount?: number | string | null };

export const FIXED_KINDS: FixedKind[] = ["impuesto", "suscripcion", "alquiler", "servicio", "otro"];
export const FIXED_LABELS: Record<FixedKind, string> = { impuesto: "Impuesto", suscripcion: "Suscripción", alquiler: "Alquiler", servicio: "Servicio", otro: "Otro" };
// En qué categoría de gastos cae cada gasto fijo cuando se paga.
export const FIXED_EXPENSE_CATEGORY: Record<FixedKind, string> = { impuesto: "impuestos", suscripcion: "ocio", alquiler: "hogar", servicio: "hogar", otro: "otro" };

export const fixedFromRow = (row: FixedRow): Fixed => ({ id: row.id, name: row.name, amount: Number(row.amount), category: (FIXED_KINDS.includes(row.category as FixedKind) ? row.category : "otro") as FixedKind, dueDay: row.due_day, startMonth: row.start_month ?? null, endMonth: row.end_month ?? null });
export const amountFromRow = (row: AmountRow): AmountChange => ({ id: row.id, fixedId: row.fixed_expense_id, month: row.month, amount: Number(row.amount) });
export const fixedPaymentFromRow = (row: FixedPaymentRow): FixedPayment => ({ fixedId: row.fixed_expense_id, amount: row.amount === null || row.amount === undefined ? null : Number(row.amount) });

export const activeIn = (item: Fixed, month: string) => (!item.startMonth || item.startMonth <= month) && (!item.endMonth || month <= item.endMonth);

// Monto programado para un mes: el último cambio de precio desde ese mes hacia atrás, o el monto original.
export function scheduled(item: Fixed, changes: AmountChange[], month: string) {
  const latest = changes.filter((change) => change.fixedId === item.id && change.month <= month).sort((a, b) => b.month.localeCompare(a.month))[0];
  return latest ? latest.amount : item.amount;
}

// Las filas del mes: lo activo, con el monto que toca (o el pagado), ordenado por día de vencimiento.
export function fixedRowsFor(items: Fixed[], payments: FixedPayment[], changes: AmountChange[], month: string): FixedRowView[] {
  const previousMonth = shiftMonth(month, -1);
  return items.filter((item) => activeIn(item, month)).map((item) => {
    const payment = payments.find((entry) => entry.fixedId === item.id);
    const amount = payment?.amount ?? scheduled(item, changes, month);
    const previous = activeIn(item, previousMonth) ? scheduled(item, changes, previousMonth) : null;
    return { item, amount, paid: Boolean(payment), previous: previous !== null && previous !== amount ? previous : null };
  }).sort((a, b) => a.item.dueDay - b.item.dueDay);
}

// Qué cambios de monto quedan después de guardar uno nuevo ("desde" este mes en adelante, o "solo" este mes).
export function mergeAmountChanges(list: AmountChange[], fixedId: string, saved: AmountChange[], scope: "desde" | "solo", month: string) {
  return [
    ...list.filter((change) => change.fixedId !== fixedId || (!saved.some((entry) => entry.month === change.month) && !(scope === "desde" && change.month > month))),
    ...saved,
  ];
}
