import { useCallback, useEffect, useState } from "react";
import { AppState, Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { supabase } from "./supabase";

// Avisos propios de la app (D2): «Entró $X de Galicia» cuando un movimiento llega por mail.
// El permiso se pide recién cuando la persona prende el interruptor en Cuentas, no al abrir la app.
const TOKEN_KEY = "avisos_token";
const CANAL = "movimientos";

// Con la app abierta también se muestra (sin sonido: la lista ya se actualiza sola).
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

// El proyecto de EAS (lo agrega `eas init`): sin él no hay avisos y el interruptor no se muestra.
const PROJECT_ID = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId ?? "";
export const avisosDisponibles = Boolean(PROJECT_ID);

export async function activarAvisos(): Promise<string | null> {
  if (!supabase || !PROJECT_ID) return "Los avisos todavía no están configurados en esta versión de la app.";
  if (Platform.OS === "android") await Notifications.setNotificationChannelAsync(CANAL, { name: "Movimientos", importance: Notifications.AndroidImportance.HIGH });
  const permiso = await Notifications.requestPermissionsAsync();
  if (!permiso.granted) return "El celular no dio permiso. Prendé las notificaciones de Finanzas Personales en Ajustes y probá de nuevo.";
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID });
    const { error } = await supabase.rpc("save_push_token", { p_token: token, p_platform: Platform.OS === "ios" ? "ios" : "android" });
    if (error) return "No se pudieron prender los avisos. Revisá tu conexión y probá de nuevo.";
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    return null;
  } catch {
    return "No se pudieron prender los avisos. Revisá tu conexión y probá de nuevo.";
  }
}

// Apaga los avisos en este celular (también al cerrar sesión, para que no le lleguen los de otra cuenta).
export async function apagarAvisos() {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (!token) return true;
  const { error } = supabase ? await supabase.rpc("delete_push_token", { p_token: token }) : { error: null };
  if (error) return false;
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  return true;
}

// Prendidos = hay token guardado y el permiso sigue dado (se puede sacar desde Ajustes).
export function useAvisos() {
  const [activos, setActivos] = useState<boolean | null>(null);
  const refresh = useCallback(async () => {
    const [token, permiso] = await Promise.all([SecureStore.getItemAsync(TOKEN_KEY), Notifications.getPermissionsAsync()]);
    setActivos(Boolean(token) && permiso.granted);
  }, []);
  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener("change", (state) => { if (state === "active") refresh(); });
    return () => sub.remove();
  }, [refresh]);
  return { activos, refresh };
}
