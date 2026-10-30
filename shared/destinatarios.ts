// Destinatarios frecuentes: ícono, color y lugar que la persona le asigna a un CBU, CVU o alias.
import type { Movement } from "./movimientos";

export type Payee = { id: string; match: string; name: string | null; icon: string | null; color: string | null; placeName: string | null };
export type PayeeRow = { id: string; match: string; name?: string | null; icon?: string | null; color?: string | null; place_name?: string | null };
export const payeeFromRow = (row: PayeeRow): Payee => ({ id: row.id, match: row.match, name: row.name ?? null, icon: row.icon ?? null, color: row.color ?? null, placeName: row.place_name ?? null });

const clave = (text: string) => text.trim().toLowerCase();
// Qué identifica a la otra parte: el CBU, CVU o alias si vino; si no, su nombre.
export const payeeKey = (item: Pick<Movement, "counterpartyName" | "counterpartyRef">) => clave(item.counterpartyRef ?? item.counterpartyName ?? "");
export const findPayee = (list: Payee[], item: Pick<Movement, "counterpartyName" | "counterpartyRef">) => { const key = payeeKey(item); return key ? list.find((payee) => payee.match === key) ?? null : null; };
