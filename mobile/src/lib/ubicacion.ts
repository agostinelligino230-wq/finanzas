import { useCallback, useEffect } from "react";
import * as Location from "expo-location";
import { activarUbicacion } from "../../modules/lector-avisos";
import type { PlacesResult } from "../../../shared/mapa";
import { createStore } from "./store";
import { supabase } from "./supabase";

// Ubicación de cada gasto. Solo «mientras se usa la app»: si dice que no, todo sigue andando sin ubicación.
const PREGUNTADO = "ubicacion:preguntado";
const DESCARTADOS = "ubicacion:descartados";

// Interruptor de Ajustes (sin fila o sin la migración 015: prendido). undefined = cargando.
const store = createStore<{ prendida: boolean } | undefined>(undefined);
const loading = new Set<string>();

async function load(userId: string) {
  if (!supabase || loading.has(userId)) return;
  loading.add(userId);
  const { data, error } = await supabase.from("user_settings").select("location_enabled").maybeSingle();
  loading.delete(userId);
  const prendida = error ? true : (data as { location_enabled?: boolean } | null)?.location_enabled !== false;
  activarUbicacion(prendida);
  store.set(userId, () => ({ prendida }));
}

export function useUbicacion(userId: string) {
  const value = store.useValue(userId);
  useEffect(() => { if (!store.has(userId)) load(userId); }, [userId]);

  const setPrendida = useCallback(async (prendida: boolean) => {
    if (!supabase) return false;
    const { error } = await supabase.from("user_settings").upsert({ user_id: userId, location_enabled: prendida, updated_at: new Date().toISOString() });
    if (error) return false;
    activarUbicacion(prendida);
    store.set(userId, () => ({ prendida }));
    return true;
  }, [userId]);

  const borrarTodo = useCallback(async () => {
    if (!supabase) return false;
    const { error } = await supabase.rpc("forget_locations");
    return !error;
  }, []);

  return { cargada: value !== undefined, prendida: value?.prendida ?? true, setPrendida, borrarTodo };
}

export const yaPreguntado = () => localStorage.getItem(PREGUNTADO) === "1";
export const marcarPreguntado = () => localStorage.setItem(PREGUNTADO, "1");

export async function pedirPermiso() {
  marcarPreguntado();
  const { granted } = await Location.requestForegroundPermissionsAsync().catch(() => ({ granted: false }));
  return granted;
}

export const tienePermiso = () => Location.getForegroundPermissionsAsync().then((result) => result.granted).catch(() => false);

// La última conocida si es reciente (es instantánea); si no, la actual.
export async function posicionActual() {
  try {
    const known = await Location.getLastKnownPositionAsync({ maxAge: 2 * 60 * 1000 });
    const position = known ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: position.coords.latitude, lng: position.coords.longitude };
  } catch {
    return null;
  }
}

export async function lugaresCerca(lat: number, lng: number): Promise<PlacesResult | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.functions.invoke("lugares", { body: { lat, lng } });
  return error || !data || data.error ? null : data as PlacesResult;
}

// Los movimientos a los que la persona ya les dijo «No guardar»: no se vuelve a preguntar por ellos.
const leerDescartados = (): string[] => {
  try { return JSON.parse(localStorage.getItem(DESCARTADOS) ?? "[]") as string[]; } catch { return []; }
};
export const descartados = () => new Set(leerDescartados());
export const descartar = (id: string) => localStorage.setItem(DESCARTADOS, JSON.stringify([...leerDescartados(), id].slice(-50)));
