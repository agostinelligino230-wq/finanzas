// Notificaciones de los bancos que manda la app de Android.
// GET  → lista de apps bancarias que el celular deja pasar ({version, paquetes}); así sumar una entidad no pide otra versión de la app.
// POST (X-Device-Token) → {avisos:[{clave, publicado, paquete, titulo, texto, textoLargo?}], escuchando?}
//   → {resultados:[{clave, estado}]}. Cada aviso entra por la misma puerta que los mails (ingest_movement).
// 401 = token inválido o revocado (la app pide volver a vincular) · 413 = más de 50 avisos · 429 = más de 120 por minuto.
import { createClient } from "npm:@supabase/supabase-js@2";
import { entidadDePaquete, PAQUETES } from "../_shared/lectores/entidades.ts";
import { cotizacionPorDia, procesarAviso } from "../_shared/lectores/procesar.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAX_POR_LLAMADO = 50;
const MAX_POR_MINUTO = 120;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

type Aviso = { clave?: unknown; publicado?: unknown; paquete?: unknown; titulo?: unknown; texto?: unknown; textoLargo?: unknown };
const text = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");

Deno.serve(async (req) => {
  try {
    if (req.method === "GET") return json(PAQUETES);
    if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

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
        titulo: text(item.titulo, 300), texto: text(item.textoLargo, 4000) || text(item.texto, 4000), recibido: publicado,
      }, ctx);
      resultados.push({ clave, estado: result.estado });
    }
    return json({ resultados });
  } catch (error) {
    console.error(error);
    return json({ error: "interno" }, 500);
  }
});

// El token viaja en claro (HTTPS) y en la base está solo su sha256.
async function deviceOf(token: string) {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const { data } = await admin.from("devices").select("id, user_id").eq("token_hash", hash).is("revoked_at", null).maybeSingle();
  return data as { id: string; user_id: string } | null;
}
