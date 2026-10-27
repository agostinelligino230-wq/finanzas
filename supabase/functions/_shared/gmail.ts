// Pedidos a la API de Gmail (solo lectura) que usan las funciones gmail y gmail-push.
const CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me/";

export type Mail = { id: string; subject: string; from: string; text: string; date: Date; auth: string[] };
type Header = { name: string; value: string };
type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[] };

export async function accessToken(refresh: string) {
  const data = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: refresh, grant_type: "refresh_token" }),
  }).then((response) => response.json());
  return (data.access_token as string | undefined) ?? null;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Gmail limita los pedidos por minuto: si se pasa, espera un poco y reintenta.
export async function gmailGet(access: string, path: string, init?: RequestInit) {
  for (let attempt = 0; ; attempt++) {
    const data = await fetch(GMAIL + path, { ...init, headers: { Authorization: "Bearer " + access, "Content-Type": "application/json" } }).then((response) => response.json()).catch(() => ({}));
    const limited = data?.error && (data.error.code === 429 || /rate|quota/i.test(String(data.error.message ?? "")));
    if (!limited || attempt >= 3) return data;
    await wait(4000 * (attempt + 1));
  }
}

const headerOf = (headers: Header[], name: string) => headers.find((entry) => entry.name.toLowerCase() === name)?.value ?? "";
// Todos los Authentication-Results, en el orden en que están en el mail (el primero lo agrega Gmail).
const authOf = (headers: Header[]) => headers.filter((entry) => entry.name.toLowerCase() === "authentication-results").map((entry) => entry.value);

// Un mail completo (asunto, remitente, texto y autenticación).
export async function fullMail(access: string, id: string): Promise<Mail | null> {
  const message = await gmailGet(access, "messages/" + id + "?format=full");
  if (!message.payload) return null; // Si Gmail no lo devuelve, se lee en la próxima.
  const headers = (message.payload.headers ?? []) as Header[];
  return { id, subject: headerOf(headers, "subject"), from: headerOf(headers, "from"), text: bodyText(message.payload).replace(/\s+/g, " "), date: new Date(Number(message.internalDate)), auth: authOf(headers) };
}

// Solo los encabezados (sin el cuerpo): alcanza para saber si el mail es de un banco.
export async function mailHeaders(access: string, id: string) {
  const query = ["From", "Subject", "Authentication-Results"].map((name) => "metadataHeaders=" + name).join("&");
  const message = await gmailGet(access, "messages/" + id + "?format=metadata&" + query);
  if (!message.payload) return null;
  const headers = (message.payload.headers ?? []) as Header[];
  return { id, from: headerOf(headers, "from"), subject: headerOf(headers, "subject"), auth: authOf(headers) };
}

// Una o varias búsquedas, solo los ids (sin bajar los mails): cada id aparece una vez aunque salga en más de una.
export async function searchIds(access: string, query: string | string[], days: number, max = 100): Promise<string[]> {
  const ids = new Set<string>();
  for (const text of Array.isArray(query) ? query : [query]) {
    const list = await gmailGet(access, "messages?maxResults=" + max + "&q=" + encodeURIComponent(text + " newer_than:" + days + "d"));
    for (const item of (list.messages ?? []) as { id: string }[]) ids.add(item.id);
  }
  return [...ids];
}

// Las búsquedas con cada mail completo (se baja una sola vez aunque aparezca en más de una).
export async function search(access: string, query: string | string[], days: number, max = 100): Promise<Mail[]> {
  const mails: Mail[] = [];
  for (const id of await searchIds(access, query, days, max)) {
    const mail = await fullMail(access, id);
    if (mail) mails.push(mail);
  }
  return mails;
}

// ---------- Aviso al instante (users.watch + Pub/Sub) ----------

// Pide que Gmail avise a Pub/Sub cuando entra un mail a la bandeja. Vence a los 7 días: se renueva todos los días.
export async function watch(access: string, topic: string) {
  const data = await gmailGet(access, "watch", { method: "POST", body: JSON.stringify({ topicName: topic, labelIds: ["INBOX"], labelFilterBehavior: "INCLUDE" }) });
  if (!data?.historyId) return null;
  return { historyId: String(data.historyId), expiration: new Date(Number(data.expiration)).toISOString() };
}

export async function stopWatch(access: string) {
  await fetch(GMAIL + "stop", { method: "POST", headers: { Authorization: "Bearer " + access } }).catch(() => null);
}

// Ids de los mails que entraron a la bandeja desde startHistoryId. null = el historial venció (hay que releer).
export async function addedSince(access: string, startHistoryId: string) {
  const ids: string[] = [];
  let page = "";
  let latest = startHistoryId;
  for (let round = 0; round < 10; round++) {
    const data = await gmailGet(access, "history?historyTypes=messageAdded&labelId=INBOX&maxResults=500&startHistoryId=" + startHistoryId + (page ? "&pageToken=" + page : ""));
    if (data?.error?.code === 404) return null;
    if (data?.error) throw new Error("Gmail history: " + (data.error.message ?? data.error.code));
    for (const entry of (data.history ?? []) as { messagesAdded?: { message: { id: string } }[] }[]) {
      for (const added of entry.messagesAdded ?? []) if (!ids.includes(added.message.id)) ids.push(added.message.id);
    }
    if (data.historyId) latest = String(data.historyId);
    if (!data.nextPageToken) break;
    page = data.nextPageToken;
  }
  return { ids, historyId: latest };
}

// ---------- Texto del mail ----------

function bodyText(payload: Part): string {
  const plain = findPart(payload, "text/plain");
  const html = findPart(payload, "text/html");
  // Algunos (Wallbit) mandan en texto plano solo el pie y el detalle en el HTML: sin ningún monto, se usa el HTML.
  if (plain && (!html || /\$|USD|U\$S|ARS/i.test(decode(plain)))) return decode(plain);
  if (!html) return "";
  return decode(html)
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|tr|td|li|h\d)>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&zwnj;/g, " ").replace(/&#36;|&dollar;/g, "$").replace(/&amp;/g, "&").replace(/&aacute;/g, "á").replace(/&eacute;/g, "é").replace(/&iacute;/g, "í").replace(/&oacute;/g, "ó").replace(/&uacute;/g, "ú").replace(/&ntilde;/g, "ñ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16))); // Naranja X manda «ingres&#xF3;»
}

function findPart(part: Part, mime: string): string | null {
  if (part.mimeType === mime && part.body?.data) return part.body.data;
  for (const child of part.parts ?? []) {
    const found = findPart(child, mime);
    if (found) return found;
  }
  return null;
}

export function base64url(value: string) {
  const normal = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normal + "===".slice((normal.length + 3) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

const decode = (data: string) => new TextDecoder().decode(base64url(data));
