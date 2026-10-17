// Conexión con Gmail (solo lectura) para cargar avisos de Ualá, Mercado Pago, Wallbit, Nación y Macro.
// GET ?start=…        → manda a la pantalla de Google para elegir la cuenta y dar permiso.
// GET ?code=…&state=… → vuelve de Google: guarda el permiso, trae los últimos 60 días y vuelve a la app.
// POST (con sesión)   → "Actualizar ahora" para ese usuario.
// POST (sin sesión)   → lo llama el programador diario: actualiza las cuentas que hace más de 20 horas no se leen.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
const DEFAULT_APP = "https://finanzas-personales-ar.vercel.app";
const REDIRECT_URI = SUPABASE_URL + "/functions/v1/gmail";
const SCOPES = "openid email profile https://www.googleapis.com/auth/gmail.readonly";
const TZ = "America/Argentina/Buenos_Aires";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Solo se vuelve a la app (dominios propios), nunca a otro sitio.
const safeReturn = (value: string | null) => (value && /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(value)) || (value && /^http:\/\/localhost(:\d+)?$/.test(value)) ? value : DEFAULT_APP;

type Link = { user_id: string; email: string | null; name: string | null; refresh_token: string; providers: string[]; last_sync_at: string | null };
type Movement = { id: string; type: "gasto" | "ingreso"; amount: number; description: string; category: string; source: string; currency: "ARS" | "USD"; original?: number; rate?: number; date: string; datetime: string };
type Statement = { provider: string; card: string; color: string; month: string; due_date: string; total: number; total_usd: number };
type Mail = { id: string; subject: string; text: string; date: Date };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  try {
    if (req.method === "GET" && url.searchParams.get("start")) return await start(url.searchParams.get("start")!);
    if (req.method === "GET") return await callback(url);
    if (req.method === "POST") return await syncRequest(req);
    return json({ error: "Método no permitido" }, 405);
  } catch (error) {
    console.error(error);
    return json({ error: String(error) }, 500);
  }
});

async function start(state: string) {
  const { data } = await admin.from("gmail_link_states").select("state").eq("state", state).maybeSingle();
  if (!data || !CLIENT_ID) return Response.redirect(DEFAULT_APP + "/conectar?gmail=error", 302);
  const params = new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: "code", scope: SCOPES, access_type: "offline", prompt: "consent", include_granted_scopes: "true", state });
  return Response.redirect("https://accounts.google.com/o/oauth2/v2/auth?" + params.toString(), 302);
}

async function callback(url: URL) {
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const { data: saved } = state ? await admin.from("gmail_link_states").select("user_id, return_to").eq("state", state).maybeSingle() : { data: null };
  const back = (status: string) => Response.redirect(safeReturn(saved?.return_to ?? null) + "/conectar?gmail=" + status, 302);
  if (!saved) return back("error");
  await admin.from("gmail_link_states").delete().eq("state", state!);
  if (!code) return back("cancelado");

  const token = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: REDIRECT_URI, grant_type: "authorization_code" }),
  }).then((response) => response.json());
  if (!token.refresh_token || !String(token.scope ?? "").includes("gmail.readonly")) return back("sin-permiso");

  const profile = token.id_token ? JSON.parse(new TextDecoder().decode(base64url(token.id_token.split(".")[1]))) : {};
  const link = { user_id: saved.user_id, email: profile.email ?? null, name: profile.name ?? null, refresh_token: token.refresh_token };
  const { error } = await admin.from("gmail_links").upsert(link, { onConflict: "user_id" });
  if (error) return back("error");
  const { data: row } = await admin.from("gmail_links").select("*").eq("user_id", saved.user_id).single();
  await syncLink(row as Link, 60);
  return back("ok");
}

async function syncRequest(req: Request) {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = jwt ? await admin.auth.getUser(jwt) : { data: { user: null } };
  if (auth?.user) {
    const { data: row } = await admin.from("gmail_links").select("*").eq("user_id", auth.user.id).maybeSingle();
    if (!row) return json({ error: "Gmail no está conectado" }, 404);
    return json(await syncLink(row as Link));
  }
  // Programador diario: solo las cuentas que hace más de 20 horas no se leen.
  const limit = new Date(Date.now() - 20 * 3600 * 1000).toISOString();
  const { data: rows } = await admin.from("gmail_links").select("*").or("last_sync_at.is.null,last_sync_at.lt." + limit);
  const results = [];
  for (const row of (rows ?? []) as Link[]) {
    try { results.push(await syncLink(row)); } catch (error) { console.error(row.user_id, error); }
  }
  return json({ cuentas: results.length });
}

async function syncLink(link: Link, days?: number) {
  const since = link.last_sync_at ? Math.ceil((Date.now() - new Date(link.last_sync_at).getTime()) / 86400000) + 2 : 60;
  const window = days ?? Math.min(60, Math.max(3, since));
  const access = await accessToken(link.refresh_token);
  if (!access) {
    await admin.from("gmail_links").update({ last_result: { error: "permiso" } }).eq("user_id", link.user_id);
    return { error: "permiso" };
  }
  const { movements, statements } = await readMails(access, link, window);
  const added = await saveMovements(link.user_id, movements);
  const saved = await saveStatements(link.user_id, statements);
  const result = { movimientos: added, resumenes: saved };
  await admin.from("gmail_links").update({ last_sync_at: new Date().toISOString(), last_result: result }).eq("user_id", link.user_id);
  return result;
}

async function accessToken(refresh: string) {
  const data = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: refresh, grant_type: "refresh_token" }),
  }).then((response) => response.json());
  return (data.access_token as string | undefined) ?? null;
}

// ---------- Lectura de mails ----------

async function search(access: string, query: string, days: number): Promise<Mail[]> {
  const list = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100&q=" + encodeURIComponent(query + " newer_than:" + days + "d"), { headers: { Authorization: "Bearer " + access } }).then((response) => response.json());
  const mails: Mail[] = [];
  for (const item of (list.messages ?? []) as { id: string }[]) {
    const message = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/" + item.id + "?format=full", { headers: { Authorization: "Bearer " + access } }).then((response) => response.json());
    const headers = (message.payload?.headers ?? []) as { name: string; value: string }[];
    const subject = headers.find((header) => header.name.toLowerCase() === "subject")?.value ?? "";
    mails.push({ id: item.id, subject, text: bodyText(message.payload).replace(/\s+/g, " "), date: new Date(Number(message.internalDate)) });
  }
  return mails;
}

type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[] };

function bodyText(payload: Part): string {
  const plain = findPart(payload, "text/plain");
  if (plain) return decode(plain);
  const html = findPart(payload, "text/html");
  if (!html) return "";
  return decode(html)
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|tr|td|li|h\d)>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&#36;|&dollar;/g, "$").replace(/&amp;/g, "&").replace(/&aacute;/g, "á").replace(/&eacute;/g, "é").replace(/&iacute;/g, "í").replace(/&oacute;/g, "ó").replace(/&uacute;/g, "ú").replace(/&ntilde;/g, "ñ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function findPart(part: Part, mime: string): string | null {
  if (part.mimeType === mime && part.body?.data) return part.body.data;
  for (const child of part.parts ?? []) {
    const found = findPart(child, mime);
    if (found) return found;
  }
  return null;
}

function base64url(value: string) {
  const normal = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normal + "===".slice((normal.length + 3) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

const decode = (data: string) => new TextDecoder().decode(base64url(data));

const day = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);

// "$50.000,00" o "$3500" → 50000 / 3500
function amount(text: string) {
  const clean = text.replace(/\.$/, "");
  return Number(clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean.replace(/\.(?=\d{3}(\D|$))/g, ""));
}

const titleCase = (text: string) => text.toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());

// Transferencias a vos mismo (por nombre o alias) no cuentan como gasto.
function isOwn(name: string | null, text: string) {
  const words = (name ?? "").toLowerCase().split(/\s+/).filter((word) => word.length > 2);
  if (words.length < 2) return false;
  const clean = text.toLowerCase().replace(/[^a-záéíóúñ]/g, "");
  return clean.includes(words[0]) && clean.includes(words[words.length - 1]);
}

const MONTHS: Record<string, string> = { ene: "01", jan: "01", feb: "02", mar: "03", abr: "04", apr: "04", may: "05", jun: "06", jul: "07", ago: "08", aug: "08", sep: "09", set: "09", oct: "10", nov: "11", dic: "12", dec: "12" };

const expense = (id: string, mail: Mail, value: number, description: string, category: string, source: string): Movement => ({ id, type: "gasto", amount: value, description, category, source, currency: "ARS", date: day(mail.date), datetime: mail.date.toISOString() });

async function dollarRate() {
  for (const kind of ["cripto", "bolsa"]) {
    try {
      const data = await fetch("https://dolarapi.com/v1/dolares/" + kind).then((response) => response.json());
      if (data?.compra) return Number(data.compra);
    } catch { /* probar el siguiente */ }
  }
  return null;
}

async function readMails(access: string, link: Link, days: number) {
  const movements: Movement[] = [];
  const statements: Statement[] = [];
  const reads = (id: string) => (link.providers ?? []).includes(id);

  if (reads("uala")) {
    for (const mail of await search(access, 'from:uala.com.ar subject:"transferencia fue exitosa"', days)) {
      const value = mail.text.match(/Monto\s*\$\s*([\d.,]+)/i);
      const to = mail.text.match(/Destinatario\s+(.+?)\s+(CBU|CVU|Alias|Id\.)/i);
      const op = mail.text.match(/Id\.?\s*Op\.?\s*([\w-]+)/i);
      const name = to ? to[1].trim() : "";
      if (!value || !op || isOwn(link.name, name)) continue;
      movements.push(expense("uala:" + op[1], mail, amount(value[1]), name ? "Transferencia a " + titleCase(name) : "Transferencia", "transferencias", "uala"));
    }
    for (const mail of await search(access, 'from:uala.com.ar subject:"Resumen tarjeta"', days)) {
      const due = mail.text.match(/vencimiento\s+(\d{1,2})\s+([A-Za-zÁÉÍÓÚáéíóú]{3})[A-Za-zÁÉÍÓÚáéíóú]*\.?\s+(\d{4})/i);
      const pesos = mail.text.match(/Total en pesos\s*\$\s*([\d.,]+)/i);
      const usd = mail.text.match(/Total en d[oó]lares\s*(?:USD|US\$)\s*([\d.,]+)/i);
      const month = due ? MONTHS[due[2].toLowerCase()] : null;
      if (!due || !pesos || !month) continue;
      statements.push({ provider: "uala", card: "Ualá", color: "#2F80ED", month: due[3] + "-" + month, due_date: due[3] + "-" + month + "-" + due[1].padStart(2, "0"), total: amount(pesos[1]), total_usd: usd ? amount(usd[1]) : 0 });
    }
  }

  if (reads("mercadopago")) {
    for (const mail of await search(access, 'from:mercadopago subject:"Pago aprobado"', days)) {
      const value = mail.text.match(/Pagaste\s*\$\s*([\d.,]+)/i);
      if (!value) continue;
      const shop = mail.subject.replace(/^.*Pago aprobado (en|a)\s*/i, "").trim();
      movements.push(expense("mail:" + mail.id, mail, amount(value[1]), (shop || "Pago") + " (Mercado Pago)", "otro", "mercadopago"));
    }
  }

  if (reads("nacion")) {
    for (const mail of await search(access, 'from:bna subject:"Aviso de transferencia"', days)) {
      const data = mail.text.match(/transferencia a (.+?) por \$\s*([\d.,]+)/i);
      if (!data || isOwn(link.name, data[1])) continue;
      movements.push(expense("mail:" + mail.id, mail, amount(data[2]), "Transferencia a " + titleCase(data[1].trim()) + " (Nación)", "transferencias", "nacion"));
    }
  }

  if (reads("macro")) {
    for (const mail of await search(access, 'from:macro subject:"Aviso de Transferencia"', days)) {
      const data = mail.text.match(/transferencia al CBU\/CVU\/alias\s+(\S+)\s+por\s+\$\s*([\d.,]+)/i);
      if (!data || isOwn(link.name, data[1])) continue;
      movements.push(expense("mail:" + mail.id, mail, amount(data[2]), "Transferencia a " + data[1] + " (Macro)", "transferencias", "macro"));
    }
  }

  if (reads("wallbit")) {
    const rate = await dollarRate();
    if (rate) {
      for (const mail of await search(access, "from:wallbit subject:Recibiste", days)) {
        const value = mail.text.match(/Monto:\s*USD\s*\$?\s*([\d.,]+)/i);
        const origin = mail.text.match(/Origen:\s*(.+?)\s*(ID de operaci|$)/i);
        const op = mail.text.match(/ID de operaci[oó]n:\s*([\w-]+)/i);
        if (!value) continue;
        const dollars = Number(value[1].replace(/,/g, ""));
        movements.push({ id: op ? "wallbit:" + op[1] : "mail:" + mail.id, type: "ingreso", category: "otro", source: "wallbit", currency: "USD", original: dollars, rate, amount: Math.round(dollars * rate * 100) / 100, description: origin ? "Wallbit · " + titleCase(origin[1]) : "Wallbit", date: day(mail.date), datetime: mail.date.toISOString() });
      }
    }
  }

  return { movements, statements };
}

// ---------- Guardado ----------

async function saveMovements(userId: string, movements: Movement[]) {
  const rows = movements.filter((item) => item.amount > 0).map((item) => ({
    user_id: userId, description: item.description.slice(0, 120), amount: item.amount, category: item.category, movement_type: item.type, movement_date: item.date, paid: true,
    currency: item.currency, original_amount: item.original ?? null, exchange_rate: item.rate ?? null, source: item.source, external_id: item.id, created_at: item.datetime,
  }));
  if (rows.length === 0) return 0;
  const { data, error } = await admin.from("movements").upsert(rows, { onConflict: "user_id,external_id", ignoreDuplicates: true }).select("id");
  if (error) throw error;
  return data?.length ?? 0;
}

async function saveStatements(userId: string, statements: Statement[]) {
  let count = 0;
  for (const item of statements) {
    let { data: card } = await admin.from("credit_cards").select("id").eq("user_id", userId).or("provider.eq." + item.provider + ",name.ilike." + item.card.slice(0, 3) + "%").order("created_at").limit(1).maybeSingle();
    if (!card) {
      const created = await admin.from("credit_cards").insert({ user_id: userId, name: item.card, color: item.color, provider: item.provider }).select("id").single();
      card = created.data;
    }
    if (!card) continue;
    const { error } = await admin.from("card_statements").upsert({ user_id: userId, card_id: card.id, month: item.month, total: item.total, total_usd: item.total_usd, due_date: item.due_date, source: "gmail" }, { onConflict: "card_id,month" });
    if (!error) count++;
  }
  return count;
}
