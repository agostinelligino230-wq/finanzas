// Mercado Pago por API (versión de prueba). La persona da permiso en la pantalla oficial de Mercado Pago (OAuth)
// y la app trae sus movimientos sin depender de los mails. Todo entra por ingest_movement: si un movimiento ya
// había llegado por mail o por aviso del celular, se une en vez de duplicarse.
// GET ?start=… → manda a la pantalla de Mercado Pago para autorizar.
// GET ?code=…&state=… → vuelve de Mercado Pago: guarda el permiso (cifrado), trae los últimos 60 días y vuelve a la app.
// POST (con sesión) → {accion:"actualizar"} trae lo nuevo · {accion:"desconectar"} borra la conexión.
// POST sin sesión → 401.
// Archivo único a propósito: se puede publicar desde el panel de Supabase sin la CLI.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Datos de la aplicación creada en Mercado Pago Developers (Tus integraciones).
const CLIENT_ID = Deno.env.get("MP_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("MP_CLIENT_SECRET") ?? "";
// Con esta clave se cifran los permisos antes de guardarlos. Si no hay una propia, se usa la de las claves de PDF.
const TOKEN_KEY = Deno.env.get("MP_TOKEN_KEY") || Deno.env.get("PDF_KEY") || "";
const DEFAULT_APP = "https://finanzas-personales-ar.vercel.app";
const APP_SCHEME = "finanzas://";
// Esta misma dirección hay que cargarla en "URLs de redireccionamiento" de la aplicación de Mercado Pago.
const REDIRECT_URI = SUPABASE_URL + "/functions/v1/mercadopago";
const API = "https://api.mercadopago.com";
// Durante la prueba, lo que llega solo por la API queda «para revisar» (no suma hasta que lo confirmás),
// así ningún gasto se cuenta dos veces si la API y el mail no coinciden. Con MP_TRUST=verified suma directo.
const TRUST_NUEVOS = Deno.env.get("MP_TRUST") === "verified" ? "verified" : "doubtful";
const TZ = "America/Argentina/Buenos_Aires";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Solo se vuelve a la app (dominios propios o la app del celular), nunca a otro sitio.
const safeReturn = (value: string | null) => (value && /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(value)) || (value && /^http:\/\/localhost(:\d+)?$/.test(value)) || value === APP_SCHEME ? value : DEFAULT_APP;
const returnUrl = (value: string | null, status: string) => {
  const base = safeReturn(value);
  return (base === APP_SCHEME ? APP_SCHEME + "conectar" : base + "/conectar") + "?mp=" + status;
};

type Link = {
  user_id: string; mp_user_id: string; nickname: string | null; email: string | null; access_token: string; refresh_token: string | null;
  expires_at: string | null; last_sync_at: string | null; report_requested_at: string | null;
};

// Lo que muestra la app para comparar: cada movimiento que dio Mercado Pago y qué pasó con él.
// porMail: ese mismo movimiento también entró por mail o por aviso del celular.
type Item = { fecha: string; tipo: "gasto" | "ingreso" | null; monto: number; descripcion: string; estado: string; via: "pagos" | "reporte"; nota?: string; porMail?: boolean; movimiento?: string | null };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  try {
    if (req.method === "GET" && url.searchParams.get("start")) return await start(url.searchParams.get("start")!);
    if (req.method === "GET") return await callback(url);
    if (req.method === "POST") return await request(req);
    return json({ error: "Método no permitido" }, 405);
  } catch (error) {
    console.error(error);
    return json({ error: String(error) }, 500);
  }
});

// ---------- Conexión (OAuth) ----------

async function start(state: string) {
  const { data } = await admin.from("mp_link_states").select("state, return_to").eq("state", state).maybeSingle();
  if (!data) return Response.redirect(DEFAULT_APP + "/conectar?mp=error", 302);
  if (!CLIENT_ID || !CLIENT_SECRET || !TOKEN_KEY) return Response.redirect(returnUrl(data.return_to, "sin-configurar"), 302);
  const params = new URLSearchParams({ client_id: CLIENT_ID, response_type: "code", platform_id: "mp", state, redirect_uri: REDIRECT_URI });
  return Response.redirect("https://auth.mercadopago.com/authorization?" + params.toString(), 302);
}

async function callback(url: URL) {
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const { data: saved } = state ? await admin.from("mp_link_states").select("user_id, return_to").eq("state", state).maybeSingle() : { data: null };
  const back = (status: string) => Response.redirect(returnUrl(saved?.return_to ?? null, status), 302);
  if (!saved) return back("error");
  await admin.from("mp_link_states").delete().eq("state", state!);
  if (!code) return back("cancelado");

  const token = await oauth({ grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI });
  if (!token?.access_token || !token.user_id) { console.error("oauth", token?.message ?? token?.error ?? "sin token"); return back("error"); }
  const access = String(token.access_token);
  const me = await mpGet(access, "/users/me");
  const sealedAccess = await seal(access);
  const sealedRefresh = token.refresh_token ? await seal(String(token.refresh_token)) : null;
  if (!sealedAccess) return back("error");
  const link = {
    user_id: saved.user_id, mp_user_id: String(token.user_id), nickname: me.ok ? me.data?.nickname ?? null : null, email: me.ok ? me.data?.email ?? null : null,
    access_token: sealedAccess, refresh_token: sealedRefresh, expires_at: expiry(token.expires_in), last_result: null, report_requested_at: null,
  };
  const { error } = await admin.from("mp_links").upsert(link, { onConflict: "user_id" });
  if (error) { console.error("mp_links", error.message); return back("error"); }
  const { data: row } = await admin.from("mp_links").select("*").eq("user_id", saved.user_id).single();
  try { await sync(row as Link, 60); } catch (error) { console.error("primera lectura", error); }
  return back("ok");
}

async function request(req: Request) {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const body = await req.json().catch(() => ({})) as { accion?: string };
  const { data: auth } = jwt ? await admin.auth.getUser(jwt) : { data: { user: null } };
  if (!auth?.user) return json({ error: "No autorizado" }, 401);
  const { data: row } = await admin.from("mp_links").select("*").eq("user_id", auth.user.id).maybeSingle();
  if (!row) return json({ error: "Mercado Pago no está conectado" }, 404);
  if (body.accion === "desconectar") {
    const { error } = await admin.from("mp_links").delete().eq("user_id", auth.user.id);
    return json(error ? { error: "no-se-pudo" } : { ok: true });
  }
  return json(await sync(row as Link, 35));
}

// Canje del permiso o renovación. Mercado Pago devuelve access_token (dura 180 días), refresh_token y user_id.
async function oauth(fields: Record<string, string>) {
  return await fetch(API + "/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...fields }),
  }).then((response) => response.json()).catch(() => null);
}

const expiry = (seconds: unknown) => (Number(seconds) > 0 ? new Date(Date.now() + Number(seconds) * 1000).toISOString() : null);

// Devuelve un permiso vigente: si vence en menos de 7 días, lo renueva con el refresh_token.
async function validAccess(link: Link) {
  const access = await open(link.access_token);
  const soon = link.expires_at && new Date(link.expires_at).getTime() < Date.now() + 7 * 86400000;
  if (access && !soon) return access;
  const refresh = link.refresh_token ? await open(link.refresh_token) : null;
  if (!refresh) return access;
  const token = await oauth({ grant_type: "refresh_token", refresh_token: refresh });
  if (!token?.access_token) return access;
  const sealedAccess = await seal(String(token.access_token));
  const sealedRefresh = token.refresh_token ? await seal(String(token.refresh_token)) : link.refresh_token;
  if (sealedAccess) await admin.from("mp_links").update({ access_token: sealedAccess, refresh_token: sealedRefresh, expires_at: expiry(token.expires_in) }).eq("user_id", link.user_id);
  return String(token.access_token);
}

// deno-lint-ignore no-explicit-any
async function mpGet(access: string, path: string): Promise<{ ok: boolean; status: number; data: any; text: string }> {
  const response = await fetch(API + path, { headers: { Authorization: "Bearer " + access, Accept: "application/json" } }).catch(() => null);
  if (!response) return { ok: false, status: 0, data: null, text: "" };
  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* el reporte llega como CSV */ }
  return { ok: response.ok, status: response.status, data, text };
}

// ---------- Lectura ----------

const day = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const titleCase = (text: string) => text.toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
const clean = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");

async function sync(link: Link, days: number) {
  const access = await validAccess(link);
  if (!access) {
    await admin.from("mp_links").update({ last_result: { error: "permiso" } }).eq("user_id", link.user_id);
    return { error: "permiso" };
  }
  const me = String(link.mp_user_id);
  const fuentes: Record<string, number | string> = {};
  const pagos = new Map<string, Pago>();

  // a) Lo que te pagaron o te transfirieron (sos quien cobra). b) Lo que pagaste vos (sos quien paga), si Mercado Pago lo da.
  for (const [nombre, filtro] of [["cobros", ""], ["pagos", "&payer.id=" + encodeURIComponent(me)]] as const) {
    const result = await searchPayments(access, days, filtro);
    fuentes[nombre] = result.error ?? result.items.length;
    for (const pago of result.items) pagos.set(String(pago.id), pago);
  }

  const detalle: Item[] = [];
  const cuenta = { nuevos: 0, unidos: 0, repetidos: 0, descartados: 0 };
  const anotar = (estado: string) => {
    if (estado === "new") cuenta.nuevos++;
    else if (estado === "merged") cuenta.unidos++;
    else if (estado === "repeated") cuenta.repetidos++;
    else cuenta.descartados++;
  };

  const ordenados = [...pagos.values()].sort((a, b) => String(b.date_created).localeCompare(String(a.date_created)));
  for (const pago of ordenados) {
    const leido = leerPago(pago, me);
    const cuando = new Date(pago.date_approved ?? pago.date_created ?? Date.now());
    // Un pago que todavía no se aprobó se vuelve a mirar cuando cambie de estado.
    const clave = "pago:" + pago.id + (pago.status === "approved" ? "" : ":" + (pago.status ?? "?"));
    const { estado, movimiento } = await ingresar(link.user_id, leido, {
      clave, titulo: leido.descripcion, cuando, opRef: String(pago.id), idExterno: "mpapi:" + pago.id,
      cuerpo: JSON.stringify({ id: pago.id, status: pago.status, operation_type: pago.operation_type, payment_type_id: pago.payment_type_id, description: pago.description, collector_id: pago.collector_id, payer_id: pago.payer?.id, amount: pago.transaction_amount }),
    });
    anotar(estado);
    detalle.push({ fecha: cuando.toISOString(), tipo: leido.tipo, monto: leido.monto, descripcion: leido.descripcion, estado, via: "pagos", movimiento, ...(leido.nota ? { nota: leido.nota } : {}) });
  }

  // c) Reporte de movimientos de la cuenta (lo que movió tu saldo). Mercado Pago lo arma en unos minutos:
  // la primera vez se pide y en la próxima lectura se usa.
  let reporte = "";
  try {
    const result = await releaseReport(access, link, days);
    reporte = result.estado;
    fuentes.reporte = result.filas ? result.filas.length : result.estado;
    for (const fila of result.filas ?? []) {
      if (fila.sourceId && pagos.has(fila.sourceId)) continue; // Ya vino en la lista de pagos.
      const { estado, movimiento } = await ingresar(link.user_id, fila, {
        clave: "reporte:" + fila.clave, titulo: fila.descripcion, cuando: fila.cuando, opRef: fila.opRef, idExterno: "mpapi:rep:" + fila.clave,
        cuerpo: fila.cuerpo,
      });
      anotar(estado);
      detalle.push({ fecha: fila.cuando.toISOString(), tipo: fila.tipo, monto: fila.monto, descripcion: fila.descripcion, estado, via: "reporte", movimiento, ...(fila.nota ? { nota: fila.nota } : {}) });
    }
  } catch (error) {
    console.error("reporte", error);
    fuentes.reporte = "error: " + String((error as Error)?.message ?? error).slice(0, 80);
  }

  detalle.sort((a, b) => b.fecha.localeCompare(a.fecha));
  const { porMail, faltan } = await comparar(link.user_id, days, detalle);
  for (const item of detalle) item.porMail = Boolean(item.movimiento && porMail.has(item.movimiento));
  const result = {
    ...cuenta, fuentes, reporte, dias: days,
    tambienPorMail: detalle.filter((item) => item.porMail).length,
    detalle: detalle.slice(0, 80).map(({ movimiento: _, ...item }) => item),
    faltan,
  };
  await admin.from("mp_links").update({ last_sync_at: new Date().toISOString(), last_result: result }).eq("user_id", link.user_id);
  return result;
}

type Pago = {
  id: number | string; status?: string; status_detail?: string; operation_type?: string; payment_type_id?: string; payment_method_id?: string;
  date_created?: string; date_approved?: string; transaction_amount?: number; currency_id?: string; description?: string | null; statement_descriptor?: string | null;
  collector_id?: number | string; collector?: { id?: number | string; nickname?: string; first_name?: string; last_name?: string };
  payer?: { id?: number | string | null; first_name?: string | null; last_name?: string | null; email?: string | null };
  transaction_details?: { total_paid_amount?: number; net_received_amount?: number };
  // deno-lint-ignore no-explicit-any
  point_of_interaction?: { type?: string; transaction_data?: { bank_info?: { payer?: Record<string, any>; collector?: Record<string, any> } } };
};

// Pagos de los últimos días, de a 50, hasta 1000 (Mercado Pago guarda los últimos 12 meses).
async function searchPayments(access: string, days: number, filtro: string) {
  const items: Pago[] = [];
  for (let offset = 0; offset < 1000; offset += 50) {
    const path = "/v1/payments/search?sort=date_created&criteria=desc&range=date_created&begin_date=NOW-" + days + "DAYS&end_date=NOW&limit=50&offset=" + offset + filtro;
    const response = await mpGet(access, path);
    if (!response.ok) return { items, error: "error " + response.status + (response.data?.message ? ": " + String(response.data.message).slice(0, 80) : "") };
    const results = (response.data?.results ?? []) as Pago[];
    items.push(...results);
    if (results.length < 50) break;
  }
  return { items, error: null as string | null };
}

type Leido = { tipo: "gasto" | "ingreso" | null; monto: number; descripcion: string; categoria: string; nota?: string; contraparte?: string };

const nombreDe = (persona?: Record<string, unknown> | null) => {
  if (!persona) return "";
  const nombre = clean(persona.account_holder_name) || clean(persona.long_name) || [clean(persona.first_name), clean(persona.last_name)].filter(Boolean).join(" ") || clean(persona.nickname);
  return nombre ? titleCase(nombre) : "";
};

// Qué es cada pago para vos: si cobraste es ingreso, si pagaste es gasto. Plata tuya que va y viene no cuenta.
function leerPago(pago: Pago, me: string): Leido {
  const monto = Number(pago.transaction_amount ?? 0);
  const cobrador = String(pago.collector_id ?? pago.collector?.id ?? "");
  const pagador = String(pago.payer?.id ?? "");
  const tipoOp = pago.operation_type ?? "";
  const bank = pago.point_of_interaction?.transaction_data?.bank_info;
  const texto = clean(pago.description) || clean(pago.statement_descriptor);
  const base = { monto, categoria: tipoOp === "money_transfer" ? "transferencias" : "otro" };

  if (pago.status !== "approved") return { ...base, tipo: null, descripcion: texto || "Pago", nota: "no aprobado (" + (pago.status ?? "?") + ")" };
  if ((pago.currency_id ?? "ARS") !== "ARS") return { ...base, tipo: null, descripcion: texto || "Pago", nota: "moneda " + pago.currency_id };
  if (!(monto > 0)) return { ...base, tipo: null, descripcion: texto || "Pago", nota: "sin monto" };
  if (tipoOp === "account_fund") return { ...base, tipo: null, descripcion: "Ingreso de plata a tu cuenta", nota: "plata tuya (no cuenta)" };
  if (cobrador === me && pagador === me) return { ...base, tipo: null, descripcion: texto || "Movimiento entre tus cuentas", nota: "entre tus cuentas (no cuenta)" };

  if (cobrador === me) {
    const quien = nombreDe(bank?.payer) || nombreDe(pago.payer as Record<string, unknown>);
    const descripcion = tipoOp === "money_transfer" ? (quien ? "Transferencia de " + quien : "Transferencia recibida") : (texto || "Cobro") + (quien ? " · " + quien : "");
    return { ...base, tipo: "ingreso", descripcion: descripcion + " (Mercado Pago)", contraparte: quien };
  }
  if (pagador === me) {
    const quien = nombreDe(bank?.collector) || nombreDe(pago.collector as Record<string, unknown>);
    const descripcion = tipoOp === "money_transfer" ? (quien ? "Transferencia a " + quien : "Transferencia enviada") : texto || quien || "Pago";
    const pagado = Number(pago.transaction_details?.total_paid_amount ?? 0);
    return { ...base, monto: pagado > monto ? pagado : monto, tipo: "gasto", descripcion: descripcion + " (Mercado Pago)", contraparte: quien };
  }
  return { ...base, tipo: null, descripcion: texto || "Pago", nota: "no figurás como quien paga ni quien cobra" };
}

// La prueba: qué movimientos de la API también entraron por mail o aviso, y qué movimientos de Mercado Pago
// entraron por mail o aviso en estos días pero la API no los dio.
async function comparar(userId: string, days: number, detalle: Item[]) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const ids = [...new Set(detalle.map((item) => item.movimiento).filter((id): id is string => Boolean(id)))];
  const porMail = new Set<string>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await admin.from("incoming_notices").select("movement_id").eq("user_id", userId).in("channel", ["mail", "push"]).in("movement_id", ids.slice(i, i + 100));
    for (const row of (data ?? []) as { movement_id: string }[]) porMail.add(row.movement_id);
  }
  const { data: rows } = await admin.from("movements").select("id, description, amount, movement_type, created_at")
    .eq("user_id", userId).eq("source", "mercadopago").gte("created_at", since).order("created_at", { ascending: false }).limit(300);
  const vistos = new Set(ids);
  const faltan = ((rows ?? []) as { id: string; description: string; amount: number; movement_type: string; created_at: string }[])
    .filter((row) => !vistos.has(row.id))
    .slice(0, 40)
    .map((row) => ({ fecha: row.created_at, tipo: row.movement_type, monto: Number(row.amount), descripcion: row.description }));
  return { porMail, faltan };
}

// Todo entra por la misma puerta que los mails y los avisos. Lo que no cuenta queda anotado como descartado.
async function ingresar(userId: string, leido: Leido, aviso: { clave: string; titulo: string; cuando: Date; opRef: string | null; idExterno: string; cuerpo: string }): Promise<{ estado: string; movimiento: string | null }> {
  const movimiento = leido.tipo ? {
    type: leido.tipo, amount: Math.round(leido.monto * 100) / 100, currency: "ARS", description: leido.descripcion.slice(0, 120), category: leido.categoria,
    source: "mercadopago", external_id: aviso.idExterno, op_ref: aviso.opRef, date: day(aviso.cuando), datetime: aviso.cuando.toISOString(), trust: TRUST_NUEVOS, counterparty_name: leido.contraparte || null,
  } : null;
  const notice = {
    channel: "api", provider: "mercadopago", notice_key: aviso.clave, authentic: true, auth_detail: { via: "api-mercadopago" },
    title: aviso.titulo.slice(0, 300), body: aviso.cuerpo.slice(0, 2000), received_at: aviso.cuando.toISOString(), parser: "rule",
    ...(movimiento ? {} : { outcome: "discarded", detail: leido.nota ?? "no cuenta" }),
  };
  const { data, error } = await admin.rpc("ingest_movement", { p_user: userId, p_mov: movimiento, p_notice: notice });
  if (error) { console.error("ingest_movement", error.message); return { estado: "error", movimiento: null }; }
  const result = data as { outcome?: string; movement_id?: string | null } | null;
  return { estado: String(result?.outcome ?? "error"), movimiento: result?.movement_id ?? null };
}

// ---------- Reporte de movimientos de la cuenta (release report) ----------

type Fila = Leido & { clave: string; sourceId: string | null; opRef: string | null; cuando: Date; cuerpo: string };

const DESCRIPCIONES: Record<string, [string, string]> = {
  payment: ["Cobro", "Pago"],
  refund: ["Devolución recibida", "Devolución"],
  withdrawal: ["Retiro", "Retiro a tu cuenta bancaria"],
  payout: ["Retiro", "Retiro"],
  chargeback: ["Contracargo", "Contracargo"],
  mediation: ["Reclamo", "Reclamo"],
  fee: ["Cargo", "Cargo de Mercado Pago"],
  tax: ["Impuesto", "Impuesto"],
};

async function releaseReport(access: string, link: Link, days: number): Promise<{ estado: string; filas?: Fila[] }> {
  const list = await mpGet(access, "/v1/account/release_report/list");
  if (!list.ok) return { estado: "error " + list.status + (list.data?.message ? ": " + String(list.data.message).slice(0, 80) : "") };
  type Archivo = { file_name?: string; status?: string; date_created?: string; generation_date?: string; begin_date?: string };
  const archivos = (Array.isArray(list.data) ? list.data : []) as Archivo[];
  const reciente = archivos
    .filter((item) => item.file_name && /processed|enabled|ready/i.test(String(item.status ?? "processed")))
    .filter((item) => Date.now() - new Date(item.generation_date ?? item.date_created ?? 0).getTime() < 24 * 3600 * 1000)
    .sort((a, b) => String(b.generation_date ?? b.date_created).localeCompare(String(a.generation_date ?? a.date_created)))[0];

  if (reciente?.file_name) {
    const file = await mpGet(access, "/v1/account/release_report/" + encodeURIComponent(reciente.file_name));
    if (!file.ok) return { estado: "error al bajar " + file.status };
    return { estado: "leído", filas: leerReporte(file.text) };
  }

  const pedido = link.report_requested_at ? Date.now() - new Date(link.report_requested_at).getTime() : Infinity;
  if (pedido < 30 * 60 * 1000) return { estado: "esperando" };
  const end = new Date();
  const begin = new Date(end.getTime() - days * 86400000);
  const response = await fetch(API + "/v1/account/release_report", {
    method: "POST",
    headers: { Authorization: "Bearer " + access, "Content-Type": "application/json" },
    body: JSON.stringify({ begin_date: begin.toISOString().slice(0, 19) + "Z", end_date: end.toISOString().slice(0, 19) + "Z" }),
  }).catch(() => null);
  if (!response || response.status >= 300) {
    const detail = response ? await response.text().catch(() => "") : "";
    return { estado: "no se pudo pedir (" + (response?.status ?? 0) + ") " + detail.slice(0, 80) };
  }
  await admin.from("mp_links").update({ report_requested_at: new Date().toISOString() }).eq("user_id", link.user_id);
  return { estado: "pedido" };
}

// CSV con encabezado (coma o punto y coma). Solo los renglones de movimientos ("release").
function leerReporte(text: string): Fila[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const sep = (lines[0].match(/;/g) ?? []).length > (lines[0].match(/,/g) ?? []).length ? ";" : ",";
  const split = (line: string) => {
    const cells: string[] = [];
    let cell = "";
    let quoted = false;
    for (const char of line) {
      if (char === '"') quoted = !quoted;
      else if (char === sep && !quoted) { cells.push(cell); cell = ""; }
      else cell += char;
    }
    cells.push(cell);
    return cells.map((value) => value.trim());
  };
  const head = split(lines[0]).map((name) => name.toUpperCase());
  const col = (row: string[], name: string) => row[head.indexOf(name)] ?? "";
  const num = (value: string) => {
    const raw = value.replace(/[^\d.,-]/g, "");
    const normal = raw.includes(",") && !raw.includes(".") ? raw.replace(",", ".") : raw.includes(",") && raw.includes(".") && raw.lastIndexOf(",") > raw.lastIndexOf(".") ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
    return Math.abs(Number(normal) || 0);
  };

  const filas: Fila[] = [];
  for (const line of lines.slice(1)) {
    const row = split(line);
    const tipoFila = col(row, "RECORD_TYPE").toLowerCase();
    if (tipoFila && tipoFila !== "release") continue;
    const credito = num(col(row, "NET_CREDIT_AMOUNT"));
    const debito = num(col(row, "NET_DEBIT_AMOUNT"));
    if (!credito && !debito) continue;
    const descripcionMp = col(row, "DESCRIPTION").toLowerCase();
    const sourceId = col(row, "SOURCE_ID") || null;
    const fecha = new Date(col(row, "DATE"));
    const cuando = Number.isNaN(fecha.getTime()) ? new Date() : fecha;
    const ingreso = credito > 0;
    const nombres = DESCRIPCIONES[descripcionMp];
    const descripcion = (nombres ? nombres[ingreso ? 0 : 1] : descripcionMp ? titleCase(descripcionMp.replace(/_/g, " ")) : ingreso ? "Ingreso" : "Egreso") + " (Mercado Pago)";
    // Retirar plata de Mercado Pago a tu banco es mover plata tuya: no es un gasto.
    const propio = /withdrawal|payout/.test(descripcionMp) && !ingreso;
    filas.push({
      tipo: propio ? null : ingreso ? "ingreso" : "gasto", monto: ingreso ? credito : debito, descripcion, categoria: "otro", ...(propio ? { nota: "retiro a tu banco (no cuenta)" } : {}),
      clave: [sourceId ?? "sin-id", descripcionMp || "mov", cuando.toISOString(), ingreso ? credito : debito].join("|"),
      sourceId, opRef: descripcionMp === "payment" ? sourceId : null, cuando,
      cuerpo: JSON.stringify(Object.fromEntries(head.map((name, index) => [name, row[index] ?? ""]))),
    });
  }
  return filas;
}

// ---------- Permisos cifrados (AES-GCM) ----------

let key: Promise<CryptoKey> | null = null;
const cipherKey = () => (key ??= crypto.subtle.digest("SHA-256", new TextEncoder().encode(TOKEN_KEY)).then((raw) => crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"])));
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

// "v1:<iv>:<cifrado>". Sin clave no se guarda nada (antes que dejar el permiso en texto plano).
async function seal(plain: string) {
  if (!TOKEN_KEY) { console.error("Falta MP_TOKEN_KEY o PDF_KEY: el permiso de Mercado Pago no se guarda"); return null; }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await cipherKey(), new TextEncoder().encode(plain)));
  return "v1:" + toBase64(iv) + ":" + toBase64(data);
}

async function open(sealed: string | null) {
  if (!sealed || !sealed.startsWith("v1:") || !TOKEN_KEY) return null;
  const [, iv, data] = sealed.split(":");
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv) }, await cipherKey(), fromBase64(data));
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}
