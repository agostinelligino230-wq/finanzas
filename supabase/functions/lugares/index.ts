// De coordenadas a nombre de lugar. POST (con sesión) {lat, lng} → {direccion, lugares:[{nombre, direccion}]}.
// Usa OpenStreetMap (gratis): Nominatim para la dirección y Overpass para los comercios cercanos. Pasa por acá,
// y no directo desde la app, para poder cambiar de servicio (Google Places) sin tocar la web ni el celular.
import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const AGENTE = "FinanzasPersonales/1.0 (https://finanzas-personales-ar.vercel.app)";
const RADIO_METROS = 120;
const MAX_LUGARES = 5;

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  try {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: auth } = jwt ? await admin.auth.getUser(jwt) : { data: { user: null } };
    if (!auth?.user) return json({ error: "No autorizado" }, 401);
    const body = await req.json().catch(() => null) as { lat?: unknown; lng?: unknown } | null;
    const lat = Number(body?.lat);
    const lng = Number(body?.lng);
    if (body?.lat == null || body?.lng == null || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return json({ error: "Coordenadas inválidas" }, 400);
    const [direccion, lugares] = await Promise.all([direccionDe(lat, lng), lugaresCerca(lat, lng)]);
    return json({ direccion, lugares });
  } catch (error) {
    console.error(error);
    return json({ error: "interno" }, 500);
  }
});

type Calle = { road?: string; house_number?: string; suburb?: string; city?: string; town?: string };
const textoDe = (calle: Calle) => [[calle.road, calle.house_number].filter(Boolean).join(" "), calle.suburb ?? calle.city ?? calle.town].filter(Boolean).join(", ");

async function direccionDe(lat: number, lng: number) {
  const url = "https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=es&lat=" + lat + "&lon=" + lng;
  const data = await fetch(url, { headers: { "User-Agent": AGENTE }, signal: AbortSignal.timeout(6000) }).then((response) => response.json()).catch(() => null) as { address?: Calle } | null;
  return data?.address ? textoDe(data.address) : "";
}

type Nodo = { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };

async function lugaresCerca(lat: number, lng: number) {
  const consulta = "[out:json][timeout:6];nwr(around:" + RADIO_METROS + "," + lat + "," + lng + ")[name][~\"^(shop|amenity|craft|office|leisure)$\"~\".\"];out center 40;";
  const data = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", headers: { "User-Agent": AGENTE, "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(consulta), signal: AbortSignal.timeout(8000) })
    .then((response) => response.json()).catch(() => null) as { elements?: Nodo[] } | null;
  const metros = (nodo: Nodo) => {
    const dLat = ((nodo.lat ?? nodo.center?.lat ?? lat) - lat) * 111320;
    const dLng = ((nodo.lon ?? nodo.center?.lon ?? lng) - lng) * 111320 * Math.cos(lat * Math.PI / 180);
    return Math.hypot(dLat, dLng);
  };
  const vistos = new Set<string>();
  return (data?.elements ?? []).filter((nodo) => nodo.tags?.name).sort((a, b) => metros(a) - metros(b)).flatMap((nodo) => {
    const nombre = nodo.tags!.name;
    if (vistos.has(nombre)) return [];
    vistos.add(nombre);
    return [{ nombre, direccion: [nodo.tags!["addr:street"], nodo.tags!["addr:housenumber"]].filter(Boolean).join(" ") }];
  }).slice(0, MAX_LUGARES);
}
