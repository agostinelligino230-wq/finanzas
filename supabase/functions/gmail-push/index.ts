// Mail al instante: Gmail avisa por Google Pub/Sub cada vez que entra un mail a la bandeja de una cuenta conectada.
// POST de Pub/Sub (con su token OIDC) → se leen los mails nuevos desde el último history_id guardado.
// De los mails que no son de un banco solo se miran los encabezados, en memoria: no se baja el cuerpo ni se guarda nada.
// Los de un banco entran por la misma puerta que la lectura diaria (ingest_movement).
// Respuestas: 200 = listo (Pub/Sub no reintenta); 409 = esa cuenta se está procesando (Pub/Sub reintenta más tarde);
// 401 = no lo mandó Pub/Sub; 500 = falló algo (Pub/Sub reintenta). Con GMAIL_PUSH=off responde 200 sin procesar.
import { createClient } from "npm:@supabase/supabase-js@2";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.9.6";
import { accessToken, addedSince, fullMail, mailHeaders, search } from "../_shared/gmail.ts";
import { BUSQUEDA } from "../_shared/lectores/mail.ts";
import { entidadPorDominio } from "../_shared/lectores/entidades.ts";
import { avisoDeMail, cotizacionUnaVez, procesarAviso } from "../_shared/lectores/procesar.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// La suscripción push de Pub/Sub firma cada llamado con un token de Google para esta audiencia y esta cuenta de servicio.
const AUDIENCE = Deno.env.get("PUBSUB_AUDIENCE") ?? "";
const PUSH_ACCOUNT = Deno.env.get("PUBSUB_SERVICE_ACCOUNT") ?? "";
const PUSH_ON = (Deno.env.get("GMAIL_PUSH") ?? "on") !== "off";
const LEASE_SECONDS = 120;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const reply = (text: string, status = 200) => new Response(text, { status });

type Link = { user_id: string; email: string | null; name: string | null; refresh_token: string; providers: string[]; history_id: string | null };

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply("Método no permitido", 405);
  if (!(await fromPubSub(req))) return reply("No autorizado", 401);
  if (!PUSH_ON) return reply("apagado");
  try {
    const body = await req.json().catch(() => null);
    const data = body?.message?.data ? JSON.parse(atob(body.message.data)) : null;
    const email = String(data?.emailAddress ?? "").toLowerCase();
    // Un aviso sin cuenta no va a servir nunca: se confirma para que Pub/Sub no lo reintente.
    if (!email) return reply("sin cuenta");
    const { data: links } = await admin.from("gmail_links").select("user_id, email, name, refresh_token, providers, history_id").eq("email", email);
    let busy = false;
    for (const link of (links ?? []) as Link[]) {
      if ((await processLink(link, String(data.historyId ?? ""))) === "busy") busy = true;
    }
    return busy ? reply("ocupado", 409) : reply("ok");
  } catch (error) {
    console.error(error);
    return reply("error", 500);
  }
});

// El token lo firma Google: se verifica firma, emisor, audiencia y que sea la cuenta de servicio de la suscripción.
async function fromPubSub(req: Request) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token || !AUDIENCE || !PUSH_ACCOUNT) return false;
  try {
    const { payload } = await jwtVerify(token, googleKeys, { issuer: ["https://accounts.google.com", "accounts.google.com"], audience: AUDIENCE });
    return payload.email === PUSH_ACCOUNT && payload.email_verified === true;
  } catch {
    return false;
  }
}

async function processLink(link: Link, notified: string): Promise<"ok" | "busy"> {
  // Una cuenta se procesa de a un aviso por vez (si llegan dos juntos, el segundo espera y Pub/Sub lo reintenta).
  const { data: taken } = await admin.rpc("take_gmail_lease", { p_user: link.user_id, p_seconds: LEASE_SECONDS });
  if (!taken) return "busy";
  let next: string | null = null;
  try {
    const access = await accessToken(link.refresh_token);
    if (!access) {
      await admin.from("gmail_links").update({ last_result: { error: "permiso" } }).eq("user_id", link.user_id);
      return "ok";
    }
    const ctx = { userId: link.user_id, nombre: link.name, proveedores: link.providers ?? [], cotizacion: cotizacionUnaVez() };
    if (!link.history_id) {
      next = notified || null; // Primera vez: desde acá en adelante.
      return "ok";
    }
    const added = await addedSince(access, link.history_id);
    if (added === null) {
      // El historial venció (Gmail lo guarda unos días): se releen los últimos 3 días con la búsqueda de siempre.
      for (const mail of await search(access, BUSQUEDA, 3, 100)) await procesarAviso(admin, avisoDeMail(mail), ctx);
      next = notified || null;
      return "ok";
    }
    for (const id of added.ids) {
      const head = await mailHeaders(access, id);
      if (!head || !entidadPorDominio(head.from, ctx.proveedores)) continue; // No es de un banco: no se lee ni se guarda.
      const mail = await fullMail(access, id);
      if (mail) await procesarAviso(admin, avisoDeMail(mail), ctx);
    }
    next = added.historyId;
    return "ok";
  } finally {
    await admin.from("gmail_links").update({ push_lease_until: null, last_push_at: new Date().toISOString(), ...(next ? { history_id: next } : {}) }).eq("user_id", link.user_id);
  }
}
