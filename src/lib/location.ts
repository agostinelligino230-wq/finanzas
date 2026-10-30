import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { PlacesResult } from "../../shared/mapa";

// Ubicación de cada gasto en la web: el permiso se pide una sola vez y la persona puede apagarlo en Conectar.
export type Point = { lat: number; lng: number };
type Consent = "ok" | "no" | null;

const consentKey = (userId: string) => "finanzas:ubicacion:" + userId;
const skippedKey = (userId: string) => "finanzas:ubicacion-omitidos:" + userId;
const MAX_SKIPPED = 50;

export const readConsent = (userId: string): Consent => { const value = localStorage.getItem(consentKey(userId)); return value === "ok" || value === "no" ? value : null; };
export const saveConsent = (userId: string, value: "ok" | "no") => localStorage.setItem(consentKey(userId), value);
export const clearConsent = (userId: string) => localStorage.removeItem(consentKey(userId));

// Los movimientos a los que la persona ya les dijo «No guardar».
export function readSkipped(userId: string): string[] {
  try { return JSON.parse(localStorage.getItem(skippedKey(userId)) ?? "[]") as string[]; } catch { return []; }
}
export const addSkipped = (userId: string, id: string) => localStorage.setItem(skippedKey(userId), JSON.stringify([...readSkipped(userId), id].slice(-MAX_SKIPPED)));

// null: no se pudo. "denied": la persona dijo que no en el navegador.
export function currentPosition(): Promise<Point | "denied" | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      (error) => resolve(error.code === error.PERMISSION_DENIED ? "denied" : null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  });
}

export async function nearbyPlaces(point: Point): Promise<PlacesResult> {
  if (!supabase) return { direccion: "", lugares: [] };
  const { data, error } = await supabase.functions.invoke("lugares", { body: point });
  if (error || data?.error) return { direccion: "", lugares: [] };
  return data as PlacesResult;
}

export function useLocationEnabled(userId: string) {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.from("user_settings").select("location_enabled").maybeSingle().then(({ data, error }) => {
      if (active) setEnabled(error ? false : (data as { location_enabled?: boolean } | null)?.location_enabled ?? true);
    });
    return () => { active = false; };
  }, [userId]);

  const save = async (value: boolean) => {
    if (!supabase) return false;
    const { error } = await supabase.from("user_settings").upsert({ user_id: userId, location_enabled: value }, { onConflict: "user_id" });
    if (error) return false;
    setEnabled(value);
    if (value) clearConsent(userId);
    return true;
  };

  const forget = async () => {
    if (!supabase) return false;
    const { error } = await supabase.rpc("forget_locations");
    return !error;
  };

  return { enabled, save, forget };
}
