// Conexión con Gmail (solo lectura) para cargar avisos de Ualá, Mercado Pago, Wallbit, Nación y Macro.
// GET ?start=…        → manda a la pantalla de Google para elegir la cuenta y dar permiso.
// GET ?code=…&state=… → vuelve de Google: guarda el permiso, trae los últimos 60 días y vuelve a la app.
// POST (con sesión)   → "Actualizar ahora" para ese usuario, buscar resúmenes de tarjeta ({accion:"tarjetas"})
//                        o analizar el PDF de un resumen ({accion:"analizar", fuente, clave?, recordar?, auto?}).
// POST (sin sesión)   → lo llama el programador diario: actualiza las cuentas que hace más de 20 horas no se leen.
import { createClient } from "npm:@supabase/supabase-js@2";
import { getDocumentProxy } from "npm:unpdf@1.8.1";

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
type Mail = { id: string; subject: string; from: string; text: string; date: Date };

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
  const body = await req.json().catch(() => ({})) as { accion?: string; interno?: string; fuente?: string; clave?: string; recordar?: boolean; auto?: boolean };

  // Análisis automático de un resumen (lo pide la misma función, una vez por tarjeta).
  if (jwt && jwt === SERVICE_KEY && body.interno === "analizar" && body.fuente) {
    const { data: source } = await admin.from("statement_sources").select("*").eq("id", body.fuente).maybeSingle();
    if (!source) return json({ error: "no existe" }, 404);
    const { data: row } = await admin.from("gmail_links").select("*").eq("user_id", (source as Source).user_id).maybeSingle();
    if (!row) return json({ error: "Gmail no está conectado" }, 404);
    return json(await analyzeSource(row as Link, source as Source));
  }

  const { data: auth } = jwt && jwt !== SERVICE_KEY ? await admin.auth.getUser(jwt) : { data: { user: null } };
  if (auth?.user) {
    const { data: row } = await admin.from("gmail_links").select("*").eq("user_id", auth.user.id).maybeSingle();
    if (!row) return json({ error: "Gmail no está conectado" }, 404);
    const link = row as Link;
    if (body.accion === "tarjetas") {
      const access = await accessToken(link.refresh_token);
      if (!access) return json({ error: "permiso" });
      const sources = await discoverStatements(access, link);
      return json({ tarjetas: sources.length });
    }
    if (body.accion === "analizar" && body.fuente) {
      const { data: source } = await admin.from("statement_sources").select("*").eq("id", body.fuente).eq("user_id", link.user_id).maybeSingle();
      if (!source) return json({ error: "no existe" }, 404);
      return json(await analyzeSource(link, source as Source, { clave: body.clave, recordar: body.recordar, auto: body.auto }));
    }
    return json(await syncLink(link));
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
  const { movements, statements, mails } = await readMails(access, link, window);
  const added = await saveMovements(link.user_id, movements);
  const saved = await saveStatements(link.user_id, statements);
  // Resúmenes de tarjeta en PDF: se anotan los nuevos y se analizan solos los que autorizaste.
  let tarjetas = 0;
  try {
    const sources = await discoverStatements(access, link);
    tarjetas = sources.filter((source) => !source.dismissed).length;
    await analyzeInBackground(sources);
  } catch (error) { console.error("tarjetas", error); }
  const result = { movimientos: added, resumenes: saved, tarjetas, mails };
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

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me/";
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Gmail limita los pedidos por minuto: si se pasa, espera un poco y reintenta.
async function gmailGet(access: string, path: string) {
  for (let attempt = 0; ; attempt++) {
    const data = await fetch(GMAIL + path, { headers: { Authorization: "Bearer " + access } }).then((response) => response.json()).catch(() => ({}));
    const limited = data?.error && (data.error.code === 429 || /rate|quota/i.test(String(data.error.message ?? "")));
    if (!limited || attempt >= 3) return data;
    await wait(4000 * (attempt + 1));
  }
}

async function search(access: string, query: string, days: number, max = 100): Promise<Mail[]> {
  const list = await gmailGet(access, "messages?maxResults=" + max + "&q=" + encodeURIComponent(query + " newer_than:" + days + "d"));
  const mails: Mail[] = [];
  for (const item of (list.messages ?? []) as { id: string }[]) {
    const message = await gmailGet(access, "messages/" + item.id + "?format=full");
    if (!message.payload) continue; // Si Gmail no lo devuelve, se lee en la próxima.
    const headers = (message.payload.headers ?? []) as { name: string; value: string }[];
    const header = (name: string) => headers.find((entry) => entry.name.toLowerCase() === name)?.value ?? "";
    mails.push({ id: item.id, subject: header("subject"), from: header("from"), text: bodyText(message.payload).replace(/\s+/g, " "), date: new Date(Number(message.internalDate)) });
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
    .replace(/&nbsp;|&zwnj;/g, " ").replace(/&#36;|&dollar;/g, "$").replace(/&amp;/g, "&").replace(/&aacute;/g, "á").replace(/&eacute;/g, "é").replace(/&iacute;/g, "í").replace(/&oacute;/g, "ó").replace(/&uacute;/g, "ú").replace(/&ntilde;/g, "ñ")
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
  // Cuántos mails se encontraron por cuenta (para saber si algo no se está leyendo).
  const found: Record<string, number> = {};
  // Una sola búsqueda para todas las cuentas (Gmail cobra cada búsqueda) y después se separa por remitente y asunto.
  const ids = ["uala", "mercadopago", "nacion", "macro", "wallbit"].filter(reads);
  const all = ids.length ? await search(access, '{from:uala.com.ar from:mercadopago from:bna from:macro from:wallbit} {subject:"transferencia fue exitosa" subject:"Resumen tarjeta" subject:"Pago aprobado" subject:"Aviso de transferencia" subject:Recibiste}', days, 300) : [];
  const pick = (id: string, from: RegExp, subject: RegExp) => { const list = all.filter((mail) => from.test(mail.from) && subject.test(mail.subject)); found[id] = (found[id] ?? 0) + list.length; return list; };

  if (reads("uala")) {
    for (const mail of pick("uala", /uala/i, /transferencia fue exitosa/i)) {
      const value = mail.text.match(/Monto:?\s*\$\s*([\d.,]+)/i);
      const to = mail.text.match(/Destinatario:?\s+(.+?)\s+(CBU|CVU|Alias|Id\.)/i);
      const op = mail.text.match(/Id\.?\s*Op\.?:?\s*([\w-]+)/i);
      const name = to ? to[1].trim() : "";
      if (!value || !op || isOwn(link.name, name)) continue;
      movements.push(expense("uala:" + op[1], mail, amount(value[1]), name ? "Transferencia a " + titleCase(name) : "Transferencia", "transferencias", "uala"));
    }
    for (const mail of pick("uala", /uala/i, /Resumen tarjeta/i)) {
      const due = mail.text.match(/vencimiento:?\s+(\d{1,2})\s+([A-Za-zÁÉÍÓÚáéíóú]{3})[A-Za-zÁÉÍÓÚáéíóú]*\.?\s+(\d{4})/i);
      const pesos = mail.text.match(/Total en pesos:?\s*\$\s*([\d.,]+)/i);
      const usd = mail.text.match(/Total en d[oó]lares:?\s*(?:USD|US\$)\s*([\d.,]+)/i);
      const month = due ? MONTHS[due[2].toLowerCase()] : null;
      if (!due || !pesos || !month) continue;
      statements.push({ provider: "uala", card: "Ualá", color: "#2F80ED", month: due[3] + "-" + month, due_date: due[3] + "-" + month + "-" + due[1].padStart(2, "0"), total: amount(pesos[1]), total_usd: usd ? amount(usd[1]) : 0 });
    }
  }

  if (reads("mercadopago")) {
    for (const mail of pick("mercadopago", /mercado ?pago/i, /Pago aprobado/i)) {
      const value = mail.text.match(/Pagaste:?\s*\$\s*([\d.,]+)/i);
      if (!value) continue;
      const shop = mail.subject.replace(/^.*Pago aprobado (en|a)\s*/i, "").trim();
      movements.push(expense("mail:" + mail.id, mail, amount(value[1]), (shop || "Pago") + " (Mercado Pago)", "otro", "mercadopago"));
    }
  }

  if (reads("nacion")) {
    for (const mail of pick("nacion", /bna/i, /Aviso de transferencia/i)) {
      const data = mail.text.match(/transferencia a (.+?) por \$\s*([\d.,]+)/i);
      if (!data || isOwn(link.name, data[1])) continue;
      movements.push(expense("mail:" + mail.id, mail, amount(data[2]), "Transferencia a " + titleCase(data[1].trim()) + " (Nación)", "transferencias", "nacion"));
    }
  }

  if (reads("macro")) {
    for (const mail of pick("macro", /macro/i, /Aviso de Transferencia/i)) {
      const data = mail.text.match(/transferencia al CBU\/CVU\/alias\s+(\S+)\s+por\s+\$\s*([\d.,]+)/i);
      if (!data || isOwn(link.name, data[1])) continue;
      movements.push(expense("mail:" + mail.id, mail, amount(data[2]), "Transferencia a " + data[1] + " (Macro)", "transferencias", "macro"));
    }
  }

  if (reads("wallbit")) {
    const rate = await dollarRate();
    if (rate) {
      for (const mail of pick("wallbit", /wallbit/i, /Recibiste/i)) {
        // El monto viene en el mail o en el asunto ("Recibiste USD $691.55").
        const value = mail.text.match(/Monto:\s*USD\s*\$?\s*([\d.,]+)/i) ?? mail.subject.match(/Recibiste\s+US[D$]\s*\$?\s*([\d.,]+)/i);
        const origin = mail.text.match(/Origen:\s*(.+?)\s*(ID de operaci|$)/i);
        const op = mail.text.match(/ID de operaci[oó]n:\s*([\w-]+)/i);
        if (!value) continue;
        const dollars = Number(value[1].replace(/,/g, ""));
        movements.push({ id: op ? "wallbit:" + op[1] : "mail:" + mail.id, type: "ingreso", category: "otro", source: "wallbit", currency: "USD", original: dollars, rate, amount: Math.round(dollars * rate * 100) / 100, description: origin ? "Wallbit · " + titleCase(origin[1]) : "Wallbit", date: day(mail.date), datetime: mail.date.toISOString() });
      }
    }
  }

  const mails: Record<string, { mails: number; leidos: number }> = {};
  for (const id of Object.keys(found)) mails[id] = { mails: found[id], leidos: movements.filter((item) => item.source === id).length + statements.filter((item) => item.provider === id).length };
  return { movements, statements, mails };
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
    // Si ya se leyó el PDF de ese mes, manda el PDF (tiene el detalle completo).
    const { data: fromPdf } = await admin.from("card_statements").select("id").eq("card_id", card.id).eq("month", item.month).eq("source", "pdf").maybeSingle();
    if (fromPdf) continue;
    const { error } = await admin.from("card_statements").upsert({ user_id: userId, card_id: card.id, month: item.month, total: item.total, total_usd: item.total_usd, due_date: item.due_date, source: "gmail" }, { onConflict: "card_id,month" });
    if (!error) count++;
  }
  return count;
}
// ---------- Resúmenes de tarjeta en PDF ----------
// Se arma el texto del PDF renglón por renglón (respetando columnas) y se buscan:
// vencimiento, cierre, total a pagar (pesos y dólares), pago mínimo, consumos y cuotas.

type PdfToken = { str: string; x: number; y: number; w: number };
type PdfLine = { text: string; tokens: PdfToken[] };
type Consumo = { date: string | null; description: string; amount: number; currency: "ARS" | "USD"; kind: "consumo" | "cargo" | "pago"; cuota?: { n: number; m: number } };
type StatementData = {
  month: string; dueDate: string | null; closingDate: string | null; total: number; totalUsd: number; minPayment: number | null;
  brand: string | null; last4: string | null; consumos: Consumo[];
};

type PdfProxy = { numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: unknown[] }> }> };

async function pdfLines(pdf: PdfProxy): Promise<PdfLine[]> {
  const lines: PdfLine[] = [];
  for (let page = 1; page <= Math.min(pdf.numPages, 12); page++) {
    const content = await (await pdf.getPage(page)).getTextContent();
    const tokens = (content.items as { str?: string; transform?: number[]; width?: number }[])
      .filter((item) => item.str && item.str.trim() && item.transform)
      .map((item) => ({ str: item.str!.replace(/\s+/g, " "), x: item.transform![4], y: item.transform![5], w: item.width ?? 0 }))
      .sort((a, b) => b.y - a.y || a.x - b.x);
    let row: PdfToken[] = [];
    const flush = () => {
      if (!row.length) return;
      row.sort((a, b) => a.x - b.x);
      let text = "";
      let end = -Infinity;
      for (const token of row) {
        const gap = token.x - end;
        text += text ? (gap > 12 ? "   " : gap > 1 ? " " : "") : "";
        text += token.str.trim();
        end = token.x + token.w;
      }
      lines.push({ text: text.trim(), tokens: row });
      row = [];
    };
    for (const token of tokens) {
      if (row.length && Math.abs(row[0].y - token.y) > 3) flush();
      row.push(token);
    }
    flush();
  }
  return lines;
}

const MONTH_NUM: Record<string, number> = { ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7, ago: 8, aug: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12, dec: 12 };
const pad = (n: number) => String(n).padStart(2, "0");
const fullYear = (y: number) => (y < 100 ? 2000 + y : y);
const iso = (y: number, m: number, d: number) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2000 && y < 2100 ? fullYear(y) + "-" + pad(m) + "-" + pad(d) : null);
const monthWord = (word: string) => MONTH_NUM[word.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").slice(0, 3)] ?? 0;

// Fechas: 06/10/25, 06-10-2025, 06 Oct 25, 06-Oct-25, 6 de octubre de 2025, 25 Octubre 06 (Visa: año mes día).
const DATE_RE = /(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})|(\d{1,2})(?:\s+de\s+|[\s.-]+)([A-Za-zÁÉÍÓÚáéíóú]{3,10})\.?(?:\s+de\s+|[\s.-]+)(\d{2,4})/;

function parseDate(text: string): string | null {
  const match = text.match(DATE_RE);
  if (!match) return null;
  if (match[1]) return iso(fullYear(Number(match[3])), Number(match[2]), Number(match[1]));
  const month = monthWord(match[5]);
  if (!month) return null;
  const a = Number(match[4]);
  const b = Number(match[6]);
  // Visa (Prisma) escribe "25 Octubre 06" = año, mes, día. Con el mes completo y un "año" de 2 cifras al final ≤ 31, se lee así.
  if (match[5].length > 3 && match[6].length === 2 && a >= 20 && a <= 40 && b <= 31) return iso(fullYear(a), month, b);
  return iso(fullYear(b), month, a);
}

function dateAfter(lines: PdfLine[], label: RegExp, skip: RegExp): string | null {
  for (const line of lines) {
    const match = line.text.match(label);
    if (!match || match.index === undefined) continue;
    const before = line.text.slice(Math.max(0, match.index - 12), match.index + match[0].length);
    if (skip.test(before)) continue;
    const date = parseDate(line.text.slice(match.index + match[0].length, match.index + match[0].length + 45));
    if (date) return date;
  }
  return null;
}

// Resúmenes con el título arriba y el valor abajo (por ejemplo Ualá): busca el valor en la misma columna, en los renglones de abajo.
function valueBelow<T>(lines: PdfLine[], label: RegExp, read: (text: string) => T | null, skip?: RegExp): T | null {
  for (let i = 0; i < lines.length; i++) {
    const token = lines[i].tokens.find((entry) => label.test(entry.str) && !(skip && skip.test(entry.str)));
    if (!token) continue;
    const from = token.x - 15;
    const to = token.x + Math.max(token.w, 60);
    for (const next of lines.slice(i + 1, i + 4)) {
      const cells = next.tokens.filter((entry) => entry.x + entry.w > from && entry.x < to).sort((a, b) => a.x - b.x);
      if (!cells.length) continue;
      const value = read(cells.map((entry) => entry.str).join(" "));
      if (value !== null) return value;
    }
  }
  return null;
}

// Separador decimal: "12.345,67" (Argentina) o "12,345.67".
function amountReader(allText: string) {
  const ar = (allText.match(/\d{1,3}(?:\.\d{3})+,\d{2}\b|\b\d{1,3},\d{2}\b/g) ?? []).length;
  const us = (allText.match(/\d{1,3}(?:,\d{3})+\.\d{2}\b|\b\d{1,3}\.\d{2}\b/g) ?? []).length;
  const comma = ar >= us;
  const re = comma ? /(-\s?)?\$?\s?(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2})(-)?(?![\d,])/g : /(-\s?)?\$?\s?(\d{1,3}(?:,\d{3})+\.\d{2}|\d+\.\d{2})(-)?(?![\d.])/g;
  const toNumber = (raw: string) => Number(comma ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, ""));
  return (text: string) => [...text.matchAll(re)].map((match) => ({ value: toNumber(match[2]) * (match[1] || match[3] ? -1 : 1), index: match.index ?? 0, raw: match[0] }));
}

const CUOTA_RES = [
  /\((\d{1,2})\/(\d{1,2})\)/,
  /\bC(?:UOTA|TA)?\.?\s?(\d{1,2})\s?\/\s?(\d{1,2})\b/i,
  /\bCUOTAS?\s*(\d{1,2})\s*(?:\/|DE)\s*(\d{1,2})\b/i,
  /(?:^|\s)(\d{2})\/(\d{2})(?=\s|$)(?!\s*\/)/,
];

function findCuota(text: string) {
  for (const re of CUOTA_RES) {
    const match = text.match(re);
    if (!match) continue;
    const n = Number(match[1]);
    const m = Number(match[2]);
    if (n >= 1 && m >= 2 && n <= m && m <= 60) return { n, m, token: match[0] };
  }
  return null;
}

const SKIP_ROW = /SALDO ANTERIOR|SALDO ACTUAL|^\s*(SUB)?TOTAL|TOTAL (DE )?CONSUMOS|TOTAL TITULAR|TOTAL ADICIONAL|PAGO M[IÍ]NIMO|L[IÍ]MITE|TASA|T\.?N\.?A|T\.?E\.?M|C\.?F\.?T/i;
const PAYMENT_ROW = /SU PAGO|PAGO EN (PESOS|D[OÓ]LARES|U\$S|USD)|PAGO RECIBIDO|CR[EÉ]DITO POR PAGO|PAGO (DE )?(LA )?TARJETA|DEVOLUCI|BONIFICACI|REINTEGRO/i;
const CHARGE_ROW = /IMPUESTO|IMP\.|\bIVA\b|PERCEP|SELLOS|DB\.?\s?RG|\bRG\s?\d{3,4}|INTERES|COMISI[OÓ]N|CARGO|SEGURO|MANTENIMIENTO|RENOVACI|PERCEPCI/i;

function parseStatement(lines: PdfLine[], fallbackMonth: string): StatementData {
  const allText = lines.map((line) => line.text).join("\n");
  const amounts = amountReader(allText);

  const dueDate = dateAfter(lines, /venc(?:imiento|\.)?(?:\s+actual)?|vto\.?|fecha de pago|pagar hasta/i, /pr[oó]x|anterior|ant\./i);
  const closingDate = dateAfter(lines, /cierre(?:\s+actual)?|fecha de corte/i, /pr[oó]x|anterior|ant\./i);
  const skipOld = /pr[oó]x|anterior/i;
  const due = dueDate ?? valueBelow(lines, /fecha de vencimiento|vencimiento actual|^\s*vencimiento\s*$/i, parseDate, skipOld);
  const closing = closingDate ?? valueBelow(lines, /fecha de cierre|cierre actual|^\s*cierre\s*$/i, parseDate, skipOld);
  const month = due ? due.slice(0, 7) : closing ? closing.slice(0, 7) : fallbackMonth;

  let total = 0;
  let totalUsd = 0;
  let minPayment: number | null = null;
  for (const line of lines) {
    const label = line.text.match(/saldo actual|total a pagar|saldo a pagar|importe a pagar|total del resumen|saldo total|tu deuda en pesos/i);
    if (label && label.index !== undefined && !total) {
      const after = line.text.slice(label.index + label[0].length);
      const found = amounts(after).filter((item) => item.index < 40);
      const usdMark = after.search(/U\$S|USD|US\$|D[OÓ]LAR/i);
      for (const item of found) {
        if (usdMark >= 0 && item.index > usdMark) { if (!totalUsd) totalUsd = Math.abs(item.value); }
        else if (!total) total = Math.abs(item.value);
      }
    }
    const min = line.text.match(/pago m[ií]nimo/i);
    if (min && min.index !== undefined && minPayment === null) {
      const found = amounts(line.text.slice(min.index + min[0].length));
      if (found.length && found[0].index < 25) minPayment = Math.abs(found[0].value);
    }
  }

  const firstAmount = (text: string) => { const found = amounts(text); return found.length ? Math.abs(found[0].value) : null; };
  if (!total) total = valueBelow(lines, /tu deuda en pesos|saldo actual|total a pagar|deuda total/i, firstAmount) ?? 0;
  if (!totalUsd) totalUsd = valueBelow(lines, /tu deuda en d[oó]lares|saldo actual en d[oó]lares/i, firstAmount) ?? 0;
  if (minPayment === null) minPayment = valueBelow(lines, /pago m[ií]nimo/i, firstAmount);

  // Columnas de pesos y dólares (si el resumen las tiene).
  let pesosX: number | null = null;
  let usdX: number | null = null;
  for (const line of lines) {
    const pesos = line.tokens.find((token) => /^\s*PESOS\s*$|^\s*\$\s*$/i.test(token.str));
    const dollars = line.tokens.find((token) => /^\s*(D[OÓ]LARES|U\$S|USD|US\$)\s*$/i.test(token.str));
    if (pesos && dollars) { pesosX = pesos.x + pesos.w / 2; usdX = dollars.x + dollars.w / 2; break; }
  }

  // Zona de movimientos: desde el encabezado / saldo anterior hasta el saldo actual.
  let start = lines.findIndex((line) => /SALDO ANTERIOR|DETALLE DE (TRANSACCI|CONSUMOS|MOVIMIENTOS)|FECHA\s+.*(DESCRIPCI|DETALLE|CONCEPTO|COMERCIO|ESTABLECIMIENTO)/i.test(line.text));
  if (start < 0) start = 0;
  let end = lines.findIndex((line, index) => index > start && /SALDO ACTUAL|TOTAL A PAGAR|SALDO A PAGAR|^\s*(Legales|Plazos|Informaci[oó]n legal)\b/i.test(line.text));
  if (end < 0) end = lines.length;

  const consumos: Consumo[] = [];
  let context: { y: number; m: number } | null = null;
  for (let k = start; k < end; k++) {
    const line = lines[k];
    const text = line.text;
    const lineDate = parseDate(text.slice(0, 22));
    if (lineDate) context = { y: Number(lineDate.slice(0, 4)), m: Number(lineDate.slice(5, 7)) };
    if (SKIP_ROW.test(text)) continue;
    const found = amounts(text);
    if (!found.length) continue;
    const last = found[found.length - 1];
    // Que el importe esté al final del renglón (columnas de pesos / dólares).
    if (text.slice(last.index + last.raw.length).replace(/[\s$U\$SD-]/g, "").length > 2) continue;

    // ¿En qué columna está? Por posición si hay encabezado; si no, por la marca de dólares.
    // Sin columnas: es en dólares si el importe viene marcado (U$S 15,99) o si la compra dice "USD 15,99" y el importe es ese.
    const marked = /(U\$S|USD|US\$)\s*$/i.test(text.slice(Math.max(0, last.index - 6), last.index + 2).replace(/[\d.,\s-]+$/, ""));
    const sameAsUsd = amounts(text.slice(0, last.index)).some((item) => Math.abs(item.value) === Math.abs(last.value)) && /U\$S|USD|US\$/i.test(text.slice(0, last.index));
    let currency: "ARS" | "USD" = marked || sameAsUsd ? "USD" : "ARS";
    const token = line.tokens.slice().reverse().find((entry) => entry.str.includes(last.raw.trim().replace(/^-\s?/, "").replace(/^\$\s?/, "").replace(/-$/, "")));
    if (token && pesosX !== null && usdX !== null) {
      const center = token.x + token.w / 2;
      currency = Math.abs(center - usdX) < Math.abs(center - pesosX) ? "USD" : "ARS";
    }

    let description = text.slice(0, found[0].index);
    // Si el renglón del importe casi no tiene texto, la descripción está arriba y abajo (Ualá).
    const letters = (value: string) => (value.replace(DATE_RE, " ").replace(/\b[A-Z]{0,2}\d{4,}\b/g, " ").match(/[A-Za-zÁÉÍÓÚáéíóúÑñ]/g) ?? []).length;
    if (letters(description) < 3) {
      const loose = (other?: PdfLine) => other && !amounts(other.text).length && !parseDate(other.text.slice(0, 22)) && !/^\s*(Fecha|Total)\b/i.test(other.text) ? other.text : "";
      const above = k - 1 >= start ? loose(lines[k - 1]) : "";
      const below = k + 1 < end ? loose(lines[k + 1]) : "";
      description = description + " " + above + " " + below;
    }
    const cuota = findCuota(description);
    if (cuota) description = description.replace(cuota.token, " ");
    let date = lineDate;
    if (!date && context) {
      const day = description.match(/^\s*(\d{1,2})\s/);
      if (day) { date = iso(context.y, context.m, Number(day[1])); description = description.replace(/^\s*\d{1,2}\s/, " "); }
    }
    description = description
      .replace(DATE_RE, " ")
      .replace(/^\s*\d{1,2}\s+(?=[A-Za-z*])/, " ")
      .replace(/\b\d{4,}\*?(?=\s|$)/g, " ")
      .replace(/\b[A-Z]\d{4,}\b/g, " ")
      .replace(/\s+ARG\b/g, " ")
      .replace(/\s\*\s/g, " ")
      .replace(/\b(USD|U\$S|US\$)\s*$/i, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^[*\-\s]+|[*\-\s]+$/g, "");
    if ((description.match(/[A-Za-zÁÉÍÓÚáéíóúÑñ]/g) ?? []).length < 3) continue;

    const kind: Consumo["kind"] = PAYMENT_ROW.test(text) || last.value < 0 ? "pago" : CHARGE_ROW.test(description) ? "cargo" : "consumo";
    consumos.push({ date, description: description.slice(0, 80), amount: Math.abs(last.value), currency, kind, ...(cuota && kind === "consumo" ? { cuota: { n: cuota.n, m: cuota.m } } : {}) });
  }

  if (!total) total = consumos.filter((item) => item.kind !== "pago" && item.currency === "ARS").reduce((sum, item) => sum + item.amount, 0);
  if (!totalUsd) totalUsd = 0;

  const brandMatch = allText.match(/\b(VISA|MASTERCARD|MASTER|AMERICAN EXPRESS|AMEX|CABAL|NARANJA)\b/i);
  const brand = brandMatch ? ({ master: "Mastercard", mastercard: "Mastercard", visa: "Visa", "american express": "American Express", amex: "American Express", cabal: "Cabal", naranja: "Naranja" } as Record<string, string>)[brandMatch[1].toLowerCase()] : null;
  const last4 = allText.match(/(?:terminada en\s*|finalizada en\s*|XXXX[\s-]?|\*{4}[\s-]?|N[°º]\s?\d{4}\s?X{4}\s?X{4}\s?)(\d{4})\b/i)?.[1] ?? null;

  return { month, dueDate: due, closingDate: closing, total: Math.round(total * 100) / 100, totalUsd: Math.round(totalUsd * 100) / 100, minPayment, brand, last4, consumos };
}
// ---------- Tarjetas: buscar los resúmenes en Gmail y analizarlos ----------

type Source = { id: string; user_id: string; key: string; label: string; provider: string | null; brand: string | null; card_id: string | null; last_message_id: string | null; analyzed_message_id: string | null; auto: boolean; dismissed: boolean; pdf_password: string | null };

// Banco o billetera según quién manda el mail o cómo se llama el archivo.
const ISSUERS: [RegExp, string, string, string][] = [
  [/uala|ual[aá]/i, "uala", "Ualá", "#2F80ED"],
  [/naranja/i, "naranjax", "Naranja X", "#F08C2E"],
  [/galicia/i, "galicia", "Galicia", "#F08C2E"],
  [/santander/i, "santander", "Santander", "#E0475F"],
  [/bbva|franc[eé]s/i, "bbva", "BBVA", "#2F80ED"],
  [/macro/i, "macro", "Banco Macro", "#3D4A63"],
  [/\bbna\b|bna\.com|naci[oó]n/i, "nacion", "Banco Nación", "#2F80ED"],
  [/provincia|bapro/i, "provincia", "Banco Provincia", "#3BB273"],
  [/bancociudad|banco ciudad/i, "ciudad", "Banco Ciudad", "#169C8C"],
  [/icbc/i, "icbc", "ICBC", "#E0475F"],
  [/hsbc/i, "hsbc", "HSBC", "#E0475F"],
  [/supervielle/i, "supervielle", "Supervielle", "#E0475F"],
  [/patagonia/i, "patagonia", "Banco Patagonia", "#3D4A63"],
  [/credicoop/i, "credicoop", "Credicoop", "#3BB273"],
  [/comafi/i, "comafi", "Comafi", "#5B6CF0"],
  [/hipotecario/i, "hipotecario", "Hipotecario", "#F08C2E"],
  [/brubank/i, "brubank", "Brubank", "#5B6CF0"],
  [/mercadopago|mercado pago/i, "mercadopago", "Mercado Pago", "#169C8C"],
  [/openbank/i, "openbank", "Openbank", "#E0475F"],
  [/columbia/i, "columbia", "Banco Columbia", "#2F80ED"],
  [/bancor\b/i, "cordoba", "Bancor", "#2F80ED"],
  [/cencosud/i, "cencosud", "Tarjeta Cencosud", "#169C8C"],
  [/shopping/i, "shopping", "Tarjeta Shopping", "#E0475F"],
  [/americanexpress|american express|amex/i, "amex", "American Express", "#2F80ED"],
  [/cabal/i, "cabal", "Cabal", "#2F80ED"],
  [/lemon/i, "lemon", "Lemon", "#3BB273"],
  [/personal ?pay/i, "personalpay", "Personal Pay", "#2F80ED"],
];

const BRANDS: [RegExp, string][] = [[/\bvisa\b/i, "Visa"], [/master/i, "Mastercard"], [/american express|amex/i, "American Express"], [/\bcabal\b/i, "Cabal"]];

const issuerOf = (text: string) => ISSUERS.find(([re]) => re.test(text)) ?? null;
const brandOf = (text: string) => BRANDS.find(([re]) => re.test(text))?.[1] ?? null;

type MailPart = { filename?: string; mimeType?: string; body?: { data?: string; attachmentId?: string; size?: number }; parts?: MailPart[] };

function pdfParts(part: MailPart, found: MailPart[] = []) {
  if ((part.filename ?? "").toLowerCase().endsWith(".pdf") || part.mimeType === "application/pdf") found.push(part);
  for (const child of part.parts ?? []) pdfParts(child, found);
  return found;
}

// Busca los últimos resúmenes con PDF (uno por tarjeta) y los anota para preguntarte si los analizamos.
async function discoverStatements(access: string, link: Link) {
  const query = 'has:attachment filename:pdf newer_than:75d {resumen "estado de cuenta" liquidacion liquidación} {tarjeta visa mastercard master amex "american express" cabal naranja crédito credito}';
  const list = await gmailGet(access, "messages?maxResults=40&q=" + encodeURIComponent(query));
  const latest = new Map<string, Record<string, unknown>>();
  for (const item of (list.messages ?? []) as { id: string }[]) {
    const message = await gmailGet(access, "messages/" + item.id + "?format=full");
    const headers = (message.payload?.headers ?? []) as { name: string; value: string }[];
    const header = (name: string) => headers.find((entry) => entry.name.toLowerCase() === name)?.value ?? "";
    const pdfs = pdfParts(message.payload ?? {});
    if (!pdfs.length) continue;
    const from = header("from");
    const subject = header("subject");
    const files = pdfs.map((part) => part.filename ?? "").join(" ");
    const issuer = issuerOf(from) ?? issuerOf(subject + " " + files);
    const brand = brandOf(subject + " " + files) ?? (issuer && ["amex", "cabal"].includes(issuer[1]) ? null : brandOf(from));
    const domain = (from.match(/@([\w.-]+)/)?.[1] ?? "otro").toLowerCase();
    const key = (issuer?.[1] ?? domain) + ":" + (brand ?? "tarjeta");
    if (latest.has(key)) continue; // Gmail los da del más nuevo al más viejo.
    const label = issuer ? issuer[2] + (brand && !issuer[2].includes(brand) ? " " + brand : "") : (brand ?? "Tarjeta") + " (" + domain + ")";
    latest.set(key, { user_id: link.user_id, key, label, provider: issuer?.[1] ?? null, brand, last_message_id: item.id, last_mail_at: new Date(Number(message.internalDate)).toISOString(), last_subject: subject.slice(0, 140) });
  }
  if (latest.size) await admin.from("statement_sources").upsert([...latest.values()], { onConflict: "user_id,key" });
  const { data } = await admin.from("statement_sources").select("*").eq("user_id", link.user_id);
  return (data ?? []) as Source[];
}

// Cada análisis corre aparte (así un PDF pesado no frena al resto).
async function analyzeInBackground(sources: Source[]) {
  const pending = sources.filter((source) => source.auto && !source.dismissed && source.last_message_id && source.last_message_id !== source.analyzed_message_id);
  await Promise.all(pending.map((source) => fetch(REDIRECT_URI, { method: "POST", headers: { Authorization: "Bearer " + SERVICE_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ interno: "analizar", fuente: source.id }) }).catch(() => null)));
  return pending.length;
}

const monthShift = (month: string, offset: number) => {
  const date = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + offset, 1));
  return date.getUTCFullYear() + "-" + String(date.getUTCMonth() + 1).padStart(2, "0");
};

const slug = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim().slice(0, 40);

async function findOrCreateCard(source: Source, data: StatementData) {
  if (source.card_id) {
    const { data: card } = await admin.from("credit_cards").select("id, name, due_day").eq("id", source.card_id).maybeSingle();
    if (card) return card as { id: string; name: string; due_day: number | null };
  }
  const brand = source.brand ?? data.brand;
  if (source.provider) {
    const { data: cards } = await admin.from("credit_cards").select("id, name, due_day").eq("user_id", source.user_id).eq("provider", source.provider).order("created_at");
    const list = (cards ?? []) as { id: string; name: string; due_day: number | null }[];
    const match = (brand && list.find((card) => card.name.toLowerCase().includes(brand.toLowerCase()))) || (list.length === 1 || !brand ? list[0] : null);
    if (match) return match;
  }
  const issuer = source.provider ? ISSUERS.find((entry) => entry[1] === source.provider) : null;
  const name = issuer ? issuer[2] + (brand && !issuer[2].includes(brand) ? " " + brand : "") : brand ?? source.label;
  const { data: created } = await admin.from("credit_cards").insert({ user_id: source.user_id, name, color: issuer?.[3] ?? "#5B6CF0", provider: source.provider }).select("id, name, due_day").single();
  return created as { id: string; name: string; due_day: number | null } | null;
}

// Baja el PDF del último resumen, lo lee y guarda: total, vencimiento, consumos y cuotas que faltan.
async function analyzeSource(link: Link, source: Source, options: { clave?: string; recordar?: boolean; auto?: boolean } = {}) {
  const fail = async (status: string) => {
    await admin.from("statement_sources").update({ status, ...(options.auto !== undefined ? { auto: options.auto } : {}) }).eq("id", source.id);
    return { error: status };
  };
  if (!source.last_message_id) return fail("sin-pdf");
  const access = await accessToken(link.refresh_token);
  if (!access) return { error: "permiso" };
  const message = await gmailGet(access, "messages/" + source.last_message_id + "?format=full");
  const pdfs = pdfParts(message.payload ?? {});
  const part = pdfs.find((entry) => /resumen|estado|liquidaci|tarjeta/i.test(entry.filename ?? "")) ?? pdfs[0];
  if (!part) return fail("sin-pdf");
  const raw = part.body?.data ?? (part.body?.attachmentId ? (await gmailGet(access, "messages/" + source.last_message_id + "/attachments/" + part.body.attachmentId)).data : null);
  if (!raw) return fail("sin-pdf");

  const password = options.clave?.trim() || source.pdf_password || undefined;
  let lines: PdfLine[];
  try {
    const pdf = await getDocumentProxy(base64url(raw), password ? { password } : {});
    lines = await pdfLines(pdf as unknown as PdfProxy);
  } catch (error) {
    const err = error as { name?: string; code?: number };
    if (err?.name === "PasswordException") return fail(err.code === 2 ? "clave-incorrecta" : "clave");
    console.error(error);
    return fail("no-se-pudo-leer");
  }

  const mailMonth = day(new Date(Number(message.internalDate))).slice(0, 7);
  const data = parseStatement(lines, mailMonth);
  if (!data.total && !data.consumos.length) return fail("no-se-pudo-leer");

  const card = await findOrCreateCard(source, data);
  if (!card) return fail("no-se-pudo-leer");
  if (!card.due_day && data.dueDate) await admin.from("credit_cards").update({ due_day: Number(data.dueDate.slice(8, 10)) }).eq("id", card.id);

  await admin.from("card_statements").upsert({
    user_id: source.user_id, card_id: card.id, month: data.month, total: data.total, total_usd: data.totalUsd, due_date: data.dueDate,
    closing_date: data.closingDate, min_payment: data.minPayment, details: { consumos: data.consumos }, message_id: source.last_message_id, source: "pdf",
  }, { onConflict: "card_id,month" });

  // Compras en cuotas: quedan cargadas hasta la última cuota, sin duplicarse cuando llega el próximo resumen.
  const cuotas = data.consumos.filter((item) => item.kind === "consumo" && item.cuota && item.currency === "ARS");
  const rows = cuotas.map((item) => {
    const firstMonth = monthShift(data.month, -(item.cuota!.n - 1));
    return { user_id: source.user_id, card_id: card.id, description: item.description, kind: "cuotas", amount: item.amount, installments: item.cuota!.m, first_month: firstMonth, source: "pdf", external_key: slug(item.description) + "|" + item.cuota!.m + "|" + firstMonth };
  });
  const unique = [...new Map(rows.map((row) => [row.external_key, row])).values()];
  if (unique.length) await admin.from("card_items").upsert(unique, { onConflict: "card_id,external_key" });

  const pendiente = cuotas.reduce((sum, item) => sum + item.amount * (item.cuota!.m - item.cuota!.n), 0);
  const hasta = cuotas.reduce((max, item) => { const end = monthShift(data.month, item.cuota!.m - item.cuota!.n); return end > max ? end : max; }, "");
  const consumos = data.consumos.filter((item) => item.kind === "consumo");
  const result = {
    tarjeta: card.name, mes: data.month, total: data.total, total_usd: data.totalUsd, vence: data.dueDate, minimo: data.minPayment,
    consumos: consumos.length, cargos: Math.round(data.consumos.filter((item) => item.kind === "cargo").reduce((sum, item) => sum + item.amount, 0) * 100) / 100,
    cuotas: cuotas.length, pendiente: Math.round(pendiente * 100) / 100, hasta: hasta || null,
  };
  await admin.from("statement_sources").update({
    status: "listo", result, card_id: card.id, analyzed_message_id: source.last_message_id, analyzed_at: new Date().toISOString(),
    ...(options.auto !== undefined ? { auto: options.auto } : {}),
    ...(options.clave && options.recordar ? { pdf_password: options.clave.trim(), password_saved: true } : {}),
  }).eq("id", source.id);
  return { ok: true, resultado: result };
}
