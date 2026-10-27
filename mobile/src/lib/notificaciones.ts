import { useCallback, useEffect, useState } from "react";
import { AppState, Platform } from "react-native";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import * as Lector from "../../modules/lector-avisos";
import { supabase, SUPABASE_URL } from "./supabase";

// Lectura de las notificaciones de los bancos (solo Android): alta del celular, vínculo con el lector nativo
// y lista de apps permitidas (la baja del servidor, así sumar una entidad no pide otra versión de la app).
const FUNCION = SUPABASE_URL + "/functions/v1/notificaciones";
const DEVICE_KEY = "lector_device_id";

export const disponible = Platform.OS === "android" && Lector.disponible;

export async function actualizarPaquetes() {
  const data = await fetch(FUNCION).then((response) => response.json()).catch(() => null) as { version?: number; paquetes?: { paquete: string }[] } | null;
  if (data?.paquetes) Lector.actualizarPaquetes(data.paquetes.map((item) => item.paquete), data.version ?? 0);
}

// Al abrir la app (y al volver a ella), un celular ya vinculado baja la lista de nuevo: así una entidad
// que se suma en el servidor (por ejemplo, Wallbit) se escucha sin tener que volver a vincular el celular.
export function useListaDeApps() {
  useEffect(() => {
    if (!disponible) return;
    const update = () => { if (Lector.estado().vinculado) actualizarPaquetes(); };
    update();
    const sub = AppState.addEventListener("change", (state) => { if (state === "active") update(); });
    return () => sub.remove();
  }, []);
}

// Da de alta este celular (el token viaja una sola vez) y prende el lector.
export async function vincular(): Promise<string | null> {
  if (!supabase) return "Falta configurar Supabase.";
  const constants = Platform.constants as { Brand?: string; Model?: string };
  const { data, error } = await supabase.rpc("register_device", { p_platform: "android", p_model: [constants.Brand, constants.Model].filter(Boolean).join(" ").slice(0, 80), p_app_version: Constants.expoConfig?.version ?? "" });
  if (error || !data?.token) return "No se pudo vincular el celular. Probá de nuevo.";
  await SecureStore.setItemAsync(DEVICE_KEY, String(data.id));
  await actualizarPaquetes();
  Lector.vincular(String(data.token), FUNCION);
  return null;
}

// Apaga el lector y corta el token de este celular en el servidor.
export async function desvincular() {
  Lector.desvincular();
  const id = await SecureStore.getItemAsync(DEVICE_KEY);
  if (id && supabase) await supabase.rpc("revoke_device", { p_id: id });
  await SecureStore.deleteItemAsync(DEVICE_KEY);
}

// Estado del lector, al día cada vez que la persona vuelve a la app (por ejemplo, desde Ajustes).
export function useLector() {
  const [estado, setEstado] = useState(Lector.estado());
  const refresh = useCallback(() => setEstado(Lector.estado()), []);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => { if (state === "active") refresh(); });
    return () => sub.remove();
  }, [refresh]);
  return { estado, refresh };
}
