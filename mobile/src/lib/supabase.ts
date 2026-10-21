import { AppState } from "react-native";
import { createClient } from "@supabase/supabase-js";
import { EncryptedStorage } from "./storage";

// Las mismas claves públicas que la web (EXPO_PUBLIC_* en mobile/.env). Nunca la service_role.
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
// La web: ahí se confirma el mail de una cuenta nueva y se cambia la contraseña olvidada.
export const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? "https://finanzas-personales-ar.vercel.app";

export const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { storage: new EncryptedStorage(), autoRefreshToken: true, persistSession: true, detectSessionInUrl: false, flowType: "pkce" },
    })
  : null;

// En el celular la sesión se renueva solo mientras la app está abierta.
AppState.addEventListener("change", (state) => {
  if (!supabase) return;
  if (state === "active") supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
