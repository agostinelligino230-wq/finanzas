// Lectores de notificaciones del celular (Android), uno por entidad, con el mismo patrón que los de mail.
// Se escriben con textos reales (prueba P1 y el registro de 30 días de incoming_notices).
// Mientras una entidad no tenga el suyo, sus notificaciones pasan por el lector genérico y quedan «dudosas».
import type { Lector } from "./tipos.ts";

export const LECTORES_PUSH: Lector[] = [];
