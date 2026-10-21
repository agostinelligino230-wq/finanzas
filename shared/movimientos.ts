// Movimientos: tipos y reglas que comparten la web y la app del celular (qué suma, de dónde vino cada uno).
import { findProvider } from "./providers";

export type MovementType = "gasto" | "ingreso";
export type Currency = "ARS" | "USD";
// manual: lo cargaste vos · legacy: entró por Gmail antes de los avisos verificados · verified: lo avisó el banco (app oficial o mail firmado)
// doubtful: llegó sin un aviso verificado; no suma hasta que lo confirmes.
export type Trust = "manual" | "legacy" | "verified" | "doubtful";
export type Channel = "mail" | "push";
// "amount" siempre está en pesos. Si se cargó en dólares, "original" y "rate" guardan el monto en US$ y la cotización usada.
export type Movement = {
  id: string; description: string; amount: number; category: string; date: string; createdAt: string; type: MovementType; paid: boolean;
  currency: Currency; original: number | null; rate: number | null; source: string | null; trust: Trust; confirmedAt: string | null; channels: Channel[];
  readByAI: boolean; // Lo leyó la IA de respaldo (ningún lector propio lo reconoció): se avisa siempre.
};
export type NewMovement = { description: string; amount: number; category: string; date: string; type: MovementType; paid: boolean; currency?: Currency; original?: number | null; rate?: number | null };
export type MovementRow = {
  id: string; description: string; amount: number | string; category: string; movement_type: MovementType; movement_date: string; paid: boolean; created_at: string;
  currency?: string | null; original_amount?: number | string | null; exchange_rate?: number | string | null; source?: string | null;
  trust?: string | null; confirmed_at?: string | null; incoming_notices?: { channel: string; parser?: string | null }[] | null;
};

// Cada movimiento trae de qué vías llegó (notificación, mail o las dos) y quién leyó cada aviso.
export const MOVEMENT_COLUMNS = "*, incoming_notices(channel, parser)";

const numberOrNull = (value: number | string | null | undefined) => (value === null || value === undefined || value === "" ? null : Number(value));
const TRUSTS: Trust[] = ["manual", "legacy", "verified", "doubtful"];

export const fromRow = (row: MovementRow): Movement => ({
  id: row.id, description: row.description, amount: Number(row.amount), category: row.category, date: row.movement_date, createdAt: row.created_at, type: row.movement_type, paid: row.paid,
  currency: row.currency === "USD" ? "USD" : "ARS", original: numberOrNull(row.original_amount), rate: numberOrNull(row.exchange_rate), source: row.source ?? null,
  trust: TRUSTS.includes(row.trust as Trust) ? (row.trust as Trust) : "manual", confirmedAt: row.confirmed_at ?? null,
  channels: [...new Set((row.incoming_notices ?? []).map((notice) => notice.channel))].filter((channel): channel is Channel => channel === "mail" || channel === "push").sort(),
  readByAI: (row.incoming_notices ?? []).some((notice) => notice.parser === "ai") && !(row.incoming_notices ?? []).some((notice) => notice.parser === "rule"),
});

// Lo dudoso no suma (ni al saldo, ni a los gráficos, ni a la descarga) hasta que lo confirmes.
export const counts = (item: Movement) => item.trust !== "doubtful" || item.confirmedAt !== null;

// "Verificado · notificación y mail de Galicia", "desde Ualá"…
export function originLabel(item: Movement) {
  const provider = findProvider(item.source)?.name;
  if (!provider) return "";
  const via = item.channels.length === 2 ? "notificación y mail" : item.channels[0] === "push" ? "notificación" : item.channels[0] === "mail" ? "mail" : "";
  if (item.trust === "verified") return "Verificado · " + (via ? via + " de " : "") + provider;
  return (via ? via[0].toUpperCase() + via.slice(1) + " de " + provider : "desde " + provider) + (item.readByAI ? " · leído con IA, revisá el monto" : "");
}

export const sortMovements = (list: Movement[]) => [...list].sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)));

// "luz", "gas"... sirve para diferenciar dentro de una misma categoría
export const hasDetail = (item: { description: string }, categoryName: string) => {
  const text = item.description.trim().toLowerCase();
  return text !== "" && text !== "gasto" && text !== "ingreso" && text !== "ahorro" && text !== categoryName.toLowerCase();
};

// Totales de un mes (lo que suma): ingresos, gastos, disponible y lo que falta pagar.
export function monthTotals(movements: Movement[], month: string) {
  const items = movements.filter((item) => counts(item) && item.date.startsWith(month));
  const income = items.filter((item) => item.type === "ingreso").reduce((sum, item) => sum + item.amount, 0);
  const expense = items.filter((item) => item.type === "gasto").reduce((sum, item) => sum + item.amount, 0);
  const pending = items.filter((item) => item.type === "gasto" && !item.paid).reduce((sum, item) => sum + item.amount, 0);
  return { items, income, expense, available: income - expense, pending };
}
