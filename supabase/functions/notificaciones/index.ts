// Notificaciones de los bancos que manda la app de Android.
// GET  → lista de apps bancarias que el celular deja pasar ({version, paquetes}); así sumar una entidad no pide otra versión de la app.
// POST (X-Device-Token) → {avisos:[{clave, publicado, paquete, titulo, texto, textoLargo?}], escuchando?}
//   → {resultados:[{clave, estado}]}. Cada aviso entra por la misma puerta que los mails (ingest_movement).
// POST (X-Cron-Secret) → lo llama el programador diario: avisa los gastos fijos que vencen según el aviso elegido.
// 401 = token inválido o revocado (la app pide volver a vincular) · 413 = más de 50 avisos · 429 = más de 120 por minuto.
import { createClient } from "npm:@supabase/supabase-js@2";
import { entidadDePaquete, PAQUETES } from "../_shared/lectores/entidades.ts";
import { cotizacionPorDia, procesarAviso } from "../_shared/lectores/procesar.ts";
import { enviarPush } from "../_shared/avisos.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const MAX_POR_LLAMADO = 50;
const MAX_POR_MINUTO = 120;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

type Aviso = { clave?: unknown; publicado?: unknown; paquete?: unknown; titulo?: unknown; texto?: unknown; textoLargo?: unknown; lat?: unknown; lng?: unknown; precision?: unknown };
const text = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");
// Solo coordenadas válidas: un valor roto no puede frenar el movimiento.
function ubicacionDe(item: Aviso) {
  const lat = Number(item.lat);
  const lng = Number(item.lng);
  if (item.lat == null || item.lng == null || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined;
  const precision = Number(item.precision);
  return { lat, lng, precision: Number.isFinite(precision) ? Math.round(precision) : null };
}

Deno.serve(async (req) => {
  try {
    if (req.method === "GET") return json(PAQUETES);
    if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
    if (req.headers.has("X-Cron-Secret")) {
      if (!CRON_SECRET || req.headers.get("X-Cron-Secret") !== CRON_SECRET) return json({ error: "No autorizado" }, 401);
      return json(await avisarVencimientos());
    }

    const device = await deviceOf(req.headers.get("X-Device-Token") ?? "");
    if (!device) return json({ error: "dispositivo" }, 401);
    const body = await req.json().catch(() => null) as { avisos?: Aviso[]; escuchando?: boolean } | null;
    const avisos = Array.isArray(body?.avisos) ? body!.avisos : [];
    if (avisos.length > MAX_POR_LLAMADO) return json({ error: "demasiados" }, 413);
    const { data: allowed } = await admin.rpc("take_device_quota", { p_device: device.id, p_count: avisos.length, p_limit: MAX_POR_MINUTO, p_listener: typeof body?.escuchando === "boolean" ? body.escuchando : null });
    if (!allowed) return json({ error: "espera" }, 429);

    const ctx = { userId: device.user_id, nombre: null, proveedores: null, cotizacion: cotizacionPorDia() };
    const resultados = [];
    for (const item of avisos) {
      const clave = text(item.clave, 200);
      const paquete = text(item.paquete, 120);
      const publicado = new Date(text(item.publicado, 40));
      // Solo apps de la lista (el celular ya filtra; esto es por si una versión vieja manda de más).
      if (!clave || !entidadDePaquete(paquete) || Number.isNaN(publicado.getTime())) { resultados.push({ clave, estado: "ignored" }); continue; }
      const result = await procesarAviso(admin, {
        canal: "push", clave: device.id + "|" + clave, remitente: paquete, proveedor: entidadDePaquete(paquete)!.id, dispositivo: device.id,
        titulo: text(item.titulo, 300), texto: text(item.textoLargo, 4000) || text(item.texto, 4000), recibido: publicado, ubicacion: ubicacionDe(item),
      }, ctx);
      resultados.push({ clave, estado: result.estado });
    }
    return json({ resultados });
  } catch (error) {
    console.error(error);
    return json({ error: "interno" }, 500);
  }
});

// ---------- Avisos de vencimiento ----------

type Fijo = { id: string; user_id: string; name: string; due_day: number; reminder_days: number; start_month: string | null; end_month: string | null };

// Si el mes no tiene ese día, vence el último día del mes (igual que en shared/fijos.ts).
function vencimiento(mes: string, dia: number) {
  const [year, month] = mes.split("-").map(Number);
  return mes + "-" + String(Math.min(dia, new Date(Date.UTC(year, month, 0)).getUTCDate())).padStart(2, "0");
}

async function avisarVencimientos() {
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const mes = hoy.slice(0, 7);
  // El aviso de un vencimiento del 1 o el 2 puede caer a fin del mes anterior.
  const [year, month] = mes.split("-").map(Number);
  const siguiente = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7);
  const { data, error } = await admin.from("fixed_expenses").select("id, user_id, name, due_day, reminder_days, start_month, end_month").not("reminder_days", "is", null);
  if (error) throw error;
  let enviados = 0;
  for (const fijo of (data ?? []) as Fijo[]) {
    const toca = [mes, siguiente].find((candidato) => {
      const dias = Math.round((Date.parse(vencimiento(candidato, fijo.due_day)) - Date.parse(hoy)) / 86400000);
      return dias === fijo.reminder_days && (!fijo.start_month || fijo.start_month <= candidato) && (!fijo.end_month || candidato <= fijo.end_month);
    });
    if (!toca) continue;
    const { data: pago } = await admin.from("fixed_expense_payments").select("id").eq("fixed_expense_id", fijo.id).eq("month", toca).maybeSingle();
    if (pago) continue;
    const cuando = fijo.reminder_days === 0 ? "hoy" : fijo.reminder_days === 1 ? "mañana" : "en " + fijo.reminder_days + " días";
    await enviarPush(admin, fijo.user_id, { title: fijo.name + " vence " + cuando, body: "Tocá para marcarlo como pagado." }, "/fijos");
    enviados++;
  }
  return { enviados };
}

// El token viaja en claro (HTTPS) y en la base está solo su sha256.
async function deviceOf(token: string) {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const { data } = await admin.from("devices").select("id, user_id").eq("token_hash", hash).is("revoked_at", null).maybeSingle();
  return data as { id: string; user_id: string } | null;
}
