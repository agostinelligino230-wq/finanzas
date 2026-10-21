// Resúmenes de tarjeta que llegan en PDF al Gmail conectado. La app pregunta antes de analizarlos.
export type StatementResult = { tarjeta: string; mes: string; total: number; total_usd: number; vence: string | null; minimo: number | null; consumos: number; cargos: number; cuotas: number; pendiente: number; hasta: string | null };
export type StatementSource = {
  id: string; label: string; provider: string | null; brand: string | null; card_id: string | null;
  last_message_id: string | null; last_mail_at: string | null; last_subject: string | null;
  analyzed_message_id: string | null; analyzed_at: string | null; status: string; result: StatementResult | null;
  auto: boolean; dismissed: boolean; password_saved: boolean;
};
export type AnalyzeOptions = { clave?: string; recordar?: boolean; auto?: boolean };
export type AnalyzeResponse = { ok?: boolean; resultado?: StatementResult; error?: string };

export const STATEMENT_COLUMNS = "id, label, provider, brand, card_id, last_message_id, last_mail_at, last_subject, analyzed_message_id, analyzed_at, status, result, auto, dismissed, password_saved";

// Hay un resumen que todavía no se analizó (nunca, o llegó uno nuevo).
export const isPending = (source: StatementSource) => !source.dismissed && Boolean(source.last_message_id) && source.last_message_id !== source.analyzed_message_id;
export const needsPassword = (source: StatementSource) => source.status === "clave" || source.status === "clave-incorrecta";

export const scanErrorMessage = (code: unknown) => (code === "permiso" ? "Google ya no nos deja leer tu Gmail. Volvé a conectarlo." : "No se pudo buscar en tu Gmail. Probá en un rato.");
