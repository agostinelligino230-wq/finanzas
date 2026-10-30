// Un aviso (mail o notificación) → lector → RPC ingest_movement, que decide si es nuevo, si se une
// a uno que ya llegó por otra vía o si ya estaba. Es la única puerta de entrada de los movimientos automáticos.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { LECTORES_MAIL } from "./mail.ts";
import { LECTORES_PUSH } from "./push.ts";
import { leerGenerico } from "./generico.ts";
import { leerConIA } from "./ia.ts";
import { entidad, entidadDeMail, entidadDePaquete, type Entidad } from "./entidades.ts";
import { officialSignature } from "./autenticidad.ts";
import { day } from "./texto.ts";
import { avisarApp } from "../avisos.ts";
import type { Aviso, Lectura, Resumen } from "./tipos.ts";
import type { Mail } from "../gmail.ts";

export type Estado = "new" | "merged" | "repeated" | "discarded" | "unrecognized" | "error" | "ignored";
export type Contexto = { userId: string; nombre: string | null; proveedores?: string[] | null; cotizacion: (dia: string) => Promise<number | null> };
export type Resultado = { estado: Estado; proveedor: string | null; reconocido: boolean; leido: boolean; resumen?: Resumen; movimiento?: string | null };
type Parser = "rule" | "generic" | "ai";

const LECTORES = [...LECTORES_MAIL, ...LECTORES_PUSH];
const TEXTO_MAXIMO = 20000;
const CON_MONTO = /(?:\$|US\$|USD|U\$S|ARS)\s?\d/i;

export type Leido = { ent: Entidad; reconocido: boolean; lectura: Lectura; parser: Parser | null; firma: string | null };

// Qué dice un aviso, sin guardar nada: lector propio, genérico o IA. Lo usan la carga y «Volver a leer».
// null: no es de ninguna entidad (o la persona no la eligió).
export async function leerAviso(admin: SupabaseClient, aviso: Aviso, ctx: Pick<Contexto, "nombre" | "proveedores">): Promise<Leido | null> {
  const permitido = (id: string) => !ctx.proveedores || ctx.proveedores.includes(id);
  const lector = LECTORES.find((item) => item.canal === aviso.canal && permitido(item.proveedor) && item.reconoce(aviso));
  const ent = lector ? entidad(lector.proveedor) : aviso.canal === "push" ? entidadDePaquete(aviso.remitente) : entidadDeMail(aviso.remitente, ctx.proveedores);
  if (!ent) return null;

  let lectura: Lectura = lector ? lector.leer(aviso, { nombre: ctx.nombre }) : null;
  let parser: Parser | null = lector ? "rule" : null;
  const firma = aviso.canal === "mail" ? officialSignature(aviso.autenticacion, ent.dominios) : null;
  if (lectura && "resumen" in lectura) return { ent, reconocido: true, lectura, parser, firma };
  // Sin lector propio: las notificaciones de bancos y los mails firmados por la entidad prueban el genérico,
  // que además descarta promociones, códigos y avisos de seguridad (así no gastan la IA).
  // Los mails sin firma quedan como «no reconocido» para escribirles un lector.
  if (lectura === null && (aviso.canal === "push" || firma)) {
    lectura = leerGenerico(aviso, ent.nombre);
    if (lectura) parser = "generic";
  }
  // IA de respaldo (con tope e interruptor): notificaciones que nadie leyó y mails que traen un monto.
  // De los mails, solo los firmados por la entidad: uno falso no gasta el cupo ni le habla a la IA.
  if (lectura === null && (aviso.canal === "push" || (firma && CON_MONTO.test(aviso.titulo + " " + aviso.texto)))) {
    lectura = await leerConIA(admin, aviso, ent.nombre);
    if (lectura) parser = "ai";
  }
  return { ent, reconocido: Boolean(lector), lectura, parser, firma };
}

export async function procesarAviso(admin: SupabaseClient, aviso: Aviso, ctx: Contexto): Promise<Resultado> {
  const leido = await leerAviso(admin, aviso, ctx);
  // No es de ninguna entidad (o la persona no la eligió): no se guarda nada.
  if (!leido) return { estado: "ignored", proveedor: null, reconocido: false, leido: false };
  const { ent, lectura, parser, firma } = leido;
  if (lectura && "resumen" in lectura) return { estado: "discarded", proveedor: ent.id, reconocido: true, leido: true, resumen: lectura.resumen };

  const autentico = aviso.canal === "push" || Boolean(firma);
  const notice = {
    channel: aviso.canal, provider: ent.id, notice_key: aviso.clave, authentic: autentico,
    auth_detail: aviso.canal === "mail" ? { dkim_domain: firma } : { package: aviso.remitente, device_id: aviso.dispositivo ?? null },
    title: aviso.titulo.slice(0, 300), body: aviso.texto.slice(0, TEXTO_MAXIMO), received_at: aviso.recibido.toISOString(), parser,
  };
  const base = { proveedor: ent.id, reconocido: leido.reconocido };

  if (!lectura) return { ...base, leido: false, ...(await ingest(admin, ctx.userId, null, { ...notice, outcome: "unrecognized" })) };
  if ("descartar" in lectura) return { ...base, leido: false, ...(await ingest(admin, ctx.userId, null, { ...notice, outcome: "discarded", detail: lectura.descartar })) };
  if (!("tipo" in lectura)) return { ...base, estado: "error", leido: false };

  // En dólares: "amount" se guarda en pesos con la cotización del día en que llegó la plata.
  let pesos = lectura.monto;
  let original: number | null = null;
  let rate: number | null = null;
  if (lectura.moneda === "USD") {
    rate = await ctx.cotizacion(day(aviso.recibido));
    if (!rate) return { ...base, estado: "error", leido: false }; // Sin cotización no se guarda: se lee en la próxima.
    original = lectura.monto;
    pesos = Math.round(lectura.monto * rate * 100) / 100;
  }
  if (!(pesos > 0)) return { ...base, leido: false, ...(await ingest(admin, ctx.userId, null, { ...notice, outcome: "discarded", detail: "monto en cero" })) };

  // Verificado: aviso auténtico leído por un lector propio. Lo leído por el genérico o la IA, siempre dudoso.
  // Un mail sin firma de una entidad con dominios todavía sin confirmar (P2) suma como hasta hoy (legacy).
  const trust = parser !== "rule" ? "doubtful" : autentico ? "verified" : aviso.canal === "mail" && !ent.dkimConfirmado ? "legacy" : "doubtful";
  const externalId = lectura.idExterno ?? (aviso.canal === "mail" ? "mail:" + aviso.clave : "push:" + ent.id + ":" + (lectura.opRef ?? aviso.clave));
  const movement = {
    type: lectura.tipo, amount: pesos, currency: lectura.moneda, original, rate, description: lectura.descripcion.slice(0, 120), category: lectura.categoria,
    source: ent.id, external_id: externalId, op_ref: lectura.opRef ?? null, date: day(aviso.recibido), datetime: aviso.recibido.toISOString(), trust,
    counterparty_name: lectura.contraparte?.nombre ?? null, counterparty_ref: lectura.contraparte?.ref ?? null,
    lat: aviso.ubicacion?.lat ?? null, lng: aviso.ubicacion?.lng ?? null, accuracy_m: aviso.ubicacion?.precision ?? null,
  };
  const saved = await ingest(admin, ctx.userId, movement, notice);
  // Movimiento nuevo por mail: aviso propio de la app (si llegó por notificación, el banco ya avisó).
  if (saved.estado === "new" && aviso.canal === "mail") await avisarApp(admin, ctx.userId, movement, ent.nombre, aviso.recibido);
  return { ...base, leido: true, ...saved };
}

async function ingest(admin: SupabaseClient, userId: string, movement: Record<string, unknown> | null, notice: Record<string, unknown>): Promise<{ estado: Estado; movimiento?: string | null }> {
  const { data, error } = await admin.rpc("ingest_movement", { p_user: userId, p_mov: movement, p_notice: notice });
  if (error) {
    console.error("ingest_movement", error.message);
    return { estado: "error" };
  }
  return { estado: (data as { outcome: Estado }).outcome, movimiento: (data as { movement_id: string | null }).movement_id };
}

export const avisoDeMail = (mail: Mail): Aviso => ({ canal: "mail", clave: mail.id, remitente: mail.from, titulo: mail.subject, texto: mail.text, recibido: mail.date, autenticacion: mail.auth });

// Cotización del dólar (compra) del día en que llegó la plata, para los ingresos en US$. Una búsqueda por día y por lectura.
export function cotizacionPorDia() {
  const pending = new Map<string, Promise<number | null>>();
  return (dia: string) => {
    let rate = pending.get(dia);
    if (!rate) pending.set(dia, rate = dollarRate(dia));
    return rate;
  };
}

const KINDS = ["cripto", "bolsa"];

// "2026-10-05" → la del historial de ArgentinaDatos. Si ese día no tiene (fin de semana, feriado o la de hoy
// todavía no cargó), la de hoy en vivo si es hoy, y si no, la del día hábil anterior.
async function dollarRate(dia: string) {
  const today = day(new Date());
  const start = new Date(dia + "T12:00:00Z");
  for (let back = 0; back < 5; back++) {
    if (back === 1 && dia === today) {
      const live = await dollarRateNow();
      if (live) return live;
    }
    const date = new Date(start.getTime() - back * 86400000).toISOString().slice(0, 10).replace(/-/g, "/");
    for (const kind of KINDS) {
      try {
        const response = await fetch("https://api.argentinadatos.com/v1/cotizaciones/dolares/" + kind + "/" + date);
        const data = response.ok ? await response.json() : null;
        if (data?.compra) return Number(data.compra);
      } catch { /* probar el siguiente */ }
    }
  }
  return dollarRateNow();
}

async function dollarRateNow() {
  for (const kind of KINDS) {
    try {
      const data = await fetch("https://dolarapi.com/v1/dolares/" + kind).then((response) => response.json());
      if (data?.compra) return Number(data.compra);
    } catch { /* probar el siguiente */ }
  }
  return null;
}
