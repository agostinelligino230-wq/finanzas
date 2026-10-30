// Gastos fijos: tipos y cálculos que comparten la web y la app del celular.
import { shiftMonth } from "./format";
import type { CardStatement } from "./tarjetas";

export type FixedKind = "impuesto" | "suscripcion" | "alquiler" | "servicio" | "otro";
export type PaymentMethod = "debito" | "tarjeta" | "transferencia" | "efectivo";
// "amount" está en la moneda del gasto ("currency"); las filas del mes (FixedRowView) ya lo traen en pesos.
export type Fixed = {
  id: string; name: string; amount: number; category: FixedKind; dueDay: number; startMonth: string | null; endMonth: string | null;
  provider: string | null; icon: string | null; color: string | null; currency: "ARS" | "USD"; paymentMethod: PaymentMethod | null; cardId: string | null;
  reminderDays: number | null; variable: boolean; note: string | null;
};
export type AmountChange = { id: string; fixedId: string; month: string; amount: number };
export type FixedPayment = { fixedId: string; amount: number | null };
// "amount" siempre en pesos. "usd": el monto en dólares si el gasto es en US$ (el pago guardado ya está en pesos).
export type FixedRowView = { item: Fixed; amount: number; usd: number | null; paid: boolean; previous: number | null };
export type FixedInput = {
  name: string; amount: number; category: FixedKind; dueDay: number; provider?: string | null; icon?: string | null; color?: string | null; currency?: "ARS" | "USD";
  paymentMethod?: PaymentMethod | null; cardId?: string | null; reminderDays?: number | null; variable?: boolean; startMonth?: string | null; endMonth?: string | null; note?: string | null;
};

export type FixedRow = {
  id: string; name: string; amount: number | string; category: string; due_day: number; start_month?: string | null; end_month?: string | null;
  provider?: string | null; icon?: string | null; color?: string | null; currency?: string | null; payment_method?: string | null; card_id?: string | null;
  reminder_days?: number | null; variable?: boolean | null; note?: string | null;
};
export type AmountRow = { id: string; fixed_expense_id: string; month: string; amount: number | string };
export type FixedPaymentRow = { fixed_expense_id: string; amount?: number | string | null };

export const FIXED_KINDS: FixedKind[] = ["impuesto", "suscripcion", "alquiler", "servicio", "otro"];
export const PAYMENT_METHODS: PaymentMethod[] = ["debito", "tarjeta", "transferencia", "efectivo"];
export const PAYMENT_LABELS: Record<PaymentMethod, string> = { debito: "Débito automático", tarjeta: "Tarjeta", transferencia: "Transferencia", efectivo: "Efectivo" };
export const REMINDER_OPTIONS: { value: number | null; label: string }[] = [{ value: null, label: "Sin aviso" }, { value: 0, label: "El mismo día" }, { value: 1, label: "1 día antes" }, { value: 3, label: "3 días antes" }, { value: 5, label: "5 días antes" }];
export const FIXED_LABELS: Record<FixedKind, string> = { impuesto: "Impuesto", suscripcion: "Suscripción", alquiler: "Alquiler", servicio: "Servicio", otro: "Otro" };
// En qué categoría de gastos cae cada gasto fijo cuando se paga.
export const FIXED_EXPENSE_CATEGORY: Record<FixedKind, string> = { impuesto: "impuestos", suscripcion: "ocio", alquiler: "hogar", servicio: "hogar", otro: "otro" };

export const fixedFromRow = (row: FixedRow): Fixed => ({ id: row.id, name: row.name, amount: Number(row.amount), category: (FIXED_KINDS.includes(row.category as FixedKind) ? row.category : "otro") as FixedKind, dueDay: row.due_day, startMonth: row.start_month ?? null, endMonth: row.end_month ?? null,
  provider: row.provider ?? null, icon: row.icon ?? null, color: row.color ?? null, currency: row.currency === "USD" ? "USD" : "ARS", paymentMethod: PAYMENT_METHODS.includes(row.payment_method as PaymentMethod) ? (row.payment_method as PaymentMethod) : null,
  cardId: row.card_id ?? null, reminderDays: row.reminder_days ?? null, variable: Boolean(row.variable), note: row.note ?? null });
// Las columnas nuevas que guarda el formulario (mes de inicio y fin, solo si vienen).
export const fixedDetailColumns = (input: FixedInput) => ({
  provider: input.provider ?? null, icon: input.icon ?? null, color: input.color ?? null, currency: input.currency ?? "ARS", payment_method: input.paymentMethod ?? null,
  card_id: input.paymentMethod === "tarjeta" ? input.cardId ?? null : null, reminder_days: input.reminderDays ?? null, variable: Boolean(input.variable), note: input.note?.trim() || null,
  ...(input.startMonth !== undefined ? { start_month: input.startMonth } : {}), ...(input.endMonth !== undefined ? { end_month: input.endMonth } : {}),
});
export const amountFromRow = (row: AmountRow): AmountChange => ({ id: row.id, fixedId: row.fixed_expense_id, month: row.month, amount: Number(row.amount) });
export const fixedPaymentFromRow = (row: FixedPaymentRow): FixedPayment => ({ fixedId: row.fixed_expense_id, amount: row.amount === null || row.amount === undefined ? null : Number(row.amount) });

export const activeIn = (item: Fixed, month: string) => (!item.startMonth || item.startMonth <= month) && (!item.endMonth || month <= item.endMonth);

// Monto programado para un mes: el último cambio de precio desde ese mes hacia atrás, o el monto original.
export function scheduled(item: Fixed, changes: AmountChange[], month: string) {
  const latest = changes.filter((change) => change.fixedId === item.id && change.month <= month).sort((a, b) => b.month.localeCompare(a.month))[0];
  return latest ? latest.amount : item.amount;
}

// Las filas del mes: lo activo, con el monto que toca (o el pagado), ordenado por día de vencimiento.
// usdRate: cotización para pasar a pesos los gastos en US$ (sin cotización valen 0 en los totales y se muestra el monto en US$).
export function fixedRowsFor(items: Fixed[], payments: FixedPayment[], changes: AmountChange[], month: string, usdRate: number | null = null): FixedRowView[] {
  const previousMonth = shiftMonth(month, -1);
  return items.filter((item) => activeIn(item, month)).map((item) => {
    const payment = payments.find((entry) => entry.fixedId === item.id);
    const planned = scheduled(item, changes, month);
    const usd = item.currency === "USD" ? planned : null;
    const amount = payment?.amount ?? (usd !== null ? Math.round(usd * (usdRate ?? 0) * 100) / 100 : planned);
    const previous = usd === null && activeIn(item, previousMonth) ? scheduled(item, changes, previousMonth) : null;
    return { item, amount, usd, paid: Boolean(payment), previous: previous !== null && previous !== amount ? previous : null };
  }).sort((a, b) => a.item.dueDay - b.item.dueDay);
}

// Qué cambios de monto quedan después de guardar uno nuevo ("desde" este mes en adelante, o "solo" este mes).
export function mergeAmountChanges(list: AmountChange[], fixedId: string, saved: AmountChange[], scope: "desde" | "solo", month: string) {
  return [
    ...list.filter((change) => change.fixedId !== fixedId || (!saved.some((entry) => entry.month === change.month) && !(scope === "desde" && change.month > month))),
    ...saved,
  ];
}

// Si el mes no tiene ese día (31 en noviembre), vence el último día del mes.
export function dueDateIn(month: string, dueDay: number) {
  const [year, number] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return month + "-" + String(Math.min(dueDay, last)).padStart(2, "0");
}

// Pagado con tarjeta: si ese mes ya llegó el resumen, el gasto está adentro del total del resumen y no se suma otra vez.
export const insideStatement = (row: FixedRowView, statements: CardStatement[], month: string) =>
  row.item.paymentMethod === "tarjeta" && Boolean(row.item.cardId) && statements.some((entry) => entry.cardId === row.item.cardId && entry.month === month);
export const countedFixedRows = (rows: FixedRowView[], statements: CardStatement[], month: string) => rows.filter((row) => !insideStatement(row, statements, month));

// Lo que hay que mostrar como aviso en Inicio: sin pagar y dentro de los días de aviso elegidos.
export function upcomingReminders(rows: FixedRowView[], month: string, today: string) {
  return rows.flatMap((row) => {
    if (row.paid || row.item.reminderDays === null) return [];
    const due = dueDateIn(month, row.item.dueDay);
    const days = Math.round((Date.parse(due) - Date.parse(today)) / 86400000);
    return days >= 0 && days <= row.item.reminderDays ? [{ row, due, days }] : [];
  }).sort((a, b) => a.days - b.days);
}
